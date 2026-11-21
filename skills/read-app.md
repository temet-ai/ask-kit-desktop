Read what a native app, window or screen region shows now: its text, a list, a dialog, a number

1. Name what to read. `await scripts.run("windows", { match: "<app>" })` gives the class and
   whether it is `visible` (its workspace is on a monitor). A hidden window cannot be captured;
   say so, and that focusing it needs act.
2. Check the row: `denied` is a reason the window is never read (password manager, keyring,
   login, banking, private window). Report it and stop. `terminal: true` means a terminal that may
   run a Claude Code session: read it only when the request names that window.
3. Read it: `await scripts.run("read-window", { window: "<class or title regex>" })`. The result
   has `text`, `lines` (each with global `x`, `y`), and `screenshot` (a PNG path). A region is
   `{ region: "X,Y WxH" }` in global pixels, for example a part of a window you already know
   from `at` and `size`.
4. If the text looks garbled or misses what you need: read a smaller region around it, or try
   `psm: 11` (sparse text: menus, buttons, icons). Say when the text stayed unclear instead of
   guessing a number or a name.
5. A web page in Chrome is better read through the browser kit or the Chrome tools when the
   question is about the page; read the window only when the question is about what is on screen.
6. Answer with the text that matters, quoted briefly, and the screenshot path as the evidence.
   Text with `masked` set had an email address or token replaced: do not try to recover it.
   Never describe the screenshot as if you had seen the pixels: you have the OCR text only.
