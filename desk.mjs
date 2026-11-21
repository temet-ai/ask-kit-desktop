// A client for a Linux desktop (Hyprland on Omarchy, Wayland): what is on screen now, and, when
// the caller asked for a change, operating it.
//
// Three checks. A call that changes the desktop (a dispatch, a keyword, a reload, a click, typing, an
// omarchy command that sets something) needs `act`; what is read from the screen goes to a cloud
// model, so windows on the deny list (lib.mjs) are never captured, clicked in or typed into, terminals
// only when the request names them, and tokens and email addresses are masked; and nothing that never
// ends or waits for a person (a follow mode, a batch, `hyprctl kill`, an interactive REPL) runs.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bindRow, denied, inside, isTerminal, mask, maskTitle, overlap, ruleCalls, rx } from "./lib.mjs";

const deny = (why) => {
  throw new Error(`not allowed: ${why}`);
};
const notInThisAsk = (what) => {
  throw new Error(`not in this ask: ${what} changes things, and the caller did not ask for a change (act: true), so nothing was done. Answer what you can, and say that this needs \`ask\` with act: true. Do not look for another way to do it.`);
};

// hyprctl commands that only read. Anything else changes the desktop, runs Lua, or is not known.
const HYPR_READS = new Set([
  "activewindow", "activeworkspace", "animations", "binds", "clients", "configerrors", "cursorpos", "decorations", "devices", "getoption", "getprop",
  "globalshortcuts", "instances", "layers", "layouts", "monitors", "splash", "status", "systeminfo", "version", "workspacerules", "workspaces", "rollinglog",
]);
const HYPR_GLOBAL_VALUE = new Set(["-i", "--instance"]);

function splitHypr(a) {
  const globals = [];
  let i = 0;
  for (; i < a.length; i++) {
    if (HYPR_GLOBAL_VALUE.has(a[i])) {
      globals.push(a[i], a[i + 1]);
      i++;
    } else if (a[i].startsWith("-")) globals.push(a[i]);
    else break;
  }
  return { globals, cmd: a[i] ?? "", rest: a.slice(i + 1) };
}

// omarchy: what reads, what changes, what this kit never runs.
const OMARCHY_READS = [
  /^(version|channel current)$/, /^commands( --(json|all))*$/, /^theme (current|list|dir|extras)\b/, /^theme bg current$/, /^font (current|list)$/, /^menu keybindings --print$/,
  /^hyprland toggle (enabled|disabled)\b/, /^hyprland workspace layout current\b/, /^hyprland monitor (focused|laptop)\b/, /^battery (present|status)\b/,
  /^monitor state$/, /^capture screenrecording --status$/, /^restart --help$/, /^cmd (present|missing)$/, /^bar get\b/,
];
const OMARCHY_ACT_GROUPS = new Set([
  "theme", "font", "toggle", "restart", "bar", "hyprland", "launch", "reminder", "notification", "osd", "brightness", "audio", "display", "powerprofiles", "screensaver",
  "dock", "shell", "show", "language",
]);
const OMARCHY_NEVER = [
  [/^windows key\b/, "it prints the Windows product key"],
  [/^hyprland window close all\b/, "it closes every window, and the person may have unsaved work"],
  [/^theme (install|remove|update)\b/, "it fetches or deletes theme code; the person does that themselves"],
  [/^(system|update|upgrade|install|remove|reinstall|refresh|setup|migrate|snapshot|sudo|dev|hibernation|plymouth|kernel|pkg|drive|mise|n1x|agent|network|tailscale|share|webapp|tui|games|hw|voxtype|dictation|default|branding|debug|disk|dns|file|nvim|openclaw|transcode|ascii|bluetooth)\b/, "it is outside what this kit does on the desktop (updates, installs, power, network and system changes are the person's own to do)"],
  [/^(theme (switcher|bg-switcher)|menu (?!keybindings --print))/, "it opens a menu and waits for a person"],
  [/^capture (screenshot|screenrecording|text|qr)\b(?!.*--status)/, "it opens a region picker and waits for a person; read a window with desk.read instead"],
];

/** "read", "act" or "refused: why" for an omarchy command line, without running it. */
export function omarchyClass(args) {
  const a = args.map(String);
  const line = a.join(" ");
  for (const [re, why] of OMARCHY_NEVER) if (re.test(line)) return `refused: ${why}`;
  if (OMARCHY_READS.some((re) => re.test(line)) || a.includes("--help") || a.includes("-h")) return "read";
  return OMARCHY_ACT_GROUPS.has(a[0]) ? "act" : "refused: the group is not one this kit runs";
}

