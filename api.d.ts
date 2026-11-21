interface DeskWindow {
  address: string; class: string; initialClass: string; title: string; // title has emails and tokens masked
  workspace: number; workspaceName: string; monitor: string;
  at: [number, number]; size: [number, number]; // global layout coordinates, pixels
  floating: boolean; fullscreen: boolean; focused: boolean;
  visible: boolean; // its workspace is shown on a monitor now and it lies on a connected monitor (only visible windows can be captured)
  pid: number; program: string | null; xwayland: boolean; pinned: boolean; grouped: number; tags: string[];
  focusRank: number; // 0 is the most recently focused
  terminal: boolean; // a terminal may run a Claude Code session: it is only read or driven when the request names it
  denied: string | null; // why this window is never read, clicked in or typed into (password manager, login, banking, private window), else null
}
interface DeskMonitor {
  id: number; name: string; description: string; make: string; model: string; width: number; height: number; refresh: number; scale: number;
  x: number; y: number; logical: { w: number; h: number }; transform: number; workspace: number | null; workspaceName: string | null;
  specialWorkspace: string | null; focused: boolean; disabled: boolean; vrr: boolean; dpms: boolean; mirrorOf: string | null;
}
interface DeskBind { keys: string; mods: string[]; key: string; description: string | null; dispatcher?: string; arg?: string | null; /* both only for non-Lua binds */ flags?: string[]; submap?: string }
interface DeskRead {
  window: { address: string; class: string; title: string; workspace: number } | null; region: string; screenshot: string; scale: number;
  chars?: number; text?: string; lines?: { text: string; x: number; y: number }[]; linesCut?: number; masked?: string; alsoMatched?: number;
}
interface CmdResult { code: number; out: string; err: string; timedOut?: boolean }

