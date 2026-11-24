// נקודת כניסה: תפריט ראשי + "נשקייה" (צפייה בנשקים עם סקינים).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS, RARITY, weapon } from './data/weapons.js';
import { SKINS } from './data/skins.js';
import { BUILDERS } from './models/weapons.js';
import { startLab } from './modes/animlab.js';
import { startMap } from './modes/mapview.js';
import { startTraining } from './modes/training.js';
import { startShop } from './modes/shop.js';
import { startBattle } from './modes/battle.js';
import { startSolo } from './modes/solo.js';
import { addCoins, getLoadout } from './store.js';

const canvas = document.getElementById('view');
const ui = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0d12');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
scene.add(new THREE.HemisphereLight('#cfe3ff', '#20242c', 1.1));
const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(1, 2, 1.5); scene.add(key);
const rim = new THREE.DirectionalLight('#ffb020', 1.6); rim.position.set(-1.5, 0.5, -1); scene.add(rim);

let lab = null, train = null, shown = null, state = { weapon: 'knife', skin: 'default' }, spin = true;

function show() {
  if (shown) scene.remove(shown);
  const b = BUILDERS[state.weapon];
  if (!b) return;
  shown = b(state.skin);
  const box = new THREE.Box3().setFromObject(shown);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  shown.position.sub(c);
  const pivot = new THREE.Group(); pivot.add(shown); shown = pivot;
  scene.add(shown);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max(Math.max(size.x, size.z) / (2 * t * camera.aspect), size.y / (2 * t)) * 1.1;
  camera.position.set(0, d * 0.12, d);
  camera.lookAt(0, 0, 0);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (shown) show();
}
addEventListener('resize', resize);

// גרירה לסיבוב
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; spin = false; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => { if (drag !== null && shown) { shown.rotation.y += (e.clientX - drag) * 0.01; drag = e.clientX; } });

const h = (html) => { ui.innerHTML = html; };

function menu() {
  if (shown) { scene.remove(shown); shown = null; }
  h(`<div class="menu">
    <h1>STRIKE3D</h1>
    <button class="btn" data-go="lab">🧍 מעבדת תנועה <small>אחיזה ותנועות</small></button>
    <button class="btn" data-go="map">🗺️ מפה <small>סיור בזירה + מטוס</small></button>
    <button class="btn" data-go="armory">🔪 נשקייה <small>צפייה בנשקים וסקינים</small></button>
    <button class="btn" data-go="train">🎯 אימון <small>מטווח ובוטים</small></button>
    <button class="btn" data-go="battle">⚔️ קרב <small>מטוס, צניחה, כולם נגד כולם</small></button>
    <button class="btn" data-go="solo">🕵️ מצב לבד <small>4 עלילות</small></button>
    <button class="btn" data-go="shop">📦 חנות ותיק <small>תיבות, סקינים, ציוד</small></button>
  </div>`);
  ui.querySelector('[data-go=armory]').onclick = armory;
  ui.querySelector('[data-go=map]').onclick = () => { lab = startMap(scene, camera, ui, menu); };
  ui.querySelector('[data-go=train]').onclick = () => { train = startTraining(scene, camera, ui, menu, renderer); };
  ui.querySelector('[data-go=battle]').onclick = () => { lab = startBattle(scene, camera, ui, menu, renderer, { onCoin: (n) => addCoins(n, 'battle'), skin: getLoadout()?.outfit || 'default' }); };
  ui.querySelector('[data-go=solo]').onclick = () => { lab = startSolo(scene, camera, ui, menu, renderer); };
  ui.querySelector('[data-go=lab]').onclick = () => { lab = startLab(scene, camera, ui, menu); };
  ui.querySelector('[data-go=shop]').onclick = () => { lab = startShop(scene, camera, ui, menu); };
}

function armory() {
  spin = true;
  const w = weapon(state.weapon);
  const ready = WEAPONS.filter((x) => BUILDERS[x.id]);
  h(`<div class="bar">
      <button class="chip" id="back">→ חזרה</button>
      ${ready.map((x) => `<button class="chip ${x.id === state.weapon ? 'on' : ''}" data-w="${x.id}">${x.he}</button>`).join('')}
    </div>
    <div class="info"><b style="color:${RARITY[w.rarity].color}">${w.he}</b> · ${RARITY[w.rarity].he}<br>
      נזק ${w.dmg} · טווח ${w.range} מ׳</div>
    <div class="skins">${SKINS.map((s) => `<button class="chip ${s.id === state.skin ? 'on' : ''}" data-s="${s.id}"
      style="border-color:${s.id === state.skin ? RARITY[s.rarity].color : '#2a3142'}">${s.he}</button>`).join('')}</div>`);
  ui.querySelector('#back').onclick = menu;
  ui.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { state.weapon = b.dataset.w; armory(); }));
  ui.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { state.skin = b.dataset.s; armory(); }));
  show();
}

resize();
menu();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (shown && spin) shown.rotation.y += dt * 0.8;
  if (lab?.active) lab.update(dt);
  if (train?.active) train.update(dt);
  renderer.render(scene, camera);
});
window.__s3d = { scene, camera, state, armory, menu, get lab() { return lab; }, get train() { return train; } };
