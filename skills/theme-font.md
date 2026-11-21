Change the theme, font or background, or a toggle, the Omarchy way

Omarchy generates many files from a theme (terminal, bar, editor, GTK). Never edit those, nothing
under `/usr/share/omarchy`, and no theme file by hand when a command does it.

1. Look at where things stand: `await scripts.run("omarchy", { themes: true })` returns the
   current theme, font and background and the installed themes and fonts. Match the name the
   request gives (the commands take "Tokyo Night" and "tokyo-night" alike).
2. Find the command if you are unsure: `await scripts.run("omarchy", { for: "<words>" })`. Each
   command has `kit`: `read`, `act` or `never`. A `never` is the person's to run.
3. Run it (needs act), no shell, one argument per item:
   - theme: `await desk.omarchy("theme", "set", "<name>")`
   - font: `await desk.omarchy("font", "set", "<name>")`
   - background: `await desk.omarchy("theme", "bg", "next")` or `("theme", "bg", "set", "<path>")`
   - toggles and restarts: `await desk.omarchy("toggle", "nightlight")`, `("restart", "shell")`
   - `<command> --help` shows what a command takes without running it.
   Check `code` and `err` in the result.
4. Verify: `await scripts.run("omarchy")` shows the theme, font and background now. A theme change
   can take a moment to reach every app; read it again before saying it did not apply.
5. Installing, updating, removing and refreshing themes or fonts are refused. A custom theme or a
   tweak of a stock one is a file edit under `~/.config/omarchy/themes`: the dotfiles kit does the
   edit, then run `theme set` again here.
6. The answer gives the old value, the command that ran and the new value.
