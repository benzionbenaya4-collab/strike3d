// פתיחת תיבה: גלגלת אופקית של כרטיסי פריטים שמאטה בהדרגה ונעצרת על הפרס (שנבחר מראש לפי משקלים).
// אייקונים: רינדור תלת־ממד קטן מחוץ למסך (renderer אחד משותף), נשמר כתמונה במטמון.
// אפקטים לפי נדירות: זוהר, חלקיקים, הבזק מסך במיתי. צלילים: WebAudio (נוצר רק אחרי קליק של השחקן).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RARITY } from '../data/weapons.js';
import { BUILDERS } from '../models/weapons.js';
import { buildCharacter } from '../models/character.js';
import { itemKey, itemName, itemRarity, RARITY_ORDER } from '../store.js';

// ================= אייקונים =================
const ICON_W = 192, ICON_H = 144;
const cache = new Map(); // key -> dataURL
const waiting = new Map(); // key -> Promise
let R = null;
function iconRig() {
  if (R) return R;
  const canvas = document.createElement('canvas'); canvas.width = ICON_W; canvas.height = ICON_H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(ICON_W, ICON_H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight('#dfeaff', '#2a2f3a', 1.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.6); key.position.set(1.2, 2, 2); scene.add(key);
  const rim = new THREE.DirectionalLight('#ffd28a', 1.4); rim.position.set(-2, 0.6, -1.5); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, ICON_W / ICON_H, 0.01, 50);
  R = { renderer, scene, camera, canvas };
  return R;
}
function disposeTree(o) {
  o.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
  });
}
/** בונה מודל לתצוגה (גם לתיק): נשק בסקין, או דמות בסקין */
export function buildItemModel(it) {
  if (it.type === 'outfit') { const rig = buildCharacter({ skin: it.skin }); rig.root.userData.rig = rig; return rig.root; }
  const b = BUILDERS[it.weapon];
  return b ? b(it.skin) : new THREE.Group();
}
function renderIcon(it) {
  const { renderer, scene, camera } = iconRig();
  const obj = buildItemModel(it);
  const pivot = new THREE.Group(); pivot.add(obj); scene.add(pivot);
  if (it.type === 'outfit') { obj.rotation.y = -0.35; obj.userData.rig?.anim?.update(0.016, {}); }
  else { obj.rotation.set(0.12, -0.5, 0.05); if (it.weapon === 'grenade') obj.rotation.set(0.3, -0.6, 0.2); }
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const pad = it.type === 'outfit' ? 1.05 : 1.18;
  const d = Math.max(size.x / (2 * t * camera.aspect), size.y / (2 * t)) * pad + size.z / 2;
  camera.position.set(0, d * 0.08, d); camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(pivot); disposeTree(pivot);
  return url;
}
const frame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
let chain = Promise.resolve();
/** dataURL לאייקון (מטמון). אסינכרוני: כל אייקון בפריים משלו, כדי לא לתקוע את המסך. */
export function itemIcon(it) {
  const k = itemKey(it);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (waiting.has(k)) return waiting.get(k);
  const p = (chain = chain.then(frame).then(() => {
    let url = '';
    try { url = renderIcon(it); } catch (e) { console.warn('icon', k, e); }
    cache.set(k, url); waiting.delete(k); return url;
  }));
  waiting.set(k, p);
  return p;
}
export const cachedIcon = (it) => cache.get(itemKey(it)) || '';
/** ממלא את כל ה-<img data-icon> שבתוך el ברגע שהאייקון מוכן */
export function fillIcons(el, items) {
  el.querySelectorAll('img[data-icon]').forEach((img) => {
    const it = items[+img.dataset.icon]; if (!it) return;
    const u = cachedIcon(it);
    if (u) img.src = u; else itemIcon(it).then((url) => { if (url && img.isConnected) img.src = url; });
  });
}

