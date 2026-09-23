'use strict';
// Aprenentatge del gust de l'usuari amb "M'agrada" / "No m'agrada".
//
// Cada granota es descompon en trets (tipus, color, ulls, boca, patró,
// proporcions...). Per a cada tret es compten els vots a favor i en contra i
// se'n treu un pes (log-odds, com un classificador Naive Bayes). Per generar
// una granota nova es proven moltes llavors, es puntuen amb aquests pesos i se
// n'escull una amb probabilitat proporcional a exp(puntuació / T): les que
// encaixen amb el teu gust surten molt més, però es continua explorant.
//
// Els comptes surten de dues fonts que se sumen:
//  - GRANOTES_MODEL (src/model.js): model base consolidat al projecte a partir
//    de tots els vots enregistrats (eines/entrena.js). És el mateix per a tothom.
//  - Els vots d'aquest navegador (localStorage), que es poden exportar a un
//    fitxer per consolidar-los al model base.
// Cada vot guarda els trets de la granota, no només la llavor, perquè continuï
// sent vàlid encara que el generador canviï.

const Gust = (() => {
  const KEY = 'granotes-gust-v2';
  const OLD_KEY = 'granotes-gust-v1';
  const CANDIDATES = 60;     // llavors provades per cada granota nova
  const EXPLORE = 0.15;      // fracció de granotes totalment a l'atzar
  const TEMP = 1.5;          // temperatura: més alta = més varietat
  const BASE = typeof GRANOTES_MODEL !== 'undefined' ? GRANOTES_MODEL : { votes: 0, L: 0, D: 0, counts: {}, labels: {} };

  const hex = s => (s >>> 0).toString(16).padStart(8, '0');
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;

  // store = { votes: { llavor: { v, f: [claus], ver, t } }, labels: { clau: etiqueta } }
  let store = { votes: {}, labels: {} };
  try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch (e) { /* res */ }
  store.votes = store.votes || {}; store.labels = store.labels || {};
  migrateV1();
  let model;

  function migrateV1() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { return; }
    if (!old) return;
    for (const [seed, v] of Object.entries(old)) if (!store.votes[seed]) record(parseInt(seed, 16), v, 0);
    save();
    try { localStorage.removeItem(OLD_KEY); } catch (e) { /* res */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* sense emmagatzematge */ } }

  function record(seed, v, t = Date.now()) {
    const feats = Granota.features(Granota.genome(seed));
    for (const [k, label] of feats) store.labels[k] = label;
    store.votes[hex(seed)] = { v, f: feats.map(x => x[0]), ver: Granota.VERSION, t };
  }

  function build() {
    const counts = new Map();
    const add = (k, l, d) => { const e = counts.get(k) || { l: 0, d: 0 }; e.l += l; e.d += d; counts.set(k, e); };
    for (const [k, [l, d]] of Object.entries(BASE.counts)) add(k, l, d);
    let L = BASE.L, D = BASE.D;
    for (const e of Object.values(store.votes)) {
      if (e.v > 0) L++; else D++;
      for (const k of e.f) add(k, e.v > 0 ? 1 : 0, e.v > 0 ? 0 : 1);
    }
    model = { counts, L, D, base: Math.log((L + 1) / (D + 1)) };
  }
  const labelOf = k => store.labels[k] || BASE.labels[k] || k;

  // Pes d'un tret: com de més sovint surt als "m'agrada" que als "no m'agrada",
  // corregit pel total de vots de cada tipus.
  const weight = e => Math.log((e.l + 1) / (e.d + 1)) - model.base;

  function score(g) {
    if (!model.L && !model.D) return 0;
    let s = 0;
    for (const [k] of Granota.features(g)) {
      const e = model.counts.get(k);
      if (e) s += weight(e);
    }
    return s;
  }

  function next() {
    if (!(model.L + model.D) || Math.random() < EXPLORE) return randomSeed();
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

  function vote(seed, v) {
    if (voteOf(seed) === v) delete store.votes[hex(seed)];   // tornar a clicar anul·la el vot
    else record(seed, v);
    save(); build();
  }

  // Trets amb més pes (a favor i en contra), amb un mínim de 2 vots
  function insights(n = 6) {
    const list = [...model.counts.entries()].filter(([, e]) => e.l + e.d >= 2)
      .map(([k, e]) => ({ label: labelOf(k), w: weight(e), l: e.l, d: e.d }));
    const pos = list.filter(e => e.w > 0.25).sort((a, b) => b.w - a.w).slice(0, n);
    const neg = list.filter(e => e.w < -0.25).sort((a, b) => a.w - b.w).slice(0, n);
    return { pos, neg };
  }

  // ---- Exportar / importar ----------------------------------------------------
  function exportJSON() {
    return JSON.stringify({
      format: 'granotes-vots', version: 1, generator: Granota.VERSION,
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
      if (!e || !Array.isArray(e.f) || (e.v !== 1 && e.v !== -1)) continue;
      if (!cur || (e.t || 0) > (cur.t || 0)) { if (!cur) n++; store.votes[seed] = e; }
    }
    Object.assign(store.labels, data.labels || {});
    save(); build();
    return n;
  }

  function reset() { store = { votes: {}, labels: {} }; save(); build(); }

  build();
  return {
    next, vote, score, insights, reset, voteOf, exportJSON, importJSON,
    counts: () => ({ L: model.L, D: model.D, local: Object.keys(store.votes).length, base: BASE.votes }),
  };
})();
