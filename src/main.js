import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const TINT = true; // true: у платформ свой оттенок шашечек; false: нейтральные серые шашечки

// ---------- Рендер в стиле N64 ----------
const RES_H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
$('game').appendChild(renderer.domElement);

function gradCanvas(w, h, stops) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return c;
}
function pixTex(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function drawTex(size, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return pixTex(c, repeat);
}

const scene = new THREE.Scene();
scene.background = pixTex(gradCanvas(2, 48, [[0, '#2a62d0'], [0.6, '#7ec0ff'], [1, '#d4eeff']]));
scene.fog = new THREE.Fog(0xa6d4ff, 24, 150);
const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 250);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(5, 10, 6);
scene.add(sun);

// Динамический ambient occlusion. Слабо/сильно: меняйте kernelRadius и maxDistance
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, 320, RES_H);
ssao.kernelRadius = 2.5; ssao.minDistance = 0.0005; ssao.maxDistance = 0.012;
composer.addPass(ssao);
composer.addPass(new OutputPass());

function resize() {
  const w = Math.round(RES_H * innerWidth / innerHeight);
  renderer.setSize(w, RES_H, false);
  composer.setSize(w, RES_H);
  camera.aspect = w / RES_H;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const box = (parent, w, h, d, m, x, y, z) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); parent.add(o); return o;
};

// ---------- Текстуры ----------
// Шашечки как были: 8x8, два серых тона
const baseTex = drawTex(8, (g) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, 4, 4); g.fillRect(4, 4, 4, 4);
}, true);

// Текстуры рук
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function rngFrom(seed) { const n = xmur3(String(seed)); return () => n() / 4294967296; }
const hr = rngFrom('hands');
const dots = (g, s, col, n) => { g.fillStyle = col; for (let i = 0; i < n; i++) g.fillRect((hr() * s) | 0, (hr() * s) | 0, 1, 1); };
const sleeveTex = drawTex(16, (g, s) => {
  g.fillStyle = '#d32f2f'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#a62020'; for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1);
  dots(g, s, '#ef6a6a', 20);
});
const skinTex = drawTex(16, (g, s) => {
  g.fillStyle = '#ffcc99'; g.fillRect(0, 0, s, s);
  dots(g, s, '#e3a173', 26); dots(g, s, '#ffe3c4', 12);
});
const gloveTex = drawTex(16, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bdbdbd');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.fillStyle = '#9a9a9a'; [4, 8, 12].forEach((x) => g.fillRect(x, 0, 1, 10)); // швы пальцев
  dots(g, s, '#d8d8d8', 14);
});

// ---------- Уровни: генератор по сиду, формат, кодирование ----------
const r05 = (x) => Math.round(x * 2) / 2;

function classic() {
  const plats = [[0, 0, 0, 8, 8], [0, 0.5, -8, 4, 4], [3, 1.2, -13, 3, 3], [-1, 2, -18, 3, 3],
    [-5, 2.5, -23, 3, 3], [-5, 3.5, -28, 2.5, 2.5], [0, 4.2, -30, 3, 3], [5, 5, -32, 3, 3],
    [10, 6, -36, 2.5, 2.5], [10, 6.5, -42, 1.5, 6], [10, 7.5, -50, 6, 6]];
  return { name: 'Классика', plats, coins: plats.slice(1, 10).map(([x, y, z]) => [x, y + 1.3, z]), goal: [10, 9.1, -50], start: [0, 0, 0] };
}

