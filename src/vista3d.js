'use strict';
// Vistes de la granota des de qualsevol direcció (perfil, tres quarts, esquena).
//
// A partir del genoma es construeix un model 3D senzill fet d'el·lipsoides (cos,
// cap, ulls, cuixes, peus, braços i mans) i es dibuixa en píxels llançant un raig
// per cada píxel (projecció ortogràfica, càmera una mica per sobre). Després s'hi
// aplica l'estil pixel-art: ombrejat en 3 tons, contorn exterior i contorns
// interiors on una peça queda davant d'una altra.
//
// Eixos del model: x a la dreta de la granota, y amunt, z endavant (cap al morro).
// yaw 0..7 en passos de 45°: 0 = de cara a la càmera, 2 = mira a la dreta,
// 4 = d'esquena, 6 = mira a l'esquerra.

const Granota3D = (() => {
  const { variant, shift, hexToHsl, hash2, noise2 } = Granota.util;
  const GW = 112, GH = 100, CX = 56, G = 90;          // llenç més gran que el 2D (perfil i salts)
  const PITCH = 22 * Math.PI / 180;                     // càmera una mica per sobre
  const LIGHT = norm([-0.45, 0.72, 0.55]);
  const PC = '#0a0a10';

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // El·lipsoide amb rotació opcional al voltant de l'eix x (per inclinar potes i cos)
  function ell(part, c, r, rotX = 0) { return { part, c, r, rotX, cs: Math.cos(rotX), sn: Math.sin(rotX) }; }
  // Intersecció raig-el·lipsoide: retorna { t, p (punt local sense escalar), n (normal objecte) }
  function hit(e, o, d) {
    // a l'espai local de l'el·lipsoide (rotació inversa al voltant de x)
    const ox = o[0] - e.c[0], oy = o[1] - e.c[1], oz = o[2] - e.c[2];
    const ly = oy * e.cs + oz * e.sn, lz = -oy * e.sn + oz * e.cs;
    const dy = d[1] * e.cs + d[2] * e.sn, dz = -d[1] * e.sn + d[2] * e.cs;
    const qx = ox / e.r[0], qy = ly / e.r[1], qz = lz / e.r[2];
    const ux = d[0] / e.r[0], uy = dy / e.r[1], uz = dz / e.r[2];
    const A = ux * ux + uy * uy + uz * uz, B = 2 * (qx * ux + qy * uy + qz * uz), C = qx * qx + qy * qy + qz * qz - 1;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t < 0) return null;
    const px = ox + d[0] * t, py = ly + dy * t, pz = lz + dz * t;
    const nl = [px / (e.r[0] * e.r[0]), py / (e.r[1] * e.r[1]), pz / (e.r[2] * e.r[2])];
    const n = norm([nl[0], nl[1] * e.cs - nl[2] * e.sn, nl[1] * e.sn + nl[2] * e.cs]);
    return { t, n, p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
  }

  // Patrons de la pell (mateixa lògica que el dibuix de cara, sobre coordenades del model)
  function pattern(g, u, v, p, part) {
    let col = null, dl = 0;
    const au = Math.abs(u), pc = g.pat;
    for (const q of g.patterns) {
      switch (q.type) {
        case 'spots':
          for (const s of q.list) {
            const d = Math.hypot((u - s.u) * g.bw, (v - s.v) * g.bh / 2);
            if (d < s.r) { col = q.ring && d > s.r - 1 ? g.outline : pc; break; }
          }
          break;
        case 'warts': {
          const x = Math.round(p[0]), y = Math.round(p[1] * 0.7 + p[2] * 0.7);
          if (hash2(x, y, q.seed) < q.density) dl = 1; else if (hash2(x, y - 1, q.seed) < q.density) dl = -1;
          break;
        }
        case 'speckle': if (hash2(Math.round(u * 40), Math.round(v * 40 + p[2]), q.seed) < q.density) col = pc; break;
        case 'freckle': if (v < 0.3 && hash2(Math.round(u * 30), Math.round(v * 30 + p[2]), q.seed) < q.density) dl = -1; break;
        case 'stripe': if (au < q.w && part === 'body') col = pc; break;
        case 'lines': if (Math.abs(au - q.pos) < q.w) col = pc; break;
        case 'bands': if (Math.floor((v + 1) * q.k + q.phase + (part === 'leg' ? u * 3 : 0)) % 2 === 0 && (part === 'leg' || au > 0.15)) col = pc; break;
        case 'blotch': if (noise2((au + 0.3) * q.scale * 2, (v + 2) * q.scale + p[2] * 0.08, q.seed) > q.thr) col = pc; break;
        case 'mottle': if (noise2((au + 0.3) * q.scale * 3, (v + 2) * q.scale * 1.5 + p[2] * 0.08, q.seed) > 0.62) dl = -1; break;
        case 'twotone': if (v > q.at || part === 'leg') col = g.accent; break;
        case 'chevron': if (part === 'body' && Math.abs(((v * 3 + au * 2.2) % 1 + 1) % 1 - 0.5) < 0.12 && v > -0.6 && v < 0.5) col = pc; break;
      }
    }
    return { col, dl };
  }

  // Construeix les peces del model segons la pose
  const Q = 0.85;                                       // escala perquè la mida quadri amb la vista de cara
  function build(g0, pose) {
    const g = Object.assign({}, g0, { bw: g0.bw * Q, bh: g0.bh * Q, tw: g0.tw * Q, th: g0.th * Q, legLen: g0.legLen * Q, er: g0.er * 0.92 });
    const W = g.bw, Hb = g.bh, L = Math.min(W * 1.05, 20), hw = g.headW || 1;
    const legs = pose.legs || 'sit';
    const sx = pose.sx || 1, sy = pose.sy || 1;
    const lift = legs === 'jump' ? g.legLen * 0.6 : legs === 'spread' ? g.legLen * 0.3 : 0;
    // inclinació del cos: morro amunt en l'enlairament, avall en la caiguda
    const tilt = legs === 'jump' ? (pose.arms === 'down' ? -0.45 : -0.2) : legs === 'spread' ? 0.25 : 0;
    const parts = [];
    const torsoC = [0, Hb * 0.4 * sy + lift, -L * 0.15], headC = [0, Hb * 0.64 * sy + lift, L * 0.42];
    const rot = (c) => {                                  // gira un punt del cos al voltant del maluc
      const pv = [0, lift + 1, -L * 0.6];
      const y = c[1] - pv[1], z = c[2] - pv[2];
      return [c[0], pv[1] + y * Math.cos(tilt) - z * Math.sin(tilt), pv[2] + y * Math.sin(tilt) + z * Math.cos(tilt)];
    };
    parts.push(ell('body', rot(torsoC), [W * 0.9 * sx, Hb * 0.42 * sy, L * 0.95], -tilt));
    const hc = rot(headC);
    parts.push(ell('head', hc, [W * 0.84 * hw * sx, Hb * 0.3 * sy, L * 0.55], -tilt));
    // ulls
    const er = g.er * 1.05, ex = Math.min(W * g.eyeSpread, W * 0.72 * hw);
    const small = g.eyeType === 'bead' || g.eyeType === 'dot';
    const ey = hc[1] + Hb * 0.3 * sy * (small ? 0.45 : 0.72), ez = hc[2] + L * (small ? 0.42 : 0.3);
    for (const sgn of [-1, 1]) parts.push(Object.assign(ell('eye', [sgn * ex, ey, ez], [er, er, er]), { side: sgn, eyeC: [sgn * ex, ey, ez], er }));
    // sac vocal
    if (pose.puff) parts.push(ell('sac', [0, hc[1] - Hb * 0.22, hc[2] + L * 0.38], [2 + W * 0.25 * pose.puff, 1.5 + 2.5 * pose.puff, 2 + 2 * pose.puff]));
    // potes posteriors
    if (legs === 'jump' || legs === 'spread') {
      // pota estirada: segment del maluc (que segueix el cos) fins al peu, sense trencar-se
      const back = legs === 'jump';
      const seg = (part, a, b, r) => {
        const dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dy, dz) || 1;
        return ell(part, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [r, r, len / 2 + r * 0.6], Math.atan2(-dy / len, dz / len));
      };
      for (const sgn of [-1, 1]) {
        const hip = rot([sgn * W * 0.6, lift + Hb * 0.12, -L * 0.7]);
        const knee = back ? rot([sgn * W * 0.66, lift * 0.5 + Hb * 0.05, -L * 1.25]) : [sgn * W * 0.85, Hb * 0.18, -L * 0.95];
        const foot = back ? (pose.arms === 'down' ? [sgn * W * 0.66, 1, -L * 1.55] : [sgn * W * 0.66, lift * 0.35 + 1.5, -L * 1.75])
          : [sgn * W * 0.95, 1, -L * 0.6];
        const r = Math.max(1.6, g.tw * 0.45);
        parts.push(seg('leg', hip, knee, r * 1.25));
        parts.push(seg('leg', knee, foot, r));
        parts.push(ell('foot', [foot[0], foot[1], foot[2] - (back ? L * 0.2 : -L * 0.15)], [1.8, 1, L * 0.3]));
      }
    } else if (g.thighs !== 'hidden') {
      const k = legs === 'crouch' ? 1.15 : 1;
      for (const sgn of [-1, 1]) {
        parts.push(ell('leg', [sgn * W * 0.78 * k, g.th * 0.85, -L * 0.45], [g.tw * 0.9 * k, g.th, L * 0.5]));
        parts.push(ell('foot', [sgn * W * 0.92 * k, 0.9, -L * 0.02], [2, 0.9, L * 0.5]));
      }
    } else for (const sgn of [-1, 1]) parts.push(ell('foot', [sgn * W * 0.7, 0.9, -L * 0.1], [2, 0.9, L * 0.4]));
    // braços i mans
    if (g.arms !== 'hidden' || legs !== 'sit') {
      const aw = g.arms === 'stubby' ? 2 : 1.6;
      const reach = pose.arms === 'reach', tuck = pose.arms === 'down' || pose.arms === 'out';
      for (const sgn of [-1, 1]) {
        const ax = sgn * W * 0.55;
        if (tuck) parts.push(ell('arm', rot([ax, lift + Hb * 0.25, L * 0.25]), [aw, aw, L * 0.4], 1.2));
        else {
          const hz = L * (reach ? 1.05 : 0.8), hy = reach ? lift * 0.3 + 1 : 0.8;
          parts.push(ell('arm', [ax, (hy + Hb * 0.3 + lift) / 2, (hz + L * 0.55) / 2], [aw, Hb * 0.2 + lift * 0.3, aw * 1.1], reach ? 0.5 : 0.25));
          parts.push(ell('hand', [ax * 1.04, hy, hz], [2.2, 0.8, 2]));
        }
      }
    }
    return { parts, W, Hb, L, hc, g, mouthY: hc[1] - Hb * 0.3 * sy * 0.25, headFront: hc[2] + L * 0.55 };
  }

  function render(g, poseName, yaw) {
    const pose = Granota.POSES[poseName] || {};
    const M = build(g, pose);
    const th = yaw * Math.PI / 4, cy = Math.cos(th), sy = Math.sin(th), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    // vista → objecte (inversa de: gir yaw, després inclinació de càmera)
    const toObj = v => {
      const y1 = v[1] * cp + v[2] * sp, z1 = -v[1] * sp + v[2] * cp, x1 = v[0];
      return [x1 * cy - z1 * sy, y1, x1 * sy + z1 * cy];
    };
    const toView = v => {
      const x1 = v[0] * cy + v[2] * sy, z1 = -v[0] * sy + v[2] * cy, y1 = v[1];
      return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
    };
    const dirObj = toObj([0, 0, -1]);
    const N = GW * GH;
    const col = new Array(N).fill(null), lvl = new Int8Array(N), depth = new Float32Array(N).fill(1e9), pid = new Int16Array(N).fill(-1);
    const legHex = g.legColor === 'accent' ? g.accent : g.legColor === 'dark' ? shift(g.body, 0, 0, -0.12) : g.body;
    const footHex = g.feetAccent ? g.accent : legHex;
    const bellyHex = (() => { const [h, s, l] = hexToHsl(g.belly); return l > 0.86 ? Granota.util.hslToHex(h, Math.max(s, 0.25), 0.84) : g.belly; })();
    const closed = pose.eyes === 'closed' || g.eyeType === 'happy' || g.eyeType === 'calm';
    const eyeF = sgn => norm([sgn * 0.45, 0.2, 0.87]);
    const HL = norm([-0.35, 0.6, 0.72]);

    for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) {
      const o = toObj([px + 0.5 - CX, G - (py + 0.5), 200]);
      let best = null, bi = -1;
      M.parts.forEach((e, i) => { const h = hit(e, o, dirObj); if (h && (!best || h.t < best.t)) { best = h; bi = i; } });
      if (!best) continue;
      const k = py * GW + px, e = M.parts[bi], p = best.p, n = best.n;
      depth[k] = best.t; pid[k] = bi;
      const nv = toView(n), ndl = dot(nv, LIGHT);
      let c, l = ndl > 0.82 ? 1 : ndl < -0.15 ? -2 : ndl < 0.22 ? -1 : 0;
      if (e.part === 'body' || e.part === 'head') {
        c = g.body;
        const u = p[0] / M.W, v = (M.Hb * 0.5 - p[1]) / (M.Hb * 0.5);
        const bellyOn = g.bellyType !== 'none' && g.belly !== g.body;
        if (bellyOn && n[2] > 0.3 && n[1] < 0.35 && p[1] < M.mouthY - 1 && Math.abs(p[0]) < M.W * (g.bellyType === 'chin' ? 0.4 : 0.75)) c = bellyHex;
        else { const pt = pattern(g, u, v, p, 'body'); if (pt.col) c = pt.col; l = Math.max(-2, Math.min(1, l + pt.dl)); }
        // boca: línia al voltant del morro
        if (e.part === 'head' && g.mouth !== 'none' && Math.abs(p[1] - M.mouthY) < 0.55 && n[2] > -0.1 && p[2] > M.hc[2]) {
          c = pose.mouth === 'open' && n[2] > 0.5 ? g.mouthIn : g.outline; l = 0;
        }
        if (e.part === 'head' && g.nostrils && n[2] > 0.75 && n[1] > 0.25 && n[1] < 0.5 && Math.abs(Math.abs(p[0]) - 1.5) < 0.6) { c = g.outline; l = 0; }
      } else if (e.part === 'leg') {
        c = legHex;
        const pt = pattern(g, p[0] / M.W, (M.Hb * 0.5 - p[1]) / (M.Hb * 0.5), p, 'leg'); if (pt.col) c = pt.col; l = Math.max(-2, Math.min(1, l + pt.dl));
      } else if (e.part === 'arm') c = legHex;
      else if (e.part === 'foot' || e.part === 'hand') { c = footHex; if (Math.abs((p[2] * 1.3) % 2) < 0.35 && n[1] > 0.3) { c = g.outline; l = 0; } }
      else if (e.part === 'sac') { c = variant(bellyHex, 1); l = Math.max(0, l); }
      else if (e.part === 'eye') {
        const m = norm([p[0] - e.eyeC[0], p[1] - e.eyeC[1], p[2] - e.eyeC[2]]);
        const f = eyeF(e.side), df = dot(m, f);
        const t = g.eyeType;
        const socket = t === 'vivid' ? g.iris : t === 'rim' ? g.rimColor : t === 'crescent' ? shift(g.body, 0, -0.05, 0.13) : t === 'calm' ? g.calmLid : g.lid || g.body;
        c = t === 'bead' || t === 'dot' ? PC : socket;
        if (t === 'bead' || t === 'dot') {
          if (g.beadStyle === 'red') c = df > 0.75 ? PC : '#f0302c';
          if (g.beadStyle === 'moon' && df < 0.1 && m[1] < 0.3) c = g.moonColor;
          if (dot(m, HL) > 0.9) { c = '#ffffff'; l = 0; }
        } else if (closed || (pose.eyes === 'half' && m[1] > 0)) {
          if (df > 0.3 && Math.abs(m[1] - 0.05) < 0.14) { c = g.outline; l = 0; }
        } else if (df > 0.42) {
          const dark = ['full', 'shine'].includes(g.pupil) || t === 'oval' || t === 'crescent' || t === 'rim';
          c = t === 'white' ? '#f2f0e6' : dark ? PC : g.iris;
          if (df > 0.8 && !dark) c = PC;
          if (t === 'crescent' && df < 0.55) c = g.moonColor;
          if ((t === 'toad' || t === 'hooded' || g.brow) && m[1] > (t === 'hooded' ? 0.05 : 0.35)) c = socket;
          l = 0;
          if (dot(m, HL) > 0.93) c = '#ffffff';
        }
      }
      col[k] = c; lvl[k] = l;
    }
    // contorn exterior (sobre els píxels buits) i interior (on una peça tapa una altra)
    const out = new Uint8Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const k = y * GW + x;
      if (col[k]) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const q = ny * GW + nx;
          if (!col[q]) out[q] = 1;
          else if (depth[q] > depth[k] + 2.5 && pid[q] !== pid[k] && !(M.parts[pid[q]].part === 'body' && M.parts[pid[k]].part === 'head')) out[q] = 1;
        }
      }
    }
    for (let k = 0; k < N; k++) if (out[k]) { col[k] = g.outline; lvl[k] = 0; }

    const cv = document.createElement('canvas');
    cv.width = GW; cv.height = GH;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(GW, GH);
    let top = GH;
    for (let k = 0; k < N; k++) {
      if (!col[k]) continue;
      top = Math.min(top, Math.floor(k / GW));
      const hex = variant(col[k], lvl[k]);
      const nn = parseInt(hex.slice(1), 16);
      img.data[k * 4] = nn >> 16 & 255; img.data[k * 4 + 1] = nn >> 8 & 255; img.data[k * 4 + 2] = nn & 255; img.data[k * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    // boca projectada (per a la llengua)
    const mv = toView([0, M.mouthY, M.headFront]);
    return { canvas: cv, mouth: { x: CX + mv[0], y: G - mv[1] }, bodyW: g.bw, top, cx: CX, g: G };
  }

  return { render, GW, GH, CX, G };
})();
