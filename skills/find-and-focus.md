Find a window and focus it, move it to another workspace or monitor, float, resize or close it

1. Find it: `await scripts.run("find-window", { description: "<words>" })`. Use `best.address`.
   When `note` says the top candidates tie, or two windows plausibly fit, say which one you chose.
   `await scripts.run("windows", { match: "<class>" })` lists every window of an app.
2. Check the window is not off limits before acting on it: `terminal: true` (a terminal may run a
   Claude Code session) and `denied` (password manager, login, banking, private window) show in
   the row. Do not close, type into or click in either unless the request names the terminal.
3. Focus: `await desk.focus(address)`. It confirms that focus moved or throws. A window on another
   workspace switches the view to that workspace. Say so in the answer.
4. Other changes, all by address:
   - `desk.moveToWorkspace(address, 3)` (add `{ follow: true }` to go there too)
   - `desk.float(address, "toggle")`, `desk.fullscreen(address, "maximized")`
   - `desk.resize(address, 100, 0)` adds pixels; `{ relative: false }` sets the size
   - `desk.workspace(2)` switches workspace without touching a window
   - `desk.close(address)` closes it. Closing can lose unsaved work: close only what the request
     named, and read the window first (`read-window`) when it holds something being edited.
5. Check: `await scripts.run("windows", { match: "<class>" })` shows the new workspace, `floating`,
   `size` and `focused`. Put those in the answer.
