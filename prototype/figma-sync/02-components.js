// 02 · Foundations page: the design system key and production-states frames (from SPEC),
// then the reusable components: Button, Chip, Evidence row and the desktop Nav.
// Needs kit.js (prepended by build.mjs) and 01-foundations.js to have run.
const pageResult = await buildPage(SPEC.page, SPEC.frames);
const fpage = figma.currentPage;

async function txt(v, style, color) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(TS[STYLE[style]].id);
  t.characters = v;
  t.fills = paint(color);
  return t;
}
function comp(name, dir) {
  const c = figma.createComponent();
  c.name = name;
  c.layoutMode = dir;
  c.primaryAxisSizingMode = 'AUTO';
  c.counterAxisSizingMode = 'AUTO';
  c.fills = [];
  return c;
}
function arrange(set) {
  set.layoutMode = 'HORIZONTAL';
  set.itemSpacing = 16;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 16;
  set.primaryAxisSizingMode = 'AUTO';
  set.counterAxisSizingMode = 'AUTO';
  set.fills = paint('paper');
  set.strokes = paint('line');
  set.dashPattern = [4, 3];
  set.cornerRadius = 10;
}
function bindText(set, propName, textName, def) {
  const key = set.addComponentProperty(propName, 'TEXT', def);
  for (const v of set.children) {
    const t = v.findOne((n) => n.type === 'TEXT' && n.name === textName);
    if (t) t.componentPropertyReferences = { characters: key };
  }
}

let y = 0;
for (const c of fpage.children) y = Math.max(y, c.y + c.height + 160);
const created = [];

// Button
const BTN = { Primary: ['accent', null, 'paper'], Secondary: ['paper', 'line-2', 'ink'], Danger: ['paper', 'line-2', 'stop'] };
const btns = [];
for (const [kind, [bg, bd, fg]] of Object.entries(BTN)) {
  const b = comp('Kind=' + kind, 'HORIZONTAL');
  b.paddingLeft = b.paddingRight = 20;
  b.itemSpacing = 8;
  b.cornerRadius = 10;
  b.fills = paint(bg);
  if (bd) { b.strokes = paint(bd); b.strokeWeight = 1; }
  b.primaryAxisAlignItems = 'CENTER';
  b.counterAxisAlignItems = 'CENTER';
  const t = await txt('Button', 'body-strong', fg);
  t.name = 'label';
  b.appendChild(t);
  b.resize(b.width, 48);
  b.primaryAxisSizingMode = 'AUTO';
  btns.push(b);
}
const btnSet = figma.combineAsVariants(btns, fpage);
btnSet.name = 'Button';
arrange(btnSet);
bindText(btnSet, 'Label', 'label', 'Button');
btnSet.description = 'Primary for the one main action on a screen. Secondary for everything else. Danger only for destructive actions (delete, turn off).';
btnSet.x = 0; btnSet.y = y;
created.push(btnSet.id);

// Chip
const CHIP = { Good: ['good-soft', 'good', 'check'], Warn: ['warn-soft', 'warn', null], Stop: ['stop-soft', 'stop', 'x'], Neutral: ['neutral-soft', 'neutral', null], Accent: ['accent-soft', 'accent', 'pen'], Dashed: ['paper', 'neutral', 'dash'] };
const chips = [];
for (const [kind, [bg, fg, ic]] of Object.entries(CHIP)) {
  const c = comp('Kind=' + kind, 'HORIZONTAL');
  c.paddingTop = c.paddingBottom = 3;
  c.paddingLeft = c.paddingRight = 9;
  c.itemSpacing = 5;
  c.cornerRadius = 12;
  c.counterAxisAlignItems = 'CENTER';
  c.fills = paint(bg);
  if (kind === 'Dashed') { c.strokes = paint('line-2'); c.dashPattern = [3, 2]; }
  if (ic) c.appendChild(icon(ic, 12, fg));
  const t = await txt(kind === 'Good' ? 'Verified employer' : kind, 'micro', fg);
  t.name = 'label';
  c.appendChild(t);
  chips.push(c);
}
const chipSet = figma.combineAsVariants(chips, fpage);
chipSet.name = 'Chip';
arrange(chipSet);
bindText(chipSet, 'Label', 'label', 'Label');
chipSet.description = 'State chip. Always icon or label plus colour, never colour alone (BRD §16).';
chipSet.x = btnSet.x + btnSet.width + 80; chipSet.y = y;
created.push(chipSet.id);