// Один и тот же сид всегда даёт один и тот же уровень
function generate(seed) {
  const R = rngFrom(seed), rr = (a, b) => a + R() * (b - a);
  const plats = [[0, 0, 0, 6, 6]];
  const n = 10 + Math.floor(R() * 9);
  let ang = rr(-0.4, 0.4);
  for (let i = 1; i < n; i++) {
    const prev = plats[plats.length - 1], last = i === n - 1;
    const w = last ? 5 : r05(rr(2.2, 4.4)), d = last ? 5 : r05(rr(2.2, 4.4));
    const y = Math.max(0, r05(prev[1] + (i < 2 ? rr(0, 0.6) : rr(-0.8, 1))));
    let placed = null;
    for (let t = 0; t < 14 && !placed; t++) {
      const a = Math.max(-1.7, Math.min(1.7, ang + rr(-0.9, 0.9) * (1 + t * 0.15)));
      const ux = Math.sin(a), uz = -Math.cos(a);
      const ext = (bw, bd) => (Math.abs(ux) * bw + Math.abs(uz) * bd) / 2;
      const dist = ext(prev[3], prev[4]) + ext(w, d) + rr(1.4, 2.9); // зазор допрыгиваемый
      const x = r05(prev[0] + ux * dist), z = r05(prev[2] + uz * dist);
      if (plats.every((q) => Math.abs(q[0] - x) > (q[3] + w) / 2 + 0.8 || Math.abs(q[2] - z) > (q[4] + d) / 2 + 0.8)) {
        placed = [x, y, z, w, d]; ang = a;
      }
    }
    if (!placed) break;
    plats.push(placed);
  }
  const mid = plats.slice(1, -1);
  const coins = mid.filter(() => R() < 0.7).map(([x, y, z]) => [x, y + 1.3, z]);
  if (coins.length < 3) mid.slice(0, 3).forEach(([x, y, z]) => coins.push([x, y + 1.3, z]));
  const [gx, gy, gz] = plats[plats.length - 1];
  return { name: 'Сид: ' + seed, seed: String(seed), plats, coins, goal: [gx, gy + 1.6, gz], start: [0, 0, 0] };
}

// Проверка чужих уровней (из ссылки, кода, Мастерской)
function sanitize(j) {
  const ok = (a, n, lo, hi) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && v >= lo && v <= hi);
  if (!j || !Array.isArray(j.p) || !j.p.length || j.p.length > 80) return null;
  if (!j.p.every((a) => ok(a, 5, -300, 300) && a[3] >= 1 && a[4] >= 1 && a[3] <= 30 && a[4] <= 30)) return null;
  const c = Array.isArray(j.c) ? j.c.slice(0, 100) : [];
  if (!c.every((a) => ok(a, 3, -300, 300)) || !ok(j.g, 3, -300, 300) || !ok(j.s, 3, -300, 300)) return null;
  return { name: String(j.n || 'Без названия').slice(0, 40), plats: j.p, coins: c, goal: j.g, start: j.s };
}
const enc = (lv) => btoa(unescape(encodeURIComponent(JSON.stringify({ n: lv.name, p: lv.plats, c: lv.coins, g: lv.goal, s: lv.start }))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function dec(code) {
  try { return sanitize(JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))))); }
  catch { return null; }
}

// ---------- Построение уровня ----------
const COLORS = [0x4caf50, 0xff9800, 0x42a5f5, 0xe91e63, 0xffeb3b];
const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8).rotateX(Math.PI / 2);
const coinMat = mat(0xffd800, { emissive: 0x665500 });
const goalGeo = new THREE.IcosahedronGeometry(0.7, 0);
const goalMat = mat(0xfff176, { emissive: 0x887700 });
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
marker.visible = false; scene.add(marker);
const orbit = { cx: 0, cz: 0, rx: 15, rz: 15, top: 0 };
let L, levelGroup = new THREE.Group(), boxes = [], coins = [], goal, voidY = -15;
scene.add(levelGroup);

