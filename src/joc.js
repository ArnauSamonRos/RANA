'use strict';
// Comportament: la granota passeja, respira, parpelleja, rauca, fa la migdiada
// i caça mosques. Els temps, l'alçada i la llargada dels salts depenen del cos
// (pes, potes) i de la "personalitat" de cada granota.

const { G, CX } = Granota;

// ---- Canvas --------------------------------------------------------------
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W, H, S;
function resize() {
  W = cv.width = innerWidth;
  H = cv.height = innerHeight;
  S = Math.max(2, Math.round(Math.min(W, H) / 210));
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const bounds = () => ({ x0: 32 * S, x1: W - 32 * S, y0: 64 * S, y1: H - 6 * S });

// ---- Mosques ---------------------------------------------------------------
const flies = [];
function spawnFly(x, y) {
  const m = 30 * S;
  const f = {
    x: x ?? rand(m, W - m), y: y ?? rand(50 * S, H - m),
    vx: 0, vy: 0, t: rand(0, 10), caught: false, dead: false,
  };
  f.hx = f.x; f.hy = f.y;
  flies.push(f);
}
function updateFly(f, dt) {
  if (f.caught) return;
  f.t += dt;
  f.hx = clamp(f.hx + Math.sin(f.t * 0.37) * 18 * S * dt, 20 * S, W - 20 * S);
  f.hy = clamp(f.hy + Math.cos(f.t * 0.29) * 12 * S * dt, 45 * S, H - 20 * S);
  const ax = (f.hx - f.x) * 3 + rand(-1, 1) * 260 * S;
  const ay = (f.hy - f.y) * 3 + rand(-1, 1) * 260 * S;
  f.vx = (f.vx + ax * dt) * 0.9;
  f.vy = (f.vy + ay * dt) * 0.9;
  f.x += f.vx * dt; f.y += f.vy * dt;
}
function drawFly(f, now) {
  const x = Math.round(f.x / S) * S, y = Math.round(f.y / S) * S;
  const up = !f.caught && Math.floor(now / 40) % 2;
  ctx.fillStyle = '#c9d6e3';
  ctx.fillRect(x - 2 * S, y - (up ? 2 : 1) * S, S, S);
  ctx.fillRect(x + S, y - (up ? 2 : 1) * S, S, S);
  ctx.fillStyle = '#2b2530';
  ctx.fillRect(x - S, y - S, 2 * S, 2 * S);
}

// ---- Partícules (per l'aparició / desaparició) -----------------------------
const puffs = [];
function poof(x, y, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(20, 70) * S;
    puffs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20 * S, t: 0, life: rand(0.35, 0.7), s: Math.ceil(rand(1, 3)) });
  }
}

// ---- Granota -----------------------------------------------------------------
let frog;

function newFrog(seed, entrance = true) {
  if (frog) poof(frog.x, frog.y - 14 * S, 22);
  const f = Granota.create(seed);
  const g = f.g;
  frog = {
    f, g, x: frog ? frog.x : W / 2, y: frog ? frog.y : H * 0.6,
    lift: 0, pose: 'idle', lx: 0, ly: 0, act: null, plan: [], tongue: null,
    // Paràmetres de moviment derivats del cos
    hopDist: (16 + 16 * g.jumpy) * (1 - 0.3 * g.mass),
    hopHeight: (9 + 15 * g.jumpy) * (1 - 0.35 * g.mass),
    airTime: 0.28 + 0.2 * g.mass,
    crouchT: 0.07 + 0.08 * g.mass,
    landT: 0.09 + 0.1 * g.mass,
    breathT: 0.55 + 0.45 * g.mass,
  };
  const b = bounds();
  frog.x = clamp(frog.x, b.x0, b.x1); frog.y = clamp(frog.y, b.y0, b.y1);
  if (entrance) { frog.act = actDrop(); frog.act.t = 0; }
  location.replace('#' + seed.toString(16).padStart(8, '0'));
  document.getElementById('name').textContent = g.name;
  document.getElementById('seed').textContent = '#' + seed.toString(16).padStart(8, '0');
}

function mouthWorld() {
  const m = frog.f.frame('idle').mouth;
  return { x: frog.x + (m.x - CX) * S, y: frog.y - frog.lift + (m.y - G) * S };
}
function lookAt(tx, ty) {
  const dx = tx - frog.x, dy = ty - (frog.y - 20 * S);
  frog.lx = Math.abs(dx) > 12 * S ? Math.sign(dx) : 0;
  frog.ly = dy < -30 * S ? -1 : dy > 10 * S ? 1 : 0;
}

