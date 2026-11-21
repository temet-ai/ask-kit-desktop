export const meta = {
  purpose:
    "Every window open now: workspace, monitor, class, title, position and size, floating or tiled, fullscreen, focused, whether its workspace is on screen, the process behind it, and whether it is a terminal or on the deny list. Filters by class or title, workspace, monitor, floating or focused. Titles have emails and tokens masked.",
  params: {
    match: "regex on class, title or program name, optional",
    workspace: "workspace id or name, optional",
    monitor: "monitor name, optional",
    floating: "true or false, optional",
    focused: "true: only the focused window, optional",
    visible: "true: only windows whose workspace a monitor shows now, optional",
    max: "most windows to return, default 40",
  },
  returns: "{count, shown, cut, workspaces:[{id,name,monitor,windows}], windows:[{address,class,title,workspace,monitor,at:[x,y],size:[w,h],floating,fullscreen,focused,visible,program,pid,terminal,denied}]}",
  example: 'await scripts.run("windows", { match: "chrome" })',
};

export default async function ({ desk }, { match, workspace, monitor, floating, focused, visible, max = 40 } = {}) {
  const all = await desk.windows({ match, workspace, monitor, floating, focused, visible });
  const rows = all.slice(0, max).map((w) => {
    const { initialClass, focusRank, xwayland, pinned, grouped, tags, ...r } = w;
    const out = { ...r };
    if (initialClass && initialClass !== w.class) out.initialClass = initialClass;
    if (xwayland) out.xwayland = true;
    if (pinned) out.pinned = true;
    if (tags.length) out.tags = tags;
    if (!w.denied) delete out.denied;
    if (!w.terminal) delete out.terminal;
    return out;
  });
  return { count: all.length, shown: rows.length, cut: all.length - rows.length, workspaces: await desk.workspaces(), windows: rows };
}