// Градиент по вершинам (как Gouraud на N64): светлее сверху и в центре, темнее к краям и вниз.
// Шашечная текстура остаётся, градиент ложится поверх неё.
function platGeo(w, d) {
  const g = new THREE.BoxGeometry(w, 1, d, Math.max(1, Math.round(w)), 2, Math.max(1, Math.round(d)));
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5;
    const e = Math.max(Math.abs(pos.getX(i)) / (w / 2), Math.abs(pos.getZ(i)) / (d / 2));
    const k = nor.getY(i) > 0.5 ? 1 - 0.3 * e : nor.getY(i) < -0.5 ? 0.3 : 0.35 + 0.35 * t;
    col.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function buildLevel(lv) {
  scene.remove(levelGroup);
  levelGroup.traverse((o) => { if (o.userData.k === 'p') { o.geometry.dispose(); o.material.map.dispose(); o.material.dispose(); } });
  levelGroup = new THREE.Group(); scene.add(levelGroup);
  boxes = []; coins = [];
  lv.plats.forEach(([x, y, z, w, d], i) => {
    const tex = baseTex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 2, d / 2);
    const m = new THREE.Mesh(platGeo(w, d), mat(TINT ? COLORS[i % COLORS.length] : 0xffffff, { map: tex, vertexColors: true }));
    m.position.set(x, y - 0.5, z); m.userData = { k: 'p', i };
    levelGroup.add(m);
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - 1, maxY: y, minZ: z - d / 2, maxZ: z + d / 2 });
  });
  lv.coins.forEach(([x, y, z], i) => {
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.position.set(x, y, z); c.userData = { k: 'c', i };
    levelGroup.add(c); coins.push(c);
  });
  goal = new THREE.Mesh(goalGeo, goalMat);
  goal.position.set(...lv.goal); goal.userData = { k: 'g' };
  levelGroup.add(goal);
  marker.position.set(lv.start[0], lv.start[1] + 0.6, lv.start[2]);

  const P = lv.plats;
  const mnx = Math.min(...P.map((a) => a[0] - a[3] / 2)), mxx = Math.max(...P.map((a) => a[0] + a[3] / 2));
  const mnz = Math.min(...P.map((a) => a[2] - a[4] / 2)), mxz = Math.max(...P.map((a) => a[2] + a[4] / 2));
  orbit.cx = (mnx + mxx) / 2; orbit.cz = (mnz + mxz) / 2;
  orbit.rx = Math.max(15, (mxx - mnx) / 2); orbit.rz = Math.max(15, (mxz - mnz) / 2);
  orbit.top = Math.max(...P.map((a) => a[1]));
  voidY = Math.min(...P.map((a) => a[1])) - 12;
}

// ---------- Игрок ----------
const player = new THREE.Group();
box(player, 0.6, 0.4, 0.35, mat(0x1565c0), 0, 0.2, 0);
box(player, 0.7, 0.6, 0.4, mat(0xd32f2f), 0, 0.7, 0);
box(player, 0.45, 0.45, 0.45, mat(0xffcc99), 0, 1.25, 0);
box(player, 0.5, 0.15, 0.5, mat(0xd32f2f), 0, 1.55, 0);
scene.add(player);
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);
scene.add(shadow);

// Руки от первого лица (с текстурами)
const hands = new THREE.Group();
camera.add(hands);
const sleeveM = mat(0xffffff, { map: sleeveTex }), skinM = mat(0xffffff, { map: skinTex }), gloveM = mat(0xffffff, { map: gloveTex });
function makeArm(side) {
  const g = new THREE.Group();
  box(g, 0.16, 0.16, 0.42, sleeveM, 0, 0, -0.21);
  box(g, 0.12, 0.12, 0.2, skinM, 0, 0, -0.5);
  box(g, 0.2, 0.2, 0.2, gloveM, 0, 0, -0.68);
  g.position.set(side * 0.36, -0.5, -0.15);
  g.rotation.y = -side * 0.1;
  hands.add(g);
  return g;
}
const armL = makeArm(-1), armR = makeArm(1);

// ---------- Драконы ----------
const scaleTex = drawTex(32, (g) => {
  g.fillStyle = '#222'; g.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 8; y++) for (let x = -1; x < 8; x++) {
    const px = x * 4 + (y % 2) * 2, py = y * 4;
    const gr = g.createLinearGradient(0, py, 0, py + 3);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8a8a8a');
    g.fillStyle = gr; g.fillRect(px, py, 3, 3);
  }
}, true);
scaleTex.repeat.set(3, 2);
const glitter = drawTex(32, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#fff';
  for (let i = 0; i < 28; i++) g.fillRect((Math.random() * 32) | 0, (Math.random() * 32) | 0, 1, 1);
}, true);
glitter.repeat.set(2, 2);

