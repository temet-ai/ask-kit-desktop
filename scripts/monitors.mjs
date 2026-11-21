export const meta = {
  purpose:
    "The connected monitors: resolution, refresh rate, scale, position in the global layout, the workspace each shows, which one has focus, and the size of the whole layout. Says plainly when only Hyprland's fallback output exists (no real display connected).",
  params: {},
  returns: "{monitors:[{name,description,width,height,refresh,scale,x,y,logical:{w,h},workspace,workspaceName,focused,disabled,vrr,mirrorOf}], layout:{x,y,w,h}, note?}",
  example: 'await scripts.run("monitors")',
};

export default async function ({ desk }) {
  const ms = (await desk.monitors()).map(({ id, make, model, transform, dpms, specialWorkspace, ...m }) => ({ ...m, ...(transform ? { transform } : {}), ...(specialWorkspace ? { specialWorkspace } : {}) }));
  const live = ms.filter((m) => !m.disabled);
  const x0 = Math.min(...live.map((m) => m.x));
  const y0 = Math.min(...live.map((m) => m.y));
  const x1 = Math.max(...live.map((m) => m.x + m.logical.w));
  const y1 = Math.max(...live.map((m) => m.y + m.logical.h));
  const out = { monitors: ms, layout: live.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null };
  if (ms.length && ms.every((m) => m.name === "FALLBACK")) out.note = "Only Hyprland's FALLBACK output exists: no real monitor is connected or enabled, so windows keep their old positions and cannot be captured.";
  if (!ms.length) out.note = "Hyprland reports no monitors.";
  return out;
}
