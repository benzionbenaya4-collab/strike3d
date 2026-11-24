// HUD: כוונת, תחמושת, חיים, סמני פגיעה, הודעות. עברית, RTL.
// API:
//   const hud = createHud(ui);
//   hud.setAmmo(cur, mag, reloading)   // mag=0 → נשק קר (∞)
//   hud.setHp(hp, max=100)
//   hud.setWeapons([{ he, key }], activeIndex)
//   hud.setTop(html)                    // משימה / שעון
//   hud.hit({ head, kill })             // סמן פגיעה
//   hud.hurt(angle)                     // נפגעת: זווית מקור ביחס לכיוון המבט (רדיאנים, 0 = מלפנים)
//   hud.toast(text, ms)
//   hud.spread(px)                      // פתיחת הכוונת
//   hud.setReticle(weaponId)            // כוונת שונה לכל נשק (סכין = בלי כוונת)
//   hud.scope(bool)                     // מסך צלף בזמן כיוון
//   hud.show(bool)  hud.dispose()
const CSS = `
.s3h { position:absolute; inset:0; pointer-events:none !important; font-family:Rubik, sans-serif; color:#eef2f8; direction:rtl; }
.s3h-x { position:absolute; left:50%; top:50%; width:0; height:0; }
.s3h-x i { position:absolute; background:#fff; box-shadow:0 0 2px #000; }
.s3h-x .d { width:4px; height:4px; left:-2px; top:-2px; border-radius:50%; }
.s3h-x .h { width:10px; height:2px; top:-1px; } .s3h-x .v { width:2px; height:10px; left:-1px; }
.s3h-x .ring { position:absolute; border:2px solid #fff; border-radius:50%; box-shadow:0 0 2px #000, inset 0 0 2px #000; display:none; }
.s3h-x.r-knife i, .s3h-x.r-knife .ring { display:none; }
.s3h-x.r-pistol .h { width:7px; } .s3h-x.r-pistol .v { height:7px; }
.s3h-x.r-rifle .d { display:none; } .s3h-x.r-rifle .h { width:14px; } .s3h-x.r-rifle .v { height:14px; }
.s3h-x.r-smg .ring { display:block; } .s3h-x.r-smg .h, .s3h-x.r-smg .v { width:6px; height:2px; } .s3h-x.r-smg .v { width:2px; height:6px; }
.s3h-x.r-shotgun .ring { display:block; border-style:dashed; } .s3h-x.r-shotgun .h, .s3h-x.r-shotgun .v { display:none; }
.s3h-x.r-sniper .h, .s3h-x.r-sniper .v { display:none; } .s3h-x.r-sniper .d { width:3px; height:3px; left:-1.5px; top:-1.5px; }
.s3h-x.r-plasma { transform:rotate(45deg); } .s3h-x.r-plasma i { background:#7df9ff; box-shadow:0 0 6px #22f0ff; } .s3h-x.r-plasma .ring { display:block; border-color:#7df9ff; }
.s3h-x.r-grenade .h, .s3h-x.r-grenade .v { display:none; } .s3h-x.r-grenade .ring { display:block; border-width:1px; }
.s3h-scope { position:absolute; inset:0; opacity:0; transition:opacity .15s; background:radial-gradient(circle at center, transparent 0, transparent min(34vw,34vh), #000 calc(min(34vw,34vh) + 2px)); }
.s3h-scope::before, .s3h-scope::after { content:""; position:absolute; background:#000c; }
.s3h-scope::before { left:0; right:0; top:50%; height:1.5px; } .s3h-scope::after { top:0; bottom:0; left:50%; width:1.5px; }
.s3h-scope.on { opacity:1; }
.s3h-hm { position:absolute; left:50%; top:50%; width:0; height:0; opacity:0; transition:opacity .25s; }
.s3h-hm i { position:absolute; width:12px; height:3px; background:#fff; left:-6px; top:-1.5px; box-shadow:0 0 3px #000; }
.s3h-hm.head i { background:#ff3b3b; } .s3h-hm.kill i { width:16px; left:-8px; }
.s3h-box { position:absolute; background:#151922b8; border:1px solid #2a3142; border-radius:12px; padding:8px 12px; }
.s3h-ammo { bottom:max(14px, env(safe-area-inset-bottom)); left:16px; text-align:left; direction:ltr; min-width:110px; }
.s3h-ammo b { font-size:34px; font-weight:900; } .s3h-ammo small { color:#8b95a7; font-size:16px; }
.s3h-ammo .w { direction:rtl; font-size:13px; color:#ffb020; text-align:left; }
.s3h-hp { bottom:max(14px, env(safe-area-inset-bottom)); right:16px; width:min(220px, 40vw); }
.s3h-hp .s3h-bar { height:10px; background:#0b0d12; border-radius:6px; overflow:hidden; margin-top:4px; }
.s3h-hp .s3h-bar i { display:block; height:100%; width:100%; background:linear-gradient(90deg,#3ddc84,#9be15d); transition:width .15s; }
.s3h-hp .s3h-bar i.low { background:linear-gradient(90deg,#ff3b3b,#ff7a3b); }
.s3h-top { top:max(12px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%); text-align:center; font-weight:700; font-size:15px; white-space:nowrap; }
.s3h-slots { position:absolute; bottom:max(84px, calc(env(safe-area-inset-bottom) + 70px)); left:16px; display:flex; gap:6px; direction:ltr; }
.s3h-slots span { background:#151922b8; border:1px solid #2a3142; border-radius:8px; padding:3px 8px; font-size:12px; color:#8b95a7; }
.s3h-slots span.on { border-color:#ffb020; color:#ffb020; }
.s3h-toast { position:absolute; top:28%; left:50%; transform:translateX(-50%); font-size:22px; font-weight:900; text-shadow:0 2px 6px #000;
  opacity:0; transition:opacity .2s; white-space:nowrap; }
.s3h-vig { position:absolute; inset:0; opacity:0; transition:opacity .35s; background:radial-gradient(ellipse at center, transparent 55%, #ff1e1e70 100%); }
.s3h-dir { position:absolute; left:50%; top:50%; width:0; height:0; opacity:0; transition:opacity .6s; }
.s3h-dir i { position:absolute; left:-30px; top:-140px; width:60px; height:14px; border-radius:50%; background:#ff3b3bcc; filter:blur(1px); }
@media (pointer: coarse) { .s3h-ammo { bottom:auto; top:max(54px, env(safe-area-inset-top)); } .s3h-hp { bottom:auto; top:max(54px, env(safe-area-inset-top)); }
  .s3h-slots { bottom:auto; top:max(124px, env(safe-area-inset-top)); } }
`;

