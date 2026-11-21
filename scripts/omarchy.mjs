import { purposeOf } from "../lib.mjs";

export const meta = {
  purpose:
    "The Omarchy and Hyprland versions, the current theme, font and background, and the omarchy commands grouped by purpose. With `for` (a word or phrase) it lists the commands whose name or summary matches, each with its arguments and whether this kit runs it as a read, with act, or never.",
  params: {
    for: "a word or phrase to find commands for, optional: 'nightlight', 'font', 'workspace layout'",
    group: "list every command of one group, optional: 'theme', 'toggle'",
    themes: "true: also list the installed themes and fonts",
  },
  returns: "{omarchy, channel, hyprland:{version,date}, theme, font, background, purposes:{<purpose>:[group (number of commands)]}} or, with for or group, {commands:[{route,summary,args,kit}], matched, cut}",
  example: 'await scripts.run("omarchy", { for: "night light" })',
};

const one = async (desk, ...a) => {
  const r = await desk.omarchy(...a);
  return r.code === 0 ? r.out.split("\n")[0].trim() : null;
};

export default async function ({ desk }, { for: want, group, themes } = {}) {
  const raw = await desk.omarchy("commands", "--json");
  if (raw.code !== 0) throw new Error(`omarchy commands failed: ${(raw.err || raw.out).slice(0, 300)}`);
  const all = JSON.parse(raw.out).commands.filter((c) => !c.hidden);
  const row = (c) => {
    const k = desk.omarchyClass(c.route.replace(/^omarchy /, "").split(" "));
    return { route: c.route, summary: c.summary, args: c.args || undefined, ...(c.requires_sudo ? { sudo: true } : {}), kit: k === "read" || k === "act" ? k : "never" };
  };
  if (want || group) {
    const words = String(want ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.filter((c) => (!group || c.group === group) && words.every((w) => `${c.route} ${c.summary}`.toLowerCase().includes(w)));
    return { commands: hits.slice(0, 40).map(row), matched: hits.length, cut: Math.max(0, hits.length - 40) };
  }
  const purposes = {};
  const groups = {};
  for (const c of all) (groups[c.group] ??= []).push(c.name);
  for (const [g, names] of Object.entries(groups)) (purposes[purposeOf(g)] ??= []).push(`${g} (${names.length})`);
  const hv = await desk.hyprJson("version");
  const out = {
    omarchy: await one(desk, "version"),
    channel: await one(desk, "channel", "current"),
    hyprland: { version: hv.version, date: hv.commit_date },
    theme: await one(desk, "theme", "current"),
    font: await one(desk, "font", "current"),
    background: await one(desk, "theme", "bg", "current"),
    commands: all.length,
    purposes,
    next: "pass for: '<words>' or group: '<group>' to list commands",
  };
  if (themes) {
    out.themes = (await desk.omarchy("theme", "list")).out.split("\n").filter(Boolean);
    out.fonts = (await desk.omarchy("font", "list")).out.split("\n").filter(Boolean);
  }
  return out;
}
