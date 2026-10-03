// ---- TalentNexus Figma kit: prepended to every batch by build.mjs (runs inside Figma's use_figma) ----
// Turns the compact layout specs from convert_canvas.py into auto-layout frames bound to the
// "TalentNexus" variables and type/* text styles created by 01-foundations.js.
const V = {};
for (const v of await figma.variables.getLocalVariablesAsync()) V[v.name] = v;
const TS = {};
for (const s of await figma.getLocalTextStylesAsync()) TS[s.name] = s;
for (const st of ['Regular', 'Medium', 'Semi Bold', 'Bold']) await figma.loadFontAsync({ family: 'Inter', style: st });

const HEX = { ink: '#141a1f', 'ink-2': '#4a5560', 'ink-3': '#77828e', paper: '#ffffff', 'paper-2': '#f4f6f8', line: '#d9dfe5', 'line-2': '#b4bec8',
  accent: '#1b5e8c', 'accent-soft': '#e7f0f6', good: '#1f6b45', 'good-soft': '#e4f1ea', warn: '#8a5a12', 'warn-soft': '#fbf0dd',
  stop: '#8c2f2f', 'stop-soft': '#f8e7e7', neutral: '#5a646e', 'neutral-soft': '#edeff2' };
const hex = (c) => HEX[c] || c;
function rgb(h) { h = hex(h).replace('#', ''); return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 }; }
function paint(c) {
  if (!c) return [];
  const base = { type: 'SOLID', color: rgb(c) };
  const v = V['color/' + c];
  return [v ? figma.variables.setBoundVariableForPaint(base, 'color', v) : base];
}