export function createHud(ui) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.className = 's3h';
  el.innerHTML = `
    <div class="s3h-vig"></div>
    <div class="s3h-dir"><i></i></div>
    <div class="s3h-scope"></div>
    <div class="s3h-x"><b class="ring"></b><i class="d"></i><i class="h" data-p="l"></i><i class="h" data-p="r"></i><i class="v" data-p="u"></i><i class="v" data-p="b"></i></div>
    <div class="s3h-hm"><i style="transform:rotate(45deg) translateX(12px)"></i><i style="transform:rotate(135deg) translateX(12px)"></i>
      <i style="transform:rotate(225deg) translateX(12px)"></i><i style="transform:rotate(315deg) translateX(12px)"></i></div>
    <div class="s3h-box s3h-top"></div>
    <div class="s3h-slots"></div>
    <div class="s3h-box s3h-ammo"><div class="w"></div><b>0</b> <small>/ 0</small></div>
    <div class="s3h-box s3h-hp"><div style="display:flex;justify-content:space-between;font-size:13px"><span>❤️ חיים</span><b>100</b></div><div class="s3h-bar"><i></i></div></div>
    <div class="s3h-toast"></div>`;
  ui.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const X = { l: $('[data-p=l]'), r: $('[data-p=r]'), u: $('[data-p=u]'), b: $('[data-p=b]') };
  const xh = $('.s3h-x'), ring = $('.s3h-x .ring'), scopeEl = $('.s3h-scope');
  const hm = $('.s3h-hm'), vig = $('.s3h-vig'), dir = $('.s3h-dir'), toastEl = $('.s3h-toast');
  const ammoB = $('.s3h-ammo b'), ammoS = $('.s3h-ammo small'), ammoW = $('.s3h-ammo .w');
  const hpB = $('.s3h-hp b'), hpBar = $('.s3h-hp .s3h-bar i'), top = $('.s3h-top'), slots = $('.s3h-slots');
  let hmT = 0, toastT = 0, vigT = 0, lastSpread = -1, last = {};
  const tm = (fn, ms, prev) => { clearTimeout(prev); return setTimeout(fn, ms); };

  const hud = {
    el,
    setAmmo(cur, mag, reloading = false) {
      const k = `${cur}|${mag}|${reloading}`; if (last.ammo === k) return; last.ammo = k;
      ammoB.textContent = mag ? (reloading ? '…' : cur) : '∞';
      ammoS.textContent = mag ? (reloading ? 'טוען' : `/ ${mag}`) : '';
      ammoB.style.color = mag && cur <= Math.ceil(mag * 0.2) && !reloading ? '#ff5a3b' : '';
    },
    setHp(hp, max = 100) {
      hp = Math.max(0, Math.round(hp)); if (last.hp === hp) return; last.hp = hp;
      hpB.textContent = hp; hpBar.style.width = (100 * hp / max) + '%'; hpBar.classList.toggle('low', hp < max * 0.35);
    },
    setWeapons(list, active) {
      const k = list.map((w) => w.he).join() + active; if (last.w === k) return; last.w = k;
      slots.innerHTML = list.map((w, i) => `<span class="${i === active ? 'on' : ''}">${i + 1} ${w.he}</span>`).join('');
      ammoW.textContent = list[active]?.he || '';
    },
    setTop(html) { if (last.top === html) return; last.top = html; top.innerHTML = html; top.style.display = html ? '' : 'none'; },
    hit({ head = false, kill = false } = {}) {
      hm.className = 's3h-hm' + (head ? ' head' : '') + (kill ? ' kill' : '');
      hm.style.transition = 'none'; hm.style.opacity = 1; void hm.offsetWidth; hm.style.transition = '';
      hmT = tm(() => (hm.style.opacity = 0), kill ? 260 : 120, hmT);
    },
    hurt(angle = 0) {
      vig.style.transition = 'none'; vig.style.opacity = 1; void vig.offsetWidth; vig.style.transition = '';
      dir.style.transform = `rotate(${angle}rad)`; dir.style.transition = 'none'; dir.style.opacity = 1; void dir.offsetWidth; dir.style.transition = '';
      vigT = tm(() => { vig.style.opacity = 0; dir.style.opacity = 0; }, 160, vigT);
    },
    toast(text, ms = 1200) { toastEl.textContent = text; toastEl.style.opacity = 1; toastT = tm(() => (toastEl.style.opacity = 0), ms, toastT); },
    spread(px) {
      px = Math.round(px); if (px === lastSpread) return; lastSpread = px;
      const g = 4 + px;
      const r = g + 8; ring.style.width = ring.style.height = 2 * r + 'px'; ring.style.left = ring.style.top = -r - 2 + 'px';
      X.l.style.left = -(g + 10) + 'px'; X.r.style.left = g + 'px'; X.u.style.top = -(g + 10) + 'px'; X.b.style.top = g + 'px';
    },
    setReticle(id) { if (last.ret === id) return; last.ret = id; xh.className = 's3h-x r-' + (id || 'pistol'); },
    scope(on) { on = !!on; if (last.scope === on) return; last.scope = on; scopeEl.classList.toggle('on', on); xh.style.opacity = on ? 0.9 : ''; },
    show(v) { el.style.display = v ? '' : 'none'; },
    dispose() { clearTimeout(hmT); clearTimeout(toastT); clearTimeout(vigT); el.remove(); st.remove(); },
  };
  hud.spread(0);
  return hud;
}
