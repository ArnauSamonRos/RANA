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
  // Varietat (0..1, ajustable al panell): barreja granotes a l'atzar (com abans del
  // model) amb granotes guiades pel gust, i com de estricte és el model triant.
  const VKEY = 'granotes-varietat';
  let variety = 0.5;
  try { const v = parseFloat(localStorage.getItem(VKEY)); if (v >= 0 && v <= 1) variety = v; } catch (e) { /* res */ }
  const explore = () => 0.1 + 0.5 * variety;          // 10%..60% a l'atzar (0.35 per defecte)
  const temp = () => 0.3 + 1.2 * variety;             // més alta = més varietat
  const RECENT = 8;                                    // granotes recents que no es volen repetir
  const recent = [];
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
  dropConsolidated();
  let model = null;

  // Els vots que ja són al model base (consolidats al projecte) s'esborren del
  // navegador: així no compten dues vegades i el comptador de vots nous torna a 0.
  function dropConsolidated() {
    const ids = new Set(BASE_ENTRIES.map(e => e.id).filter(Boolean));
    if (!ids.size) return;
    let n = 0;
    for (const [k, e] of Object.entries(store.votes)) if (ids.has(Aprenentatge.voteId(k, e))) { delete store.votes[k]; n++; }
    if (n) save();
  }

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

  // Semblança entre dues granotes (proporció de trets principals compartits)
  const MAINP = /^(arch|col|bcol|eye|pup|mouth|belly|arms|thigh|pat|pal|bst):/;
  const mainOf = seed => new Set(featKeys(seed).filter(k => MAINP.test(k)));
  function similarity(a, b) {
    let same = 0; for (const k of a) if (b.has(k)) same++;
    return same / Math.max(1, Math.max(a.size, b.size));
  }
  function remember(seed) { recent.push(mainOf(seed)); if (recent.length > RECENT) recent.shift(); return seed; }

  function next() {
    if (!model.total || Math.random() < explore()) return remember(randomSeed());
    const cands = [];
    for (let i = 0; i < CANDIDATES; i++) {
      const s = randomSeed();
      const e = store.votes[hex(s)];
      if (e && e.v < 0 && e.ver === Granota.VERSION) continue;
      // penalitza les que s'assemblen massa a les últimes que s'han vist
      const m = mainOf(s);
      const rep = recent.length ? Math.max(...recent.map(r => similarity(m, r))) : 0;
      cands.push([s, score(Granota.genome(s)) - 3 * rep * rep]);
    }
    const mx = Math.max(...cands.map(c => c[1]));
    const T = temp();
    const ws = cands.map(c => Math.exp((c[1] - mx) / T));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return remember(cands[i][0]); }
    return remember(cands[cands.length - 1][0]);
  }

  function setVariety(v) {
    variety = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VKEY, String(variety)); } catch (e) { /* res */ }
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
    next, vote, rate, duel, duelPair, setVariety, variety: () => variety, score, insights, reset, voteOf, exportJSON, importJSON,
    counts: () => ({ L: model.L, D: model.D, P: model.P, K: model.K, local: Object.keys(store.votes).length, base: BASE_ENTRIES.length }),
  };
})();