// ---- Accions ------------------------------------------------------------------
// Cada acció té run(t, dt) i retorna true quan acaba.
function actIdle(dur) {
  const blinkAt = Math.random() < 0.7 ? rand(0.2, 1) * dur : -9;
  const lookAt_ = Math.random() < frog.g.curious ? rand(0.1, 0.9) * dur : -9;
  return { run(t) {
    frog.lift = 0;
    if (lookAt_ > 0 && t > lookAt_ && !this.looked) {
      this.looked = true;
      frog.lx = Math.random() < 0.3 ? 0 : Math.sign(rand(-1, 1)); frog.ly = Math.random() < 0.25 ? -1 : 0;
    }
    const tb = t - blinkAt;
    if (tb > 0 && tb < 0.14) frog.pose = 'blink';
    else frog.pose = Math.floor(t / frog.breathT) % 2 ? 'breath' : 'idle';
    return t >= dur;
  } };
}

function actNap(dur) {
  return { run(t) {
    frog.lift = 0; frog.lx = 0; frog.ly = 0;
    const edge = Math.min(t, dur - t);
    frog.pose = edge < 0.25 ? 'half' : Math.floor(t / (frog.breathT * 1.6)) % 2 ? 'blink' : 'half';
    return t >= dur;
  } };
}

function actCroak() {
  const k = 0.8 + frog.g.mass * 0.6;
  const seq = [];
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) seq.push(['puff1', 0.07 * k], ['puff2', 0.22 * k], ['puff1', 0.07 * k], ['idle', 0.14 * k]);
  let total = 0; const at = seq.map(s => (total += s[1]));
  return { run(t) {
    frog.lift = 0;
    const i = at.findIndex(a => t < a);
    if (i < 0) return true;
    frog.pose = seq[i][0];
    return false;
  } };
}

function actHop(tx, ty, big) {
  const b = bounds();
  const x0 = frog.x, y0 = frog.y;
  tx = clamp(tx, b.x0, b.x1); ty = clamp(ty, b.y0, b.y1);
  const dist = Math.hypot(tx - x0, ty - y0);
  const k = big ? 2.2 : 1;
  const height = (frog.hopHeight * k * (0.6 + 0.4 * Math.min(1, dist / (frog.hopDist * S)))) * S;
  const air = frog.airTime * (big ? 1.5 : 1) * (0.8 + 0.2 * Math.min(1, dist / (frog.hopDist * S)));
  const c = frog.crouchT * (big ? 1.8 : 1), l = frog.landT;
  const dx = tx - x0;
  frog.lx = Math.abs(dx) > 4 * S ? Math.sign(dx) : 0;
  frog.ly = ty < y0 - 6 * S ? -1 : 0;
  return { run(t) {
    if (t < c) { frog.pose = 'crouch'; frog.lift = 0; return false; }
    const u = (t - c) / air;
    if (u < 1) {
      const e = ease(u);
      frog.x = x0 + (tx - x0) * e;
      frog.y = y0 + (ty - y0) * e;
      frog.lift = 4 * height * u * (1 - u);
      frog.pose = u < 0.22 ? 'takeoff' : u < 0.6 ? 'air' : 'fall';
      return false;
    }
    frog.x = tx; frog.y = ty; frog.lift = 0;
    frog.pose = 'crouch';
    return t >= c + air + l;
  } };
}

function actDrop() {
  const h = frog.y + 80 * S;
  return { run(t) {
    const d = 0.45;
    if (t < d) { const u = t / d; frog.lift = h * (1 - u * u); frog.pose = 'fall'; return false; }
    if (!this.landed) { this.landed = true; poof(frog.x, frog.y, 8); }
    frog.lift = 0;
    frog.pose = t < d + 0.18 ? 'crouch' : 'idle';
    return t > d + 0.35;
  } };
}

