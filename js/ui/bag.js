// "🎒 תיק": רשת של הפריטים שיש לשחקן, תצוגת תלת־ממד של הפריט הנבחר ליד הדמות בסקין הנוכחי,
// ובחירת ציוד: נשק 1, נשק 2, סכין, סקין דמות. נשמר ב-store.js.
import * as THREE from 'three';
import { RARITY, weapon as W } from '../data/weapons.js';
import { getProfile, getLoadout, getWallet, equip, equippedSlot, itemName, itemRarity, RARITY_ORDER } from '../store.js';
import { buildCharacter } from '../models/character.js';
import { BUILDERS } from '../models/weapons.js';
import { buildItemModel, fillIcons, cachedIcon } from './spinner.js';

const CSS = `
.s3b { position:absolute; inset:0; pointer-events:none; display:flex; flex-direction:column; }
.s3b > * { pointer-events:auto; }
.s3b-top { display:flex; gap:8px; align-items:center; padding:12px; }
.s3b-top .sp { flex:1; pointer-events:none; }
.s3b-coins { font:900 18px Rubik; color:#ffd54a; padding:6px 14px; border-radius:999px; background:#151922cc; border:1px solid #3a3220; }
.s3b-view { flex:1; pointer-events:none; position:relative; }
.s3b-sel { position:absolute; top:4px; inset-inline:0; text-align:center; font:900 18px Rubik; text-shadow:0 2px 8px #000; pointer-events:none; }
.s3b-sel small { display:block; font:700 13px Rubik; }
.s3b-panel { height:52%; background:#11141bf2; border-top:1px solid #2a3142; border-radius:18px 18px 0 0; display:flex; flex-direction:column; gap:8px;
  padding:10px 12px max(10px, env(safe-area-inset-bottom)); min-height:0; }
@media (min-width:900px) and (min-aspect-ratio:4/3) {
  .s3b-top { position:absolute; top:0; inset-inline:0; }
  .s3b-panel { position:absolute; top:64px; bottom:0; inset-inline-start:0; width:440px; height:auto; border-radius:18px 0 0 0; border-top:0; border-inline-end:1px solid #2a3142; }
  .s3b-view { position:absolute; top:64px; bottom:0; inset-inline-end:0; width:calc(100% - 440px); }
}
.s3b-slots { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.s3b-slot { border-radius:12px; border:2px solid var(--rc,#2a3142); background:#0b0d12; padding:4px; display:flex; flex-direction:column; align-items:center; cursor:pointer;
  color:#eef2f8; font:700 11px Rubik; min-width:0; }
.s3b-slot.on { box-shadow:0 0 0 2px #ffb020; }
.s3b-slot img { width:100%; height:44px; object-fit:contain; }
.s3b-slot span { color:#8b95a7; font-weight:400; } .s3b-slot b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.s3b-act { display:flex; gap:8px; align-items:center; min-height:38px; flex-wrap:wrap; }
.s3b-act .chip.eq { border-color:#3ddc84; color:#3ddc84; }
.s3b-act .t { color:#8b95a7; font:400 13px Rubik; }
.s3b-filters { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; }
.s3b-grid { flex:1; min-height:0; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(92px,1fr)); gap:8px; align-content:start; }
.s3b-it { position:relative; border-radius:12px; border:2px solid var(--rc); background:linear-gradient(180deg,#1b2130,#10131b); padding:4px; cursor:pointer;
  display:flex; flex-direction:column; align-items:center; color:#eef2f8; font:700 11px Rubik; box-shadow:inset 0 -18px 22px -14px var(--rc); }
.s3b-it img { width:100%; height:58px; object-fit:contain; }
.s3b-it b { text-align:center; line-height:1.2; }
.s3b-it.sel { box-shadow:0 0 0 3px #ffb020, inset 0 -18px 22px -14px var(--rc); }
.s3b-it .e { position:absolute; top:3px; inset-inline-start:3px; font-size:10px; background:#3ddc84; color:#0b0d12; border-radius:6px; padding:0 4px; }
.s3b-it .n { position:absolute; top:3px; inset-inline-end:3px; font-size:10px; background:#ffb020; color:#0b0d12; border-radius:6px; padding:0 4px; }
`;

