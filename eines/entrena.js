#!/usr/bin/env node
'use strict';
// Consolida tots els fitxers de vots de dades/*.json al model base src/model.js.
// Ús:  node eines/entrena.js
//
// El model base conté tots els vots enregistrats (compactats).
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
    if (!Aprenentatge.valid(e)) continue;
    const key = seed + '@' + (e.ver || 0);
    const cur = votes.get(key);
    if (!cur || (e.t || 0) >= (cur.t || 0)) votes.set(key, e);
    n++;
  }
  Object.assign(labels, data.labels || {});
  console.log(`  ${f}: ${n} vots`);
}

// Tots els vots es guarden compactats al model base; la pàgina hi entrena el
// model (regressió logística) juntament amb els vots nous del navegador.
const entries = [...votes.values()];
let L = 0, D = 0, P = 0, K = 0;
for (const e of entries) {
  if (e.type === 'duel') K++; else if (e.v > 0) L++; else if (e.v < 0) D++; else P++;
}
const clean = entries.map(e => e.type === 'duel' ? { type: 'duel', w: e.w, l: e.l }
  : Object.assign({ v: e.v, f: e.f }, e.parts ? { parts: e.parts } : {}));
const packed = Aprenentatge.pack(clean);
const used = {};
for (const k of packed.keys) if (labels[k]) used[k] = labels[k];

const model = { votes: entries.length, L, D, P, K, entries: packed, labels: used, updated: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(out,
  '// Model base après dels vots enregistrats (generat per eines/entrena.js).\n' +
  '// No l\'editis a mà: afegeix fitxers de vots a dades/ i torna a executar l\'script.\n' +
  'const GRANOTES_MODEL = ' + JSON.stringify(model) + ';\n');

// Resum del que s'ha après (mateix model que la pàgina)
const m = Aprenentatge.train(clean, null, 80);
const labelOf = k => k.includes('|') ? Aprenentatge.labelPair(k, labelOf) : labels[k] || k;
const rows = Object.entries(m.w).filter(([k]) => (m.support[k] || 0) >= 2).map(([k, w]) => [k, labelOf(k), w, m.support[k]]);
const fmt = ([, lab, x, n]) => `      ${lab.padEnd(40)} ${x >= 0 ? '+' : ''}${x.toFixed(2)}  (${n} val.)`;
const show = (title, list) => {
  const pos = list.filter(r => r[2] > 0.15).sort((a, b) => b[2] - a[2]).slice(0, 4);
  const neg = list.filter(r => r[2] < -0.15).sort((a, b) => a[2] - b[2]).slice(0, 4);
  if (!pos.length && !neg.length) return;
  console.log(`  ${title}`);
  pos.forEach(r => console.log(fmt(r)));
  neg.forEach(r => console.log(fmt(r)));
};
console.log(`\nModel desat a src/model.js: ${entries.length} valoracions (${L} positives · ${D} negatives · ${P} neutres o només per parts · ${K} duels)\n`);
for (const p of Aprenentatge.PARTS) show(p.label, rows.filter(r => Aprenentatge.partOf(r[0]) === p.id));
show('Combinacions', rows.filter(r => Aprenentatge.partOf(r[0]) === 'pair'));