function actTongue(fly) {
  const ext = 0.08, hold = 0.04, ret = 0.14;
  let target;
  if (fly) target = fly;
  else {
    const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), r = frog.g.reach * S * rand(0.5, 0.8);
    const m = mouthWorld();
    target = { x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r };
  }
  lookAt(target.x, target.y);
  return { run(t) {
    frog.lift = 0;
    const m = mouthWorld();
    if (t < ext + hold + ret) {
      frog.pose = 'tongue';
      let k;
      if (t < ext) k = t / ext;
      else if (t < ext + hold) k = 1;
      else k = 1 - (t - ext - hold) / ret;
      if (!this.aim) this.aim = { x: target.x, y: target.y };
      if (t < ext && fly && !fly.caught) this.aim = { x: fly.x, y: fly.y };  // segueix la mosca
      const tip = { x: m.x + (this.aim.x - m.x) * k, y: m.y + (this.aim.y - m.y) * k };
      frog.tongue = { from: m, to: tip };
      if (fly && !fly.caught && t >= ext && Math.hypot(fly.x - tip.x, fly.y - tip.y) < 7 * S) fly.caught = true;
      if (fly && fly.caught) { fly.x = tip.x; fly.y = tip.y; }
      return false;
    }
    frog.tongue = null;
    if (fly && fly.caught && !fly.dead) { fly.dead = true; frog.plan.unshift(actGulp()); }
    frog.pose = 'idle';
    return true;
  } };
}

function actGulp() {
  return { run(t) {
    frog.lift = 0;
    frog.pose = t < 0.22 ? 'gulp' : t < 0.3 ? 'blink' : 'idle';
    return t > 0.5;
  } };
}

// ---- Cervell ---------------------------------------------------------------------
function think() {
  if (frog.plan.length) return frog.plan.shift();
  const g = frog.g;
  const b = bounds();

  const live = flies.filter(f => !f.caught && !f.dead);
  if (live.length) {
    const fly = live.reduce((a, c) => Math.hypot(a.x - frog.x, a.y - frog.y) < Math.hypot(c.x - frog.x, c.y - frog.y) ? a : c);
    const m = mouthWorld();
    const d = Math.hypot(fly.x - m.x, fly.y - m.y);
    lookAt(fly.x, fly.y);
    if (d < g.reach * S * 0.9) return actTongue(fly);
    // punt ideal: la mosca una mica per sobre de la boca, dins l'abast
    const mi = frog.f.frame('idle').mouth;
    const gx = fly.x, gy = fly.y + (G - mi.y) * S + g.reach * S * 0.4;
    const b2 = bounds();
    const dx = clamp(gx, b2.x0, b2.x1) - frog.x, dy = clamp(gy, b2.y0, b2.y1) - frog.y, dd = Math.hypot(dx, dy) || 1;
    if (dd < 4 * S) return actIdle(rand(0.2, 0.5));   // no hi arriba: esperar mirant-la
    const big = dd > frog.hopDist * S * 3 && Math.random() < 0.25 * g.jumpy;
    const step = Math.min(dd, frog.hopDist * S * (big ? 2.2 : rand(0.8, 1.15)));
    frog.plan.push(actIdle(rand(0.12, 0.4) * g.lazy));
    return actHop(frog.x + dx / dd * step, frog.y + dy / dd * step, big);
  }

  // Sense mosques: passejar amb naturalitat, segons la personalitat
  const r = Math.random();
  if (r < 0.34) return actIdle(rand(1, 3) * g.lazy);
  if (r < 0.34 + 0.12 * g.croaky) return actCroak();
  if (r < 0.55 && g.lazy > 1.1) return actNap(rand(2.5, 5));
  if (r < 0.6) { frog.plan.push(actIdle(rand(0.5, 1))); return actTongue(null); }
  if (r < 0.68 * g.jumpy) {
    const a = rand(0, Math.PI * 2), d = frog.hopDist * S * 2.2;
    frog.plan.push(actIdle(rand(0.6, 1.4) * g.lazy));
    return actHop(frog.x + Math.cos(a) * d, frog.y + Math.sin(a) * d * 0.6, true);
  }
  // sèrie de salts en una direcció
  let a = rand(0, Math.PI * 2);
  const n = 2 + Math.floor(Math.random() * 3);
  let x = frog.x, y = frog.y;
  for (let i = 0; i < n; i++) {
    const d = frog.hopDist * S * rand(0.8, 1.2);
    let nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d * 0.6;
    if (nx < b.x0 || nx > b.x1) { a = Math.PI - a; nx = x + Math.cos(a) * d; }
    if (ny < b.y0 || ny > b.y1) { a = -a; ny = y + Math.sin(a) * d * 0.6; }
    x = nx; y = ny;
    frog.plan.push({ lazyHop: [x, y] }, actIdle(rand(0.06, 0.3) * g.lazy));
  }
  frog.plan.push(actIdle(rand(0.8, 2) * g.lazy));
  return actIdle(0.01);
}

function nextAction() {
  let a = think();
  if (a.lazyHop) a = actHop(a.lazyHop[0], a.lazyHop[1], false);
  a.t = 0;
  frog.act = a;
}