const sparkleMats = [];
const mk = (color, extra = {}) => {
  const m = new THREE.MeshPhongMaterial({ color, map: scaleTex, specular: 0xffffff, shininess: 90, flatShading: true,
    emissive: 0xfff2b0, emissiveMap: glitter, emissiveIntensity: 0.5, ...extra });
  sparkleMats.push(m); return m;
};
function wingGeo(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.1, uv.getY(i) * 0.1);
  return g;
}
const innerG = wingGeo([[0, -1], [9, -2], [9, 6], [4, 7], [0, 5]]);
const outerG = wingGeo([[0, -2], [13, -5], [11, 1], [8, 4], [4, 3], [0, 6]]);
const ball = new THREE.SphereGeometry(1, 7, 5);
const spikeG = new THREE.ConeGeometry(0.3, 0.9, 4);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
const dragons = [];

// f: во сколько раз орбита шире уровня, h: высота полёта, spd: скорость (знак = направление)
function makeDragon(color, f, h, spd, ph) {
  const body = mk(color), bone = mk(0xe8dcc0);
  const dark = mk(new THREE.Color(color).multiplyScalar(0.6), { side: THREE.DoubleSide });
  const d = { f, h, spd, a: ph, ph, segs: [], wings: [] };
  for (let i = 0; i < 20; i++) {
    const r = 2.4 * (1 - i / 24) + 0.3;
    const s = new THREE.Mesh(ball, body);
    s.scale.set(r, r * 0.9, r * 1.6);
    const sp = new THREE.Mesh(spikeG, bone); sp.position.y = 1.05; s.add(sp);
    scene.add(s); d.segs.push(s);
  }
  d.head = new THREE.Group();
  box(d.head, 2.6, 2, 3.2, body, 0, 0, 0);
  box(d.head, 1.7, 1.1, 2.4, body, 0, -0.35, 2.5);
  for (const sd of [-1, 1]) {
    const hn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 5), bone);
    hn.position.set(sd, 1.3, -0.8); hn.rotation.x = -1; d.head.add(hn);
    box(d.head, 0.3, 0.4, 0.6, eyeMat, sd * 1.32, 0.5, 0.8);
  }
  scene.add(d.head);
  d.shoulder = new THREE.Group();
  for (const side of [1, -1]) {
    const inner = new THREE.Group(); inner.position.set(side * 2.2, 1.2, 0); inner.scale.x = side;
    inner.add(new THREE.Mesh(innerG, dark));
    const outer = new THREE.Group(); outer.position.x = 9;
    outer.add(new THREE.Mesh(outerG, dark));
    inner.add(outer); d.shoulder.add(inner);
    d.wings.push([inner, outer, side]);
  }
  scene.add(d.shoulder);
  dragons.push(d);
}
makeDragon(0x2e9b4a, 1.0, 4, 11, 0);
makeDragon(0xc0392b, 1.4, 8, -14, 2);
makeDragon(0x7b3fc9, 1.9, 12, 9, 4);

const P1 = new THREE.Vector3(), Q1 = new THREE.Vector3();
function updateDragons(dt, time) {
  glitter.offset.x += dt * 0.12; glitter.offset.y -= dt * 0.05;
  const tw = 0.5 + 0.4 * Math.sin(time * 5);
  sparkleMats.forEach((m) => (m.emissiveIntensity = tw));
  for (const d of dragons) {
    // орбита подстраивается под размер текущего уровня
    const rx = orbit.rx * d.f + 32, rz = orbit.rz * d.f + 32, avg = (rx + rz) / 2;
    const s = Math.sign(d.spd), gap = 3.4 / avg, y0 = d.h + orbit.top * 0.5;
    d.a += (d.spd / avg) * dt;
    const at = (a, o) => o.set(orbit.cx + rx * Math.cos(a), y0 + 3 * Math.sin(2 * a), orbit.cz + rz * Math.sin(a));
    const place = (o, a) => { at(a, P1); at(a + s * 0.02, Q1); o.position.copy(P1); o.lookAt(Q1); };
    place(d.head, d.a);
    d.segs.forEach((seg, i) => place(seg, d.a - s * (i + 1) * gap));
    d.shoulder.position.copy(d.segs[3].position);
    d.shoulder.quaternion.copy(d.segs[3].quaternion);
    d.wings.forEach(([inner, outer, side]) => {
      inner.rotation.z = side * Math.sin(time * 4.2 + d.ph) * 0.6;
      outer.rotation.z = Math.sin(time * 4.2 + d.ph - 1) * 0.5;
    });
  }
}

