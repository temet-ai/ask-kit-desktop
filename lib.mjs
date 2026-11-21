// Shared helpers for the desktop kit: the deny list (the one place that says which windows are never
// read, clicked in or typed into), masking of tokens and email addresses, and decoding of Hyprland's
// JSON (key bindings, monitors, windows).

// ---- The deny list -------------------------------------------------------------------------------
// A window that matches is never captured, OCR'd, clicked in, typed into or closed by this kit, and
// a capture region that overlaps one is refused. Edit these two patterns, nothing else.
export const DENY_CLASS =
  /1password|bitwarden|keepass|enpass|proton.?pass|lastpass|dashlane|nordpass|keeper|gnome-keyring|seahorse|kwalletmanager|polkit|pinentry|gcr-prompter|ksshaskpass|ssh-askpass/i;
export const DENY_TITLE =
  /sign.?in|log.?in|log.?on|password|passphrase|passcode|authenticat|unlock|keyring|polkit|pinentry|1password|bitwarden|keepass|two.?factor|2fa|verification code|one.?time|private browsing|incognito|inprivate|bank|paypal|payment|checkout|credit card/i;

/** Why a window is off limits, or null. */
export function denied(w) {
  const cls = `${w.class ?? ""} ${w.initialClass ?? ""}`;
  if (DENY_CLASS.test(cls)) return `its class (${w.class}) is a password manager, keyring or authentication prompt`;
  if (DENY_TITLE.test(`${w.title ?? ""} ${w.initialTitle ?? ""}`)) return "its title looks like a login, password, banking or private-browsing window";
  return null;
}

// A terminal may run a Claude Code session, so it is only read or driven when the request names it.
export const TERMINAL = /foot|alacritty|kitty|ghostty|wezterm|konsole|terminal|xterm|st-256color|tmux|^TUI\.|org\.omarchy\.(terminal|tui)/i;
export const isTerminal = (w) => TERMINAL.test(w.class ?? "") || TERMINAL.test(w.initialClass ?? "");

// ---- Masking ---------------------------------------------------------------------------------------
const MASKS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[private key]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g, "[email]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[token]"],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, "[token]"],
  [/\b(ghp|gho|ghu|ghs|ghr|github_pat|glpat|xox[abprs]|AKIA|ASIA|AIza|ya29)[A-Za-z0-9_.-]{12,}/g, "[token]"],
  [/\b[0-9a-f]{32,}\b/gi, "[hex]"],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{28,}\b/g, "[token]"],
];

/** Replace email addresses and anything shaped like a token or key. Returns {text, n}. */
export function mask(s) {
  let n = 0;
  let text = String(s ?? "");
  for (const [re, to] of MASKS) text = text.replace(re, () => (n++, to));
  return { text, n };
}
export const maskTitle = (s) => mask(s).text;

// ---- Hyprland decoding ------------------------------------------------------------------------------
const MOD_BITS = [[64, "SUPER"], [4, "CTRL"], [8, "ALT"], [1, "SHIFT"]];
/** Hyprland's modmask as words, in the order Omarchy writes them: SUPER CTRL ALT SHIFT. */
export const modNames = (mask) => MOD_BITS.filter(([bit]) => mask & bit).map(([, n]) => n);

export function bindRow(b) {
  const mods = modNames(b.modmask);
  const key = b.key;
  const keys = [...mods, key].join(" + ");
  const flags = ["locked", "mouse", "release", "repeat", "longPress", "non_consuming"].filter((f) => b[f]);
  const row = { keys, mods, key, description: b.description || null };
  if (b.dispatcher !== "__lua") Object.assign(row, { dispatcher: b.dispatcher, arg: b.arg || null });
  if (b.submap) row.submap = b.submap;
  if (flags.length) row.flags = flags;
  // A Lua bind (every Omarchy bind) shows only a slot number as its argument: the description is the readable part.
  if (b.dispatcher === "__lua" && !row.description) row.description = "(no description: a Lua function with no label)";
  return row;
}

