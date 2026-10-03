// Packs kit.js + specs/*.json into ready-to-run use_figma payloads in dist/.
// Each payload must stay under the use_figma limit of 50,000 characters.
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';

const LIMIT = 48000; // keep a margin under 50,000
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const kit = readFileSync('kit.js', 'utf8');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

const out = [];
function emit(name, code) {
  if (code.length > LIMIT) throw new Error(`${name} is ${code.length} characters, over ${LIMIT}`);
  new AsyncFunction(code); // syntax check only, nothing runs
  writeFileSync(`dist/${name}`, code);
  out.push([name, code.length]);
}

emit('01-foundations.js', readFileSync('01-foundations.js', 'utf8'));

const specs = readdirSync('specs').filter((f) => f.endsWith('.json')).sort();
let n = 2;
for (const file of specs) {
  const spec = JSON.parse(readFileSync(`specs/${file}`, 'utf8'));
  const isFoundations = file.startsWith('1-');
  const tail = isFoundations ? readFileSync('02-components.js', 'utf8') : 'return await buildPage(SPEC.page, SPEC.frames);\n';
  const room = LIMIT - kit.length - tail.length - 200;
  // Greedy chunking of frames so each call fits.
  const chunks = [];
  let cur = [];
  for (const fr of spec.frames) {
    const trial = JSON.stringify({ page: spec.page, frames: [...cur, fr] });
    if (trial.length > room && cur.length) { chunks.push(cur); cur = [fr]; } else cur.push(fr);
  }
  if (cur.length) chunks.push(cur);
  if (isFoundations && chunks.length > 1) throw new Error('Foundations frames must fit in one call with the components');
  chunks.forEach((frames, i) => {
    const slug = file.replace(/^\d-/, '').replace('.json', '');
    const name = `${String(n).padStart(2, '0')}-${isFoundations ? 'foundations-components' : slug}${chunks.length > 1 ? '-' + (i + 1) : ''}.js`;
    emit(name, `${kit}\nconst SPEC = ${JSON.stringify({ page: spec.page, frames })};\n${tail}`);
    n++;
  });
}

for (const [name, len] of out) console.log(`${name.padEnd(36)} ${String(len).padStart(6)} chars`);
console.log(`${out.length} use_figma calls in total`);
