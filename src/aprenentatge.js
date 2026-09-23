'use strict';
// Lògica compartida (navegador i Node) per convertir vots en comptes.
//
// Un vot és { v, parts, f }:
//   v     = valoració global (1, -1 o 0 si només s'han valorat parts)
//   parts = valoracions per part, p. ex. { ulls: 1, boca: 1, potes: -1 }
//   f     = claus dels trets de la granota (Granota.features)
//
// Cada tret pertany a una part. El tret rep la valoració de la seva part si
// s'ha marcat, i si no, la global. A més es compten les COMBINACIONS entre els
// trets principals de parts diferents (p. ex. "ulls contents + boca somrient"):
// una combinació és positiva si les dues parts ho són i negativa si alguna no
// agrada.

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
    arch: 'cos', ratio: 'cos', size: 'cos', head: 'cos', taper: 'cos', horns: 'cos',
    pal: 'colors', col: 'colors', lum: 'colors', sat: 'colors', bcol: 'colors',
    eye: 'ulls', esz: 'ulls', pup: 'ulls', iris: 'ulls', lid: 'ulls', angry: 'ulls', brow: 'ulls',
    mouth: 'boca', nost: 'boca', cheeks: 'boca',
    belly: 'panxa',
    arms: 'potes', thigh: 'potes', feet: 'potes',
    pat: 'patro', patc: 'patro',
  };
  // Trets principals que es combinen entre ells
  const MAIN = new Set(['arch', 'col', 'bcol', 'eye', 'pup', 'mouth', 'belly', 'arms', 'thigh', 'pat']);

  const prefix = k => k.split(':')[0];
  const partOf = k => k.includes('|') ? 'pair' : (PART_OF_PREFIX[prefix(k)] || 'cos');
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // Llista de [clau, signe] que aporta un vot
  function contributions(e) {
    const sign = p => (e.parts && e.parts[p]) || e.v || 0;
    const out = [];
    for (const k of e.f) { const s = sign(partOf(k)); if (s) out.push([k, s]); }
    const mains = e.f.filter(k => MAIN.has(prefix(k)));
    for (let i = 0; i < mains.length; i++) for (let j = i + 1; j < mains.length; j++) {
      const pa = partOf(mains[i]), pb = partOf(mains[j]);
      if (pa === pb) continue;
      const sa = sign(pa), sb = sign(pb);
      if (sa && sb) out.push([pairKey(mains[i], mains[j]), Math.min(sa, sb)]);
    }
    return out;
  }

  // Afegeix un vot a { counts: {clau: [l, d]}, totals: {part: [l, d]} }
  function accumulate(model, e) {
    const seen = new Set();
    for (const [k, s] of contributions(e)) {
      const c = model.counts[k] || (model.counts[k] = [0, 0]);
      c[s > 0 ? 0 : 1]++;
      const p = partOf(k), key = p + (s > 0 ? '+' : '-');
      if (!seen.has(key)) {                 // cada vot compta un cop per part i signe
        seen.add(key);
        const t = model.totals[p] || (model.totals[p] = [0, 0]);
        t[s > 0 ? 0 : 1]++;
      }
    }
  }

  const labelPair = (k, labelOf) => k.split('|').map(labelOf).join(' + ');

  return { PARTS, partOf, contributions, accumulate, labelPair };
})();

if (typeof module !== 'undefined') module.exports = Aprenentatge;
