// 01 · Foundations: the "TalentNexus" variable collection and the type/* text styles.
// Same names and values as the original CareerNexus Figma file, so screens and code stay in step.
// Safe to re-run: existing variables and styles with the same name are updated, not duplicated.
for (const st of ['Regular', 'Medium', 'Semi Bold', 'Bold']) await figma.loadFontAsync({ family: 'Inter', style: st });

const COLORS = {
  'color/ink': '#141a1f', 'color/ink-2': '#4a5560', 'color/ink-3': '#77828e', 'color/paper': '#ffffff', 'color/paper-2': '#f4f6f8',
  'color/line': '#d9dfe5', 'color/line-2': '#b4bec8', 'color/accent': '#1b5e8c', 'color/accent-soft': '#e7f0f6',
  'color/good': '#1f6b45', 'color/good-soft': '#e4f1ea', 'color/warn': '#8a5a12', 'color/warn-soft': '#fbf0dd',
  'color/stop': '#8c2f2f', 'color/stop-soft': '#f8e7e7', 'color/neutral': '#5a646e', 'color/neutral-soft': '#edeff2',
};
const FLOATS = {
  'space/4': [4, ['GAP', 'WIDTH_HEIGHT']], 'space/8': [8, ['GAP', 'WIDTH_HEIGHT']], 'space/12': [12, ['GAP', 'WIDTH_HEIGHT']],
  'space/16': [16, ['GAP', 'WIDTH_HEIGHT']], 'space/20': [20, ['GAP', 'WIDTH_HEIGHT']], 'space/24': [24, ['GAP', 'WIDTH_HEIGHT']],
  'space/32': [32, ['GAP', 'WIDTH_HEIGHT']], 'radius/sm': [6, ['CORNER_RADIUS']], 'radius/md': [10, ['CORNER_RADIUS']],
  'radius/lg': [14, ['CORNER_RADIUS']], 'touch/min': [44, ['WIDTH_HEIGHT']],
};
const TYPE = {
  'type/display': ['Bold', 28, 34], 'type/title': ['Bold', 20, 26], 'type/subtitle': ['Semi Bold', 17, 24], 'type/body': ['Regular', 15, 22],
  'type/body-strong': ['Semi Bold', 15, 22], 'type/meta': ['Medium', 13, 18], 'type/micro': ['Semi Bold', 11, 16],
};
const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });

let col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'TalentNexus');
if (!col) col = figma.variables.createVariableCollection('TalentNexus');
const mode = col.modes[0].modeId;
const existing = {};
for (const v of await figma.variables.getLocalVariablesAsync()) if (v.variableCollectionId === col.id) existing[v.name] = v;

const variableIds = [];
for (const [name, h] of Object.entries(COLORS)) {
  const v = existing[name] || figma.variables.createVariable(name, col, 'COLOR');
  v.setValueForMode(mode, rgb(h));
  v.scopes = name.includes('ink') || ['color/good', 'color/warn', 'color/stop', 'color/neutral', 'color/accent'].includes(name)
    ? ['TEXT_FILL', 'FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'] : ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
  variableIds.push(v.id);
}
for (const [name, [val, scopes]] of Object.entries(FLOATS)) {
  const v = existing[name] || figma.variables.createVariable(name, col, 'FLOAT');
  v.setValueForMode(mode, val);
  v.scopes = scopes;
  variableIds.push(v.id);
}

const styles = await figma.getLocalTextStylesAsync();
const styleIds = [];
for (const [name, [weight, size, lh]] of Object.entries(TYPE)) {
  const s = styles.find((x) => x.name === name) || figma.createTextStyle();
  s.name = name;
  s.fontName = { family: 'Inter', style: weight };
  s.fontSize = size;
  s.lineHeight = { unit: 'PIXELS', value: lh };
  if (name === 'type/micro') s.letterSpacing = { unit: 'PERCENT', value: 4 };
  styleIds.push(s.id);
}

figma.root.children[0].name = 'Foundations';
return { collection: col.id, variables: variableIds.length, textStyles: styleIds.length, variableIds, styleIds };
