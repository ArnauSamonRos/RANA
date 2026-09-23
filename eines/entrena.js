#!/usr/bin/env node
'use strict';
// Consolida tots els fitxers de vots de dades/*.json al model base src/model.js.
// Ús:  node eines/entrena.js
//
// El model base són els comptes de "m'agrada" / "no m'agrada" de cada tret.
// La pàgina el carrega sempre, de manera que la generació ja surt afinada
// per a tothom, en qualsevol navegador, i els vots nous s'hi sumen a sobre.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'dades');
const out = path.join(root, 'src', 'model.js');

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
if (!files.length) { console.error('No hi ha fitxers de vots a dades/. Exporta-los des de la pàgina i posa\'ls allà.'); process.exit(1); }

// Un vot per granota (llavor + versió del generador); el més recent guanya
const votes = new Map();
const labels = {};
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (data.format !== 'granotes-vots') { console.warn(`  (s'ignora ${f}: no és un fitxer de vots)`); continue; }
  let n = 0;
  for (const [seed, e] of Object.entries(data.votes || {})) {
    if (!e || !Array.isArray(e.f) || (e.v !== 1 && e.v !== -1)) continue;
    const key = seed + '@' + (e.ver || 0);
    const cur = votes.get(key);
    if (!cur || (e.t || 0) >= (cur.t || 0)) votes.set(key, e);
    n++;
  }
  Object.assign(labels, data.labels || {});
  console.log(`  ${f}: ${n} vots`);
}

const counts = {};
let L = 0, D = 0;
for (const e of votes.values()) {
  if (e.v > 0) L++; else D++;
  for (const k of e.f) {
    const c = counts[k] || (counts[k] = [0, 0]);
    c[e.v > 0 ? 0 : 1]++;
  }
}
const used = {};
for (const k of Object.keys(counts)) if (labels[k]) used[k] = labels[k];

const model = { votes: votes.size, L, D, counts, labels: used, updated: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(out,
  '// Model base après dels vots enregistrats (generat per eines/entrena.js).\n' +
  '// No l\'editis a mà: afegeix fitxers de vots a dades/ i torna a executar l\'script.\n' +
  'const GRANOTES_MODEL = ' + JSON.stringify(model) + ';\n');

// Resum del que s'ha après
const base = Math.log((L + 1) / (D + 1));
const w = ([l, d]) => Math.log((l + 1) / (d + 1)) - base;
const rows = Object.entries(counts).filter(([, c]) => c[0] + c[1] >= 3).map(([k, c]) => [labels[k] || k, w(c), c]);
const fmt = ([lab, x, c]) => `    ${lab.padEnd(26)} ${x >= 0 ? '+' : ''}${x.toFixed(2)}  (${c[0]}👍 ${c[1]}👎)`;
console.log(`\nModel desat a src/model.js: ${votes.size} vots (${L} 👍 · ${D} 👎)\n`);
console.log('  Més t\'agrada:');
rows.filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(r => console.log(fmt(r)));
console.log('  Menys t\'agrada:');
rows.filter(r => r[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 10).forEach(r => console.log(fmt(r)));
