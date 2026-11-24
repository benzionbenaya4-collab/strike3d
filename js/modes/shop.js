// "📦 חנות": 3 תיבות (רגילה 100 / עלית 500 / מיתית 1500) עם סיכויים גלויים, פתיחה בגלגלת, כפתור לתיק.
// הפרס נקבע לפני הסיבוב: נדירות לפי משקלי התיבה → פריט אקראי מאותה נדירות. כפול = החזר מטבעות חלקי.
// ?dev בכתובת → כפתור מטבעות חינם לבדיקה.
import { WEAPONS, RARITY } from '../data/weapons.js';
import { SKINS } from '../data/skins.js';
import { getWallet, spend, addCoins, addItem, equip, onChange, itemRarity, RARITY_ORDER } from '../store.js';
import { openSpinner, unlockAudio } from '../ui/spinner.js';
import { startBag } from '../ui/bag.js';
import { startCoinDemo } from '../world/coins.js';

/** משקלים לכל תיבה (רגילה = המשקלים המקוריים של RARITY) */
export const CHESTS = [
  { id: 'basic',  he: 'תיבה רגילה', price: 100,  color: '#8f6a3e', lid: '#a97d4a', band: '#c9ced6',
    odds: Object.fromEntries(RARITY_ORDER.map((r) => [r, RARITY[r].weight])) },
  { id: 'elite',  he: 'תיבה עלית',  price: 500,  color: '#23407a', lid: '#2f56a3', band: '#3d8bff',
    odds: { common: 25, rare: 38, epic: 25, legendary: 10, mythic: 2 } },
  { id: 'mythic', he: 'תיבה מיתית', price: 1500, color: '#5a3a08', lid: '#7c520c', band: '#ffc531',
    odds: { common: 0, rare: 15, epic: 40, legendary: 33, mythic: 12 } },
];
const DUP_REFUND = 0.25;

/** כל מה שאפשר לקבל: כל נשק (חוץ מרימון) בכל סקין + סקיני דמות */
export const POOL = [
  ...WEAPONS.filter((w) => w.id !== 'grenade').flatMap((w) => SKINS.map((s) => ({ type: 'weapon', weapon: w.id, skin: s.id }))),
  ...SKINS.map((s) => ({ type: 'outfit', skin: s.id })),
];
const BY_RARITY = Object.fromEntries(RARITY_ORDER.map((r) => [r, POOL.filter((it) => itemRarity(it) === r)]));

const pickWeighted = (odds, rand = Math.random) => {
  const tot = RARITY_ORDER.reduce((s, r) => s + (BY_RARITY[r].length ? odds[r] || 0 : 0), 0);
  let x = rand() * tot;
  for (const r of RARITY_ORDER) { const w = BY_RARITY[r].length ? odds[r] || 0 : 0; if ((x -= w) < 0) return r; }
  return RARITY_ORDER.find((r) => odds[r] > 0);
};
/** הגרלת פרס מתיבה (לפני שהגלגלת מתחילה) */
export function rollChest(chest, rand = Math.random) {
  const r = pickWeighted(chest.odds, rand), list = BY_RARITY[r];
  return { ...list[Math.floor(rand() * list.length)] };
}
const pct = (chest) => {
  const tot = RARITY_ORDER.reduce((s, r) => s + (chest.odds[r] || 0), 0);
  return RARITY_ORDER.map((r) => [r, ((chest.odds[r] || 0) / tot) * 100]);
};

