// 🕵️ מצב לבד – מרכז העלילות: 4 כרטיסים (בסיס 9, המתחזה, הרוצח בעיר הגשם, ארמון הזהב) עם טיזר, קושי והתקדמות.
// startSolo(scene, camera, ui, back, renderer) → { active, update(dt) }
// עלילות נטענות בעצלות (import דינמי). אם קובץ חסר או שאין לו את הפונקציה → "בקרוב".
// התקדמות: localStorage['s3d.story.v1'][id] = { done, best (כוכבים 0–3), pct, endings:[], at } – כל עלילה כותבת דרך saveStory ב-storykit.js.
import * as THREE from 'three';
import { getStory } from './storykit.js';

const STORIES = [
  { id: 'base9', icon: '👻', he: 'בסיס 9', genre: 'אימה', diff: 3, color: '#5fd38a', file: './base9.js', fn: 'startBase9',
    teaser: 'המטוס מתרסק בלילה ליד בסיס סודי נטוש. החיילים הפכו לצללים שזזים בחושך, ורק אור הפנס עוצר אותם.', endings: 1 },
  { id: 'imposter', icon: '👹', he: 'המתחזה', genre: 'מסתורין', diff: 2, color: '#ff6a5a', file: './imposter.js', fn: 'startImposter',
    teaser: 'מפלצת מתחפשת לאחד מתושבי העיר. יש לך שעה אחת כדי לגלות מי זה. יריתם במישהו אחר? הפסדתם.', endings: 1 },
  { id: 'detective', icon: '🔍', he: 'הרוצח בעיר הגשם', genre: 'בלש', diff: 2, color: '#36e2ff', file: './detective.js', fn: 'startDetective',
    teaser: 'ממציא מפורסם נעלם בלילה גשום. סרוק זירות, אסוף טביעות, חקור 4 חשודים, ותגלה מה באמת קרה.', endings: 2 },
  { id: 'heist', icon: '👑', he: 'ארמון הזהב', genre: 'שוד והתגנבות', diff: 3, color: '#ffc83a', file: './heist.js', fn: 'startHeist',
    teaser: 'מתגנבים לארמון בין שומרים ומצלמות ופורצים כספות. בכספת האחרונה מחכה סוד שמשנה הכול. לברוח עם הזהב, או לעצור את המלך?', endings: 2 },
];
const DIFF = ['', 'קל', 'בינוני', 'קשה'];
const LOADERS = {
  base9: () => import('./base9.js'), imposter: () => import('./imposter.js'),
  detective: () => import('./detective.js'), heist: () => import('./heist.js'),
};

const CSS = `
.so { position:absolute; inset:0; overflow:auto; padding:max(14px, env(safe-area-inset-top)) 14px max(16px, env(safe-area-inset-bottom));
  background:radial-gradient(ellipse at 50% 0%, #1c2333cc 0%, #0b0d12ee 70%); font-family:Rubik,sans-serif; color:#eef2f8; pointer-events:auto; }
.so * { box-sizing:border-box; }
.so-head { display:flex; align-items:center; justify-content:space-between; gap:10px; max-width:980px; margin:0 auto 12px; }
.so-head h1 { margin:0; font-size:clamp(24px,6vw,36px); font-weight:900; }
.so-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr)); gap:12px; max-width:980px; margin:0 auto; }
.so-card { position:relative; background:#151922ee; border:1px solid #2a3142; border-radius:18px; padding:14px; display:flex; flex-direction:column; gap:8px;
  overflow:hidden; min-height:250px; }
.so-card::before { content:''; position:absolute; inset:0 0 auto 0; height:4px; background:var(--c); }
.so-card .ic { font-size:44px; line-height:1; }
.so-card h2 { margin:0; font-size:20px; font-weight:900; }
.so-card .g { color:#8b95a7; font-size:12px; }
.so-card p { margin:0; font-size:13.5px; line-height:1.55; color:#cfd6e2; flex:1; }
.so-meta { display:flex; gap:6px; flex-wrap:wrap; font-size:12px; }
.so-meta span { background:#0b0d12; border-radius:999px; padding:3px 9px; }
.so-bar { height:6px; background:#0b0d12; border-radius:4px; overflow:hidden; } .so-bar i { display:block; height:100%; background:var(--c); }
.so-play { padding:11px; border-radius:12px; border:1px solid var(--c); background:#0b0d12; color:#fff; font:800 16px Rubik; cursor:pointer; }
.so-play:hover { background:#1b2030; }
.so-play[disabled] { border-color:#2a3142; color:#8b95a7; cursor:default; }
.so-soon { position:absolute; top:12px; left:12px; background:#2a3142; color:#cfd6e2; font-size:12px; font-weight:800; padding:3px 9px; border-radius:999px; }
.so-err { color:#ff8a6e; font-size:12px; text-align:center; }
`;