declare const desk: {
  act: boolean; // true when this ask may change things

  // ---- reading: allowed in every ask ----

  // Open windows (mapped ones), sorted by workspace then position. Optional filters: match (regex on class, title or program), workspace (id or name),
  // monitor (name), floating, focused, visible. The same data as the `windows` script, with every field.
  windows(o?: { match?: string; workspace?: string | number; monitor?: string; floating?: boolean; focused?: boolean; visible?: boolean }): Promise<DeskWindow[]>;
  // Windows ranked against a description in words: "browser on workspace 2", "floating terminal", "the focused window". Each has a score; the best is first.
  findWindow(description: string, o?: { max?: number }): Promise<(DeskWindow & { score: number })[]>;
  // Monitors with resolution, refresh, scale, position and the workspace each shows. Only a "FALLBACK" output means no real display is connected.
  monitors(): Promise<DeskMonitor[]>;
  // Workspaces that have windows or are pinned: [{id, name, monitor, windows, fullscreen, tiledLayout}].
  workspaces(): Promise<{ id: number; name: string; monitor: string; windows: number; fullscreen: boolean; tiledLayout: string }[]>;
  // Loaded keybindings as Hyprland has them now. q: words that must all appear in the combination or description. o.key: an exact combination ("SUPER + W") or key.
  // Lua binds (all of Omarchy's) have only the description: Hyprland gives their action as an internal slot number, which is left out.
  binds(q?: string, o?: { key?: string; max?: number }): Promise<{ total: number; matched: number; cut: number; binds: DeskBind[] }>;
  // One Hyprland option as hyprctl prints it ({option, int|float|str|custom, set}); name like "general:gaps_in". options("general:gaps_in", "decoration:rounding") returns {name: value}.
  option(name: string): Promise<any>;
  options(...names: string[]): Promise<Record<string, any>>;
  // Layer surfaces on screen now (bar, dock, notifications, menus): [{monitor, level, namespace, x, y, w, h}].
  layers(): Promise<{ monitor: string; level: number; namespace: string; x: number; y: number; w: number; h: number }[]>;
  // Errors Hyprland reports for the config it loaded: [] when clean.
  configErrors(): Promise<string[]>;
  // Rule calls found in the Lua files Hyprland loads (Omarchy defaults under $OMARCHY_PATH/default/hypr, then ~/.config/hypr/*.lua): kind "window" | "layer" | "workspace",
  // file (relative to its origin), line, comment above it, text (the call). Hyprland 0.56 has no command that lists loaded window or layer rules, so this is the closest source.
  // Files under toggles/ only apply while that toggle is on (loadedByDefault: false).
  rules(o?: { match?: string; kind?: "window" | "layer" | "workspace"; max?: number }): Promise<{ total: number; matched: number; cut: number; rules: { origin: "omarchy" | "user"; file: string; line: number; kind: string; comment?: string; text: string; loadedByDefault: boolean }[] }>;
  // Workspace rules Hyprland has loaded now (hyprctl workspacerules).
  workspaceRules(): Promise<any[]>;

  // Screenshot one window or region, then OCR it. o.window: regex on class or title, or an address; o.region: "X,Y WxH" in global layout coordinates;
  // o.terminal: a terminal's address, only when the request names that terminal; o.psm: tesseract mode (6 text blocks, 11 sparse); o.ocr false: screenshot only.
  // Returns text, lines with the global coordinates of their centres (usable by desk.click), and the screenshot's path (never image bytes).
  // Throws, and captures nothing, for: no window or region named (the whole desktop is never captured), a deny-listed window (password managers, keyring and polkit prompts,
  // login, banking, private browsing), a capture rectangle that overlaps one, a terminal not named, a window on a workspace no monitor shows.
  // Emails and tokens in the text are replaced. The path is under $XDG_RUNTIME_DIR/desk-kit; open it only if the layout matters, text is usually enough.
  read(o: { window?: string; region?: string; terminal?: string; psm?: number; ocr?: boolean; maxChars?: number; maxLines?: number }): Promise<DeskRead>;

  // hyprctl with an argument list, no shell: desk.hypr("-j", "clients"). Reading commands run in every ask. dispatch, keyword, reload, setprop, eval and the rest need act.
  // Refused always: --batch, kill (waits for a click), an interactive repl, rollinglog -f. Never throws on a non-zero exit.
  hypr(...args: string[]): Promise<CmdResult>;
  // As hypr("-j", ...args) parsed; throws on a non-zero exit. desk.hyprJson("monitors"), desk.hyprJson("version"), desk.hyprJson("devices").
  hyprJson(...args: string[]): Promise<any>;

  // "read", "act" or "refused: why" for an omarchy command line, without running it: desk.omarchyClass(["theme", "set", "tokyo-night"]) is "act".
  omarchyClass(args: string[]): string;
  // An omarchy command, no shell: desk.omarchy("theme", "current"). Reading commands (version, theme current|list, font current|list, commands --json, --help of any command,
  // menu keybindings --print) run in every ask. Setting commands (theme set, font set, theme bg next|set, toggle ..., restart ..., bar ..., hyprland ..., launch ..., reminder,
  // notification, brightness, audio, display) need act. Refused always: menus and pickers that wait for a person, update, install, remove, refresh, reinstall, setup, system (lock, power),
  // network, theme install, `hyprland window close all`, `windows key`. Never throws on a non-zero exit.
  omarchy(...args: string[]): Promise<CmdResult>;

  // ---- acting: each throws "not in this ask" unless act is true ----
  // A window is an address from desk.windows() or a description. close, click, type, key, scroll and drag refuse a deny-listed window, the window this process runs in,
  // and a terminal unless o.terminal is that terminal's address (pass it only when the request names the terminal).

  focus(window: string): Promise<{ focused: string; class: string; workspace: number }>; // confirms that focus moved
  workspace(id: string | number): Promise<string>; // switch workspace on the focused monitor: 3, "name:web", "previous_per_monitor"
  close(window: string, o?: { terminal?: string }): Promise<string>;
  float(window: string, action?: "toggle" | "enable" | "disable"): Promise<string>;
  moveToWorkspace(window: string, workspace: string | number, o?: { follow?: boolean }): Promise<string>;
  resize(window: string, x: number, y: number, o?: { relative?: boolean }): Promise<string>; // relative by default: pixels to add
  fullscreen(window: string, mode?: "fullscreen" | "maximized"): Promise<string>;
  launch(command: string): Promise<string>; // a command string started detached through Hyprland: desk.launch("nautilus ~/Downloads")
  // Any Hyprland Lua dispatcher (Hyprland 0.56 syntax): desk.dispatch('hl.dsp.focus({ workspace = "3" })'). List them with desk.hypr("repl", "...") only when needed.
  dispatch(lua: string): Promise<string>;
  reload(): Promise<{ reloaded: boolean; errors: string[] }>; // hyprctl reload, then configerrors: [] means the config is valid
  keyword(name: string, value: string | number): Promise<string>; // one option for this session only, not saved: desk.keyword("general:gaps_in", 5)

  // Global layout coordinates, as given by desk.read lines or a window's at and size. After every step that changes the screen, read again before the next click.
  click(x: number, y: number, o?: { button?: "left" | "right" | "middle"; double?: boolean; terminal?: string }): Promise<string>;
  type(text: string, o?: { terminal?: string }): Promise<string>; // into the focused window; check desk.windows({focused: true}) first
  key(...combos: (string | { terminal?: string })[]): Promise<string>; // an options object may come last // "ctrl+s", "enter", "super+2", "alt+f4", "esc", "tab", "f5", "pgdn"
  scroll(direction: "up" | "down" | "left" | "right", n?: number, o?: { at?: [number, number]; terminal?: string }): Promise<string>;
  drag(x1: number, y1: number, x2: number, y2: number, o?: { terminal?: string }): Promise<string>;
};