// Lua that would bypass the checks on windows (raw keys into any window, a process kill, the Lua standard library) is never sent through dispatch or eval.
const LUA_NEVER = /\b(os|io|package|debug|loadfile|dofile|require|load)\b|send_key_state|send_shortcut|exec_raw|dsp\.exit|window\.kill|window\.signal/;
const luaGuard = (code) => {
  if (LUA_NEVER.test(String(code))) deny("that Lua can send keys to any window, kill a process or run Lua libraries; use desk.focus, desk.close, desk.launch, desk.key and the other calls, which check the window first");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const luaStr = (s) => JSON.stringify(String(s));
const addr = (a) => (/^0x[0-9a-f]+$/i.test(a) ? a : deny(`not a window address: ${a} (use the address from desk.windows())`));

/** Real command runner: no shell, a timeout, stdin closed unless input is given. */
export function realExec(cmd, args, { timeoutMs = 10_000, input, env } = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 << 20, encoding: "utf8", env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err?.code === "ENOENT") resolve({ code: 127, out: "", err: `${cmd} is not installed` });
      else resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: String(stdout), err: String(stderr).slice(0, 4000), ...(err?.killed ? { timedOut: true } : {}) });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input ?? "");
  });
}

// The ask server may start outside the desktop session: find the running Hyprland instance.
function hyprEnv() {
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) return {};
  try {
    const dir = path.join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`, "hypr");
    const ins = fs.readdirSync(dir).map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
    if (ins) return { HYPRLAND_INSTANCE_SIGNATURE: ins.n, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? "wayland-1" };
  } catch {}
  return {};
}

function ancestors() {
  const pids = new Set();
  let pid = process.pid;
  while (pid > 1) {
    pids.add(pid);
    try {
      pid = Number(fs.readFileSync(`/proc/${pid}/stat`, "utf8").replace(/^.*\) /, "").split(" ")[1]);
    } catch {
      break;
    }
  }
  return pids;
}

const comm = (pid) => {
  try {
    return fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
  } catch {
    return null;
  }
};

// The module source: make(ctx) returns the `desk` global.
export function make({ settings, push, act }) {
  return makeDesk({ push, act: !!act, helper: settings?.DESK_HELPER || process.env.DESK_HELPER || undefined });
}

export function makeDesk({ exec = realExec, push = () => {}, act = false, runDir, helper } = {}) {
  const env = hyprEnv();
  const ran = async (cmd, args, o = {}) => {
    const started = Date.now();
    const r = await exec(cmd, args, { env, ...o });
    push({ kind: cmd, detail: `${cmd} ${args.join(" ")}`.slice(0, 200), ms: Date.now() - started, code: r.code, size: r.out.length });
    return r;
  };

  // ---- hyprctl -------------------------------------------------------------------------------------
  function checkHypr(args) {
    const a = args.map(String);
    const { cmd, rest } = splitHypr(a);
    if (!cmd) deny("no hyprctl command");
    if (a.includes("--batch")) deny("--batch runs several commands in one go; run them one at a time");
    if (cmd === "kill" ) deny("hyprctl kill waits for a click for ever; close a window with desk.close(address)");
    if ((cmd === "repl" || cmd === "eval") && !rest.length) deny("an interactive REPL never ends; pass the Lua code");
    if (cmd === "rollinglog" && rest.some((x) => x === "-f" || x === "--follow")) deny("rollinglog --follow never ends; read the tail without -f");
    if (["dispatch", "eval", "repl"].includes(cmd)) luaGuard(rest.join(" "));
    const reading = HYPR_READS.has(cmd);
    if (!reading && !act) notInThisAsk(`hyprctl ${[cmd, ...rest].join(" ").slice(0, 80)}`);
    return { a, cmd, reading };
  }
  const hypr = async (...args) => {
    const { a } = checkHypr(args);
    return ran("hyprctl", a);
  };
  const hyprJson = async (...args) => {
    const r = await hypr("-j", ...args);
    if (r.code !== 0) throw new Error(`hyprctl ${args.join(" ")}: ${(r.err || r.out).trim().slice(0, 300) || "failed (is Hyprland running in this session?)"}`);
    try {
      return JSON.parse(r.out);
    } catch {
      throw new Error(`hyprctl ${args.join(" ")} printed no JSON: ${r.out.slice(0, 200)}`);
    }
  };
  const dispatch = async (lua) => {
    luaGuard(lua);
    if (!act) notInThisAsk(`hyprctl dispatch ${String(lua).slice(0, 80)}`);
    const r = await ran("hyprctl", ["dispatch", lua]);
    const out = r.out.trim();
    if (r.code !== 0 || (out && out !== "ok")) throw new Error(`hyprctl dispatch ${lua}: ${(out || r.err).slice(0, 300)}`);
    return out || "ok";
  };

  // ---- reading the desktop ----------------------------------------------------------------------------
  async function monitors() {
    const ms = await hyprJson("monitors");
    return ms.map((m) => {
      const lw = Math.round(m.width / m.scale);
      const lh = Math.round(m.height / m.scale);
      const swap = m.transform % 2 === 1;
      return {
        id: m.id, name: m.name, description: m.description, make: m.make, model: m.model,
        width: m.width, height: m.height, refresh: Math.round(m.refreshRate * 100) / 100, scale: m.scale,
        x: m.x, y: m.y, logical: { w: swap ? lh : lw, h: swap ? lw : lh }, transform: m.transform,
        workspace: m.activeWorkspace?.id ?? null, workspaceName: m.activeWorkspace?.name ?? null,
        specialWorkspace: m.specialWorkspace?.name || null, focused: m.focused, disabled: m.disabled, vrr: !!m.vrr, dpms: m.dpmsStatus, mirrorOf: m.mirrorOf === "none" ? null : m.mirrorOf,
      };
    });
  }

  async function windows(o = {}) {
    const [clients, mons, active] = await Promise.all([hyprJson("clients"), hyprJson("monitors"), hyprJson("activewindow").catch(() => ({}))]);
    const names = new Map(mons.map((m) => [m.id, m.name]));
    const shown = new Set(mons.flatMap((m) => [m.activeWorkspace?.id, m.specialWorkspace?.id].filter((x) => x != null && x !== 0)));
    const rects = mons.filter((m) => !m.disabled).map((m) => ({ x: m.x, y: m.y, w: Math.round((m.transform % 2 ? m.height : m.width) / m.scale), h: Math.round((m.transform % 2 ? m.width : m.height) / m.scale) }));
    const onScreen = (c) => rects.some((r) => overlap(r, { x: c.at[0], y: c.at[1], w: c.size[0], h: c.size[1] }));
    let rows = clients
      .filter((c) => c.mapped)
      .map((c) => {
        const row = {
          address: c.address, class: c.class, title: maskTitle(c.title), initialClass: c.initialClass,
          workspace: c.workspace.id, workspaceName: c.workspace.name, monitor: names.get(c.monitor) ?? String(c.monitor),
          at: c.at, size: c.size, floating: c.floating, fullscreen: c.fullscreen > 0, focused: c.address === active?.address,
          visible: shown.has(c.workspace.id) && !c.hidden && onScreen(c), pid: c.pid, program: comm(c.pid), xwayland: c.xwayland, pinned: c.pinned,
          grouped: c.grouped?.length ? c.grouped.length : 0, tags: c.tags ?? [], focusRank: c.focusHistoryID,
          terminal: isTerminal(c), denied: denied(c),
        };
        return row;
      })
      .sort((a, b) => a.workspace - b.workspace || a.at[1] - b.at[1] || a.at[0] - b.at[0]);
    if (o.workspace != null) rows = rows.filter((r) => String(r.workspace) === String(o.workspace) || r.workspaceName === String(o.workspace));
    if (o.monitor) rows = rows.filter((r) => r.monitor === o.monitor);
    if (o.floating != null) rows = rows.filter((r) => r.floating === o.floating);
    if (o.focused) rows = rows.filter((r) => r.focused);
    if (o.visible != null) rows = rows.filter((r) => r.visible === o.visible);
    if (o.match) {
      const re = rx(o.match);
      rows = rows.filter((r) => re.test(r.class) || re.test(r.initialClass ?? "") || re.test(r.title) || re.test(r.program ?? ""));
    }
    return rows;
  }

  // Words people use for kinds of app, and the classes and programs they mean.
const SYNONYMS = {
  browser: /chrom|firefox|brave|zen|edge|vivaldi|opera|librewolf/i,
  editor: /code|zed|sublime|helix|nvim|vim|emacs|kate|gedit|jetbrains|idea|pycharm|webstorm|clion|rustrover/i,
  files: /nautilus|dolphin|thunar|nemo|pcmanfm|yazi/i,
  chat: /slack|telegram|discord|signal|element|teams|whatsapp/i,
  mail: /thunderbird|evolution|geary|mail/i,
  music: /spotify|rhythmbox|lollypop|mpv|vlc/i,
  terminal: /foot|alacritty|kitty|ghostty|wezterm|konsole|xterm/i,
};
const WORD = /[a-z0-9][a-z0-9._-]*/gi;
  /** Rank windows against a description in words ("the browser on workspace 2", "floating terminal"). */
  async function findWindow(description, o = {}) {
    const text = String(description ?? "");
    const all = await windows();
    const ws = text.match(/\b(?:workspace|ws)\s*#?\s*(\w+)/i)?.[1];
    const wantFloat = /\bfloating\b/i.test(text) ? true : /\btiled\b/i.test(text) ? false : null;
    const wantFocus = /\b(focused|active|current)\b/i.test(text);
    const stop = new Set(["the", "a", "an", "on", "in", "of", "window", "windows", "app", "workspace", "ws", "floating", "tiled", "focused", "active", "current", "that", "my", "open", "with", "is", "which", "and", "one"]);
    const words = (text.match(WORD) ?? []).map((w) => w.toLowerCase()).filter((w) => !stop.has(w) && w !== ws?.toLowerCase());
    const ranked = all
      .map((w) => {
        let score = 0;
        const hay = { class: w.class.toLowerCase(), program: (w.program ?? "").toLowerCase(), title: w.title.toLowerCase(), initialClass: (w.initialClass ?? "").toLowerCase() };
        const tags = w.tags.join(" ").toLowerCase();
        for (const word of words) {
          const syn = SYNONYMS[word];
          if (syn && (syn.test(hay.class) || syn.test(hay.program))) score += 4;
          else if (word === "terminal" && w.terminal) score += 4;
          else if (tags.includes(word)) score += 3;
          if (hay.class === word || hay.program === word) score += 5;
          else if (hay.class.includes(word) || hay.initialClass.includes(word)) score += 4;
          else if (hay.program.includes(word)) score += 3;
          else if (hay.title.includes(word)) score += 2;
        }
        if (ws && (String(w.workspace) === ws || w.workspaceName === ws)) score += 3;
        if (wantFloat != null && w.floating === wantFloat) score += 2;
        if (wantFocus && w.focused) score += 4;
        return { score, w };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.w.focusRank - b.w.focusRank)
      .slice(0, o.max ?? 5);
    return ranked.map(({ score, w }) => ({ score, ...w }));
  }

  async function binds(q, o = {}) {
    const rows = (await hyprJson("binds")).map(bindRow);
    let out = rows;
    if (q) {
      const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
      const norm = (s) => String(s ?? "").toLowerCase().replace(/\s*\+\s*/g, "+");
      out = rows.filter((r) => words.every((w) => norm(`${r.keys} ${r.description} ${r.dispatcher ?? ""} ${r.arg ?? ""}`).includes(norm(w))));
    }
    if (o.key) {
      const k = String(o.key).toUpperCase().replace(/\s*\+\s*/g, "+").replace(/\s+/g, "+");
      out = out.filter((r) => r.keys.toUpperCase().replace(/\s*\+\s*/g, "+") === k || r.keys.toUpperCase().replace(/\s*\+\s*/g, "+").endsWith("+" + k) || r.key.toUpperCase() === k);
    }
    return { total: rows.length, matched: out.length, binds: out.slice(0, o.max ?? 30), cut: Math.max(0, out.length - (o.max ?? 30)) };
  }

  const option = async (name) => {
    if (!/^[a-z_]+(:[a-z_.]+)+$/i.test(name)) deny(`not an option name: ${name} (like general:gaps_in)`);
    return hyprJson("getoption", name);
  };

  // ---- reading what a window shows ------------------------------------------------------------------------
  const shotDir = runDir ?? path.join(process.env.XDG_RUNTIME_DIR ?? os.tmpdir(), "desk-kit");

  async function resolveTarget(o) {
    const mons = await hyprJson("monitors");
    const shown = new Set(mons.flatMap((m) => [m.activeWorkspace?.id, m.specialWorkspace?.id].filter((x) => x != null && x !== 0)));
    const all = (await hyprJson("clients")).filter((c) => c.mapped && !c.hidden);
    const visible = all.filter((c) => shown.has(c.workspace.id));
    let target = null;
    let rect;
    let label;
    if (o.window) {
      const re = /^0x[0-9a-f]+$/i.test(o.window) ? null : rx(o.window);
      const hits = all.filter((c) => (re ? re.test(c.class) || re.test(c.title) || re.test(c.initialClass ?? "") : c.address === o.window)).sort((a, b) => a.focusHistoryID - b.focusHistoryID);
      if (!hits.length) throw new Error(`no window matches ${o.window}: see desk.windows()`);
      target = hits[0];
      const why = denied(target);
      if (why) deny(`the window ${target.class} (${target.address}) is refused: ${why}`);
      if (isTerminal(target) && o.terminal !== target.address) deny(`${target.class} is a terminal, and a terminal may run a Claude Code session. Read it only when the request names that window, then pass terminal: "${target.address}"`);
      if (!shown.has(target.workspace.id)) throw new Error(`${target.class} is on workspace ${target.workspace.id}, which no monitor shows now; a window can only be captured while it is on screen. Focusing it needs act`);
      rect = { x: target.at[0], y: target.at[1], w: target.size[0], h: target.size[1] };
      label = target.class;
      target.alsoMatched = hits.length - 1;
    } else if (o.region) {
      const m = String(o.region).match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s+(\d+)\s*x\s*(\d+)\s*$/);
      if (!m) throw new Error(`region must look like "X,Y WxH" in global layout coordinates: ${o.region}`);
      rect = { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
      if (rect.w * rect.h > 16_000_000) throw new Error("that region is bigger than a screen: name a smaller one");
      label = "region";
    } else {
      throw new Error("name what to read: window (a class or title regex, or an address) or region (\"X,Y WxH\"). The whole desktop is never captured by default");
    }
    // Whatever else is drawn inside the rectangle is captured too.
    for (const c of visible) {
      if (target && c.address === target.address) continue;
      if (!overlap(rect, { x: c.at[0], y: c.at[1], w: c.size[0], h: c.size[1] })) continue;
      const why = denied(c);
      if (why) deny(`the capture would include the window ${c.class} (${c.address}): ${why}`);
      if (isTerminal(c) && o.terminal !== c.address) deny(`the capture would include the terminal ${c.class} (${c.address}); name that window or pick a region that avoids it`);
    }
    return { target, rect, label };
  }

  function cleanShots(dir) {
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
      for (const f of files.slice(0, -30)) fs.unlinkSync(path.join(dir, f));
    } catch {}
  }

  /** tesseract TSV (psm 6) to lines with global coordinates. */
  function parseTsv(tsv, rect, scale) {
    const groups = new Map();
    for (const line of tsv.split("\n").slice(1)) {
      const p = line.split("\t");
      if (p.length < 12 || !p[11].trim() || Number(p[10]) < 30) continue;
      const key = `${p[2]}.${p[3]}.${p[4]}`;
      const [l, t, w, h] = p.slice(6, 10).map(Number);
      if (!groups.has(key)) groups.set(key, { words: [], x0: l, y0: t, x1: l + w, y1: t + h });
      const g = groups.get(key);
      g.words.push(p[11].trim());
      g.x0 = Math.min(g.x0, l); g.y0 = Math.min(g.y0, t); g.x1 = Math.max(g.x1, l + w); g.y1 = Math.max(g.y1, t + h);
    }
    return [...groups.values()]
      .sort((a, b) => Math.round(a.y0 / 8) - Math.round(b.y0 / 8) || a.x0 - b.x0)
      .map((g) => ({ text: g.words.join(" "), x: Math.round(rect.x + (g.x0 + g.x1) / 2 / scale), y: Math.round(rect.y + (g.y0 + g.y1) / 2 / scale) }));
  }

  /**
   * Screenshot one window or region and OCR it. Returns the text, the lines with the global coordinates of their centres, and the screenshot's path.
   */
  async function read(o = {}) {
    const { target, rect, label } = await resolveTarget(o);
    fs.mkdirSync(shotDir, { recursive: true, mode: 0o700 });
    cleanShots(shotDir);
    const scale = rect.w * 2 <= 3200 && rect.h * 2 <= 3200 ? 2 : 1;
    const file = path.join(shotDir, `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(8, 17)}-${label.replace(/[^A-Za-z0-9_-]/g, "_")}.png`);
    const g = await ran("grim", ["-s", String(scale), "-g", `${rect.x},${rect.y} ${rect.w}x${rect.h}`, file], { timeoutMs: 15_000 });
    if (g.code !== 0) throw new Error(`grim could not capture ${rect.x},${rect.y} ${rect.w}x${rect.h}: ${(g.err || g.out).trim().slice(0, 300)} (is the window on a connected monitor?)`);
    const out = { window: target ? { address: target.address, class: target.class, title: maskTitle(target.title), workspace: target.workspace.id } : null, region: `${rect.x},${rect.y} ${rect.w}x${rect.h}`, screenshot: file, scale };
    if (target?.alsoMatched) out.alsoMatched = target.alsoMatched;
    if (o.ocr === false) return out;
    const t = await ran("tesseract", [file, "-", "--psm", String(o.psm ?? 6), "tsv"], { timeoutMs: 40_000 });
    if (t.code !== 0) throw new Error(`tesseract failed: ${(t.err || t.out).trim().slice(0, 300)}`);
    let masked = 0;
    const rows = parseTsv(t.out, rect, scale).map((l) => {
      const m = mask(l.text);
      masked += m.n;
      return { ...l, text: m.text };
    });
    const text = rows.map((l) => l.text).join("\n");
    const maxChars = o.maxChars ?? 8000;
    out.chars = text.length;
    out.text = text.length > maxChars ? text.slice(0, maxChars) + `\n[cut: ${text.length - maxChars} more characters; narrow the region]` : text;
    out.lines = rows.slice(0, o.maxLines ?? 200);
    if (rows.length > out.lines.length) out.linesCut = rows.length - out.lines.length;
    if (masked) out.masked = `${masked} email address(es) or token(s) in the text were replaced`;
    return out;
  }

  // ---- acting ---------------------------------------------------------------------------------------------
  const needAct = (what) => {
    if (!act) notInThisAsk(what);
  };
  const me = ancestors();

  /** Refuse to drive a window that is denied, a terminal not named by the request, or the window this process runs in. */
  async function guard(wins, o = {}) {
    for (const w of wins) {
      const why = denied(w);
      if (why) deny(`the window ${w.class} (${w.address}) is refused: ${why}`);
      if (me.has(w.pid)) deny(`${w.class} (${w.address}) is the window this session runs in`);
      if (isTerminal(w) && o.terminal !== w.address) deny(`${w.class} (${w.address}) is a terminal, and a terminal may run a Claude Code session. Drive it only when the request names that window, then pass terminal: "${w.address}"`);
    }
  }
  async function activeWin() {
    const w = await hyprJson("activewindow").catch(() => null);
    if (!w || !w.address) deny("no window has focus, so keys would go nowhere; focus one first with desk.focus(address)");
    return w;
  }
  async function underPoint(x, y) {
    const mons = await hyprJson("monitors");
    const shown = new Set(mons.flatMap((m) => [m.activeWorkspace?.id, m.specialWorkspace?.id].filter((v) => v != null && v !== 0)));
    return (await hyprJson("clients")).filter((c) => c.mapped && !c.hidden && shown.has(c.workspace.id) && inside([x, y], c.at, c.size));
  }

  const deskBin = async (args, input) => {
    if (!helper) throw new Error("clicking, typing, key presses, scrolling and dragging need the DESK_HELPER setting: the program that sends mouse and keyboard input (see the README). Nothing was done");
    const r = await ran(helper, args, { input, timeoutMs: 20_000 });
    if (r.code !== 0) throw new Error(`${helper} ${args[0]}: ${(r.err || r.out).trim().slice(0, 300)}`);
    return r.out.trim();
  };

  async function windowFor(sel) {
    const ws = await windows();
    const w = /^0x[0-9a-f]+$/i.test(String(sel)) ? ws.find((x) => x.address === sel) : (await findWindow(sel, { max: 1 }))[0];
    if (!w) throw new Error(`no window matches ${sel}: see desk.windows()`);
    return w;
  }

  const api = {
    /** True when this ask may change things. */
    act,
    /** "read", "act" or "refused: why" for an omarchy command line, without running it: desk.omarchyClass(["theme", "set", "x"]). */
    omarchyClass,
    hypr, hyprJson, monitors, windows, findWindow, binds, option, read,

    /** hyprctl getoption results for several options, as {name: value}. */
    async options(...names) {
      const out = {};
      for (const n of names) {
        const r = await option(n);
        out[n] = r.int ?? r.float ?? r.str ?? r.css ?? r.custom ?? r.vec2 ?? r;
      }
      return out;
    },

    /** Layer surfaces now on screen (bar, notifications, menus): [{monitor, level, namespace, w, h}]. */
    async layers() {
      const l = await hyprJson("layers");
      return Object.entries(l).flatMap(([monitor, v]) => Object.entries(v.levels ?? {}).flatMap(([level, xs]) => xs.map((x) => ({ monitor, level: Number(level), namespace: x.namespace, x: x.x, y: x.y, w: x.w, h: x.h }))));
    },

    /** Active workspaces and their windows' count: [{id, name, monitor, windows, tiledLayout}]. */
    async workspaces() {
      return (await hyprJson("workspaces")).map((w) => ({ id: w.id, name: w.name, monitor: w.monitor, windows: w.windows, fullscreen: w.hasfullscreen, tiledLayout: w.tiledLayout }));
    },

    /** Config errors Hyprland reports now: [] when the config loaded cleanly. */
    async configErrors() {
      const r = await ran("hyprctl", ["configerrors"]);
      return r.out.split("\n").map((x) => x.trim()).filter(Boolean);
    },

    // -- acting: each needs act, and checks the window first --
    /** Focus a window (address from desk.windows(), or a description). Confirms that focus moved. */
    async focus(sel) {
      needAct("focusing a window");
      const w = await windowFor(sel);
      await dispatch(`hl.dsp.focus({ window = ${luaStr("address:" + addr(w.address))} })`);
      for (let i = 0; i < 20; i++) {
        if ((await hyprJson("activewindow").catch(() => ({}))).address === w.address) return { focused: w.address, class: w.class, workspace: w.workspace };
        await sleep(50);
      }
      throw new Error(`asked to focus ${w.class} (${w.address}), but it did not take focus: it closed, or someone else is using the machine`);
    },
    /** Switch to a workspace by id or name on the focused monitor. */
    async workspace(id) {
      needAct("switching workspace");
      if (!/^[\w+\-:]+$/.test(String(id))) deny(`not a workspace: ${id}`);
      return dispatch(`hl.dsp.focus({ workspace = ${luaStr(id)} })`);
    },
    /** Close a window (not a denied one, not a terminal the request did not name, not the window this session runs in). */
    async close(sel, o = {}) {
      needAct("closing a window");
      const w = await windowFor(sel);
      await guard([w], o);
      return dispatch(`hl.dsp.window.close({ window = ${luaStr("address:" + addr(w.address))} })`);
    },
    /** Float or tile a window: action "toggle" (default), "enable" or "disable". */
    async float(sel, action = "toggle") {
      needAct("floating or tiling a window");
      if (!["toggle", "enable", "disable"].includes(action)) deny(`float action must be toggle, enable or disable`);
      const w = await windowFor(sel);
      return dispatch(`hl.dsp.window.float({ action = ${luaStr(action)}, window = ${luaStr("address:" + addr(w.address))} })`);
    },
    /** Move a window to a workspace (id or name); follow: true also switches to it. */
    async moveToWorkspace(sel, workspace, o = {}) {
      needAct("moving a window");
      if (!/^[\w+\-:]+$/.test(String(workspace))) deny(`not a workspace: ${workspace}`);
      const w = await windowFor(sel);
      return dispatch(`hl.dsp.window.move({ workspace = ${luaStr(workspace)}, follow = ${o.follow ? "true" : "false"}, window = ${luaStr("address:" + addr(w.address))} })`);
    },
    /** Resize a window by pixels (relative: true, the default) or to an exact size (relative: false). */
    async resize(sel, x, y, o = {}) {
      needAct("resizing a window");
      if (!Number.isFinite(x) || !Number.isFinite(y)) deny("resize needs numbers");
      const w = await windowFor(sel);
      return dispatch(`hl.dsp.window.resize({ x = ${x}, y = ${y}, relative = ${o.relative === false ? "false" : "true"}, window = ${luaStr("address:" + addr(w.address))} })`);
    },
    /** Toggle fullscreen ("fullscreen") or maximized ("maximized") for a window. */
    async fullscreen(sel, mode = "fullscreen") {
      needAct("changing fullscreen");
      if (!["fullscreen", "maximized"].includes(mode)) deny("mode must be fullscreen or maximized");
      const w = await windowFor(sel);
      return dispatch(`hl.dsp.window.fullscreen({ mode = ${luaStr(mode)}, window = ${luaStr("address:" + addr(w.address))} })`);
    },
    /** Start a program through Hyprland, detached. The command is one string, as typed in a shell. */
    async launch(command) {
      needAct("launching a program");
      if (!String(command).trim()) deny("no command");
      return dispatch(`hl.dsp.exec_cmd(${luaStr(command)})`);
    },
    /** Run any Hyprland Lua dispatcher: desk.dispatch('hl.dsp.focus({ workspace = "3" })'). */
    dispatch,
    /** hyprctl reload, then the config errors it reports: [] when clean. */
    async reload() {
      needAct("reloading Hyprland");
      const r = await ran("hyprctl", ["reload"]);
      if (r.code !== 0) throw new Error(`hyprctl reload: ${(r.err || r.out).trim().slice(0, 300)}`);
      await sleep(400);
      return { reloaded: true, errors: await api.configErrors() };
    },
    /** Set one option for this session (not saved to a file): desk.keyword("general:gaps_in", 5). */
    async keyword(name, value) {
      needAct("setting a Hyprland option");
      if (!/^[a-z_]+(:[a-z_.]+)+$/i.test(name)) deny(`not an option name: ${name}`);
      const r = await ran("hyprctl", ["keyword", name, String(value)]);
      if (r.code !== 0 || (r.out.trim() && r.out.trim() !== "ok")) throw new Error(`hyprctl keyword: ${(r.out || r.err).trim().slice(0, 300)}`);
      return "ok";
    },

    /** Click at global layout coordinates (from desk.read lines, or a window's at and size). button: left (default), right, middle. */
    async click(x, y, o = {}) {
      needAct("clicking");
      await guard(await underPoint(x, y), o);
      const a = ["click", String(Math.round(x)), String(Math.round(y)), "--abs", "--wait", "0.15"];
      if (o.button && o.button !== "left") a.push("--button", ["right", "middle", "back", "forward"].includes(o.button) ? o.button : deny(`unknown button ${o.button}`));
      if (o.double) a.push("--double");
      return deskBin(a);
    },
    /** Type text into the focused window (not into a terminal the request did not name). */
    async type(text, o = {}) {
      needAct("typing");
      const w = await activeWin();
      await guard([w], o);
      const t = String(text);
      if (!t.length || t.length > 2000) deny("type between 1 and 2000 characters");
      return deskBin(["type", "--wait", "0.15", ...(isTerminal(w) ? ["--force"] : []), "-"], t);
    },
    /** Press key combos in the focused window: desk.key("ctrl+s"), desk.key("super+2"). */
    async key(...combos) {
      needAct("pressing keys");
      const o = typeof combos.at(-1) === "object" ? combos.pop() : {};
      if (!combos.length) deny("no key given");
      const w = await activeWin();
      await guard([w], o);
      return deskBin(["key", "--wait", "0.15", ...(isTerminal(w) ? ["--force"] : []), ...combos.map(String)]);
    },
    /** Scroll "up", "down", "left" or "right" by n wheel clicks, over a global point when at: [x, y] is given. */
    async scroll(direction, n = 3, o = {}) {
      needAct("scrolling");
      if (!["up", "down", "left", "right"].includes(direction)) deny("direction must be up, down, left or right");
      if (o.at) await guard(await underPoint(o.at[0], o.at[1]), o);
      return deskBin(["scroll", direction, String(Math.min(30, Math.max(1, n))), ...(o.at ? ["--at", String(o.at[0]), String(o.at[1]), "--abs"] : []), "--wait", "0.15"]);
    },
    /** Left-drag between two global points. */
    async drag(x1, y1, x2, y2, o = {}) {
      needAct("dragging");
      await guard([...(await underPoint(x1, y1)), ...(await underPoint(x2, y2))], o);
      return deskBin(["drag", ...[x1, y1, x2, y2].map((v) => String(Math.round(v))), "--abs", "--wait", "0.15"]);
    },

    /** Window, layer and workspace rule calls in the Lua files Hyprland loads (Omarchy's defaults, then ~/.config/hypr), and the live workspace rules. */
    async rules(o = {}) {
      const base = process.env.OMARCHY_PATH || "/usr/share/omarchy";
      const roots = [{ origin: "omarchy", dir: path.join(base, "default", "hypr") }, { origin: "user", dir: path.join(process.env.HOME ?? os.homedir(), ".config", "hypr") }];
      const found = [];
      const walk = (origin, root, dir) => {
        let ents = [];
        try {
          ents = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of ents) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(origin, root, p);
          else if (e.name.endsWith(".lua")) {
            let src = "";
            try {
              src = fs.readFileSync(p, "utf8");
            } catch {
              continue;
            }
            for (const r of ruleCalls(src)) if (!(origin === "omarchy" && path.relative(root, p) === "helpers.lua")) found.push({ ...r, origin, file: path.relative(root, p), loadedByDefault: !/(^|\/)toggles\//.test(path.relative(root, p)) });
          }
        }
      };
      for (const r of roots) walk(r.origin, r.dir, r.dir);
      let rows = found;
      if (o.kind) rows = rows.filter((r) => r.kind === o.kind);
      if (o.match) {
        const re = rx(o.match);
        rows = rows.filter((r) => re.test(r.text) || re.test(r.comment ?? "") || re.test(r.file));
      }
      const max = o.max ?? 40;
      return { total: found.length, matched: rows.length, rules: rows.slice(0, max), cut: Math.max(0, rows.length - max) };
    },
    /** The workspace rules Hyprland has loaded now (hyprctl workspacerules). */
    async workspaceRules() {
      return hyprJson("workspacerules");
    },

    /**
     * An omarchy command, no shell: desk.omarchy("theme", "current"). Reading commands run in every ask; the ones that set something need act.
     * Commands that open a menu, wait for a person, update, install, or touch power, network and the system are refused.
     */
    async omarchy(...args) {
      const a = args.map(String);
      const line = a.join(" ");
      const kind = omarchyClass(a);
      if (kind.startsWith("refused")) deny(`omarchy ${line}: ${kind.slice(9)}`);
      const reading = kind === "read";
      if (!reading && !act) notInThisAsk(`omarchy ${line.slice(0, 80)}`);
      const r = await ran("omarchy", a, { timeoutMs: reading ? 20_000 : 60_000, env: { ...env, TERM: "dumb", NO_COLOR: "1" } });
      return { code: r.code, out: r.out.trim(), err: r.err.trim(), ...(r.timedOut ? { timedOut: true } : {}) };
    },
  };
  return api;
}
