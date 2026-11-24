// שליטה: מקלדת+עכבר (pointer lock) ומגע (ג'ויסטיק שמאלי, גרירה ימנית לכיוון, כפתורים).
// API:
//   const c = createControls({ ui, canvas });
//   c.move            -> { x, y } (x ימינה, y קדימה, אורך ≤ 1)
//   c.sprint          -> bool
//   c.fireHeld        -> bool (לחוץ עכשיו)   c.aimHeld -> bool (מקש ימני)
//   c.lookDelta()     -> { x, y } ברדיאנים מאז הקריאה הקודמת (x ימינה, y למעלה)
//   c.take(name)      -> true פעם אחת לכל לחיצה: 'fire' | 'jump' | 'reload' | 'switch' | 'slot1'..'slot3' | 'pause'
//   c.lock()          -> בקשת pointer lock (מחשב), c.locked
//   c.enabled = false -> מתעלם מקלט;  c.dispose()
export const isTouch = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

const CSS = `
.s3c-touch { position:absolute; inset:0; touch-action:none; user-select:none; -webkit-user-select:none; pointer-events:auto; }
.s3c-stick { position:absolute; width:120px; height:120px; margin:-60px 0 0 -60px; border-radius:50%;
  border:2px solid #ffffff40; background:#ffffff12; display:none; pointer-events:none; }
.s3c-knob { position:absolute; left:50%; top:50%; width:52px; height:52px; margin:-26px 0 0 -26px; border-radius:50%; background:#ffffff55; }
.s3c-b { position:absolute; border-radius:50%; border:2px solid #ffffff50; background:#151922aa; color:#fff;
  font:700 13px Rubik, sans-serif; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:2px; pointer-events:none; }
.s3c-b.on { background:#ffb02088; border-color:#ffb020; }
.s3c-b span { font-size:22px; line-height:1; }
`;