const CSS = `
.s3h { position:absolute; inset:0; overflow:auto; background:radial-gradient(ellipse at 50% 20%, #1c2333 0%, #0b0d12 70%);
  display:flex; flex-direction:column; align-items:center; padding:12px 14px max(16px, env(safe-area-inset-bottom)); gap:14px; }
.s3h-top { width:min(1000px,100%); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.s3h-top .sp { flex:1; }
.s3h-coins { font:900 20px Rubik; color:#ffd54a; padding:6px 14px; border-radius:999px; background:#151922; border:1px solid #3a3220; }
.s3h h2 { margin:4px 0 0; font:900 34px Rubik; }
.s3h-grid { width:min(1000px,100%); display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
@media (max-width:760px) { .s3h-grid { grid-template-columns:1fr; } }
.s3h-chest { background:#151922ee; border:1px solid #2a3142; border-radius:18px; padding:14px; display:flex; flex-direction:column; gap:10px; align-items:center;
  box-shadow:0 0 0 1px #0000, 0 10px 30px -12px var(--band); }
.s3h-chest h3 { margin:0; font:900 22px Rubik; color:var(--band); }
.s3h-box { position:relative; width:130px; height:104px; margin:6px 0 2px; animation:s3h-bob 2.6s ease-in-out infinite; filter:drop-shadow(0 8px 18px var(--band)); }
.s3h-box .b { position:absolute; left:0; right:0; bottom:0; height:62px; border-radius:6px 6px 10px 10px; background:linear-gradient(180deg,var(--c),#0007),var(--c); border:3px solid #0006; }
.s3h-box .l { position:absolute; left:-4px; right:-4px; top:6px; height:42px; border-radius:40px 40px 6px 6px; background:linear-gradient(180deg,var(--lid),var(--c)); border:3px solid #0006; }
.s3h-box .v { position:absolute; top:6px; bottom:0; left:50%; width:16px; margin-left:-8px; background:var(--band); opacity:.9; border-radius:3px; }
.s3h-box .k { position:absolute; top:40px; left:50%; width:26px; height:26px; margin-left:-13px; background:var(--band); border-radius:6px; border:3px solid #0007; box-shadow:0 0 14px var(--band); }
.s3h-box .h { position:absolute; left:14px; right:14px; bottom:22px; height:6px; background:var(--band); opacity:.55; border-radius:3px; }
@keyframes s3h-bob { 50% { transform:translateY(-6px) rotate(-1.5deg); } }
.s3h-odds { width:100%; display:flex; flex-direction:column; gap:4px; font:400 13px Rubik; }
.s3h-odd { display:grid; grid-template-columns:54px 1fr 46px; gap:6px; align-items:center; }
.s3h-odd .bar { position:static; height:8px; padding:0; border-radius:4px; background:#0b0d12; overflow:hidden; display:block; }
.s3h-odd .bar i { display:block; height:100%; border-radius:4px; }
.s3h-odd .p { text-align:left; direction:ltr; color:#c7cfdb; }
.s3h-buy { width:100%; justify-content:center !important; gap:8px; font-size:20px !important; }
.s3h-buy[disabled] { opacity:.45; cursor:not-allowed; }
.s3h-foot { width:min(1000px,100%); color:#8b95a7; font:400 12px Rubik; text-align:center; line-height:1.7; }
.s3h-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#151922; border:1px solid var(--acc); color:var(--fg);
  padding:10px 16px; border-radius:12px; font:700 15px Rubik; z-index:30; animation:s3h-t 2.4s forwards; pointer-events:none; }
@keyframes s3h-t { 0% { opacity:0; transform:translate(-50%,10px); } 10%,80% { opacity:1; transform:translate(-50%,0); } 100% { opacity:0; } }
`;