// Evidence row: three states, not two (BRULE-016)
const EV = { Evidenced: ['good', 'check', false, 'Evidenced — experience', 'You have 5 years in accounting. The ad asks for 3 or more.'],
  Gap: ['warn', 'minus', false, 'Gap — software', 'The ad asks for SAP. Your profile does not list it.'],
  'Not stated': ['neutral', 'q', true, 'Not stated in this ad — education', 'The employer did not say what qualification they need. This is not counted against you.'] };
const evs = [];
for (const [kind, [c, ic, dashed, title, detail]] of Object.entries(EV)) {
  const e = comp('Kind=' + kind, 'HORIZONTAL');
  e.itemSpacing = 12;
  e.paddingTop = e.paddingBottom = 4;
  e.paddingLeft = 12;
  e.strokes = paint(c);
  e.strokeTopWeight = 0; e.strokeRightWeight = 0; e.strokeBottomWeight = 0; e.strokeLeftWeight = 3;
  if (dashed) e.dashPattern = [2, 3];
  e.appendChild(icon(ic, 17, c));
  const col = figma.createFrame();
  col.name = 'text'; col.layoutMode = 'VERTICAL'; col.itemSpacing = 2; col.fills = [];
  col.primaryAxisSizingMode = 'AUTO'; col.counterAxisSizingMode = 'AUTO';
  const t1 = await txt(title, 'body-strong', kind === 'Not stated' ? 'ink' : c); t1.name = 'title';
  const t2 = await txt(detail, 'meta', 'ink-2'); t2.name = 'detail';
  col.appendChild(t1); col.appendChild(t2);
  e.appendChild(col);
  e.resize(360, e.height);
  e.primaryAxisSizingMode = 'FIXED';
  col.layoutGrow = 1;
  t1.layoutSizingHorizontal = 'FILL'; t1.textAutoResize = 'HEIGHT';
  t2.layoutSizingHorizontal = 'FILL'; t2.textAutoResize = 'HEIGHT';
  evs.push(e);
}
const evSet = figma.combineAsVariants(evs, fpage);
evSet.name = 'Evidence row';
arrange(evSet);
bindText(evSet, 'Title', 'title', 'Evidenced — experience');
bindText(evSet, 'Detail', 'detail', 'Evidence from your profile.');
evSet.description = 'Job match evidence. "Not stated" uses a dotted bar and a question mark and is never counted as a gap (BRULE-016).';
evSet.x = chipSet.x + chipSet.width + 80; evSet.y = y;
created.push(evSet.id);

// Desktop nav
const nav = figma.createComponent();
nav.name = 'Nav / Candidate desktop';
nav.layoutMode = 'HORIZONTAL';
nav.itemSpacing = 32;
nav.paddingLeft = nav.paddingRight = 32;
nav.counterAxisAlignItems = 'CENTER';
nav.fills = paint('paper');
nav.strokes = paint('line'); nav.strokeTopWeight = 0; nav.strokeLeftWeight = 0; nav.strokeRightWeight = 0; nav.strokeBottomWeight = 1;
const brand = figma.createFrame();
brand.name = 'brand'; brand.layoutMode = 'HORIZONTAL'; brand.itemSpacing = 9; brand.counterAxisAlignItems = 'CENTER'; brand.fills = [];
brand.primaryAxisSizingMode = 'AUTO'; brand.counterAxisSizingMode = 'AUTO';
brand.appendChild(icon('match', 22, 'accent'));
brand.appendChild(await txt('TalentNexus', 'body-strong', 'ink'));
nav.appendChild(brand);
const links = figma.createFrame();
links.name = 'links'; links.layoutMode = 'HORIZONTAL'; links.itemSpacing = 24; links.fills = [];
links.primaryAxisSizingMode = 'AUTO'; links.counterAxisSizingMode = 'AUTO';
for (const [l, on] of [['Profile', true], ['My CVs', false], ['Jobs', false], ['Saved', false]]) links.appendChild(await txt(l, 'meta', on ? 'ink' : 'ink-2'));
nav.appendChild(links);
nav.resize(1280, 64);
nav.primaryAxisSizingMode = 'FIXED'; nav.counterAxisSizingMode = 'FIXED';
nav.description = 'Candidate web navigation. The active tab uses ink; the others ink-2.';
nav.x = 0; nav.y = btnSet.y + Math.max(btnSet.height, chipSet.height, evSet.height) + 120;
created.push(nav.id);

return { foundations: pageResult, components: created, errors: pageResult.errors };
