export const meta = {
  purpose:
    "Window rules, layer rules and workspace rules. Hyprland 0.56 cannot list the rules it has loaded, so this reads the rule calls in the Lua files it loads (Omarchy's defaults, then ~/.config/hypr), each with its file and line and the comment above it, plus the workspace rules Hyprland reports live, the layer surfaces on screen now, and the config errors. Rules under toggles/ only apply while that toggle is on.",
  params: {
    match: "regex on the rule text, its comment or its file, optional: 'opacity', 'float', 'steam'",
    kind: "window, layer or workspace, optional",
    live: "true: also the workspace rules Hyprland has loaded and the layer surfaces on screen now (long)",
    max: "most rules, default 10",
  },
  returns: "{total, matched, cut, rules:[{origin:'omarchy'|'user', file, line, kind, comment?, text, loadedByDefault}], workspaceRules and layersNow:[{monitor,namespace,w,h}] when kind is workspace or layer, or live is true, configErrors:[]}",
  example: 'await scripts.run("rules", { match: "opacity", kind: "window" })',
};

export default async function ({ desk }, { match, kind, live, max = 10 } = {}) {
  const r = await desk.rules({ match, kind, max });
  const out = { total: r.total, matched: r.matched, cut: r.cut, rules: r.rules.map((x) => ({ origin: x.origin, file: x.file, line: x.line, kind: x.kind, ...(x.comment ? { comment: x.comment } : {}), text: x.text, loadedByDefault: x.loadedByDefault })) };
  if (kind === "workspace" || live) out.workspaceRules = (await desk.workspaceRules()).slice(0, 20).map((w) => ({ workspace: w.workspaceString, monitor: w.monitor, default: w.default, persistent: w.persistent, border: w.border, gapsIn: w.gapsIn, gapsOut: w.gapsOut, layout: w.layout }));
  if (kind === "layer" || live) out.layersNow = (await desk.layers()).map((l) => ({ monitor: l.monitor, namespace: l.namespace, w: l.w, h: l.h }));
  out.configErrors = await desk.configErrors();
  return out;
}