// ---------- Состояние и управление ----------
const keys = {};
let mode = 'play', jumpBuf = 0, camA = 0, pitch = 0, fpv = false, snapCam = false, clockT = 0;
const hud = $('hud'), msg = $('msg');
const mouse = new THREE.Vector2();

function setView(on) {
  fpv = on;
  camera.fov = on ? 75 : 60;
  camera.updateProjectionMatrix();
  player.visible = !on;
  hands.visible = on;
  if (!on && document.pointerLockElement) document.exitPointerLock();
}

function reset() {
  p.set(...L.start); v.set(0, 0, 0);
  got = 0; time = 0; won = false; jumpBuf = 0; coyote = 0;
  coins.forEach((c) => (c.visible = true));
  msg.style.display = 'none';
  snapCam = true;
}

addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyM') $('panel').classList.toggle('hide');
  if (mode === 'play') {
    if (e.code === 'Space') jumpBuf = 0.15;
    if (e.code === 'KeyR') reset();
    if (e.code === 'KeyV') setView(!fpv);
  } else {
    if (e.code === 'KeyZ') ed.h -= 0.5;
    if (e.code === 'KeyX') ed.h += 0.5;
    $('edh').value = ed.h;
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('click', (e) => {
  if (mode === 'play' && fpv && e.target === renderer.domElement && !document.pointerLockElement) renderer.domElement.requestPointerLock();
});
addEventListener('mousemove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (mode === 'play' && (document.pointerLockElement || e.buttons)) {
    camA -= e.movementX * 0.005;
    pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.005));
  }
});
addEventListener('wheel', (e) => {
  if (mode === 'edit' && e.target === renderer.domElement) ed.dist = Math.max(6, Math.min(90, ed.dist * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: true });

// ---------- Физика ----------
const HW = 0.35, H = 1.6, SPEED = 7, GRAV = 30, JUMP = 11;
const p = new THREE.Vector3(), v = new THREE.Vector3(), tmp = new THREE.Vector3();
let onGround = false, coyote = 0, face = 0, got = 0, time = 0, won = false;
let armPhase = 0, armLift = 0, landKick = 0;

const hits = (b) =>
  p.x + HW > b.minX && p.x - HW < b.maxX && p.y + H > b.minY && p.y < b.maxY && p.z + HW > b.minZ && p.z - HW < b.maxZ;

function move(axis, d) {
  p[axis] += d;
  for (const b of boxes) {
    if (!hits(b)) continue;
    if (axis === 'y') {
      if (d < 0) { p.y = b.maxY; onGround = true; } else p.y = b.minY - H;
      v.y = 0;
    } else if (axis === 'x') p.x = d > 0 ? b.minX - HW : b.maxX + HW;
    else p.z = d > 0 ? b.minZ - HW : b.maxZ + HW;
  }
}

function update(dt) {
  camA += ((keys.ArrowLeft || keys.KeyQ ? 1 : 0) - (keys.ArrowRight || keys.KeyE ? 1 : 0)) * 2 * dt;
  if (fpv) pitch = Math.max(-1.4, Math.min(1.4, pitch + ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)) * 1.5 * dt));

  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let dx = -Math.sin(camA) * f + Math.cos(camA) * r, dz = -Math.cos(camA) * f - Math.sin(camA) * r;
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; face = Math.atan2(dx, dz); }
  v.x = dx * SPEED; v.z = dz * SPEED;

  coyote = onGround ? 0.1 : coyote - dt;
  jumpBuf -= dt;
  if (jumpBuf > 0 && coyote > 0) { v.y = JUMP; coyote = 0; jumpBuf = 0; }
  v.y -= GRAV * dt;

  const wasGround = onGround, vy = v.y;
  onGround = false;
  move('x', v.x * dt); move('z', v.z * dt); move('y', v.y * dt);
  if (onGround && !wasGround && vy < -6) landKick = Math.min(1, -vy / 20);

  if (p.y < voidY) { p.set(...L.start); v.set(0, 0, 0); snapCam = true; }

  tmp.set(p.x, p.y + 0.8, p.z);
  for (const c of coins) {
    if (!c.visible) continue;
    c.rotation.y += dt * 4;
    if (c.position.distanceTo(tmp) < 1) { c.visible = false; got++; }
  }
  goal.rotation.y += dt * 2;
  if (!won && goal.position.distanceTo(tmp) < 1.4) {
    won = true;
    msg.style.display = 'flex';
    msg.innerHTML = `ЗВЕЗДА!<br>Время: ${time.toFixed(1)} с, монет: ${got}/${coins.length}<br>R: сыграть ещё`;
  }
  if (!won) time += dt;
  hud.textContent = `МОНЕТЫ ${got}/${coins.length}   ВРЕМЯ ${time.toFixed(1)}`;

  player.position.copy(p);
  player.rotation.y = face;
  let gy = -Infinity;
  for (const b of boxes) {
    if (Math.abs(p.x - (b.minX + b.maxX) / 2) < (b.maxX - b.minX) / 2 + 0.2 &&
        Math.abs(p.z - (b.minZ + b.maxZ) / 2) < (b.maxZ - b.minZ) / 2 + 0.2 &&
        b.maxY <= p.y + 0.05 && b.maxY > gy) gy = b.maxY;
  }
  shadow.visible = gy > -Infinity;
  shadow.position.set(p.x, gy + 0.02, p.z);

  const spd = Math.hypot(v.x, v.z) / SPEED;
  armPhase += dt * 11 * spd;
  armLift += ((onGround ? 0 : Math.max(-1, Math.min(1, v.y / JUMP)) * 0.7) - armLift) * (1 - Math.exp(-12 * dt));
  landKick = Math.max(0, landKick - dt * 4);
  const sw = Math.sin(armPhase) * 0.55 * spd;
  armL.rotation.x = 0.15 + sw + armLift;
  armR.rotation.x = 0.15 - sw + armLift;
  hands.position.set(Math.sin(armPhase * 0.5) * 0.02 * spd,
    -Math.abs(Math.sin(armPhase)) * 0.03 * spd - landKick * 0.1 + Math.sin(clockT * 1.6) * 0.006, 0);

  if (fpv) {
    camera.position.set(p.x, p.y + 1.5 + Math.abs(Math.sin(armPhase)) * 0.04 * spd, p.z);
    camera.rotation.set(pitch, camA, 0);
  } else {
    tmp.set(p.x + Math.sin(camA) * 8, p.y + 4.5, p.z + Math.cos(camA) * 8);
    if (snapCam) camera.position.copy(tmp); else camera.position.lerp(tmp, 1 - Math.exp(-6 * dt));
    camera.lookAt(p.x, p.y + 1.2, p.z);
  }
  snapCam = false;
}

