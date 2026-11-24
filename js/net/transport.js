// שכבת תקשורת לקרב: ממשק אחד ושני מתאמים (PeerJS לאינטרנט, BroadcastChannel לבדיקות באותו דפדפן).
// טופולוגיית כוכב: המארח מדבר עם כולם, לקוח מדבר רק עם המארח.
//
// ממשק Transport (מה ש-createHost / joinHost מחזירים):
//   t.kind      'peer' | 'bc'
//   t.id        המזהה שלי ברשת
//   t.isHost    bool
//   t.send(to, msg)      // מארח: לעמית מסוים. לקוח: to מתעלמים, תמיד למארח
//   t.broadcast(msg)     // מארח: לכל העמיתים
//   t.onMessage(fn)      // fn(fromId, msg)
//   t.onJoin(fn)         // (מארח) fn(peerId) – ערוץ חדש נפתח
//   t.onLeave(fn)        // מארח: fn(peerId) עמית התנתק. לקוח: fn(hostId) המארח נעלם
//   t.close()
// שגיאות: Error עם .code = 'unavailable' (אין שרת/ספרייה) | 'not-found' (אין חדר כזה) | 'taken' (קוד תפוס) | 'timeout'
import { bcHost, bcJoin } from './broadcast.js';
import { peerHost, peerJoin } from './peerjs.js';

const WORDS = ['TIGER', 'EAGLE', 'WOLF', 'SHARK', 'COBRA', 'FALCON', 'LION', 'BEAR', 'PANDA', 'RHINO', 'VIPER', 'HAWK', 'FOX', 'ORCA', 'LYNX', 'BISON'];

/** קוד חדר קצר וקריא, למשל TIGER-482 */
export function makeRoomCode(rand = Math.random) {
  return `${WORDS[Math.floor(rand() * WORDS.length)]}-${100 + Math.floor(rand() * 900)}`;
}
/** מנרמל קלט של משתמש: "tiger 482" → "TIGER-482". מחזיר null אם לא תקין. */
export function normalizeCode(s) {
  const m = String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().match(/^([A-Z]{2,8})\s*(\d{3})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function netErr(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

/** מאזינים קטנים משותפים למתאמים */
export function makeHub() {
  const L = { msg: [], join: [], leave: [] };
  return {
    onMessage: (fn) => L.msg.push(fn), onJoin: (fn) => L.join.push(fn), onLeave: (fn) => L.leave.push(fn),
    emitMsg: (from, m) => { for (const f of L.msg) try { f(from, m); } catch (e) { console.error(e); } },
    emitJoin: (id) => { for (const f of L.join) f(id); },
    emitLeave: (id) => { for (const f of L.leave) f(id); },
  };
}

export const rid = (n = 8) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');

/** kind: 'peer' | 'bc' */
export function createHost(kind, code, opts = {}) { return kind === 'bc' ? bcHost(code, opts) : peerHost(code, opts); }
export function joinHost(kind, code, opts = {}) { return kind === 'bc' ? bcJoin(code, opts) : peerJoin(code, opts); }