// ---- Dibuix -----------------------------------------------------------------------
function drawTongue(tg) {
  const { from, to } = tg;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(len / S));
  const snap = v => Math.round(v / S) * S;
  const col = frog.g.tongue;
  for (const [c, r] of [[frog.g.outline, 2], [col, 1]]) {
    ctx.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      const x = snap(from.x + (to.x - from.x) * i / n), y = snap(from.y + (to.y - from.y) * i / n);
      ctx.fillRect(x - r * S, y - r * S, 2 * r * S, 2 * r * S);
    }
    ctx.fillRect(snap(to.x) - (r + 1) * S, snap(to.y) - (r + 1) * S, 2 * (r + 1) * S, 2 * (r + 1) * S);
  }
}

function drawFrog() {
  const fr = frog.f.frame(frog.pose, frog.lx, frog.ly);
  // sombra
  const k = 1 - clamp(frog.lift / (60 * S), 0, 0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.beginPath();
  ctx.ellipse(frog.x, frog.y + S, (fr.bodyW + 5) * S * k, 3 * S * k, 0, 0, Math.PI * 2);
  ctx.fill();
  const x = Math.round(frog.x / S) * S - CX * S;
  const y = Math.round((frog.y - frog.lift) / S) * S - G * S;
  ctx.drawImage(fr.canvas, x, y, fr.canvas.width * S, fr.canvas.height * S);
}

// ---- Bucle ------------------------------------------------------------------------
let last = performance.now(), flyTimer = 3;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!galleryOpen) {
    flyTimer -= dt;
    if (flyTimer <= 0) { if (flies.length < 2) spawnFly(); flyTimer = rand(6, 14); }
    flies.forEach(f => updateFly(f, dt));

    if (!frog.act) nextAction();
    frog.act.t += dt;
    if (frog.act.run(frog.act.t, dt)) nextAction();
    for (let i = flies.length - 1; i >= 0; i--) if (flies[i].dead) flies.splice(i, 1);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
      if (p.t > p.life) puffs.splice(i, 1);
    }
  }

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  flies.filter(f => f.y < frog.y - 30 * S && !f.caught).forEach(f => drawFly(f, now));
  drawFrog();
  if (frog.tongue) drawTongue(frog.tongue);
  flies.filter(f => f.y >= frog.y - 30 * S || f.caught).forEach(f => drawFly(f, now));
  for (const p of puffs) {
    ctx.fillStyle = `rgba(200,200,205,${1 - p.t / p.life})`;
    const s = p.s * S;
    ctx.fillRect(Math.round(p.x / S) * S, Math.round(p.y / S) * S, s, s);
  }
  requestAnimationFrame(loop);
}

// ---- Interfície -------------------------------------------------------------------
const randomSeed = () => (Math.random() * 4294967296) >>> 0;
function restart() { flies.forEach(f => { if (f.caught) f.dead = true; }); newFrog(randomSeed()); }

document.getElementById('restart').addEventListener('click', restart);
cv.addEventListener('pointerdown', e => spawnFly(e.clientX, e.clientY));
addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') restart();
  if (e.key === 'g' || e.key === 'G') toggleGallery();
  if (e.key === 'Escape' && galleryOpen) toggleGallery();
});

// Galeria: mostra moltes granotes alhora; clic per adoptar-ne una
let galleryOpen = false;
const gal = document.getElementById('gallery');
function toggleGallery() {
  galleryOpen = !galleryOpen;
  gal.hidden = !galleryOpen;
  if (galleryOpen) fillGallery();
}
function fillGallery() {
  const grid = gal.querySelector('.grid');
  grid.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const seed = randomSeed();
    const f = Granota.create(seed);
    const fr = f.frame('idle');
    const c = document.createElement('canvas');
    c.width = 68 * 2; c.height = 54 * 2;               // retall al voltant de la granota
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(fr.canvas, 8, G - 50, 68, 54, 0, 0, c.width, c.height);
    const b = document.createElement('button');
    b.title = f.g.name;
    b.append(c);
    b.addEventListener('click', () => { toggleGallery(); newFrog(seed); });
    grid.append(b);
  }
}
document.getElementById('galleryBtn').addEventListener('click', toggleGallery);
document.getElementById('more').addEventListener('click', fillGallery);
document.getElementById('closeGal').addEventListener('click', toggleGallery);

// Llavor des de l'URL (#xxxxxxxx) per poder compartir una granota concreta
const fromHash = parseInt(location.hash.slice(1), 16);
newFrog(Number.isFinite(fromHash) ? fromHash >>> 0 : randomSeed());
requestAnimationFrame(loop);
