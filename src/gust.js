'use strict';
// Aprenentatge del gust de l'usuari: puntuació d'1 a 5, valoració per parts i
// duels (triar la millor de dues granotes). El model és una regressió logística
// sobre els trets i les combinacions (vegeu src/aprenentatge.js).
//
// Per generar una granota nova es proven moltes llavors, es puntuen amb el
// model i se n'escull una amb probabilitat proporcional a exp(puntuació / T):
// les que encaixen amb el teu gust surten molt més, però es continua explorant.
//
// Els vots surten de dues fonts que s'entrenen juntes:
//  - GRANOTES_MODEL (src/model.js): vots consolidats al projecte (eines/entrena.js).
//  - Els vots d'aquest navegador (localStorage), que es poden exportar a un fitxer.
// Cada vot guarda els trets de la granota, no només la llavor, perquè continuï
// sent vàlid encara que el generador canviï.

const Gust = (() => {
  const KEY = 'granotes-gust-v2';
  const OLD_KEY = 'granotes-gust-v1';
  const CANDIDATES = 80;     // llavors provades per cada granota nova
  const EXPLORE = 0.1;       // fracció de granotes totalment a l'atzar
  const TEMP = 0.35;          // temperatura: més alta = més varietat
  const BASE = typeof GRANOTES_MODEL !== 'undefined' ? GRANOTES_MODEL : {};
  const BASE_ENTRIES = Aprenentatge.unpack(BASE.entries);
  const BASE_LABELS = BASE.labels || {};

  const hex = s => (s >>> 0).toString(16).padStart(8, '0');
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;
  const featKeys = seed => Granota.features(Granota.genome(seed)).map(x => x[0]);

  // store = { votes: { llavor: { v, parts, f, ver, t }, 'd:llavorA-llavorB': { type: 'duel', w, l, ver, t } },
  //           labels: { clau: etiqueta } }
  let store = { votes: {}, labels: {} };
  try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch (e) { /* res */ }
  store.votes = store.votes || {}; store.labels = store.labels || {};
  migrateV1();
  let model = null;

  function migrateV1() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { return; }
    if (!old) return;
    for (const [seed, v] of Object.entries(old)) if (!store.votes[seed]) record(parseInt(seed, 16), v, 0);
    save();
    try { localStorage.removeItem(OLD_KEY); } catch (e) { /* res */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* sense emmagatzematge */ } }

  function featsOf(seed) {
    const feats = Granota.features(Granota.genome(seed));
    for (const [k, label] of feats) store.labels[k] = label;
    return feats.map(x => x[0]);
  }
  function record(seed, v, t = Date.now(), parts = null) {
    const e = { v, f: featsOf(seed), ver: Granota.VERSION, t };
    if (parts && Object.keys(parts).length) e.parts = parts;
    store.votes[hex(seed)] = e;
  }

  // Reentrena el model amb tots els vots (partint dels pesos anteriors)
  function build(full = false) {
    const entries = [...BASE_ENTRIES, ...Object.values(store.votes)];
    let L = 0, D = 0, P = 0, K = 0;
    for (const e of Object.values(store.votes)) {
      if (e.type === 'duel') K++; else if (e.v > 0) L++; else if (e.v < 0) D++; else P++;
    }
    const m = Aprenentatge.train(entries, full ? null : model, full || !model ? 60 : 20);
    model = Object.assign(m, { L, D, P, K, total: entries.length });
  }
  const labelOf = k => k.includes('|') ? Aprenentatge.labelPair(k, labelOf)
    : store.labels[k] || BASE_LABELS[k] || k;

  const score = g => Aprenentatge.score(model, Granota.features(g).map(x => x[0]));

  function next() {
    if (!model.total || Math.random() < EXPLORE) return randomSeed();
    const cands = [];
    for (let i = 0; i < CANDIDATES; i++) {
      const s = randomSeed();
      const e = store.votes[hex(s)];
      if (e && e.v < 0 && e.ver === Granota.VERSION) continue;
      cands.push([s, score(Granota.genome(s))]);
    }
    const mx = Math.max(...cands.map(c => c[1]));
    const ws = cands.map(c => Math.exp((c[1] - mx) / TEMP));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i][0]; }
    return cands[cands.length - 1][0];
  }

  function voteOf(seed) {
    const e = store.votes[hex(seed)];
    return e && e.ver === Granota.VERSION ? e.v : 0;
  }

  // Puntuació d'1 a 5 → de -1 a 1. Amb parts marcades i un 3, només compten les parts.
  const STARS = { 1: -1, 2: -0.5, 3: 0, 4: 0.5, 5: 1 };
  function rate(seed, stars, parts = null) {
    record(seed, STARS[stars] ?? 0, Date.now(), parts);
    save(); build();
  }

  // v: 1 / -1 (galeria); tornar a clicar el mateix anul·la el vot
  function vote(seed, v, parts = null) {
    const hasParts = parts && Object.keys(parts).length;
    if (!hasParts && v && voteOf(seed) === v) delete store.votes[hex(seed)];
    else record(seed, v, Date.now(), parts);
    save(); build(true);
  }

  // Duel entre dues granotes. result: 'a' | 'b' (guanyadora), 'both' (les dues
  // agraden) o 'none' (cap). Amb guanyadora s'aprèn de les diferències entre totes dues.
  function duel(a, b, result) {
    const t = Date.now();
    if (result === 'both' || result === 'none') {
      const v = result === 'both' ? 0.5 : -0.5;
      record(a, v, t); record(b, v, t);
    } else {
      const [w, l] = result === 'a' ? [a, b] : [b, a];
      store.votes['d:' + hex(w) + '-' + hex(l)] = { type: 'duel', w: featsOf(w), l: featsOf(l), ver: Granota.VERSION, t };
    }
    save(); build();
  }

  // Parella per a un duel: la primera segons el gust; la segona, entre unes quantes
  // candidates, la que s'hi assembla en puntuació però es diferencia més en trets
  // (així la tria és difícil i ensenya més).
  function duelPair() {
    const a = next();
    const fa = new Set(featKeys(a)), sa = model.total ? score(Granota.genome(a)) : 0;
    let best = null, bestV = -Infinity;
    for (let i = 0; i < 8; i++) {
      const b = next();
      if (b === a) continue;
      const fb = featKeys(b);
      const diff = fb.filter(k => !fa.has(k)).length;
      const close = model.total ? -Math.abs(score(Granota.genome(b)) - sa) : 0;
      const v = diff * 0.3 + close + Math.random();
      if (v > bestV) { bestV = v; best = b; }
    }
    return [a, best ?? randomSeed()];
  }

  // Què s'ha après: per a cada part, els trets amb més pes a favor i en contra,
  // i les combinacions. Només trets vistos en 2 o més valoracions.
  function insights(n = 3) {
    const rows = Object.entries(model.w).filter(([k]) => (model.support[k] || 0) >= 2)
      .map(([k, w]) => ({ k, part: Aprenentatge.partOf(k), label: labelOf(k), w, n: model.support[k] }));
    const top = (list, sgn) => list.filter(r => r.w * sgn > 0.15).sort((a, b) => (b.w - a.w) * sgn).slice(0, n);
    const parts = Aprenentatge.PARTS.map(p => {
      const list = rows.filter(r => r.part === p.id);
      return { id: p.id, label: p.label, pos: top(list, 1), neg: top(list, -1) };
    });
    const pairs = rows.filter(r => r.part === 'pair');
    return { parts, pairsPos: top(pairs, 1).slice(0, 5), pairsNeg: top(pairs, -1).slice(0, 5) };
  }

  // ---- Exportar / importar ----------------------------------------------------
  function exportJSON() {
    return JSON.stringify({
      format: 'granotes-vots', version: 2, generator: Granota.VERSION,
      exported: new Date().toISOString(), votes: store.votes, labels: store.labels,
    }, null, 1);
  }
  // Retorna quants vots nous s'han afegit
  function importJSON(text) {
    const data = JSON.parse(text);
    if (data.format !== 'granotes-vots' || !data.votes) throw new Error('No és un fitxer de vots de granotes');
    let n = 0;
    for (const [seed, e] of Object.entries(data.votes)) {
      const cur = store.votes[seed];
      if (!Aprenentatge.valid(e)) continue;
      if (!cur || (e.t || 0) > (cur.t || 0)) { if (!cur) n++; store.votes[seed] = e; }
    }
    Object.assign(store.labels, data.labels || {});
    save(); build(true);
    return n;
  }

  function reset() { store = { votes: {}, labels: {} }; save(); model = null; build(true); }

  build(true);
  return {
    next, vote, rate, duel, duelPair, score, insights, reset, voteOf, exportJSON, importJSON,
    counts: () => ({ L: model.L, D: model.D, P: model.P, K: model.K, local: Object.keys(store.votes).length, base: BASE_ENTRIES.length }),
  };
})();
