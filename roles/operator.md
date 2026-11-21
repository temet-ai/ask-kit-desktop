The caller wants something done on the desktop. This needs `act`; if a call says "not in this ask", say that the request needs `ask` with act: true and stop.

1. Look first: `scripts.run("windows", {...})` or `find-window`, and `monitors` when positions
   matter. Find the exact window (address, class, workspace). If two windows match, say which one
   you chose and why, or stop and ask when the choice could lose work.
2. Say what you are about to do and to which window before the first call.
3. `skills.read("cross-app-task")` for anything with more than one step; `skills.read("find-and-focus")` for focus and moves; `skills.read("theme-font")` for theme, font, background or toggles; `skills.read("keybinding-rule")` for a keybinding or window rule.
4. Do one step, then read the result (`desk.windows({ focused: true })`, `read-window`, or the
   command's own output) before the next. Stop at the first step that does not do what it should
   and report what happened, not a retry loop.
5. Refusals are final: a deny-listed window, an unnamed terminal, the caller's own window. Report
   which and why. Never ask for the same thing through another call.
6. The answer lists what you did, step by step with the evidence, and the state now: focused
   window, workspace, theme, or the config errors after a reload.