const SLOT_HE = ['🔫 נשק 1', '🔫 נשק 2', '🔪 סכין', '🧥 סקין'];
const slotItem = (L, s) => (s === 0 || s === 1 ? { type: 'weapon', weapon: L.guns[s].id, skin: L.guns[s].skin }
  : s === 2 ? { type: 'weapon', weapon: 'knife', skin: L.knife } : { type: 'outfit', skin: L.outfit });
const fits = (it, s) => (s === null ? true : s === 3 ? it.type === 'outfit' : s === 2 ? it.weapon === 'knife' : it.type === 'weapon' && it.weapon !== 'knife' && W(it.weapon)?.kind === 'gun');

export function startBag(scene, camera, ui, back, { focus = null } = {}) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const st = { sel: focus, slot: null, filter: 'all' };
  const items = () => {
    const list = getProfile().items.slice();
    list.sort((a, b) => RARITY_ORDER.indexOf(itemRarity(b)) - RARITY_ORDER.indexOf(itemRarity(a)) || (b.at || 0) - (a.at || 0));
    return list;
  };
  if (!st.sel || !items().some((x) => x.key === st.sel)) st.sel = items()[0]?.key;
  const seenAt = Date.now() - 60000; // "חדש" = נוסף בדקה האחרונה

  // ---------- תלת־ממד ----------
  const saved = { bg: scene.background, fov: camera.fov, near: camera.near, far: camera.far, pos: camera.position.clone(), q: camera.quaternion.clone() };
  scene.background = new THREE.Color('#0d1018');
  camera.fov = 32; camera.near = 0.05; camera.far = 60; camera.updateProjectionMatrix();
  const root = new THREE.Group(); scene.add(root);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#171c27', roughness: 0.9 }));
  root.add(floor);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.23, 64).rotateX(-Math.PI / 2), ringMat); ring.position.y = 0.002; root.add(ring);
  const spot = new THREE.PointLight('#ffffff', 6, 8, 1.6); spot.position.set(0.6, 2.6, 1.6); root.add(spot);
  const turn = new THREE.Group(); root.add(turn); // מסתובב בגרירה
  let rig = null, rigKey = '', itemObj = null, itemKey_ = '', pedestal = null;
  const disposeTree = (o) => o.traverse((m) => { m.geometry?.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });

  function setScene() {
    const L = getLoadout();
    const sel = items().find((x) => x.key === st.sel);
    const outfit = sel?.type === 'outfit' ? sel.skin : L.outfit;
    // הדמות מחזיקה את הנשק הנבחר (אם נשק), אחרת את נשק 1
    const held = sel?.type === 'weapon' ? { id: sel.weapon, skin: sel.skin } : { id: L.guns[0].id, skin: L.guns[0].skin };
    const k = `${outfit}|${held.id}|${held.skin}`;
    if (k !== rigKey) {
      if (rig) { turn.remove(rig.root); disposeTree(rig.root); }
      const pose = held.id === 'knife' ? 'knife' : held.id;
      rig = buildCharacter({ skin: outfit, pose, weapon: held.id === 'knife' ? null : BUILDERS[held.id]?.(held.skin) });
      if (held.id === 'knife') rig.setWeapon(BUILDERS.knife(held.skin), 'knife');
      rig.root.position.set(-0.45, 0, 0); turn.add(rig.root); rigKey = k;
    }
    // פריט צף ליד הדמות (נשק). לסקין דמות – הדמות עצמה היא הפריט.
    const ik = sel && sel.type === 'weapon' ? sel.key : '';
    if (ik !== itemKey_) {
      if (itemObj) { turn.remove(itemObj); disposeTree(itemObj); itemObj = null; }
      if (pedestal) { turn.remove(pedestal); disposeTree(pedestal); pedestal = null; }
      if (sel && sel.type === 'weapon') {
        const m = buildItemModel(sel);
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        m.position.sub(c);
        const sc = Math.min(1.6, 0.85 / Math.max(size.x, size.y, size.z));
        itemObj = new THREE.Group(); itemObj.add(m); itemObj.scale.setScalar(sc); itemObj.position.set(0.62, 1.15, 0.1);
        turn.add(itemObj);
        const rc = RARITY[itemRarity(sel)].color;
        pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 32), new THREE.MeshStandardMaterial({ color: '#1d2230', emissive: rc, emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.3 }));
        pedestal.position.set(0.62, 0.4, 0.1); turn.add(pedestal);
      }
      itemKey_ = ik;
    }
    ringMat.color.set(sel ? RARITY[itemRarity(sel)].color : '#ffb020');
  }

  function frameCamera() {
    const view = ui.querySelector('.s3b-view');
    const W_ = innerWidth, H_ = innerHeight;
    if (!view) return;
    const r = view.getBoundingClientRect();
    // מרכז את התוכן באזור הפנוי (מעל/ליד הפאנל) בעזרת view offset
    camera.setViewOffset(W_, H_, W_ / 2 - (r.left + r.width / 2), H_ / 2 - (r.top + r.height / 2), W_, H_);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aspect = r.width / Math.max(1, r.height);
    const w = 3.0, h = 2.9; // רוחב/גובה התוכן במטרים (עם שוליים)
    const fill = r.height / H_; // חלק מגובה המסך שהאזור תופס
    const d = Math.max(w / (2 * t * aspect), h / (2 * t)) / fill;
    camera.position.set(0, 1.0 + d * 0.16, d); camera.lookAt(0, 0.92, 0);
  }

  // ---------- ממשק ----------
  function draw() {
    const L = getLoadout(), all = items(), sel = all.find((x) => x.key === st.sel);
    const shown = all.filter((it) => fits(it, st.slot) && (st.filter === 'all' || (st.filter === 'outfit' ? it.type === 'outfit' : it.type === 'weapon')));
    const slots = [0, 1, 2, 3].map((s) => slotItem(L, s));
    const iconItems = [...shown, ...slots, ...(sel ? [sel] : [])];
    const es = sel ? equippedSlot(sel) : null;
    const eqLabel = (s) => (s === 0 || s === 1 ? `נשק ${s + 1}` : s === 'knife' ? 'סכין' : 'סקין');
    let act = '';
    if (sel) {
      if (sel.type === 'weapon' && sel.weapon !== 'knife' && W(sel.weapon)?.kind === 'gun') {
        act = [0, 1].map((s) => `<button class="chip ${es === s ? 'eq' : ''}" data-eq="${s}">${es === s ? '✓' : '⬅'} נשק ${s + 1}</button>`).join('');
      } else if (es === null) act = `<button class="chip" data-eq="x">✅ צייד</button>`;
      act += es !== null ? `<span class="t">מצויד · ${eqLabel(es)}</span>` : '';
    }
    ui.innerHTML = `<div class="s3b">
      <div class="s3b-top"><button class="chip" id="back">→ חזרה</button><span class="sp"></span><span class="s3b-coins">🪙 ${getWallet().coins}</span></div>
      <div class="s3b-view">${sel ? `<div class="s3b-sel" style="color:${RARITY[itemRarity(sel)].color}">${itemName(sel)}<small>${RARITY[itemRarity(sel)].he}</small></div>` : ''}</div>
      <div class="s3b-panel">
        <div class="s3b-slots">${slots.map((it, s) => `<button class="s3b-slot ${st.slot === s ? 'on' : ''}" data-slot="${s}" style="--rc:${RARITY[itemRarity(it)].color}">
          <span>${SLOT_HE[s]}</span><img alt="" data-icon="${shown.length + s}" src="${cachedIcon(it)}"><b>${itemName(it).split(' · ').pop()}</b></button>`).join('')}</div>
        <div class="s3b-act">${act || '<span class="t">בחר פריט</span>'}</div>
        <div class="s3b-filters">${[['all', 'הכול'], ['weapon', '🔫 נשקים'], ['outfit', '🧥 דמות']].map(([f, he]) =>
          `<button class="chip ${st.filter === f && st.slot === null ? 'on' : ''}" data-f="${f}">${he}</button>`).join('')}
          ${st.slot !== null ? `<button class="chip on" data-f="all">✕ ${SLOT_HE[st.slot]}</button>` : ''}
          <span class="t" style="color:#8b95a7;font:400 12px Rubik;align-self:center;white-space:nowrap">${all.length} פריטים</span></div>
        <div class="s3b-grid">${shown.map((it, i) => {
          const e = equippedSlot(it);
          return `<button class="s3b-it ${it.key === st.sel ? 'sel' : ''}" data-k="${it.key}" style="--rc:${RARITY[itemRarity(it)].color}">
            ${e !== null ? '<span class="e">✓</span>' : ''}${(it.at || 0) > seenAt ? '<span class="n">חדש</span>' : ''}
            <img alt="" data-icon="${i}" src="${cachedIcon(it)}"><b>${itemName(it)}</b></button>`;
        }).join('')}</div>
      </div></div>`;
    ui.querySelector('#back').onclick = () => { stop(); back(); };
    ui.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      const it = all.find((x) => x.key === b.dataset.k);
      if (st.slot !== null && fits(it, st.slot)) { equip(it, st.slot <= 1 ? st.slot : null); st.slot = null; }
      st.sel = b.dataset.k; draw();
    }));
    ui.querySelectorAll('[data-slot]').forEach((b) => (b.onclick = () => {
      const s = +b.dataset.slot; st.slot = st.slot === s ? null : s;
      const cur = slotItem(getLoadout(), s); st.sel = items().find((x) => x.key === (cur.type === 'outfit' ? `outfit:${cur.skin}` : `weapon:${cur.weapon}:${cur.skin}`))?.key || st.sel;
      draw();
    }));
    ui.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; st.slot = null; draw(); }));
    ui.querySelectorAll('[data-eq]').forEach((b) => (b.onclick = () => { const v = b.dataset.eq; equip(sel, v === 'x' ? null : +v); draw(); }));
    fillIcons(ui, iconItems);
    setScene(); frameCamera();
  }

  // גרירה לסיבוב
  let dx = null, spin = true, t = 0;
  const down = (e) => { if (e.target.tagName === 'CANVAS' || e.target.classList?.contains('s3b-view')) { dx = e.clientX; spin = false; } };
  const move = (e) => { if (dx !== null) { turn.rotation.y += (e.clientX - dx) * 0.01; dx = e.clientX; } };
  const up = () => { dx = null; };
  const onResize = () => setTimeout(frameCamera, 0);
  addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('resize', onResize);

  function stop() {
    removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('resize', onResize);
    scene.remove(root); disposeTree(root);
    scene.background = saved.bg; camera.clearViewOffset();
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.position.copy(saved.pos); camera.quaternion.copy(saved.q); camera.updateProjectionMatrix();
    style.remove(); view.active = false;
  }

  draw();
  const view = {
    active: true, st, stop, draw,
    update(dt) {
      t += dt;
      if (spin) turn.rotation.y = Math.sin(t * 0.4) * 0.35;
      rig?.anim?.update(dt, { speed: 0 });
      if (itemObj) { itemObj.rotation.y += dt * 0.9; itemObj.position.y = 1.15 + Math.sin(t * 1.6) * 0.04; itemObj.children[0]?.userData.animate?.(t); }
      ring.rotation.y = t * 0.3;
    },
  };
  return view;
}
