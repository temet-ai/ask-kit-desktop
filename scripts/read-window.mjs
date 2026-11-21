export const meta = {
  purpose:
    "The text one window or screen region shows now: takes a screenshot of just that window and reads it with OCR (tesseract). Returns the text, the lines with the global coordinates of their centres, and the screenshot's path, never image bytes. Refuses password managers, keyring and polkit prompts, login, banking and private-browsing windows, any capture that would overlap one, and terminals the request did not name. Emails and tokens in the text are masked. It cannot read a window on a workspace no monitor shows.",
  params: {
    window: "regex on a window's class or title, or its address (0x...)",
    region: "instead of a window: 'X,Y WxH' in global layout coordinates, e.g. '0,0 800x600'",
    terminal: "the address of a terminal window to read; pass it only when the request names that terminal",
    psm: "tesseract page segmentation mode, default 6 (a block of text); 11 for sparse text such as icons and menus",
    ocr: "false: only take the screenshot",
  },
  returns: "{window:{address,class,title,workspace}|null, region, screenshot, scale, chars, text, lines:[{text,x,y}], linesCut?, masked?, alsoMatched?}",
  example: 'await scripts.run("read-window", { window: "^org.gnome.Nautilus$" })',
};

export default async function ({ desk }, p = {}) {
  return desk.read({ window: p.window, region: p.region, terminal: p.terminal, psm: p.psm, ocr: p.ocr });
}
