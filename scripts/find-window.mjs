export const meta = {
  purpose:
    "Which open window matches a description in words ('the browser on workspace 2', 'floating terminal', 'the focused window'). Ranks windows by class, program, title, workspace, floating and focus, and returns the address to act on. Use `windows` for a list; this answers 'which one is it'.",
  params: { description: "words describing the window", max: "most candidates, default 5" },
  returns: "{description, best:{address,class,title,workspace,monitor,focused,score}|null, candidates:[same], note?}",
  example: 'await scripts.run("find-window", { description: "browser on workspace 1" })',
};

export default async function ({ desk }, { description, max = 5 } = {}) {
  if (!description) throw new Error("pass description: words describing the window");
  const c = (await desk.findWindow(description, { max })).map((w) => ({ address: w.address, class: w.class, title: w.title, workspace: w.workspace, monitor: w.monitor, at: w.at, size: w.size, floating: w.floating, focused: w.focused, visible: w.visible, ...(w.terminal ? { terminal: true } : {}), ...(w.denied ? { denied: w.denied } : {}), score: w.score }));
  const out = { description, best: c[0] ? { ...c[0] } : null, candidates: c };
  if (!c.length) out.note = "no open window matches; run the windows script to see what is open";
  else if (c.length > 1 && c[0].score === c[1].score) out.note = "the top candidates tie: say which one, or ask for more detail";
  return out;
}
