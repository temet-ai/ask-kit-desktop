Do a short task that crosses apps, step by step, with a check after each step

Examples: copy a value from one window into another, open a file in an app, click through a dialog.
The person may be using the machine at the same time, so keep it small and say what you drive.

1. Plan the steps in your head and name the windows each one touches. Check every window with
   `windows`: a deny-listed window, an unnamed terminal or the caller's own window ends the task
   there. Report which and why.
2. Say what you are about to do and to which window, then focus it: `await desk.focus(address)`.
3. Look before you click: `await scripts.run("read-window", { window: "<class>" })`. Pick the
   target from `lines` (use its `x` and `y`) or from the window's `at` and `size`.
4. One action: `await desk.click(x, y)`, `await desk.type("text")` into the focused window,
   `await desk.key("ctrl+s")`, `await desk.scroll("down", 3, { at: [x, y] })`.
   Prefer a Hyprland call (`desk.focus`, `desk.workspace`, `desk.launch`) to a key press when one exists.
5. Check at once: `read-window` again, and compare with what you expected (the dialog opened, the
   field holds the text, the list changed). Coordinates from before the action are stale, so take
   new ones from the new read.
6. A click that misses twice: change approach (a keyboard route such as tab, arrows or a
   shortcut, or `psm: 11`, or a smaller region). After three failed steps, stop and report.
7. Never type passwords or payment details, confirm a purchase, send a message, delete data or
   click links in mail or chat. Say that the person has to do these themselves.
8. The answer lists each step with its check, and the state at the end.
