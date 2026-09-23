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
const Aprenentatge = require('../src/aprenentatge.js');

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
    if (!e || !Array.isArray(e.f) || ![1, -1, 0].includes(e.v)) continue;
    const key = seed + '@' + (e.ver || 0);
    const cur = votes.get(key);
    if (!cur || (e.t || 0) >= (cur.t || 0)) votes.set(key, e);
    n++;
  }
  Object.assign(labels, data.labels || {});
  console.log(`  ${f}: ${n} vots`);
}

// Comptes de trets i combinacions (mateixa lògica que la pàgina)
const m = { counts: {}, totals: {} };
let L = 0, D = 0, P = 0;
for (const e of votes.values()) {
  if (e.v > 0) L++; else if (e.v < 0) D++; else P++;
  Aprenentatge.accumulate(m, e);
}
const used = {};
for (const k of Object.keys(m.counts)) for (const part of k.split('|')) if (labels[part]) used[part] = labels[part];

const model = { votes: votes.size, L, D, P, counts: m.counts, totals: m.totals, labels: used, updated: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(out,
  '// Model base après dels vots enregistrats (generat per eines/entrena.js).\n' +
  '// No l\'editis a mà: afegeix fitxers de vots a dades/ i torna a executar l\'script.\n' +
  'const GRANOTES_MODEL = ' + JSON.stringify(model) + ';\n');

// Resum del que s'ha après
const base = {};
for (const [p, [l, d]] of Object.entries(m.totals)) base[p] = Math.log((l + 1) / (d + 1));
const labelOf = k => k.includes('|') ? Aprenentatge.labelPair(k, labelOf) : labels[k] || k;
const rows = Object.entries(m.counts).filter(([, c]) => c[0] + c[1] >= 3)
  .map(([k, c]) => [k, labelOf(k), Math.log((c[0] + 1) / (c[1] + 1)) - (base[Aprenentatge.partOf(k)] || 0), c]);
const fmt = ([, lab, x, c]) => `      ${lab.padEnd(40)} ${x >= 0 ? '+' : ''}${x.toFixed(2)}  (${c[0]}👍 ${c[1]}👎)`;
const show = (title, list) => {
  const pos = list.filter(r => r[2] > 0.25).sort((a, b) => b[2] - a[2]).slice(0, 4);
  const neg = list.filter(r => r[2] < -0.25).sort((a, b) => a[2] - b[2]).slice(0, 4);
  if (!pos.length && !neg.length) return;
  console.log(`  ${title}`);
  pos.forEach(r => console.log(fmt(r)));
  neg.forEach(r => console.log(fmt(r)));
};
console.log(`\nModel desat a src/model.js: ${votes.size} vots (${L} 👍 · ${D} 👎 · ${P} només per parts)\n`);
for (const p of Aprenentatge.PARTS) show(p.label, rows.filter(r => Aprenentatge.partOf(r[0]) === p.id));
show('Combinacions', rows.filter(r => Aprenentatge.partOf(r[0]) === 'pair'));