const ICONS = {
// ICONS-START
  'check': '<path d="M20 6 9 17l-5-5"></path>',
  'minus': '<path d="M5 12h14"></path>',
  'q': '<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6"></path><path d="M12 17h.01"></path>',
  'shield': '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"></path><path d="m8.5 12 2.5 2.5 4.5-5"></path>',
  'upload': '<path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M4 16v4h16v-4"></path>',
  'download': '<path d="M12 4v12"></path><path d="m7 11 5 5 5-5"></path><path d="M4 20h16"></path>',
  'back': '<path d="M15 5l-7 7 7 7"></path>',
  'chev': '<path d="m9 5 7 7-7 7"></path>',
  'chevd': '<path d="m6 9 6 6 6-6"></path>',
  'plus': '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  'flag': '<path d="M5 21V4h11l-2 4 2 4H5"></path>',
  'doc': '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path>',
  'ats': '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 9h10"></path><path d="M7 13h6"></path>',
  'match': '<path d="M4 5c4 0 6 2 8 6 2-4 4-6 8-6"></path><path d="M12 11v9"></path>',
  'lock': '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  'search': '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',
  'bookmark': '<path d="M6 3h12v18l-6-4-6 4z"></path>',
  'pen': '<path d="M4 20h4L19 9l-4-4L4 16v4z"></path>',
  'x': '<path d="M6 6l12 12"></path><path d="M18 6 6 18"></path>',
  'spark': '<path d="M12 3v6"></path><path d="M12 15v6"></path><path d="M3 12h6"></path><path d="M15 12h6"></path>',
  'alert': '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>',
  'grip': '<path d="M9 6h.01"></path><path d="M15 6h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 18h.01"></path><path d="M15 18h.01"></path>',
  'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  'dash': '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"></circle>',
// ICONS-END
};
function icon(name, size, c) {
  const g = figma.createNodeFromSvg(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="${hex(c || 'ink')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</g></svg>`);
  g.name = 'icon/' + name;
  return g;
}

const STYLE = { hero: 'type/display', display: 'type/display', title: 'type/title', subtitle: 'type/subtitle', body: 'type/body', 'body-strong': 'type/body-strong', meta: 'type/meta', micro: 'type/micro' };
const ALIGN = { C: 'CENTER', S: 'MIN', E: 'MAX', B: 'BASELINE' };
const JUST = { C: 'CENTER', SB: 'SPACE_BETWEEN', E: 'MAX' };

function tracks(cols) {
  if (!cols) return null;
  const m = cols.match(/repeat\((\d+),/);
  if (m) return Array(Number(m[1])).fill('fr');
  const out = []; let depth = 0, cur = '';
  for (const ch of cols) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch; }
  if (cur) out.push(cur);
  return out.map((t) => (/^\d+px$/.test(t) ? parseFloat(t) : 'fr'));
}

// Size a node inside its auto-layout parent. `definite`: the parent has a known width.
function place(node, n, pdir, definite, hint) {
  const isText = node.type === 'TEXT';
  if (hint && typeof hint.w === 'number') { node.resize(hint.w, node.height); node.layoutSizingHorizontal = 'FIXED'; if (isText) node.textAutoResize = 'HEIGHT'; return true; }
  if (hint && hint.grow && definite) { node.layoutGrow = 1; if (isText) node.textAutoResize = 'HEIGHT'; return true; }
  if (n.w && !isText) { node.resize(n.w, node.height); node.layoutSizingHorizontal = 'FIXED'; return true; }
  if (pdir === 'V') {
    if (n.hug || !definite) return false;
    node.layoutSizingHorizontal = 'FILL'; if (isText) node.textAutoResize = 'HEIGHT'; return true;
  }
  if ((n.grow || n.fill) && definite) { node.layoutGrow = 1; if (isText) node.textAutoResize = 'HEIGHT'; return true; }
  return false;
}

async function render(n, parent, pdir, definite, hint) {
  if (n.k === 'T') {
    const t = figma.createText();
    await t.setTextStyleIdAsync(TS[STYLE[n.s] || 'type/body'].id);
    if (n.s === 'hero') { t.fontSize = 48; t.lineHeight = { unit: 'PIXELS', value: 54 }; }
    t.characters = n.v || ' ';
    t.fills = paint(n.c || 'ink');
    if (n.strike) t.textDecoration = 'STRIKETHROUGH';
    if (n.ta === 'C') t.textAlignHorizontal = 'CENTER';
    parent.appendChild(t);
    place(t, n, pdir, definite, hint);
    return t;
  }
  if (n.k === 'I') { const g = icon(n.n, n.z || 18, n.c); parent.appendChild(g); return g; }
  if (n.k === 'R') {
    const b = figma.createFrame(); b.name = n.chk !== undefined ? 'checkbox' : 'rect';
    b.resize(n.w || 20, n.h || 20); b.cornerRadius = n.r || 0; b.fills = paint(n.bg);
    if (n.bd) { b.strokes = paint(n.bd); b.strokeWeight = 1; }
    if (n.chk) { const ic = icon('check', 14, 'paper'); b.appendChild(ic); ic.x = 3; ic.y = 3; }
    parent.appendChild(b);
    return b;
  }
  const f = figma.createFrame();
  f.name = n.n || 'Frame';
  f.layoutMode = n.d === 'H' ? 'HORIZONTAL' : 'VERTICAL';
  f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.fills = paint(n.bg);
  f.itemSpacing = n.g || 0;
  if (n.p) [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = n.p;
  if (n.r) f.cornerRadius = n.r;
  if (n.bd) { f.strokes = paint(n.bd); f.strokeWeight = n.bw || 1; if (n.dash) f.dashPattern = [4, 3]; }
  if (n.bl) { f.strokes = paint(n.bl.c); f.strokeTopWeight = 0; f.strokeRightWeight = 0; f.strokeBottomWeight = 0; f.strokeLeftWeight = n.bl.w; if (n.bl.dash) f.dashPattern = [2, 3]; }
  if (n.bt) { f.strokes = paint(n.bt.c); f.strokeTopWeight = n.bt.w; f.strokeRightWeight = 0; f.strokeBottomWeight = 0; f.strokeLeftWeight = 0; }
  if (n.wrap && n.d === 'H') { f.layoutWrap = 'WRAP'; f.counterAxisSpacing = n.g || 0; }
  if (n.al && ALIGN[n.al]) f.counterAxisAlignItems = ALIGN[n.al] === 'BASELINE' && n.d !== 'H' ? 'MIN' : ALIGN[n.al];
  if (n.jc && JUST[n.jc]) f.primaryAxisAlignItems = JUST[n.jc];
  if (n.clip) f.clipsContent = true;
  if (n.sh) f.effects = [{ type: 'DROP_SHADOW', color: { r: 0.08, g: 0.1, b: 0.12, a: 0.12 }, offset: { x: 0, y: 8 }, radius: 24, spread: -8, visible: true, blendMode: 'NORMAL' }];
  let mine = false;
  if (parent) { parent.appendChild(f); mine = place(f, n, pdir, definite, hint); }
  else { f.resize(n.W, n.H); f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED'; mine = true; }
  if (n.h && parent) { f.resize(f.width, n.h); f.layoutSizingVertical = 'FIXED'; }
  if (n.mh) f.minHeight = n.mh;
  if (n.mw) f.maxWidth = n.mw;
  const tr = tracks(n.cols);
  const kids = n.c || [];
  // In a definite horizontal row with no explicit grower, let the main text-bearing child take the slack.
  let autoGrow = -1;
  if (n.d === 'H' && mine && !tr && !kids.some((k) => k.grow || k.fill) && !n.btn && !n.hug) {
    let best = 0;
    kids.forEach((k, i) => { const len = JSON.stringify(k).length; if ((k.k === 'T' || (k.k === 'F' && !k.btn && !k.hug)) && len > best) { best = len; autoGrow = i; } });
  }
  for (let i = 0; i < kids.length; i++) {
    let h = null;
    if (tr) h = typeof tr[i % tr.length] === 'number' ? { w: tr[i % tr.length] } : { grow: 1 };
    else if (i === autoGrow) h = { grow: 1 };
    await render(kids[i], f, n.d, mine, h);
  }
  return f;
}

async function buildPage(pageName, frames) {
  let page = figma.root.children.find((p) => p.name === pageName);
  if (!page) { page = figma.createPage(); page.name = pageName; }
  await figma.setCurrentPageAsync(page);
  let x = 0;
  for (const c of page.children) x = Math.max(x, c.x + c.width + 120);
  const created = [], errors = [];
  for (const spec of frames) {
    let root;
    try {
      root = await render(Object.assign({}, spec, { W: spec.w, H: spec.h, w: undefined, h: undefined }), null, 'V', true, null);
      root.name = spec.n;
      root.clipsContent = true;
      root.x = x; root.y = 0; x += spec.w + 120;
      created.push(root.id);
    } catch (e) {
      errors.push(spec.n + ': ' + (e && e.message ? e.message : String(e)));
      if (root && !root.removed) root.remove();
    }
  }
  return { page: page.name, created: created.length, ids: created, errors };
}
