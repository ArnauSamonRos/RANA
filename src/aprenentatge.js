'use strict';
// Model de preferències (compartit pel navegador i per eines/entrena.js).
//
// Cada granota es representa amb els seus trets (Granota.features) i les
// COMBINACIONS entre els trets principals de parts diferents
// (p. ex. "ulls contents + boca somrient"). El model és una regressió
// logística: la puntuació d'una granota és la suma dels pesos dels seus trets.
//
// Tipus de valoració i què se n'aprèn:
//   { v, f }          puntuació global de -1 a 1 (escala 1..5 → -1, -0.5, 0, 0.5, 1):
//                      la probabilitat que agradi ha de ser (v+1)/2; el 3 (v=0) també informa.
//   { v, parts, f }   parts marcades (p. ex. { ulls: 1, potes: -1 }): cada part s'aprèn
//                      només amb els trets d'aquella part; la resta, amb la puntuació global.
//   { type:'duel', w, l }  la guanyadora ha de puntuar més que la perdedora
//                      (model de Bradley-Terry sobre la diferència de trets).
//
// Tots els vots es reentrenen junts, així que el model sempre és coherent
// amb tot l'historial (vots del navegador + model base consolidat).

const Aprenentatge = (() => {
  const PARTS = [
    { id: 'cos', label: 'Cos' },
    { id: 'colors', label: 'Colors' },
    { id: 'ulls', label: 'Ulls' },
    { id: 'boca', label: 'Boca' },
    { id: 'panxa', label: 'Panxa' },
    { id: 'potes', label: 'Potes' },
    { id: 'patro', label: 'Patró' },
  ];
  const PART_OF_PREFIX = {
    arch: 'cos', waist: 'cos', ratio: 'cos', size: 'cos', head: 'cos', taper: 'cos', horns: 'cos',
    pal: 'colors', col: 'colors', lum: 'colors', sat: 'colors', bcol: 'colors',
    eye: 'ulls', bst: 'ulls', esz: 'ulls', pup: 'ulls', iris: 'ulls', lid: 'ulls', angry: 'ulls', brow: 'ulls',
    mouth: 'boca', nost: 'boca', cheeks: 'boca',
    belly: 'panxa', navel: 'panxa',
    arms: 'potes', thigh: 'potes', feet: 'potes', facc: 'potes',
    pat: 'patro', patc: 'patro',
  };
  // Trets principals que es combinen entre ells
  const MAIN = new Set(['arch', 'col', 'bcol', 'eye', 'pup', 'mouth', 'belly', 'arms', 'thigh', 'pat']);
  const PAIR_VALUE = 0.5;    // les combinacions pesen la meitat que un tret sol (menys sobreajust)

  const prefix = k => k.split(':')[0];
  const partOf = k => k.includes('|') ? 'pair' : (PART_OF_PREFIX[prefix(k)] || 'cos');
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const sigmoid = z => 1 / (1 + Math.exp(-z));

  function pairKeys(f) {
    const mains = f.filter(k => MAIN.has(prefix(k)));
    const out = [];
    for (let i = 0; i < mains.length; i++) for (let j = i + 1; j < mains.length; j++)
      if (partOf(mains[i]) !== partOf(mains[j])) out.push(pairKey(mains[i], mains[j]));
    return out;
  }
  // Vector de trets d'una granota: [[clau, valor], ...]
  function vector(f) {
    return [...f.map(k => [k, 1]), ...pairKeys(f).map(k => [k, PAIR_VALUE])];
  }

  // Exemples d'entrenament d'un vot: { x: [[clau, valor]], y (0..1), bias }
  function examples(e) {
    if (e.type === 'duel') {
      const d = new Map();
      for (const [k, v] of vector(e.w)) d.set(k, (d.get(k) || 0) + v);
      for (const [k, v] of vector(e.l)) d.set(k, (d.get(k) || 0) - v);
      return [{ x: [...d].filter(([, v]) => v), y: 1, bias: false }];
    }
    const out = [];
    const marked = e.parts ? Object.keys(e.parts).filter(p => e.parts[p]) : [];
    for (const p of marked) {
      const x = e.f.filter(k => partOf(k) === p).map(k => [k, 1]);
      if (x.length) out.push({ x, y: e.parts[p] > 0 ? 1 : 0, bias: true });
    }
    // La puntuació global s'aplica als trets de les parts no marcades
    // (si només s'han marcat parts, sense puntuació global, només compten les parts).
    if (e.v || !marked.length) {
      const rest = e.f.filter(k => !marked.includes(partOf(k)));
      out.push({ x: vector(rest), y: (e.v + 1) / 2, bias: true });
    }
    return out;
  }

  // Entrena la regressió logística amb tots els vots.
  // prev: pesos anteriors per començar-hi (entrenament incremental, més ràpid)
  function train(entries, prev = null, epochs = 60) {
    const ex = entries.flatMap(examples);
    const w = new Map(prev ? Object.entries(prev.w) : []);
    let b = prev ? prev.b : 0;
    const support = {};
    for (const e of ex) for (const [k] of e.x) support[k] = (support[k] || 0) + 1;
    if (!ex.length) return { w: {}, b: 0, support, n: 0 };
    const L2 = 0.015, LR = 0.25;
    for (let ep = 0; ep < epochs; ep++) {
      const lr = LR / (1 + ep * 0.03);
      for (let i = ex.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ex[i], ex[j]] = [ex[j], ex[i]]; }
      for (const e of ex) {
        let z = e.bias ? b : 0;
        for (const [k, v] of e.x) z += (w.get(k) || 0) * v;
        const g = e.y - sigmoid(z);                     // gradient de la log-versemblança
        if (e.bias) b += lr * g * 0.5;
        for (const [k, v] of e.x) { const wk = w.get(k) || 0; w.set(k, wk + lr * (g * v - L2 * wk)); }
      }
    }
    const out = {};
    for (const [k, v] of w) if (Math.abs(v) > 1e-4) out[k] = v;
    return { w: out, b, support, n: ex.length };
  }

  // Puntuació (sense biaix) d'una granota segons el model
  function score(model, f) {
    let s = 0;
    for (const [k, v] of vector(f)) s += (model.w[k] || 0) * v;
    return s;
  }

  // Comprova que un vot (d'un fitxer importat) té el format correcte
  function valid(e) {
    if (!e) return false;
    if (e.type === 'duel') return Array.isArray(e.w) && Array.isArray(e.l);
    return Array.isArray(e.f) && typeof e.v === 'number' && e.v >= -1 && e.v <= 1;
  }

  // Codificació compacta dels vots per al model base (src/model.js)
  function pack(entries) {
    const keys = [], idx = new Map();
    const enc = f => f.map(k => { if (!idx.has(k)) { idx.set(k, keys.length); keys.push(k); } return idx.get(k); });
    const list = entries.map(e => Object.assign(e.type === 'duel' ? { d: 1, w: enc(e.w), l: enc(e.l) }
      : Object.assign({ v: e.v, f: enc(e.f) }, e.parts ? { p: e.parts } : {}), e.id ? { id: e.id } : {}));
    return { keys, list };
  }
  function unpack(packed) {
    if (!packed || !packed.keys) return [];
    const dec = a => a.map(i => packed.keys[i]);
    return packed.list.map(e => Object.assign(e.d ? { type: 'duel', w: dec(e.w), l: dec(e.l) }
      : Object.assign({ v: e.v, f: dec(e.f) }, e.p ? { parts: e.p } : {}), e.id ? { id: e.id } : {}));
  }

  // Identificador d'un vot (clau del navegador + moment): serveix per saber quins
  // vots del navegador ja estan consolidats al model base i no comptar-los dos cops.
  const voteId = (key, e) => key + '@' + (e.t || 0);

  const labelPair = (k, labelOf) => k.split('|').map(labelOf).join(' + ');

  return { PARTS, partOf, pairKeys, examples, train, score, valid, pack, unpack, voteId, labelPair };
})();

if (typeof module !== 'undefined') module.exports = Aprenentatge;
