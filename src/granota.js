'use strict';
// Generador procedural de granotes pixel-art.
// Cada granota és un "genoma" determinista a partir d'una llavor (seed).
// El renderitzador dibuixa qualsevol pose (repòs, parpelleig, gola inflada,
// ajupida, salt, caiguda, boca oberta...) a partir del mateix genoma, de manera
// que totes les animacions s'adapten a la forma de cada granota.

const Granota = (() => {

// ---------------------------------------------------------------- RNG ----
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(seed);
  const R = {
    f: r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: arr => arr[Math.floor(r() * arr.length)],
    chance: p => r() < p,
    // {clau: pes}
    weighted(obj) {
      let tot = 0; for (const k in obj) tot += obj[k];
      let x = r() * tot;
      for (const k in obj) { x -= obj[k]; if (x < 0) return k; }
      return Object.keys(obj)[0];
    },
  };
  return R;
}
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sm = t => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  const u = sm(xf), v = sm(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// ------------------------------------------------------------- Colors ----
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}
function shift(hex, dh, ds, dl) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + dh, s + ds, l + dl);
}
// Variant il·luminada / ombrejada amb desplaçament de to (estil pixel-art)
function towardHue(h, target, amt) {
  let d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
const variantCache = new Map();
function variant(hex, lvl) {
  if (!lvl) return hex;
  const key = hex + lvl;
  let v = variantCache.get(key);
  if (v) return v;
  const [h, s, l] = hexToHsl(hex);
  if (lvl > 0) v = hslToHex(towardHue(h, 55, 8 * lvl), s + 0.03, l + 0.09 * lvl);
  else v = hslToHex(towardHue(h, 250, 10 * -lvl), s + 0.04, l + 0.12 * lvl);
  variantCache.set(key, v);
  return v;
}

// ----------------------------------------------- Paletes de referència ----
// Extretes de la imatge de referència (cos, panxa, accent/potes, iris).
const PALETTES = [
  { n: 'dart',    body: '#e1382c', belly: '#e1382c', accent: '#1d5199', iris: '#0b0f1e' },
  { n: 'arbre',   body: '#aedd2b', belly: '#ffffcf', accent: '#ff5a2a', iris: '#ff3033' },
  { n: 'pluja',   body: '#b2b2aa', belly: '#dbdbd8', accent: '#808079', iris: '#1f1d1d' },
  { n: 'toro',    body: '#8e8f49', belly: '#f5f2eb', accent: '#5d5e26', iris: '#dcc156' },
  { n: 'gripau',  body: '#b65836', belly: '#dfbe9d', accent: '#8b3c20', iris: '#2b0f05' },
  { n: 'sorra',   body: '#d39d57', belly: '#f3d8a0', accent: '#8e642d', iris: '#140c02' },
  { n: 'oliva',   body: '#868324', belly: '#e4c836', accent: '#52500f', iris: '#e4c836' },
  { n: 'fang',    body: '#744d2e', belly: '#e9bda4', accent: '#4c301a', iris: '#b18546' },
  { n: 'pàl·lida',body: '#b4bc45', belly: '#ecda90', accent: '#fbd42f', iris: '#2f320a' },
  { n: 'carmí',   body: '#d53235', belly: '#d53235', accent: '#850f1a', iris: '#010004' },
  { n: 'pissarra',body: '#596273', belly: '#e9b349', accent: '#394050', iris: '#9f954d' },
  { n: 'avellana',body: '#9a5f2e', belly: '#f6d6a3', accent: '#7d4b26', iris: '#060300' },
  { n: 'llima',   body: '#a6c706', belly: '#ff6206', accent: '#627600', iris: '#1a1a06' },
  { n: 'pedra',   body: '#837866', belly: '#c9bdbd', accent: '#dfb166', iris: '#1a160e' },
  { n: 'desert',  body: '#c5b091', belly: '#d8c8aa', accent: '#815d25', iris: '#e69b43' },
  { n: 'banyuda', body: '#c5a45d', belly: '#ddc9c4', accent: '#886f39', iris: '#1f170f' },
  { n: 'menta',   body: '#7ea592', belly: '#acc3b8', accent: '#496859', iris: '#1c2b24' },
  { n: 'taronja', body: '#db7400', belly: '#f7ad1e', accent: '#9d3f00', iris: '#290f00' },
  { n: 'gel',     body: '#a2bac6', belly: '#b8ccd6', accent: '#5a7583', iris: '#c5a45d' },
  { n: 'carbó',   body: '#54514c', belly: '#54514c', accent: '#35312b', iris: '#0f0e0b' },
  { n: 'sàlvia',  body: '#95a75e', belly: '#d0d4c3', accent: '#5f6c37', iris: '#2c3317' },
  { n: 'blava',   body: '#2f5bbe', belly: '#a0d3fc', accent: '#122f6f', iris: '#06122b' },
  { n: 'os',      body: '#b1a389', belly: '#d9d6cd', accent: '#eec5a4', iris: '#242018' },
  { n: 'prat',    body: '#68a24f', belly: '#ffffcf', accent: '#356023', iris: '#e0b020' },
];
const IRIS = {
  '#0b0f1e': 5, '#1a1208': 3, '#dcc156': 2, '#e69b43': 1.5, '#ff3033': 1.2,
  '#c5a45d': 1, '#9f954d': 0.8, '#b8d040': 0.5, '#8ab0d0': 0.5, '#e8e8e0': 0.4, '#d06020': 0.6,
};
const TONGUES = ['#e0607a', '#d8506a', '#c84860', '#e888a0', '#b0506a', '#d86a5a', '#a64b77'];
const MOUTHS = ['#ae7397', '#b85a6a', '#9a5a80', '#c07080', '#8a4a60'];

// ------------------------------------------------------------ Genoma ----
function genome(seed) {
  seed = seed >>> 0;
  const R = makeRng(seed);
  const g = { seed };
  const jit = (hex, a = 1) => shift(hex, R.range(-12, 12) * a, R.range(-0.07, 0.07) * a, R.range(-0.05, 0.05) * a);

  // --- Colors: una paleta base barrejada amb d'altres i amb variació de to
  const P = R.pick(PALETTES);
  g.palette = P.n;
  g.body = jit(P.body);
  g.belly = jit(P.belly);
  g.accent = jit(P.accent);
  if (R.chance(0.3)) g.belly = jit(R.pick(PALETTES).belly);
  if (R.chance(0.3)) g.accent = jit(R.pick(PALETTES).accent);
  if (R.chance(0.18)) {           // paleta totalment nova (harmonia aleatòria)
    const h = R.range(0, 360);
    g.body = hslToHex(h, R.range(0.35, 0.85), R.range(0.35, 0.6));
    g.belly = hslToHex(h + R.range(-50, 50), R.range(0.25, 0.8), R.range(0.72, 0.9));
    g.accent = hslToHex(h + R.pick([150, 180, 210, -30, 30]), R.range(0.4, 0.8), R.range(0.3, 0.55));
  }
  if (R.chance(0.12)) g.belly = g.body;        // sense panxa diferenciada
  g.iris = R.chance(0.45) ? P.iris : R.weighted(IRIS);
  g.tongue = R.pick(TONGUES);
  g.mouthIn = R.pick(MOUTHS);
  const [bh_, bs_] = hexToHsl(g.body);
  g.outline = hslToHex(bh_, Math.min(0.5, bs_ * 0.6), 0.1);
  g.patColor = R.weighted({ dark: 4, accent: 3, light: 1.5, other: 1.5 });
  g.pat = {
    dark: shift(g.body, R.range(-15, 15), 0.05, -R.range(0.18, 0.3)),
    accent: g.accent,
    light: shift(g.body, 0, -0.05, R.range(0.12, 0.2)),
    other: jit(R.pick(PALETTES).body),
  }[g.patColor];
  g.legColor = R.weighted({ body: 5, accent: 2.5, dark: 1 });

  // --- Cos
  g.bw = R.range(11, 21);                           // mitja amplada
  g.bh = Math.min(30, Math.max(14, g.bw * R.range(0.95, 1.5)));
  g.pTop = R.range(1.7, 3.4);                       // forma del cap (rodó ↔ quadrat)
  g.pBot = R.range(1.8, 3.2);
  g.taper = R.range(-0.12, 0.45);                   // + = més ample de baix (pera / gripau)

  // --- Ulls
  g.eyeType = R.weighted({ bulge: 4, toad: 2.5, white: 1.5, bead: 2, dot: 0.8 });
  g.er = { bulge: R.range(2.4, 4.8), toad: R.range(2.4, 4.2), white: R.range(2.8, 4.8), bead: R.range(1.4, 2.6), dot: R.range(0.9, 1.4) }[g.eyeType];
  g.er = Math.min(g.er, g.bw * 0.3);
  g.eyeSpread = R.range(0.35, 0.72);
  g.eyeDrop = g.eyeType === 'bead' || g.eyeType === 'dot' ? R.range(2, 6) : R.range(-g.er * 0.6, g.er * 0.9);
  g.pupil = R.weighted({ round: 3, horiz: 3, vert: 1, full: 1.5 });
  if (g.eyeType === 'white') g.pupil = 'round';
  g.brow = g.eyeType === 'toad' || R.chance(0.15);
  g.horns = R.chance(0.08);                          // "banyes" com la granota cornuda

  // --- Boca
  g.mouth = R.weighted({ line: 4, smile: 2, frown: 1.5, small: 1.5, open: 0.6, none: 0.6 });
  g.mouthW = g.mouth === 'small' ? R.range(0.1, 0.2) : R.range(0.35, 0.85);
  g.mouthGap = R.range(1, 4);
  g.openH = R.range(3, 7);
  g.nostrils = R.chance(0.55);
  g.cheeks = R.chance(0.15);

  // --- Panxa
  g.bellyType = R.weighted({ oval: 3, big: 2.5, chin: 1, ribbed: 1, none: 0.8 });
  g.bellyW = R.range(0.5, 0.85);
  g.bellyH = R.range(0.35, 0.65);

  // --- Potes
  g.arms = R.weighted({ thin: 3, stubby: 3, pads: 2, hidden: 0.7 });
  g.armX = R.range(0.2, 0.5);
  g.thighs = R.weighted({ bulky: 3, normal: 3, slim: 1.5, hidden: 1 });
  g.tw = { bulky: R.range(4, 7), normal: R.range(3, 5), slim: R.range(2, 3.5), hidden: 0 }[g.thighs];
  g.th = { bulky: R.range(4, 7), normal: R.range(3, 5.5), slim: R.range(3, 5), hidden: 0 }[g.thighs];
  g.feet = R.weighted({ toes: 3, pads: 1.5, webbed: 1.5 });
  g.legLen = R.range(7, 13);

  // --- Patrons (0 a 3 combinats), coordenades normalitzades al cos
  g.patterns = [];
  const nPat = R.weighted({ 0: 2, 1: 4, 2: 2.5, 3: 0.8 }) | 0;
  const pool = { spots: 3, warts: 2.5, speckle: 2, stripe: 1.2, lines: 1.2, bands: 1, blotch: 1.5, mottle: 1.5, mask: 1, twotone: 1, chevron: 0.6, freckle: 1 };
  for (let i = 0; i < nPat; i++) {
    const type = R.weighted(pool);
    delete pool[type];
    const p = { type, seed: R.int(1, 1e9) };
    if (type === 'spots') {
      p.list = []; const n = R.int(2, 7), sym = R.chance(0.7);
      for (let k = 0; k < n; k++) {
        const s = { u: R.range(0.05, 0.8), v: R.range(-0.9, 0.7), r: R.range(0.9, 3) };
        p.list.push(s);
        p.list.push(sym ? { u: -s.u, v: s.v, r: s.r } : { u: -R.range(0.05, 0.8), v: R.range(-0.9, 0.7), r: R.range(0.9, 3) });
      }
      p.ring = R.chance(0.25);                       // taques amb vora
    }
    if (type === 'warts') { p.density = R.range(0.04, 0.12); }
    if (type === 'speckle' || type === 'freckle') { p.density = R.range(0.05, 0.16); }
    if (type === 'stripe') { p.w = R.range(0.04, 0.12); }
    if (type === 'lines') { p.pos = R.range(0.4, 0.7); p.w = R.range(0.05, 0.1); }
    if (type === 'bands') { p.k = R.int(3, 6); p.phase = R.range(0, 1); }
    if (type === 'blotch') { p.scale = R.range(1.6, 3.2); p.thr = R.range(0.55, 0.68); }
    if (type === 'mottle') { p.scale = R.range(2, 4); }
    if (type === 'twotone') { p.at = R.range(0.1, 0.5); }
    g.patterns.push(p);
  }
  if (g.patterns.some(p => p.type === 'twotone')) g.legColor = 'accent';

  // --- Personalitat (adapta les animacions a cada cos)
  const mass = (g.bw * g.bh - 150) / 450;                     // 0 = petita, 1 = grossa
  g.mass = Math.max(0, Math.min(1, mass));
  g.jumpy = R.range(0.8, 1.25) * (g.arms === 'pads' || g.thighs === 'slim' ? 1.2 : 1) * (1.15 - g.mass * 0.4);
  g.lazy = R.range(0.7, 1.4) * (0.8 + g.mass * 0.7);
  g.croaky = R.range(0.3, 1.5);
  g.reach = R.range(26, 48) * (0.8 + g.mass * 0.4);          // abast de la llengua (px lògics)
  g.curious = R.range(0.3, 1);

  g.name = nameOf(g);
  return g;
}

function nameOf(g) {
  const [h, s, l] = hexToHsl(g.body);
  let c;
  if (s < 0.14) c = l < 0.3 ? 'negra' : l > 0.7 ? 'blanca' : 'grisa';
  else if (h < 14 || h >= 340) c = l < 0.35 ? 'granat' : 'vermella';
  else if (h < 38) c = l < 0.45 ? 'marró' : 'taronja';
  else if (h < 58) c = l < 0.45 ? 'marró' : s < 0.45 ? 'terrosa' : 'groga';
  else if (h < 80) c = s < 0.4 ? 'oliva' : 'llimona';
  else if (h < 160) c = 'verda';
  else if (h < 200) c = 'turquesa';
  else if (h < 260) c = 'blava';
  else if (h < 300) c = 'violeta';
  else c = 'rosada';
  const pat = { spots: 'tacada', warts: 'berrugosa', speckle: 'pigallada', stripe: 'ratllada', lines: 'llistada', bands: 'tigrada', blotch: 'clapejada', mottle: 'jaspiada', mask: 'emmascarada', twotone: 'bicolor', chevron: 'ornada', freckle: 'pigosa' };
  const size = g.mass > 0.65 ? ' grossa' : g.mass < 0.12 ? ' petita' : '';
  const p = g.patterns.length ? ' ' + pat[g.patterns[0].type] : '';
  const eye = g.eyeType === 'white' ? ' ullerosa' : g.horns ? ' cornuda' : '';
  return 'Granota ' + c + p + eye + size;
}

// --------------------------------------------------------- Renderitzat ----
const GW = 84, GH = 84, G = 78, CX = 42;       // quadrícula lògica, terra i centre

const POSES = {
  idle:    {},
  breath:  { sx: 1.03, sy: 0.97 },
  blink:   { eyes: 'closed' },
  half:    { eyes: 'half' },
  puff1:   { puff: 0.5, sx: 1.02 },
  puff2:   { puff: 1, sx: 1.05, sy: 0.97 },
  crouch:  { sx: 1.1, sy: 0.84, legs: 'crouch' },
  takeoff: { sx: 0.9, sy: 1.12, legs: 'jump', arms: 'down' },
  air:     { sx: 0.93, sy: 1.07, legs: 'jump', arms: 'out' },
  fall:    { sx: 0.98, sy: 1.02, legs: 'spread', arms: 'reach' },
  tongue:  { mouth: 'open' },
  gulp:    { eyes: 'closed', puff: 0.35, sx: 1.03 },
};

function render(g, poseName, lookX = 0, lookY = 0) {
  const pose = POSES[poseName] || {};
  const sx = pose.sx || 1, sy = pose.sy || 1;
  const N = GW * GH;
  const col = new Array(N).fill(null);
  const lvl = new Int8Array(N);
  const idx = (x, y) => y * GW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

  // Estampa una màscara amb contorn i ombrejat propis
  function stamp(maskFn, colorFn, o = {}) {
    const inside = new Uint8Array(N);
    const list = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (maskFn(x + 0.5, y + 0.5) && (!o.clip || o.clip[idx(x, y)])) { inside[idx(x, y)] = 1; list.push(x, y); }
    }
    const has = (x, y) => inb(x, y) && inside[idx(x, y)];
    if (o.outline !== false) {
      for (let i = 0; i < list.length; i += 2) {
        const x = list[i], y = list[i + 1];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (inb(nx, ny) && !inside[idx(nx, ny)]) { col[idx(nx, ny)] = g.outline; lvl[idx(nx, ny)] = 0; }
        }
      }
    }
    for (let i = 0; i < list.length; i += 2) {
      const x = list[i], y = list[i + 1], k = idx(x, y);
      col[k] = colorFn ? colorFn(x, y) : o.color;
      let l = 0;
      if (o.shade !== false) {
        if (!has(x + 1, y + 1) || !has(x, y + 1)) l = -1;
        else if (o.soft && (!has(x, y + 2) || !has(x + 2, y + 1))) l = -1;
        else if (!has(x - 1, y - 1) || (o.soft && !has(x - 1, y - 2))) l = 1;
      }
      lvl[k] = l;
    }
    return inside;
  }
  const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
  const capsule = (ax, ay, bx, by, r) => (x, y) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t) <= r;
  };
  const both = (f) => (x, y) => f(x, y) || f(2 * CX - x, y);   // simetria

  const legHex = g.legColor === 'accent' ? g.accent : g.legColor === 'dark' ? shift(g.body, 0, 0, -0.12) : g.body;

  // --- Geometria del cos segons la pose
  const legs = pose.legs || 'sit';
  const bodyW = g.bw * sx, bodyH = g.bh * sy;
  const raise = legs === 'jump' ? g.legLen : legs === 'spread' ? g.legLen * 0.45 : 0;
  const bottom = G - 1 - raise - (g.thighs === 'hidden' && legs === 'sit' ? 0 : 0);
  const cy = bottom - bodyH / 2, top = bottom - bodyH;
  const bodyMask = (x, y) => {
    const v = (y - cy) / (bodyH / 2);
    if (v < -1 || v > 1) return false;
    const w = bodyW * (1 + g.taper * v * 0.5) / (1 + g.taper * 0.5) * (1 + Math.max(0, g.taper) * 0.15);
    const u = (x - CX) / w;
    const p = v < 0 ? g.pTop : g.pBot;
    return Math.abs(u) ** p + Math.abs(v) ** p <= 1;
  };
  const U = x => (x - CX) / bodyW, V = y => (y - cy) / (bodyH / 2);

  // Ulls: posició
  const er = g.er;
  const eyeDX = Math.max(er + 1, bodyW * g.eyeSpread);
  const eyeY = top + g.eyeDrop + er * 0.3;
  const eyes = [CX - eyeDX, CX + eyeDX];

  // Boca: posició
  let mouthY = Math.round(eyeY + er + g.mouthGap);
  mouthY = Math.min(mouthY, Math.round(bottom - bodyH * 0.35));
  const mouthW = Math.max(1.5, bodyW * g.mouthW);

  // --- Potes posteriors en salt (darrere del cos)
  if (legs === 'jump' || legs === 'spread') {
    const hipX = bodyW * 0.55, r = g.thighs === 'bulky' ? 1.8 : 1.3;
    const footX = legs === 'jump' ? hipX + 1 : hipX + g.legLen * 0.8;
    const footY = legs === 'jump' ? G - 1 : G - 1 - g.legLen * 0.2;
    stamp(both(capsule(CX - hipX, bottom - 2, CX - footX, footY - 1, r)), null, { color: legHex });
    stamp(both(rect(CX - footX - 2.5, footY - 1, CX - footX + 2, footY + 0.5)), null, { color: legHex, shade: false });
  }

  // --- Cos + patrons
  const bodyIn = stamp(bodyMask, null, { color: g.body, soft: true });
  applyPatterns(g, col, lvl, bodyIn, U, V, eyeY, cy, bodyH, idx, 'body');

  // --- Panxa
  if (g.bellyType !== 'none' && g.belly !== g.body) {
    let bm;
    if (g.bellyType === 'chin') bm = ellipse(CX, mouthY + 2 + bodyH * 0.1, bodyW * g.bellyW * 0.5, bodyH * 0.16);
    else if (g.bellyType === 'big') bm = ellipse(CX, bottom - bodyH * g.bellyH * 0.55, bodyW * g.bellyW, bodyH * g.bellyH * 0.62);
    else bm = ellipse(CX, bottom - bodyH * g.bellyH * 0.5, bodyW * g.bellyW * 0.8, bodyH * g.bellyH * 0.5);
    const bIn = stamp(bm, null, { color: g.belly, outline: false, clip: bodyIn, soft: true });
    if (g.bellyType === 'ribbed') {
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const k = idx(x, y);
        if (bIn[k] && (y - Math.round(mouthY)) % 3 === 0 && Math.abs(x + 0.5 - CX) > 0.8) lvl[k] = -1;
      }
    }
  }

  // --- Cuixes i peus posteriors (asseguda / ajupida)
  if (legs === 'sit' || legs === 'crouch') {
    const k = legs === 'crouch' ? 1.2 : 1;
    if (g.thighs !== 'hidden') {
      const tcx = bodyW - g.tw * 0.55, tcy = G - 1 - g.th * 0.9;
      const tIn = stamp(both(ellipse(CX - tcx * (legs === 'crouch' ? 1.04 : 1), tcy, g.tw * k, g.th)), null, { color: legHex, soft: true });
      applyPatterns(g, col, lvl, tIn, U, V, eyeY, cy, bodyH, idx, 'leg');
      const fx = tcx + g.tw * 0.6 * k;
      footRow(CX - fx - 4, CX - fx + 1, G - 1, -1);
    } else {
      footRow(CX - bodyW * 0.7 - 2, CX - bodyW * 0.7 + 2, G - 1, -1);
    }
  }

  // --- Braços
  if (g.arms !== 'hidden' || legs !== 'sit') {
    const ax = bodyW * g.armX + 2.5;
    const aw = g.arms === 'stubby' ? 1.6 : 1.1;
    const shoulderY = bottom - Math.min(bodyH * 0.3, 7);
    const armStyle = pose.arms || 'sit';
    if (armStyle === 'sit') {
      const len = legs === 'crouch' ? 0.6 : 1;
      stamp(both(capsule(CX - ax + 0.5, shoulderY + (1 - len) * 3, CX - ax - 0.5, G - 2, aw)), null, { color: legHex });
      handRow(CX - ax, G - 1);
    } else if (armStyle === 'down') {
      stamp(both(capsule(CX - ax, shoulderY, CX - ax - 1, bottom + 3, aw)), null, { color: legHex });
    } else if (armStyle === 'out') {
      stamp(both(capsule(CX - ax, shoulderY, CX - bodyW - 2, shoulderY + 3, aw)), null, { color: legHex });
    } else if (armStyle === 'reach') {
      stamp(both(capsule(CX - ax, shoulderY, CX - ax - 3, G - 2, aw)), null, { color: legHex });
      handRow(CX - ax - 3, G - 1);
    }
  }

  function footRow(x0, x1, y, dir) {
    const m = g.feet === 'webbed' ? rect(x0 - 1, y - 1, x1, y + 1) : rect(x0, y, x1, y + 1);
    stamp(both(m), null, { color: legHex, shade: false });
    if (g.feet === 'toes') for (let x = Math.ceil(x0) + 1; x < x1 - 1; x += 2) { dot(x, y, g.outline); dot(2 * CX - x - 1, y, g.outline); }
    if (g.feet === 'pads') { dot(Math.floor(x0), y, variant(legHex, 1)); dot(2 * CX - Math.floor(x0) - 1, y, variant(legHex, 1)); }
  }
  function handRow(x, y) {
    const m = rect(x - 2, y, x + 2, y + 1);
    stamp(both(m), null, { color: legHex, shade: false });
    if (g.feet !== 'webbed') { dot(Math.round(x - 0.5), y, g.outline); dot(2 * CX - Math.round(x - 0.5) - 1, y, g.outline); }
    if (g.arms === 'pads') { dot(Math.floor(x - 2), y, variant(legHex, 1)); dot(2 * CX - Math.floor(x - 2) - 1, y, variant(legHex, 1)); }
  }
  function dot(x, y, c, l = 0) { x = Math.floor(x); y = Math.floor(y); if (inb(x, y)) { col[idx(x, y)] = c; lvl[idx(x, y)] = l; } }

  // --- Gola inflada (sac vocal)
  if (pose.puff) {
    const rx = bodyW * 0.3 * (0.6 + 0.5 * pose.puff) + 1, ry = 1.5 + 3.5 * pose.puff;
    stamp(ellipse(CX, mouthY + 1 + ry, rx, ry), null, { color: variant(g.belly === g.body ? shift(g.body, 0, -0.1, 0.2) : g.belly, 1), soft: true });
  }

  // --- Banyes / celles
  if (g.horns) {
    for (const ex of eyes) {
      const d = Math.sign(ex - CX);
      stamp(capsule(ex - d * 0.5, eyeY - er - 0.5, ex + d * (er * 0.6), eyeY - er - 3.5, 1.1), null, { color: g.body });
    }
  }

  // --- Ulls
  const eyesState = pose.eyes || 'open';
  const lx = Math.round(lookX), ly = Math.round(lookY);
  for (const ex of eyes) {
    const t = g.eyeType;
    if (t === 'bulge' || t === 'toad' || t === 'white') {
      // parpella / sòcol de l'ull
      stamp(ellipse(ex, eyeY, er + 1.3, er + 1.1), null, { color: g.body, soft: false });
      if (eyesState === 'closed') {
        stamp(ellipse(ex, eyeY, er, er * 0.9), null, { color: g.body, outline: false });
        for (let x = Math.floor(ex - er + 0.5); x < ex + er - 0.5; x++) dot(x, eyeY + 0.5, g.outline);
        continue;
      }
      const ball = t === 'white' ? '#f2f0e6' : g.iris;
      const bIn = stamp(ellipse(ex, eyeY, er, er), null, { color: ball, outline: false, shade: false });
      // pupil·la
      const px = ex + lx * (er > 2.6 ? 1 : 0.5), py = eyeY + ly * (er > 3 ? 1 : 0);
      const pc = '#0a0a10';
      if (t === 'white') stamp(ellipse(px, py, Math.max(1.1, er * 0.5), Math.max(1.1, er * 0.55)), null, { color: pc, outline: false, shade: false, clip: bIn });
      else if (g.pupil === 'round') stamp(ellipse(px, py, Math.max(0.9, er * 0.42), Math.max(0.9, er * 0.42)), null, { color: pc, outline: false, shade: false, clip: bIn });
      else if (g.pupil === 'horiz') stamp(rect(px - er * 0.75, py - 0.5 - (er > 3.5 ? 0.5 : 0), px + er * 0.75, py + 0.5), null, { color: pc, outline: false, shade: false, clip: bIn });
      else if (g.pupil === 'vert') stamp(rect(px - 0.5, py - er * 0.8, px + 0.5, py + er * 0.8), null, { color: pc, outline: false, shade: false, clip: bIn });
      else if (g.pupil === 'full') stamp(ellipse(ex, eyeY, er, er), null, { color: '#0c0c14', outline: false, shade: false });
      // ombra inferior de l'iris i brillantor
      if (t !== 'white') for (let x = Math.floor(ex - er); x <= ex + er; x++) {
        const y = Math.floor(eyeY + er - 0.6);
        if (inb(x, y) && bIn[idx(x, y)] && col[idx(x, y)] === ball) lvl[idx(x, y)] = -1;
      }
      dot(ex - er * 0.45, eyeY - er * 0.45, '#ffffff');
      if (er > 3.4) dot(ex - er * 0.45 + 1, eyeY - er * 0.45, '#ffffff');
      // parpella superior (gripau) o mig tancat
      if (t === 'toad' || g.brow || eyesState === 'half') {
        const cut = eyesState === 'half' ? eyeY : eyeY - er * (t === 'toad' ? 0.35 : 0.6);
        for (let y = Math.floor(eyeY - er - 1); y < cut; y++) for (let x = Math.floor(ex - er - 1); x <= ex + er + 1; x++) {
          if (inb(x, y) && bIn[idx(x, y)]) { col[idx(x, y)] = g.body; lvl[idx(x, y)] = -1; }
        }
        for (let x = Math.floor(ex - er + 0.5); x < ex + er - 0.5; x++) {
          const y = Math.floor(cut);
          if (inb(x, y) && bIn[idx(x, y)]) dot(x, y, g.outline);
        }
      }
    } else {
      // ulls petits encastats
      if (eyesState === 'closed') { for (let x = Math.floor(ex - er - 0.5); x < ex + er + 0.5; x++) dot(x, eyeY, g.outline); continue; }
      const c = g.iris === g.body ? '#0a0a10' : (hexToHsl(g.iris)[2] > 0.5 ? '#0a0a10' : g.iris);
      stamp(ellipse(ex, eyeY, er + 0.3, er + (eyesState === 'half' ? -0.4 : 0.3)), null, { color: c, outline: false, shade: false });
      if (g.eyeType === 'bead') dot(ex - er * 0.5 + lx * 0.5, eyeY - er * 0.5, '#ffffff');
    }
  }
  if (g.brow && g.eyeType !== 'bead' && g.eyeType !== 'dot') {
    for (const ex of eyes) for (let x = Math.floor(ex - er); x <= ex + er; x++) {
      const y = Math.floor(eyeY - er - 1.2);
      if (inb(x, y) && col[idx(x, y)] && col[idx(x, y)] !== g.outline) lvl[idx(x, y)] = -1;
    }
  }

  // --- Boca
  const mc = g.outline;
  const mopen = pose.mouth === 'open';
  const mw = Math.round(mouthW);
  if (mopen || g.mouth === 'open') {
    const rx = mopen && g.mouth !== 'open' ? Math.max(2, Math.min(mw, 5)) : mw;
    const ry = mopen && g.mouth !== 'open' ? 2 : g.openH * (mopen ? 1.15 : 1);
    stamp(ellipse(CX, mouthY + ry * 0.5, rx, ry), null, { color: g.mouthIn, soft: true });
    if (g.mouth === 'open' && !mopen) {
      stamp(ellipse(CX, mouthY + ry * 1.1, rx * 0.6, ry * 0.45), null, { color: variant(g.mouthIn, 1), outline: false });
      for (let x = Math.floor(CX - rx + 1); x < CX + rx - 1; x++) if (col[idx(x, Math.floor(mouthY - ry * 0.5 + 1))] === g.mouthIn) dot(x, mouthY - ry * 0.5 + 1, '#f4f0e8');
    }
    if (mopen) stamp(ellipse(CX, mouthY + ry * 0.7, Math.max(1, rx * 0.45), 1), null, { color: g.tongue, outline: false });
  } else if (g.mouth !== 'none') {
    for (let x = -mw; x < mw; x++) {
      const e = Math.abs(x + 0.5) / mw;             // 0 al centre, 1 als extrems
      let dy = 0;
      if (g.mouth === 'smile' && e > 0.75) dy = -1;
      if (g.mouth === 'line' && e > 0.88) dy = -1;
      if (g.mouth === 'frown') dy = e > 0.8 ? 1 : 0;
      dot(CX + x, mouthY + dy, mc);
    }
    if (g.mouth !== 'small') for (let x = -mw + 1; x < mw - 1; x++) {   // llavi inferior il·luminat
      const k = idx(CX + x, mouthY + 1);
      if (col[k] && col[k] !== g.outline) lvl[k] = 1;
    }
  }
  if (g.nostrils && mouthY - eyeY > 2) { dot(CX - 2, mouthY - 2, mc); dot(CX + 1, mouthY - 2, mc); }
  if (g.cheeks) { dot(CX - mw - 1, mouthY + 1, '#f08a9a'); dot(CX + mw, mouthY + 1, '#f08a9a'); }

  // --- A píxels
  const cv = document.createElement('canvas');
  cv.width = GW; cv.height = GH;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(GW, GH);
  for (let k = 0; k < N; k++) {
    if (!col[k]) continue;
    const hex = variant(col[k], lvl[k]);
    const n = parseInt(hex.slice(1), 16);
    img.data[k * 4] = n >> 16 & 255; img.data[k * 4 + 1] = n >> 8 & 255; img.data[k * 4 + 2] = n & 255; img.data[k * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return { canvas: cv, mouth: { x: CX, y: mouthY + 1 }, bodyW, top };
}

function applyPatterns(g, col, lvl, mask, U, V, eyeY, cy, bodyH, idx, part) {
  const pc = g.pat;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const k = idx(x, y);
    if (!mask[k] || col[k] === g.outline) continue;
    const u = U(x + 0.5), v = V(y + 0.5), au = Math.abs(u);
    for (const p of g.patterns) {
      switch (p.type) {
        case 'spots':
          for (const s of p.list) {
            const d = Math.hypot((u - s.u) * g.bw, (v - s.v) * g.bh / 2);
            if (d < s.r) { col[k] = p.ring && d > s.r - 1 ? g.outline : pc; break; }
          }
          break;
        case 'warts': {
          const h = hash2(x, y, p.seed);
          if (h < p.density) lvl[k] = 1;
          else if (hash2(x, y - 1, p.seed) < p.density) lvl[k] = -1;
          break;
        }
        case 'speckle':
          if (hash2(Math.round(u * 40), Math.round(v * 40), p.seed) < p.density) col[k] = pc;
          break;
        case 'freckle':
          if (v < 0.3 && hash2(Math.round(u * 30), Math.round(v * 30), p.seed) < p.density) lvl[k] = -1;
          break;
        case 'stripe':
          if (au < p.w && v < 0.7 && part === 'body') col[k] = pc;
          break;
        case 'lines':
          if (Math.abs(au - p.pos) < p.w && v < 0.6) col[k] = pc;
          break;
        case 'bands':
          if (Math.floor((v + 1) * p.k + p.phase + (part === 'leg' ? u * 3 : 0)) % 2 === 0 && (part === 'leg' || au > 0.15)) col[k] = pc;
          break;
        case 'blotch':
          if (noise2((au + 0.3) * p.scale * 2, (v + 2) * p.scale, p.seed) > p.thr) col[k] = pc;
          break;
        case 'mottle':
          if (noise2((au + 0.3) * p.scale * 3, (v + 2) * p.scale * 1.5, p.seed) > 0.62 && lvl[k] === 0) lvl[k] = -1;
          break;
        case 'mask':
          if (part === 'body' && Math.abs(y + 0.5 - eyeY) < 1.6 && au > 0.25) col[k] = g.outline === col[k] ? col[k] : shift(g.body, 0, 0, -0.28);
          break;
        case 'twotone':
          if (v > p.at || part === 'leg') col[k] = g.accent;
          break;
        case 'chevron':
          if (part === 'body' && Math.abs(((v * 3 + au * 2.2) % 1 + 1) % 1 - 0.5) < 0.12 && v > -0.6 && v < 0.5) col[k] = pc;
          break;
      }
    }
  }
}

// Cau de fotogrames per granota
function create(seed) {
  const g = genome(seed);
  const cache = new Map();
  return {
    g,
    frame(pose, lx = 0, ly = 0) {
      const key = pose + '|' + lx + '|' + ly;
      let f = cache.get(key);
      if (!f) { f = render(g, pose, lx, ly); cache.set(key, f); }
      return f;
    },
  };
}

return { create, genome, GW, GH, G, CX, POSES };
})();
