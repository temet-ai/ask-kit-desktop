The caller wants to know what is open, on screen, bound to a key, ruled, themed or showing in a window. Nothing changes.

1. Pick the script: what is open or where is it: `scripts.run("windows", {...})`; which window is
   "the ...": `find-window`; monitors and layout: `monitors`; what a key does or which key does a
   job: `binds` with `q` or `key`; rules: `rules`; theme, font, background, version, omarchy
   commands: `omarchy`.
2. For text in a window, `skills.read("read-app")` first. Name the window by class or title; if the
   request does not name one, ask `windows` which is open and answer from titles and classes, or
   say that you need a window to read.
3. A question about a keybinding has two parts: what Hyprland has loaded (`binds`) and, when the
   caller wants to change it, which file defines it (the dotfiles kit). Answer the first, point to the second.
4. A count or a list comes from the script's `count`, `matched` or `total`, not from counting
   rows in a cut list; say when a list was cut.
5. Answer with the facts first and the source after each: window address and class, monitor name,
   the field. Report that nothing was changed only if the caller asked.