// ---------- Редактор уровней ----------
const ed = { tool: 'plat', w: 3, d: 3, h: 0, mx: 0, mz: 0, tx: 0, tz: 0, yaw: 0, dist: 20 };
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
ghost.visible = false; scene.add(ghost);
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();

function updateEdit(dt) {
  ed.yaw += ((keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0)) * 1.8 * dt;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), sp = ed.dist * 0.8 * dt;
  ed.tx += (-Math.sin(ed.yaw) * f + Math.cos(ed.yaw) * r) * sp;
  ed.tz += (-Math.cos(ed.yaw) * f - Math.sin(ed.yaw) * r) * sp;
  const cp = Math.cos(0.95);
  camera.position.set(ed.tx + Math.sin(ed.yaw) * cp * ed.dist, ed.h + Math.sin(0.95) * ed.dist, ed.tz + Math.cos(ed.yaw) * cp * ed.dist);
  camera.lookAt(ed.tx, ed.h, ed.tz);
  camera.updateMatrixWorld();
  ray.setFromCamera(mouse, camera);
  plane.constant = -ed.h;
  if (ray.ray.intersectPlane(plane, hitP)) {
    ed.mx = Math.max(-290, Math.min(290, r05(hitP.x)));
    ed.mz = Math.max(-290, Math.min(290, r05(hitP.z)));
  }
  const S = { plat: [ed.w, 1, ed.d, ed.h - 0.5], coin: [0.8, 0.8, 0.8, ed.h + 1.3], goal: [1.4, 1.4, 1.4, ed.h + 1.6], start: [0.8, 1.2, 0.8, ed.h + 0.6] }[ed.tool];
  ghost.visible = !!S;
  if (S) { ghost.scale.set(S[0], S[1], S[2]); ghost.position.set(ed.mx, S[3], ed.mz); }
  coins.forEach((c) => (c.rotation.y += dt * 4));
  goal.rotation.y += dt * 2;
}