export const lines = (s) => (s ? String(s).split("\n").filter(Boolean) : []);

/** Does the point lie in the rectangle at [x,y] of size [w,h]? */
export const inside = (pt, at, size) => pt[0] >= at[0] && pt[0] < at[0] + size[0] && pt[1] >= at[1] && pt[1] < at[1] + size[1];
/** Do two rectangles {x,y,w,h} overlap? */
export const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A regex from text the investigator wrote: a bad pattern is taken literally. */
export function rx(s) {
  try {
    return new RegExp(s, "i");
  } catch {
    return new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

// ---- Lua rule calls -------------------------------------------------------------------------------------
const RULE_CALL = /\b(o\.window|o\.transparent_window|hl\.window_rule|hl\.layer_rule|hl\.workspace_rule)\s*\(/g;

// A Lua line without its trailing comment (a "--" outside quotes).
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "-" && line[i + 1] === "-") return line.slice(0, i);
  }
  return line;
}

/** The window, layer and workspace rule calls in a Lua file: [{kind, line, comment, text}]. Strings and comments are skipped when balancing parentheses. */
export function ruleCalls(src) {
  const out = [];
  const lineAt = (i) => src.slice(0, i).split("\n").length;
  const rows = src.split("\n");
  let m;
  RULE_CALL.lastIndex = 0;
  while ((m = RULE_CALL.exec(src))) {
    // Skip a match inside a comment.
    const ls = src.lastIndexOf("\n", m.index) + 1;
    if (/--/.test(src.slice(ls, m.index))) continue;
    let depth = 0;
    let i = m.index + m[0].length - 1;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "-" && src[i + 1] === "-") i = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
    }
    const line = lineAt(m.index);
    const comment = [];
    for (let k = line - 2; k >= 0 && /^\s*--/.test(rows[k]); k--) comment.unshift(rows[k].replace(/^\s*--\s?/, ""));
    const kind = m[1].includes("layer") ? "layer" : m[1].includes("workspace") ? "workspace" : "window";
    const text = src.slice(m.index, i + 1).split("\n").map(stripComment).join(" ").replace(/\s+/g, " ").slice(0, 300);
    out.push({ kind, line, ...(comment.length ? { comment: comment.join(" ").slice(0, 160) } : {}), text });
    RULE_CALL.lastIndex = Math.max(RULE_CALL.lastIndex, i);
  }
  return out;
}

// ---- omarchy command purposes -----------------------------------------------------------------------------
const PURPOSES = {
  look: ["theme", "font", "bar", "dock", "branding", "screensaver", "display", "osd", "plymouth"],
  "windows, workspaces and monitors": ["hyprland", "launch", "monitor", "brightness"],
  "screenshots, recording and sharing": ["capture", "share", "transcode", "ascii"],
  "audio, bluetooth and dictation": ["audio", "bluetooth", "voxtype", "dictation"],
  "toggles, restarts and power": ["toggle", "restart", "powerprofiles", "hibernation", "power", "battery"],
  "shell, menus, hooks and notifications": ["menu", "shell", "plugin", "hook", "notification", "reminder", "show", "crash"],
  "install, update and reset": ["install", "remove", "pkg", "update", "upgrade", "refresh", "reinstall", "setup", "migrate", "channel", "snapshot", "version", "mise", "webapp", "tui", "games", "kernel"],
  "hardware, network and system": ["hw", "network", "drive", "tailscale", "dns", "n1x", "language", "sudo", "cmd", "debug", "disk", "file", "weather", "system"],
  "agents and developer tools": ["agent", "default", "dev", "nvim", "openclaw", "windows"],
};
export function purposeOf(group) {
  for (const [p, gs] of Object.entries(PURPOSES)) if (gs.includes(group)) return p;
  return "other";
}
