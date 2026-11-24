// פרופיל שחקן ב-localStorage: מטבעות, מלאי (נשק+סקין, סקיני דמות), ציוד (2 נשקים + סכין + סקין דמות).
// כל גישה ל-localStorage בתוך try/catch – בלי אחסון המשחק ממשיך לעבוד בזיכרון.
// API: getWallet / addCoins / spend / addItem / equip (+ getProfile, getLoadout, owns, itemKey, onChange).
import { weapon as W, RARITY } from './data/weapons.js';
import { skin as S } from './data/skins.js';

const KEY = 's3d.profile.v1';
const START_COINS = 150;
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** פריט: { type:'weapon', weapon, skin } (נשק בסקין) או { type:'outfit', skin } (סקין דמות) */
export const itemKey = (it) => (it.type === 'outfit' ? `outfit:${it.skin}` : `weapon:${it.weapon}:${it.skin}`);
const rank = (r) => RARITY_ORDER.indexOf(r);
/** נדירות פריט: הגבוהה מבין הנשק והסקין (סקין דמות – לפי הסקין) */
export function itemRarity(it) {
  const s = S(it.skin).rarity;
  if (it.type === 'outfit') return s;
  const w = W(it.weapon)?.rarity || 'common';
  return rank(w) > rank(s) ? w : s;
}
export function itemName(it) {
  const s = S(it.skin).he;
  return it.type === 'outfit' ? `דמות · ${s}` : `${W(it.weapon)?.he || it.weapon} · ${s}`;
}
export const rarityColor = (it) => RARITY[itemRarity(it)].color;

const DEFAULT_ITEMS = [
  { type: 'weapon', weapon: 'knife', skin: 'default' },
  { type: 'weapon', weapon: 'pistol', skin: 'default' },
  { type: 'weapon', weapon: 'rifle', skin: 'default' },
  { type: 'outfit', skin: 'default' },
];
const fresh = () => ({
  v: 1, coins: START_COINS, earned: 0,
  items: DEFAULT_ITEMS.map((it) => ({ ...it, key: itemKey(it), rarity: itemRarity(it), at: 0 })),
  loadout: { guns: [{ id: 'pistol', skin: 'default' }, { id: 'rifle', skin: 'default' }], knife: 'default', outfit: 'default' },
});

let P = null;
const subs = new Set();

function valid(p) {
  return p && typeof p === 'object' && Number.isFinite(p.coins) && Array.isArray(p.items) && p.loadout && Array.isArray(p.loadout.guns);
}
function load() {
  if (P) return P;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    P = valid(raw) ? raw : fresh();
  } catch (_) { P = fresh(); }
  // ודא שפריטי הבסיס תמיד קיימים
  for (const it of DEFAULT_ITEMS) if (!P.items.some((x) => x.key === itemKey(it))) P.items.push({ ...it, key: itemKey(it), rarity: itemRarity(it), at: 0 });
  while (P.loadout.guns.length < 2) P.loadout.guns.push({ id: 'pistol', skin: 'default' });
  return P;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) {}
  for (const f of subs) { try { f(P); } catch (_) {} }
}

/** עדכון מכל הכרטיסיות: אם פרופיל השתנה בכרטיסייה אחרת */
try { addEventListener('storage', (e) => { if (e.key === KEY) { P = null; load(); for (const f of subs) { try { f(P); } catch (_) {} } } }); } catch (_) {}

export const getProfile = () => load();
export const getWallet = () => ({ coins: load().coins, earned: load().earned || 0 });
export const getLoadout = () => load().loadout;
export const owns = (it) => load().items.some((x) => x.key === itemKey(it));
/** מאזין לשינויים. מחזיר פונקציית ביטול. */
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }

/** הוספת מטבעות (מטבע במפה, סוף אימון, קרב). מחזיר את היתרה. */
export function addCoins(n, _reason = '') {
  const p = load(); n = Math.floor(Number(n) || 0);
  if (n <= 0) return p.coins;
  p.coins += n; p.earned = (p.earned || 0) + n; save();
  return p.coins;
}
/** הורדת מטבעות. false אם אין מספיק (ואז לא יורד כלום). */
export function spend(n) {
  const p = load(); n = Math.floor(Number(n) || 0);
  if (n < 0 || p.coins < n) return false;
  p.coins -= n; save(); return true;
}
/** הוספת פריט לתיק. מחזיר { item, dup } – dup=true אם כבר היה (לא נוסף שוב). */
export function addItem(it) {
  const p = load(); const key = itemKey(it);
  const had = p.items.find((x) => x.key === key);
  if (had) return { item: had, dup: true };
  const item = { type: it.type, skin: it.skin, ...(it.type === 'weapon' ? { weapon: it.weapon } : {}), key, rarity: itemRarity(it), at: Date.now() };
  p.items.push(item); save();
  return { item, dup: false };
}

/**
 * ציוד פריט. slot (לנשקי ירי): 0 / 1. בלי slot: אם אותו נשק כבר באחד הסלוטים – מחליף שם את הסקין,
 * אחרת נכנס לסלוט 1 (השני). סכין → סלוט הסכין, outfit → סקין הדמות. מחזיר את הציוד או null אם הפריט לא בתיק.
 */
export function equip(it, slot = null) {
  const p = load();
  if (!p.items.some((x) => x.key === itemKey(it))) return null;
  const L = p.loadout;
  if (it.type === 'outfit') L.outfit = it.skin;
  else if (it.weapon === 'knife') L.knife = it.skin;
  else {
    let i = slot;
    if (i !== 0 && i !== 1) { i = L.guns.findIndex((g) => g.id === it.weapon); if (i < 0) i = 1; }
    const other = L.guns[1 - i];
    if (other.id === it.weapon) L.guns[1 - i] = { ...L.guns[i] }; // אותו נשק בשני הסלוטים → החלפה
    L.guns[i] = { id: it.weapon, skin: it.skin };
  }
  save(); return L;
}
/** האם הפריט מצויד כרגע (ובאיזה סלוט) */
export function equippedSlot(it) {
  const L = load().loadout;
  if (it.type === 'outfit') return L.outfit === it.skin ? 'outfit' : null;
  if (it.weapon === 'knife') return L.knife === it.skin ? 'knife' : null;
  const i = L.guns.findIndex((g) => g.id === it.weapon && g.skin === it.skin);
  return i < 0 ? null : i;
}

/** לבדיקות / dev בלבד */
export function _reset() { P = fresh(); save(); }
