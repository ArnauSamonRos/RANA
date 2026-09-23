'use strict';
// Aprenentatge del gust de l'usuari amb "M'agrada" / "No m'agrada".
//
// Cada granota es descompon en trets (tipus, color, ulls, boca, patró,
// proporcions...). Per a cada tret es compten els vots a favor i en contra i
// se'n treu un pes (log-odds, com un classificador Naive Bayes). Per generar
// una granota nova es proven moltes llavors, es puntuen amb aquests pesos i se
// n'escull una amb probabilitat proporcional a exp(puntuació / T): les que
// encaixen amb el teu gust surten molt més, però es continua explorant.
// Els vots es guarden al navegador (localStorage).

const Gust = (() => {
  const KEY = 'granotes-gust-v1';
  const CANDIDATES = 60;     // llavors provades per cada granota nova
  const EXPLORE = 0.15;      // fracció de granotes totalment a l'atzar
  const TEMP = 1.5;          // temperatura: més alta = més varietat

  const hex = s => (s >>> 0).toString(16).padStart(8, '0');
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;

  let votes = {};
  try { votes = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { votes = {}; }
  let model;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(votes)); } catch (e) { /* sense emmagatzematge */ } }

  function build() {
    const counts = new Map();
    let L = 0, D = 0;
    for (const [seed, v] of Object.entries(votes)) {
      const g = Granota.genome(parseInt(seed, 16));
      if (v > 0) L++; else D++;
      for (const [k, label] of Granota.features(g)) {
        const e = counts.get(k) || { l: 0, d: 0, label };
        if (v > 0) e.l++; else e.d++;
        counts.set(k, e);
      }
    }
    model = { counts, L, D, base: Math.log((L + 1) / (D + 1)) };
  }

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
      if (votes[hex(s)] < 0) continue;
      cands.push([s, score(Granota.genome(s))]);
    }
    const mx = Math.max(...cands.map(c => c[1]));
    const ws = cands.map(c => Math.exp((c[1] - mx) / TEMP));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i][0]; }
    return cands[cands.length - 1][0];
  }

  function vote(seed, v) {
    const k = hex(seed);
    if (votes[k] === v) delete votes[k]; else votes[k] = v;   // tornar a clicar anul·la el vot
    save(); build();
  }

  // Trets amb més pes (a favor i en contra), amb un mínim de 2 vots
  function insights(n = 6) {
    const list = [...model.counts.values()].filter(e => e.l + e.d >= 2).map(e => ({ label: e.label, w: weight(e), l: e.l, d: e.d }));
    const pos = list.filter(e => e.w > 0.25).sort((a, b) => b.w - a.w).slice(0, n);
    const neg = list.filter(e => e.w < -0.25).sort((a, b) => a.w - b.w).slice(0, n);
    return { pos, neg };
  }

  function reset() { votes = {}; save(); build(); }

  build();
  return {
    next, vote, score, insights, reset,
    voteOf: seed => votes[hex(seed)] || 0,
    counts: () => ({ L: model.L, D: model.D }),
  };
})();