// ================= צלילים =================
let AC = null;
/** חייב להיקרא מתוך קליק של השחקן (מדיניות autoplay) */
export function unlockAudio() {
  try {
    if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); }
    if (AC && AC.state === 'suspended') AC.resume();
  } catch (_) { AC = null; }
  return AC;
}
function tone(freq, { at = 0, dur = 0.08, type = 'triangle', vol = 0.12, slide = 0 } = {}) {
  if (!AC) return;
  try {
    const t0 = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (_) {}
}
const tick = (speed) => tone(1500 + speed * 900, { dur: 0.035, type: 'square', vol: 0.035 });
function winSound(rarity) {
  const r = RARITY_ORDER.indexOf(rarity);
  const notes = [523, 659, 784, 1047, 1319, 1568];
  const n = 2 + r;
  for (let i = 0; i < n; i++) tone(notes[i % notes.length], { at: i * 0.09, dur: 0.28, type: r >= 3 ? 'sawtooth' : 'triangle', vol: 0.09 });
  tone(notes[n - 1] * (r >= 4 ? 2 : 1), { at: n * 0.09, dur: 0.9, type: 'sine', vol: 0.12 });
  if (r >= 4) for (let i = 0; i < 10; i++) tone(2000 + Math.random() * 2500, { at: 0.5 + i * 0.07, dur: 0.12, type: 'sine', vol: 0.03 });
  if (r >= 3) tone(110, { at: 0, dur: 0.6, type: 'sine', vol: 0.18, slide: 0.5 });
}

// ================= סגנון =================
const CSS = `
.s3s { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:16px;
  background:radial-gradient(ellipse at 50% 40%, #1d2333f0 0%, #07080cf5 75%); z-index:20; overflow:hidden; }
.s3s h3 { margin:0; font:900 24px Rubik; text-align:center; }
.s3s-win { position:relative; width:min(980px,100%); height:178px; overflow:hidden; border-radius:16px; border:1px solid #2a3142;
  background:linear-gradient(180deg,#0e1118,#151a25 50%,#0e1118); direction:ltr; box-shadow:inset 0 0 40px #000; }
.s3s-win::before, .s3s-win::after { content:''; position:absolute; top:0; bottom:0; width:14%; z-index:2; pointer-events:none; }
.s3s-win::before { left:0; background:linear-gradient(90deg,#07080c,transparent); }
.s3s-win::after { right:0; background:linear-gradient(-90deg,#07080c,transparent); }
.s3s-mark { position:absolute; left:50%; top:0; bottom:0; width:3px; margin-left:-1.5px; background:#ffb020; z-index:3; box-shadow:0 0 12px #ffb020; }
.s3s-mark::before, .s3s-mark::after { content:''; position:absolute; left:50%; margin-left:-9px; border:9px solid transparent; }
.s3s-mark::before { top:0; border-top-color:#ffb020; } .s3s-mark::after { bottom:0; border-bottom-color:#ffb020; }
.s3s-reel { position:absolute; top:14px; left:0; display:flex; gap:10px; will-change:transform; }
.s3s-card { flex:none; width:130px; height:150px; border-radius:12px; background:linear-gradient(180deg,#1b2130,#10131b);
  border:2px solid var(--rc); box-shadow:inset 0 -26px 30px -18px var(--rc); display:flex; flex-direction:column; align-items:center; justify-content:space-between;
  padding:6px 4px 8px; overflow:hidden; transition:transform .3s, box-shadow .3s; }
.s3s-card img { width:122px; height:92px; object-fit:contain; }
.s3s-card b { font:700 12px Rubik; text-align:center; direction:rtl; line-height:1.2; color:#eef2f8; }
.s3s-card i { font:400 11px Rubik; color:var(--rc); font-style:normal; }
.s3s-card.win { transform:scale(1.07); box-shadow:0 0 28px 6px var(--rc), inset 0 -40px 40px -20px var(--rc); }
.s3s-res { display:flex; flex-direction:column; align-items:center; gap:10px; min-height:0; opacity:0; transform:translateY(12px); transition:all .4s; pointer-events:none; }
.s3s-res.on { opacity:1; transform:none; pointer-events:auto; }
.s3s-big { width:min(300px,70vw); aspect-ratio:4/3; border-radius:18px; border:3px solid var(--rc); background:radial-gradient(circle,#2a3142,#10131b 70%);
  box-shadow:0 0 50px 8px var(--rc); display:flex; align-items:center; justify-content:center; animation:s3s-pulse 1.6s ease-in-out infinite; }
.s3s-big img { width:94%; height:94%; object-fit:contain; }
@keyframes s3s-pulse { 50% { box-shadow:0 0 70px 16px var(--rc); } }
.s3s-name { font:900 22px Rubik; text-align:center; } .s3s-rar { font:700 15px Rubik; color:var(--rc); }
.s3s-dup { font:400 13px Rubik; color:#8b95a7; }
.s3s-btns { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.s3s-btns .btn { width:auto; min-width:150px; justify-content:center; }
.s3s-fx { position:absolute; inset:0; pointer-events:none; z-index:4; width:100%; height:100%; }
.s3s-flash { position:absolute; inset:0; pointer-events:none; z-index:5; background:radial-gradient(circle,#fff 0%,#ffe08a 45%,#ffc53100 80%); opacity:0; }
.s3s-flash.go { animation:s3s-flash 1.1s ease-out; }
@keyframes s3s-flash { 0% { opacity:0; } 8% { opacity:1; } 100% { opacity:0; } }
.s3s-shake { animation:s3s-shake .5s; }
@keyframes s3s-shake { 20% { transform:translate(-6px,3px); } 40% { transform:translate(5px,-4px); } 60% { transform:translate(-4px,2px); } 80% { transform:translate(3px,-1px); } }
@media (max-width:520px) { .s3s-card { width:108px; height:132px; } .s3s-card img { width:100px; height:76px; } .s3s-win { height:160px; } }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function cardHtml(it, i, extra = '') {
  const r = itemRarity(it);
  return `<div class="s3s-card ${extra}" style="--rc:${RARITY[r].color}" data-i="${i}">
    <img data-icon="${i}" alt="" src="${cachedIcon(it)}"><b>${esc(itemName(it))}</b><i>${RARITY[r].he}</i></div>`;
}

// ================= חלקיקים =================
function burst(cv, color, count, big) {
  const g = cv.getContext('2d'); if (!g) return;
  const W = (cv.width = cv.clientWidth * Math.min(devicePixelRatio, 2)), H = (cv.height = cv.clientHeight * Math.min(devicePixelRatio, 2));
  const cx = W / 2, cy = H * 0.42, s = Math.min(devicePixelRatio, 2);
  const cols = [color, '#ffffff', color, big ? '#ffe08a' : color];
  const ps = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * (big ? 14 : 9)) * s;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3 * s, life: 1, d: 0.008 + Math.random() * 0.012, r: (2 + Math.random() * 4) * s, c: cols[(Math.random() * cols.length) | 0], star: Math.random() < 0.3 };
  });
  let raf = 0;
  const step = () => {
    g.clearRect(0, 0, W, H); let alive = 0;
    for (const p of ps) {
      if (p.life <= 0) continue; alive++;
      p.x += p.vx; p.y += p.vy; p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.18 * s; p.life -= p.d;
      g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c;
      if (p.star) { g.fillRect(p.x - p.r * 1.6, p.y - 0.6 * s, p.r * 3.2, 1.2 * s); g.fillRect(p.x - 0.6 * s, p.y - p.r * 1.6, 1.2 * s, p.r * 3.2); }
      else { g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
    if (alive && cv.isConnected) raf = requestAnimationFrame(step); else g.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * openSpinner({ host, prize, filler, title, dupNote, onEquip, onKeep })
 * host: אלמנט להוספת השכבה · prize: הפריט שנבחר מראש · filler(): מחזיר פריט אקראי לגלגלת (לפי סיכויי התיבה)
 * dupNote: טקסט אם הפריט כפול. onEquip / onKeep נקראים בלחיצה, ואחריהם השכבה נסגרת.
 * מחזיר { el, done: Promise } – done מתממש כשהגלגלת נעצרת.
 */
export function openSpinner({ host, prize, filler, title = '📦 פותחים תיבה…', dupNote = '', onEquip, onKeep, duration = 5.6 }) {
  style();
  const N = 52, WIN = 44 + Math.floor(Math.random() * 3);
  const items = Array.from({ length: N }, (_, i) => (i === WIN ? prize : filler()));
  const el = document.createElement('div'); el.className = 's3s'; el.dataset.state = 'loading';
  el.innerHTML = `<h3>${title}</h3>
    <div class="s3s-win"><div class="s3s-mark"></div><div class="s3s-reel">${items.map((it, i) => cardHtml(it, i)).join('')}</div></div>
    <div class="s3s-res"></div><canvas class="s3s-fx"></canvas><div class="s3s-flash"></div>`;
  host.appendChild(el);
  const reel = el.querySelector('.s3s-reel'), win = el.querySelector('.s3s-win'), res = el.querySelector('.s3s-res');

  let resolve; const done = new Promise((r) => (resolve = r));
  let stopFx = null, raf = 0;
  const close = () => { cancelAnimationFrame(raf); stopFx?.(); el.remove(); };

  // טוענים קודם את אייקוני הפרס והכרטיסים הקרובים אליו, ומתחילים להסתובב
  const near = [...new Set([WIN, ...Array.from({ length: 14 }, (_, k) => WIN - 7 + k)])].filter((i) => i >= 0 && i < N);
  Promise.all(near.map((i) => itemIcon(items[i]))).then(() => { fillIcons(el, items); spin(); });
  fillIcons(el, items);

  function spin() {
    el.dataset.state = 'spinning';
    const card = reel.children[0], gap = 10;
    const cw = card.getBoundingClientRect().width, step = cw + gap;
    const ww = win.clientWidth;
    const jitter = (Math.random() - 0.5) * cw * 0.7;
    const D = WIN * step + cw / 2 - ww / 2 + jitter;
    const T = duration * 1000;
    const ease = (u) => 1 - Math.pow(1 - u, 4.2);
    let t0 = 0, last = -1;
    const loop = (now) => {
      if (!t0) t0 = now;
      const u = Math.min(1, (now - t0) / T), x = D * ease(u);
      reel.style.transform = `translate3d(${-x}px,0,0)`;
      const idx = Math.floor((x + ww / 2) / step);
      if (idx !== last) { if (last >= 0) tick(1 - u); last = idx; }
      if (u < 1) raf = requestAnimationFrame(loop); else land();
    };
    raf = requestAnimationFrame(loop);
  }

  function land() {
    const r = itemRarity(prize), rc = RARITY[r].color, rank = RARITY_ORDER.indexOf(r);
    el.dataset.state = 'done';
    reel.children[WIN].classList.add('win');
    winSound(r);
    stopFx = burst(el.querySelector('.s3s-fx'), rc, [12, 40, 70, 120, 220][rank], rank >= 4);
    if (rank >= 4) el.querySelector('.s3s-flash').classList.add('go');
    if (rank >= 3) { el.classList.add('s3s-shake'); }
    el.style.setProperty('--rc', rc);
    res.style.setProperty('--rc', rc);
    res.innerHTML = `<div class="s3s-big"><img alt="" src="${cachedIcon(prize)}"></div>
      <div class="s3s-name">${esc(itemName(prize))}</div><div class="s3s-rar">${RARITY[r].he}</div>
      ${dupNote ? `<div class="s3s-dup">${esc(dupNote)}</div>` : ''}
      <div class="s3s-btns"><button class="btn" id="s3s-equip">✅ לבש עכשיו</button><button class="btn" id="s3s-keep">🎒 שמור בתיק</button></div>`;
    win.style.transition = 'opacity .4s'; setTimeout(() => { if (el.isConnected) { win.style.opacity = '0.35'; res.classList.add('on'); } }, 650);
    res.querySelector('#s3s-equip').onclick = () => { close(); onEquip?.(prize); };
    res.querySelector('#s3s-keep').onclick = () => { close(); onKeep?.(prize); };
    resolve(prize);
  }
  return { el, done, items, winIndex: WIN, close };
}
