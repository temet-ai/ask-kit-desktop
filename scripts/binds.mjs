export const meta = {
  purpose:
    "The keybindings Hyprland has loaded right now (which can differ from the files), with the key combination, what it does in Omarchy's own words, its dispatcher and flags. Search by words (what it does, or part of the key) or by an exact combination. Use dotfiles to find which file defines a binding.",
  params: {
    q: "words that must all appear in the combination or description, optional: 'close window', 'super shift', 'volume'",
    key: "an exact combination or key to look up, optional: 'SUPER + SHIFT + RETURN', 'SUPER+W', 'F5'",
    max: "most bindings to return, default 30",
  },
  returns: "{total, matched, cut, binds:[{keys, description, dispatcher, arg, flags?, submap?}]}",
  example: 'await scripts.run("binds", { q: "close window" })',
};

export default async function ({ desk }, { q, key, max = 30 } = {}) {
  const r = await desk.binds(q, { key, max });
  return { total: r.total, matched: r.matched, cut: r.cut, binds: r.binds.map(({ mods, key, ...b }) => b) };
}
