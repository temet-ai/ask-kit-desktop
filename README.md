# ask-kit-desktop

An [ask-kit](https://github.com/temet-ai/ask-kit) kit that lets your coding agent's `ask` tool
answer questions about a Linux desktop running Hyprland on Omarchy, and operate it when asked.
A cheap model runs `hyprctl`, `grim`, `tesseract` and the `omarchy` command
outside your agent's context and answers with window addresses, monitor names and the text a
window shows.

Questions from its bench, of the kinds agents answer by hand with `hyprctl`:

- Which keybinding closes the focused window, and what does SUPER + SHIFT + RETURN open?
- Which window rule does Omarchy set for 1Password windows, and in which file?
- Which monitors are connected, with resolution and scale?

## Install

You need [ask-kit](https://github.com/temet-ai/ask-kit#set-it-up), Hyprland (0.56 or later, with
the Lua config) and these programs on PATH: `hyprctl`, `grim`, `tesseract`, and `omarchy`. Clicking and typing
need one more program, set with `DESK_HELPER` (see below).

Paste this into your agent:

```
Read ~/.config/ask-kit/AGENTS.md, then add this kit: github.com/temet-ai/ask-kit-desktop
```

Or run it yourself:

```sh
ask-kit kit install temet-ai/ask-kit-desktop        # shows what it reads, changes and runs
ask-kit kit install temet-ai/ask-kit-desktop --yes  # installs and enables it
```

Restart your agents so `ask` lists `desktop`. The kit answers about the desktop session it runs
in. Which file in `~/.config` sets something is the dotfiles kit's question; this kit answers
what Hyprland has loaded now.

## What it carries

| | |
|---|---|
| Scripts | `windows` (every open window: workspace, monitor, class, title, geometry, floating, focused), `find-window` (which window matches a description, with its address), `monitors` (resolution, refresh, scale, position, workspace), `binds` (loaded keybindings, searched by key or by what they do), `rules` (window, layer and workspace rules, with file and line), `omarchy` (versions, theme, font, background, and which omarchy command does a job), `read-window` (screenshot and OCR of one window or region) |
| Skills | `find-and-focus`, `read-app`, `cross-app-task`, `theme-font`, `keybinding-rule`: playbooks the investigator loads when the job calls for one |
| Roles | `observer` for questions about what is open, bound, ruled or showing; `operator` for requests to do something on the desktop |

Each script also runs with no model: `ask-kit run desktop windows`, or `ask(do: "desktop.windows")`
from an agent. A shot returns at most 4,000 characters, so a long list is cut; the investigator
gets the whole result.

Hyprland 0.56 has no command that lists the window and layer rules it has loaded. `rules` reads the
rule calls from the Lua files Hyprland loads (Omarchy's defaults, then `~/.config/hypr`) and says
so; the workspace rules and the layer surfaces on screen come from Hyprland live.

## What it can change

The mouse and keyboard calls (`desk.click`, `desk.type`, `desk.key`, `desk.scroll`, `desk.drag`) run the program named by
the `DESK_HELPER` setting. It is called as:

- `<helper> click X Y --abs --wait 0.15 [--button right|middle|back|forward] [--double]`
- `<helper> type --wait 0.15 [--force] -` with the text on stdin
- `<helper> key --wait 0.15 [--force] COMBO...` (`ctrl+s`, `super+2`)
- `<helper> scroll up|down|left|right N [--at X Y --abs] --wait 0.15`
- `<helper> drag X1 Y1 X2 Y2 --abs --wait 0.15`

with global Hyprland layout coordinates. A small script around `ydotool` and `wtype` does it. Without the setting those
five calls refuse; reading and every other acting call work without it.


A question never changes anything. `desk.mjs` sorts every call into reading or changing, and a
changing call is refused unless the caller asked for a change (`act`). When asked, it can focus,
move, resize, float, fullscreen and close a window, switch workspace, launch a program, send a
Hyprland Lua dispatch, set an option for the session, reload Hyprland and report config errors,
click, drag, scroll, type and press keys through the `DESK_HELPER` program, and run omarchy commands that
set something: `theme set`, `font set`, `theme bg next|set`, `toggle`, `restart`, `bar`,
`hyprland`, `launch`, `reminder`, `notification`, `brightness`, `audio`, `display`.

What a screen shows goes to a cloud model, so `desk.mjs` checks before it captures or drives
anything:

- A screenshot or OCR is taken of the window or region the question names, never the whole
  desktop. The kit takes the screenshot itself (grim, saved under `$XDG_RUNTIME_DIR/desk-kit`) and
  returns the text and the file's path, not image bytes. It does not touch `desk`'s own
  last-screenshot state, so another session's clicks keep their coordinates.
- A window on the deny list is never captured, clicked in, typed into or closed, and a capture
  rectangle that overlaps one is refused. The list is one pair of patterns in `lib.mjs`: 1Password,
  Bitwarden, KeePass and other password managers, keyring, polkit and pinentry prompts, and titles
  with sign in, log in, password, passphrase, bank, payment, incognito or private browsing.
- A terminal is read or driven only when the request names it, because a terminal may run a Claude
  Code session. Typing into the window the process itself runs in is refused when it can be told
  apart; sessions that run under a terminal multiplexer cannot be, so the instructions say to stop
  and name the window.
- Email addresses and token-shaped strings in window titles and OCR text are replaced before they
  leave the kit.
- Typing, clicking and key presses are checked against the window that has focus or lies under the
  point. `--batch`, `hyprctl kill`, an interactive REPL, `rollinglog -f` and Lua that sends raw keys
  or runs the Lua libraries are refused. Omarchy menus and pickers that wait for a person, updates,
  installs, refreshes, system and power commands, and `hyprland window close all` are refused.
- Every command has a timeout and runs without a shell.

## How well it works

`bench/questions.json` holds eight questions and two script runs, each with patterns its answer
must hold. It has not been run on a model yet; `ask-kit kit test desktop` runs it. The seven
scripts and the checks above were run with no model on the machine it was written on, with a
stubbed executor for the acting calls and for one OCR run on a generated image.