function edited() { L.seed = null; buildLevel(L); $('lvname').textContent = L.name; }
function erase() {
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(levelGroup.children)[0];
  const u = hit && hit.object.userData;
  if (!u) return;
  if (u.k === 'p' && L.plats.length > 1) L.plats.splice(u.i, 1);
  else if (u.k === 'c') L.coins.splice(u.i, 1);
  else return;
  edited();
}
function place() {
  const { tool: t, mx: x, mz: z, h } = ed;
  if (t === 'erase') return erase();
  if (t === 'plat') { if (L.plats.length >= 80) return say('Максимум 80 платформ'); L.plats.push([x, h, z, ed.w, ed.d]); }
  else if (t === 'coin') { if (L.coins.length >= 100) return say('Максимум 100 монет'); L.coins.push([x, h + 1.3, z]); }
  else if (t === 'goal') L.goal = [x, h + 1.6, z];
  else if (t === 'start') L.start = [x, h, z];
  edited();
}
renderer.domElement.addEventListener('mousedown', (e) => {
  if (mode !== 'edit') return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (e.button === 2) erase(); else if (e.button === 0) place();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Меню, Мастерская, ссылки ----------
let sayT;
function say(t) { $('status').textContent = t; clearTimeout(sayT); sayT = setTimeout(() => ($('status').textContent = ''), 4000); }

function setTab(t) {
  document.querySelectorAll('.pane').forEach((el) => (el.style.display = el.id === 'pane-' + t ? 'block' : 'none'));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  const e = t === 'edit';
  marker.visible = e;
  if (!e) ghost.visible = false;
  if (e !== (mode === 'edit')) {
    mode = e ? 'edit' : 'play';
    if (document.pointerLockElement) document.exitPointerLock();
    setView(false);
    if (e) {
      player.visible = hands.visible = shadow.visible = false;
      $('ename').value = L.name;
      ed.tx = L.start[0]; ed.tz = L.start[2]; ed.h = L.start[1]; $('edh').value = ed.h;
    } else reset();
  }
  if (t === 'shop') loadShop();
}
function play(lv) {
  L = lv; buildLevel(L);
  $('lvname').textContent = L.name; $('seed').value = L.seed ?? '';
  const wasEdit = mode === 'edit';
  setTab('play');
  if (!wasEdit) reset();
}

async function copyLink() {
  const base = location.href.split('#')[0];
  const link = L.seed ? `${base}#S=${encodeURIComponent(L.seed)}` : `${base}#L=${enc(L)}`;
  try { await navigator.clipboard.writeText(link); say('Ссылка скопирована'); } catch { prompt('Скопируйте ссылку:', link); }
}
const ghRepo = () => ({
  owner: location.hostname.endsWith('github.io') ? location.hostname.split('.')[0] : 'OWNER',
  repo: location.pathname.split('/')[1] || 'REPO',
});

// Мастерская: уровни лежат в Issues репозитория. Владелец ставит метку "workshop" = одобрено.
async function loadShop() {
  const list = $('shoplist'), { owner, repo } = ghRepo();
  list.textContent = 'Загрузка…';
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?labels=workshop&state=open&per_page=50`);
    if (!res.ok) throw new Error(res.status);
    const items = [];
    for (const it of await res.json()) {
      if (it.pull_request) continue;
      const m = /```level\s+([\w-]+)\s+```/.exec(it.body || '');
      const lv = m && dec(m[1]);
      if (lv) items.push({ lv, author: it.user.login, likes: (it.reactions && it.reactions['+1']) || 0, url: it.html_url });
    }
    items.sort((a, b) => b.likes - a.likes);
    list.textContent = items.length ? '' : 'Пока пусто. Станьте первым!';
    for (const it of items) {
      const row = document.createElement('div'); row.className = 'item';
      const b = document.createElement('button');
      b.textContent = `${it.lv.name} · ${it.author} · 👍${it.likes}`;
      b.onclick = () => play(it.lv);
      const a = document.createElement('a'); a.href = it.url; a.target = '_blank'; a.textContent = '↗';
      row.append(b, a); list.append(row);
    }
  } catch { list.textContent = 'Не удалось загрузить Мастерскую (она работает на GitHub Pages).'; }
}

document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
$('panel').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') e.target.blur(); });
document.querySelectorAll('.link').forEach((b) => (b.onclick = copyLink));
$('btnSeed').onclick = () => play(generate($('seed').value.trim() || 'default'));
$('btnRand').onclick = () => { const s = Math.random().toString(36).slice(2, 8); $('seed').value = s; play(generate(s)); };
$('btnClassic').onclick = () => play(classic());
$('btnCode').onclick = () => { const lv = dec($('code').value.trim()); lv ? play(lv) : say('Код не подходит'); };
$('btnTest').onclick = () => setTab('play');
$('btnNew').onclick = () => {
  L = { name: 'Мой уровень', plats: [[0, 0, 0, 6, 6]], coins: [], goal: [0, 1.6, -8], start: [0, 0, 0] };
  buildLevel(L); $('ename').value = L.name; $('lvname').textContent = L.name;
};
$('btnShop').onclick = loadShop;
$('btnSubmit').onclick = () => {
  const { owner, repo } = ghRepo();
  const body = `Название: ${L.name}\n\n\`\`\`level\n${enc(L)}\n\`\`\`\n`;
  window.open(`https://github.com/${owner}/${repo}/issues/new?title=${encodeURIComponent('[Уровень] ' + L.name)}&body=${encodeURIComponent(body)}`, '_blank');
  say('Нажмите Submit new issue на странице GitHub');
};
$('tool').onchange = (e) => { ed.tool = e.target.value; e.target.blur(); };
$('edw').oninput = (e) => (ed.w = Math.max(1, Math.min(30, +e.target.value || 3)));
$('edd').oninput = (e) => (ed.d = Math.max(1, Math.min(30, +e.target.value || 3)));
$('edh').oninput = (e) => (ed.h = +e.target.value || 0);
$('ename').oninput = (e) => { L.name = e.target.value.slice(0, 40); $('lvname').textContent = L.name; };

function loadHash() {
  const h = location.hash.slice(1);
  if (h.startsWith('S=')) play(generate(decodeURIComponent(h.slice(2))));
  else if (h.startsWith('L=')) { const lv = dec(h.slice(2)); if (lv) play(lv); else say('Ссылка на уровень повреждена'); }
}
addEventListener('hashchange', loadHash);

// ---------- Старт ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  clockT += dt;
  if (mode === 'play') update(dt); else updateEdit(dt);
  updateDragons(dt, clockT);
  composer.render();
}
play(classic());
loadHash();
loop();