export function createControls({ ui, canvas, mouseSens = 0.0022, touchSens = 0.0055 } = {}) {
  const c = {
    move: { x: 0, y: 0 }, sprint: false, fireHeld: false, aimHeld: false, locked: false, enabled: true, touch: isTouch(),
    lookDelta, take, lock, dispose,
  };
  const keys = new Set();
  const events = new Set();
  let lx = 0, ly = 0;
  const off = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); off.push(() => t.removeEventListener(ev, fn, opt)); };
  const fire = (name) => { if (c.enabled) events.add(name); };

  function lookDelta() { const d = { x: lx, y: ly }; lx = ly = 0; return d; }
  function take(name) { if (events.has(name)) { events.delete(name); return true; } return false; }
  function lock() { if (c.touch) return; try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch (_) {} }

  // ---------- מקלדת ----------
  const updateKeys = () => {
    if (c.touch && touchMove.active) return;
    const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    c.move.x = x / l; c.move.y = y / l;
    c.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  };
  on(window, 'keydown', (e) => {
    if (!c.enabled || e.target?.tagName === 'INPUT') return;
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') { fire('jump'); e.preventDefault(); }
    if (e.code === 'KeyR') fire('reload');
    if (e.code === 'KeyQ') fire('switch');
    if (e.code === 'Digit1') fire('slot1');
    if (e.code === 'Digit2') fire('slot2');
    if (e.code === 'Digit3') fire('slot3');
    if (e.code === 'Escape' || e.code === 'KeyP') fire('pause');
    updateKeys();
  });
  on(window, 'keyup', (e) => { keys.delete(e.code); updateKeys(); });
  on(window, 'blur', () => { keys.clear(); c.fireHeld = c.aimHeld = false; updateKeys(); });

  // ---------- עכבר ----------
  on(document, 'pointerlockchange', () => {
    const was = c.locked;
    c.locked = document.pointerLockElement === canvas;
    if (was && !c.locked) { c.fireHeld = c.aimHeld = false; fire('pause'); }
  });
  on(window, 'mousemove', (e) => {
    if (!c.enabled || !c.locked) return;
    lx += e.movementX * mouseSens; ly -= e.movementY * mouseSens;
  });
  on(window, 'mousedown', (e) => {
    if (!c.enabled || c.touch) return;
    if (e.target !== canvas && !e.target?.closest?.('.s3h')) return; // לא על כפתורי תפריט
    if (!c.locked) { lock(); return; } // הלחיצה הראשונה רק נועלת את העכבר
    if (e.button === 0) { c.fireHeld = true; fire('fire'); }
    if (e.button === 2) c.aimHeld = true;
  });
  on(window, 'mouseup', (e) => { if (e.button === 0) c.fireHeld = false; if (e.button === 2) c.aimHeld = false; });
  on(window, 'contextmenu', (e) => { if (c.locked) e.preventDefault(); });

  // ---------- מגע ----------
  const touchMove = { active: false };
  if (c.touch) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); off.push(() => st.remove());
    const layer = document.createElement('div'); layer.className = 's3c-touch';
    layer.innerHTML = `<div class="s3c-stick"><div class="s3c-knob"></div></div>
      <div class="s3c-b" data-b="fire"   style="width:92px;height:92px;inset-inline-start:calc(26px + env(safe-area-inset-right));bottom:120px"><span>💥</span>ירי</div>
      <div class="s3c-b" data-b="jump"   style="width:64px;height:64px;inset-inline-start:calc(130px + env(safe-area-inset-right));bottom:40px"><span>⤒</span>קפיצה</div>
      <div class="s3c-b" data-b="reload" style="width:58px;height:58px;inset-inline-start:calc(26px + env(safe-area-inset-right));bottom:40px"><span>🔄</span>טעינה</div>
      <div class="s3c-b" data-b="switch" style="width:58px;height:58px;inset-inline-start:calc(130px + env(safe-area-inset-right));bottom:122px"><span>🔁</span>החלפה</div>`;
    ui.appendChild(layer); off.push(() => layer.remove());
    const stick = layer.querySelector('.s3c-stick'), knob = layer.querySelector('.s3c-knob');
    const btns = [...layer.querySelectorAll('[data-b]')];
    const R = 52;
    const touches = new Map(); // id -> { kind, x, y, ox, oy }

    const hitBtn = (x, y) => btns.find((b) => {
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return Math.hypot(x - cx, y - cy) < r.width / 2 + 10;
    });
    const setStick = (t) => {
      let dx = t.x - t.ox, dy = t.y - t.oy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      c.move.x = dx / R; c.move.y = -dy / R; c.sprint = l > R * 1.25;
    };
    on(layer, 'touchstart', (e) => {
      e.preventDefault();
      if (!c.enabled) return;
      for (const p of e.changedTouches) {
        const x = p.clientX, y = p.clientY, b = hitBtn(x, y);
        if (b) {
          const k = b.dataset.b; b.classList.add('on');
          touches.set(p.identifier, { kind: k, x, y, el: b });
          if (k === 'fire') { c.fireHeld = true; fire('fire'); } else fire(k);
        } else if (x < innerWidth * 0.42 && !touchMove.active) {
          touchMove.active = true;
          touches.set(p.identifier, { kind: 'move', x, y, ox: x, oy: y });
          stick.style.display = 'block'; stick.style.left = x + 'px'; stick.style.top = y + 'px'; knob.style.transform = '';
        } else touches.set(p.identifier, { kind: 'look', x, y });
      }
    }, { passive: false });
    on(layer, 'touchmove', (e) => {
      e.preventDefault();
      for (const p of e.changedTouches) {
        const t = touches.get(p.identifier); if (!t) continue;
        const dx = p.clientX - t.x, dy = p.clientY - t.y;
        t.x = p.clientX; t.y = p.clientY;
        if (t.kind === 'move') setStick(t);
        else if (t.kind === 'look' || t.kind === 'fire') { lx += dx * touchSens; ly -= dy * touchSens; } // אפשר לכוון תוך כדי ירי
      }
    }, { passive: false });
    const end = (e) => {
      for (const p of e.changedTouches) {
        const t = touches.get(p.identifier); if (!t) continue;
        touches.delete(p.identifier);
        t.el?.classList.remove('on');
        if (t.kind === 'move') { touchMove.active = false; c.move.x = c.move.y = 0; c.sprint = false; stick.style.display = 'none'; }
        if (t.kind === 'fire') c.fireHeld = false;
      }
    };
    on(layer, 'touchend', end); on(layer, 'touchcancel', end);
    c.layer = layer;
  }

  function dispose() {
    off.forEach((f) => f()); off.length = 0;
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    c.enabled = false;
  }
  return c;
}
