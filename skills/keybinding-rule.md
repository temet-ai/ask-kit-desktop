Add or change a keybinding or a window rule, and verify it is loaded

The edit is a file edit in `~/.config/hypr` (`bindings.lua` for keys; `hyprland.lua` or a module for
window rules). That belongs to the dotfiles kit. This kit checks before and after.

1. Before: is the key taken? `await scripts.run("binds", { key: "SUPER + SHIFT + R" })` shows
   what it does now. When it is bound, the change is a rebind (`o.rebind` in Omarchy's Lua), and
   the answer must say what the key did before.
2. For a rule, look at what exists: `await scripts.run("rules", { match: "<class or word>" })`
   shows rule calls with file and line. Hyprland's window rule syntax changes between versions,
   so copy the form of a rule that already works here.
3. Make the edit (the dotfiles kit, or `ask.kit("dotfiles", "...")`). Do not edit
   `/usr/share/omarchy`.
4. Reload and check (needs act): `const r = await desk.reload()`. `r.errors` must be empty. A
   non-empty list is the answer: report the lines, and do not claim the change works.
5. Verify it is loaded: `scripts.run("binds", { key: "..." })` shows the new binding with its
   description; `rules` shows the new call. A rule's effect on a window shows in `windows` (its
   `tags`, `floating`, `size`).
6. The answer gives the file and line that was edited, `errors: []`, and the loaded binding or rule.