export function startShop(scene, camera, ui, back) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const dev = (() => { try { return new URLSearchParams(location.search).has('dev'); } catch (_) { return false; } })();
  let sub = null, spinner = null;

  const toast = (msg) => { const t = document.createElement('div'); t.className = 's3h-toast'; t.textContent = msg; ui.appendChild(t); setTimeout(() => t.remove(), 2500); };

  function draw() {
    const { coins } = getWallet();
    ui.innerHTML = `<div class="s3h">
      <div class="s3h-top"><button class="chip" id="back">→ חזרה</button><span class="sp"></span>
        <button class="chip" id="coinsdemo">🪙 מטבעות במפה</button>
        <button class="chip" id="bag">🎒 תיק</button>
        ${dev ? '<button class="chip" id="free" style="border-color:#3ddc84;color:#3ddc84">🧪 +1000 (dev)</button>' : ''}
        <span class="s3h-coins" id="coins">🪙 ${coins}</span></div>
      <h2>📦 חנות</h2>
      <div class="s3h-grid">${CHESTS.map((c) => `<div class="s3h-chest" style="--band:${c.band};--c:${c.color};--lid:${c.lid}">
        <h3>${c.he}</h3>
        <div class="s3h-box"><div class="b"></div><div class="h"></div><div class="l"></div><div class="v"></div><div class="k"></div></div>
        <div class="s3h-odds">${pct(c).map(([r, p]) => `<div class="s3h-odd"><span style="color:${RARITY[r].color}">${RARITY[r].he}</span>
          <span class="bar"><i style="width:${p}%;background:${RARITY[r].color}"></i></span><span class="p">${p < 1 && p > 0 ? p.toFixed(1) : Math.round(p)}%</span></div>`).join('')}</div>
        <button class="btn s3h-buy" data-chest="${c.id}" ${coins < c.price ? 'disabled' : ''}>פתח · 🪙 ${c.price}</button>
      </div>`).join('')}</div>
      <div class="s3h-foot">אוספים מטבעות במפה, בקרב ובסוף אימון. פריט שכבר יש לך מחזיר ${Math.round(DUP_REFUND * 100)}% ממחיר התיבה.<br>
        אפשר לקבל: ${POOL.length} פריטים – נשקים בסקינים וסקינים לדמות.</div>
    </div>`;
    ui.querySelector('#back').onclick = () => { stop(); back(); };
    ui.querySelector('#bag').onclick = openBag;
    ui.querySelector('#coinsdemo').onclick = () => {
      ui.innerHTML = '';
      sub = startCoinDemo(scene, camera, ui, () => { sub = null; draw(); });
    };
    if (dev) ui.querySelector('#free').onclick = () => { addCoins(1000, 'dev'); draw(); };
    ui.querySelectorAll('[data-chest]').forEach((b) => (b.onclick = () => open(CHESTS.find((c) => c.id === b.dataset.chest))));
  }

  function openBag(focusKey) {
    ui.innerHTML = '';
    sub = startBag(scene, camera, ui, () => { sub = null; draw(); }, { focus: typeof focusKey === 'string' ? focusKey : null });
  }

  function open(chest) {
    unlockAudio(); // מתוך הקליק – מותר להפעיל צליל
    if (spinner || !spend(chest.price)) { if (!spinner) toast('אין מספיק מטבעות'); return; }
    const prize = rollChest(chest);
    const { item, dup } = addItem(prize);
    let dupNote = '';
    if (dup) { const back = Math.round(chest.price * DUP_REFUND); addCoins(back, 'dup'); dupNote = `כבר יש לך את זה · הוחזרו 🪙 ${back}`; }
    draw();
    spinner = openSpinner({
      host: ui, prize: item, filler: () => rollChest(chest), title: `📦 ${chest.he}`, dupNote,
      onEquip: (it) => { spinner = null; equip(it); toast('✅ מצויד!'); openBag(it.key); },
      onKeep: () => { spinner = null; toast('🎒 נשמר בתיק'); draw(); },
    });
    view.spinner = spinner;
  }

  const off = onChange(() => { const el = ui.querySelector('#coins'); if (el) el.textContent = `🪙 ${getWallet().coins}`; });
  function stop() { off(); spinner?.close(); spinner = null; sub?.stop?.(); sub = null; style.remove(); view.active = false; }

  draw();
  const view = {
    active: true, chests: CHESTS, pool: POOL, rollChest, open, openBag, stop, spinner: null,
    get sub() { return sub; },
    update(dt) { if (sub?.active) sub.update(dt); },
  };
  return view;
}