export function startSolo(scene, camera, ui, back, renderer) {
  let child = null, el = null;
  const avail = {};          // id → true / false / undefined (נבדק)
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  // רקע עדין: חלקיקים מסתובבים מאחורי התפריט
  const saved = { bg: scene.background, pos: camera.position.clone(), q: camera.quaternion.clone() };
  const bgG = new THREE.Group(); scene.add(bgG);
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const r = 4 + Math.random() * 10, a = Math.random() * 7, y = (Math.random() - 0.5) * 8; pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffb020', size: 0.06, transparent: true, opacity: 0.7 }));
  bgG.add(pts);

  const H = {
    active: true, avail, get child() { return child; },
    open, hub, exit,
    update(dt) {
      if (child) { if (child.active) child.update(dt); else { child = null; hub(); } return; }
      bgG.rotation.y += dt * 0.05;
      camera.position.set(0, 0, 9); camera.lookAt(0, 0, 0);
    },
  };

  function probe(s) {
    if (avail[s.id] !== undefined) return;
    LOADERS[s.id]().then((m) => { avail[s.id] = typeof m[s.fn] === 'function'; }).catch(() => { avail[s.id] = false; }).finally(() => { if (!child && H.active) hub(); });
  }

  function card(s) {
    const p = getStory(s.id) || {};
    const ok = avail[s.id], pct = p.done ? 100 : Math.min(100, p.pct || 0);
    const stars = p.best ? '⭐'.repeat(p.best) + '☆'.repeat(Math.max(0, 3 - p.best)) : '';
    const ends = p.endings?.length ? `🏁 ${Math.min(p.endings.length, s.endings)}/${s.endings} סופים` : '';
    return `<div class="so-card" style="--c:${s.color}" data-id="${s.id}">
      ${ok === false ? '<span class="so-soon">בקרוב</span>' : ''}
      <div class="ic">${s.icon}</div>
      <div><h2>${s.he}</h2><div class="g">${s.genre}</div></div>
      <p>${s.teaser}</p>
      <div class="so-meta"><span>קושי: ${'●'.repeat(s.diff)}${'○'.repeat(3 - s.diff)} ${DIFF[s.diff]}</span>${p.done ? '<span>✔ הושלם</span>' : ''}${stars ? `<span>${stars}</span>` : ''}${ends ? `<span>${ends}</span>` : ''}</div>
      <div class="so-bar"><i style="width:${pct}%"></i></div>
      <button class="so-play" data-play="${s.id}" ${ok ? '' : 'disabled'}>${ok === undefined ? '⏳ טוען…' : ok ? (pct > 0 ? '▶️ המשך / שחק שוב' : '▶️ שחק') : '🔒 בקרוב'}</button>
    </div>`;
  }

  function hub(err = '') {
    if (!H.active) return;
    if (!el) { el = document.createElement('div'); el.className = 'so'; }
    ui.innerHTML = ''; ui.appendChild(el); bgG.visible = true;
    scene.background = new THREE.Color('#0b0d12');
    el.innerHTML = `<div class="so-head"><h1>🕵️ מצב לבד</h1><button class="chip" data-k="back">→ תפריט</button></div>
      ${err ? `<div class="so-err">${err}</div>` : ''}
      <div class="so-grid">${STORIES.map(card).join('')}</div>`;
    el.querySelector('[data-k=back]').onclick = exit;
    el.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => open(b.dataset.play)));
    STORIES.forEach(probe);
  }

  async function open(id) {
    const s = STORIES.find((x) => x.id === id);
    let mod = null;
    try { mod = await LOADERS[id](); } catch (_) { mod = null; }
    const fn = mod?.[s.fn];
    if (typeof fn !== 'function') { avail[id] = false; return hub(`${s.icon} ${s.he} – בקרוב`); }
    bgG.visible = false; scene.background = saved.bg;
    ui.innerHTML = '';                 // מנקה את תפריט העלילות לפני שהמשחק מתחיל
    try {
      child = fn(scene, camera, ui, () => { child = null; hub(); }, renderer);
    } catch (e) {
      console.error(e); child = null; hub(`שגיאה בטעינת ${s.he}`);
    }
  }

  function exit() {
    H.active = false; child = null;
    scene.remove(bgG); pg.dispose(); pts.material.dispose(); style.remove(); el?.remove();
    scene.background = saved.bg; camera.position.copy(saved.pos); camera.quaternion.copy(saved.q);
    back();
  }

  hub();
  return H;
}
