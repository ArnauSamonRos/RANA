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
// sent vàlid encara que el generador canviï. També es poden valorar parts per
// separat (ulls, boca, potes...) i s'aprenen les combinacions entre parts
// (vegeu src/aprenentatge.js).

const Gust = (() => {
  const KEY = 'granotes-gust-v2';
  const OLD_KEY = 'granotes-gust-v1';
  const CANDIDATES = 60;     // llavors provades per cada granota nova
  const EXPLORE = 0.15;      // fracció de granotes totalment a l'atzar
  const TEMP = 1.5;          // temperatura: més alta = més varietat
  const BASE = Object.assign({ votes: 0, counts: {}, totals: {}, labels: {} },
    typeof GRANOTES_MODEL !== 'undefined' ? GRANOTES_MODEL : {});
  const PAIR_WEIGHT = 0.7;   // pes de les combinacions respecte als trets sols

  const hex = s => (s >>> 0).toString(16).padStart(8, '0');
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;

  // store = { votes: { llavor: { v, parts, f: [claus], ver, t } }, labels: { clau: etiqueta } }
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

  function record(seed, v, t = Date.now(), parts = null) {
    const feats = Granota.features(Granota.genome(seed));
    for (const [k, label] of feats) store.labels[k] = label;
    const e = { v, f: feats.map(x => x[0]), ver: Granota.VERSION, t };
    if (parts && Object.keys(parts).length) e.parts = parts;
    store.votes[hex(seed)] = e;
  }

  function build() {
    const m = { counts: {}, totals: {} };
    for (const [k, c] of Object.entries(BASE.counts)) m.counts[k] = c.slice();
    for (const [k, t] of Object.entries(BASE.totals)) m.totals[k] = t.slice();
    let L = 0, D = 0, P = 0;
    for (const e of Object.values(store.votes)) {
      if (e.v > 0) L++; else if (e.v < 0) D++; else P++;
      Aprenentatge.accumulate(m, e);
    }
    const base = {};
    for (const [p, [l, d]] of Object.entries(m.totals)) base[p] = Math.log((l + 1) / (d + 1));
    model = { counts: m.counts, base, L, D, P, n: BASE.votes + L + D + P };
  }
  const labelOf = k => k.includes('|') ? Aprenentatge.labelPair(k, labelOf)
    : store.labels[k] || BASE.labels[k] || k;

  // Pes d'un tret o combinació: com de més sovint surt als "m'agrada" que als
  // "no m'agrada", corregit pel total de vots de la seva part.
  const weight = (k, [l, d]) => Math.log((l + 1) / (d + 1)) - (model.base[Aprenentatge.partOf(k)] || 0);

  // Puntuació d'una granota: trets sols + combinacions entre parts
  function score(g) {
    if (!model.n) return 0;
    const f = Granota.features(g).map(x => x[0]);
    let s = 0;
    for (const [k] of Aprenentatge.contributions({ v: 1, f })) {
      const c = model.counts[k];
      if (c) s += weight(k, c) * (k.includes('|') ? PAIR_WEIGHT : 1);
    }
    return s;
  }

  function next() {
    if (!model.n || Math.random() < EXPLORE) return randomSeed();
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

  // v: valoració global (1, -1 o 0); parts: { ulls: 1, potes: -1, ... }
  function vote(seed, v, parts = null) {
    const hasParts = parts && Object.keys(parts).length;
    if (!hasParts && v && voteOf(seed) === v) delete store.votes[hex(seed)];   // tornar a clicar anul·la el vot
    else if (v || hasParts) record(seed, v, Date.now(), parts);
    save(); build();
  }

  // Què s'ha après: per a cada part, els trets que més i menys agraden,
  // i les combinacions entre parts. Mínim de 2 vots per tret.
  function insights(n = 3) {
    const rows = Object.entries(model.counts).filter(([, c]) => c[0] + c[1] >= 2)
      .map(([k, c]) => ({ k, part: Aprenentatge.partOf(k), label: labelOf(k), w: weight(k, c), l: c[0], d: c[1] }));
    const top = (list, sgn) => list.filter(r => r.w * sgn > 0.25).sort((a, b) => (b.w - a.w) * sgn).slice(0, n);
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
      if (!e || !Array.isArray(e.f) || ![1, -1, 0].includes(e.v)) continue;
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
    counts: () => ({ L: model.L, D: model.D, P: model.P, local: Object.keys(store.votes).length, base: BASE.votes }),
  };
})();
