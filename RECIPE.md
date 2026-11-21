# Recipe: desktop kit

## What it answers

The live state of a Linux desktop running Hyprland on Omarchy (Wayland): open windows with their
workspace, monitor, class, title, size and focus; monitors with resolution, scale and position;
loaded keybindings; window, layer and workspace rules; the Omarchy version, theme, font and
background, and which omarchy command does a job; the text a window or region shows (screenshot and
OCR). It operates the desktop when asked: focus, move, resize, float, close, launch, workspace
switch, Hyprland reload, theme and font changes, mouse and keyboard input.

## What it needs

- Linux with Hyprland 0.56 or later (Lua config), running in the session the agent runs in.
- On PATH: `hyprctl`, `grim`, `tesseract`, and `omarchy`. Clicks, typing, keys, scrolling and
  dragging go through the program named by the optional `DESK_HELPER` setting (README lists its arguments).
- No keys, no build step.

## What it reads and runs

- Runs `hyprctl`, `grim`, `tesseract`, `omarchy` and the `DESK_HELPER` program (no shell, timeouts, stdin closed)
  through `desk.mjs`. Reads `/proc/<pid>/comm` for the program behind each window, and the Lua files
  under `$OMARCHY_PATH/default/hypr` (default `/usr/share/omarchy`) and `~/.config/hypr` for rules.
- Writes screenshots to `$XDG_RUNTIME_DIR/desk-kit` (the newest 30 are kept).
- Refuses a changing call unless the ask may act; refuses windows on the deny list in `lib.mjs`,
  terminals the request did not name, and captures that overlap either; masks emails and tokens.

## Rebuild it from an empty folder

Write `ask-kit.toml` with one `module` source named `desk`, `requires` the four programs, a `DESK_HELPER` setting,
`platforms = ["linux"]` and `acts` written as prose (the module does the holding back).
`lib.mjs` holds the deny patterns, the terminal pattern, the masks, the decoding of a bind's
modifier mask (SUPER 64, CTRL 4, ALT 8, SHIFT 1), a scanner for `o.window`, `hl.window_rule`,
`hl.layer_rule` and `hl.workspace_rule` calls in Lua, and the grouping of omarchy command groups
by purpose. `desk.mjs` exports `make({settings, push, act})` returning a client with `windows`, `findWindow`,
`monitors`, `workspaces`, `binds`, `option`, `layers`, `rules`, `read` (grim on one window or region,
then tesseract TSV at psm 6, coordinates converted to the global layout), the acting calls and
`omarchy`. Its `exec` is injectable so the acting calls can be tested with a stub.

Scripts: `windows`, `find-window`, `monitors`, `binds`, `rules`, `omarchy`, `read-window`. Keep each
shot under 4,000 characters. Skills in `skills/`: find-and-focus, read-app, cross-app-task,
theme-font, keybinding-rule. Roles: observer, operator. Describe the module exactly in `api.d.ts`.

Facts the module relies on, checked against Hyprland 0.56.2: `hyprctl -j binds` gives Omarchy's binds
as `__lua` with a description; there is no command that lists loaded window or layer rules;
`hyprctl dispatch` takes Lua (`hl.dsp.focus({ window = "address:0x..." })`); `grim -g "X,Y WxH"` takes
global layout coordinates.

## Bench

`bench/questions.json`: eight questions of the kinds agents handle by hand,
put to facts that Omarchy's defaults fix, two script runs, and one refusal (a terminal that
the request does not name).
