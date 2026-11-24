// 🔍 הרוצח בעיר הגשם – עיר לילה גשומה: 3 זירות, זכוכית מגדלת, אבקת טביעות, 4 חשודים, לוח הסקה, טוויסט ומרדף.
// startDetective(scene, camera, ui, back, renderer) → { active, update(dt) }
import * as THREE from 'three';
import { createSession, replayable, makeNpc, canvasTex, whoHtml, saveStory, getStory, V3, clamp, rnd, angDiff, beep, buzz } from './storykit.js';
import { addCoins } from '../store.js';

// ---------- תוכן העלילה ----------
const SCENES = {
  lab:     { he: 'המעבדה של הפרופסור', n: 1, c: new V3(-13, 0, -15), r: 7 },
  alley:   { he: 'הסמטה האחורית', n: 2, c: new V3(16, 0, 9), r: 8 },
  station: { he: 'תחנת הרכבת', n: 3, c: new V3(-1, 0, 51), r: 9 },
};
const CLUES = [
  { id: 'badge', scene: 'lab', pos: [-12.6, 0.02, -11], icon: '🪪', he: 'תג העובד של הפרופסור', text: 'תג מעבדה עם תמונה: "פרופ׳ נחום גל". על הפלסטיק יש טביעת אצבע ברורה. עכשיו יש לך דוגמה להשוואה.' },
  { id: 'safe', scene: 'lab', pos: [-16.9, 0.8, -19.6], icon: '🗄️', print: true, he: 'טביעה על ידית הכספת', text: 'הכספת פתוחה וריקה, ואין סימני פריצה. מי שפתח אותה ידע את הקוד.' },
  { id: 'cup', scene: 'lab', pos: [-14.6, 0.85, -13.4], icon: '🍵', he: 'כוס תה פושרת', text: 'התה עוד פושר. ליד הכוס יש סימן עגול של תיק שהיה מונח כאן. התיק נעלם, ואין סימני מאבק.' },
  { id: 'note', scene: 'lab', pos: [-17.6, 1.6, -15.2], icon: '📅', he: 'לוח השנה', text: 'בכתב ידו של הפרופסור: "הם מתקרבים. יום חמישי – לצאת מהתמונה." והיום יום חמישי.' },
  { id: 'umbrella', scene: 'alley', pos: [12.5, 0.05, 6.6], icon: '☂️', print: true, he: 'מטרייה שחורה', text: 'מטרייה שחורה זרוקה בסמטה. על הידית יש טביעת אצבע.' },
  { id: 'steps', scene: 'alley', pos: [18.5, 0.02, 10.4], icon: '👣', he: 'עקבות בבוץ', text: 'הצעדים רגילים ורגועים, ובין כל צעד אותו מרחק. אף אחד לא נגרר כאן. האיש הלך לבד, ולא מיהר.' },
  { id: 'card', scene: 'alley', pos: [22.4, 0.05, 6.2], icon: '💳', he: 'כרטיס ביקור רטוב', text: '"אורקס – טכנולוגיות הגנה. ויקטור, מנכ״ל". לידו יש סימני צמיגים טריים של רכב כבד.' },
  { id: 'ticket', scene: 'station', pos: [-2.6, 0.62, 49.6], icon: '🎫', he: 'כרטיס רכבת', text: 'כרטיס לכיוון אחד, נקנה אתמול בערב. השם על הכרטיס: "נ. גל". מי שנחטף לא קונה כרטיס מראש.' },
  { id: 'locker', scene: 'station', pos: [-7.1, 1.1, 53.5], icon: '🔐', print: true, he: 'תא אחסון 17', text: 'על המנעול יש טביעה. בתוך התא יש פתק: "מי שמצא את זה – אל תסמוך על אורקס."' },
];
const SUSPECTS = [
  { id: 'dana', face: '🧪', he: 'דנה', role: 'העוזרת במעבדה', pos: [-4.4, -11.5], yaw: -Math.PI / 2,
    outfit: { hoodie: '#e6e2d8', hoodieDk: '#c9c4b6', vest: '#d8d3c6', pouch: '#c9c4b6', pants: '#34405a', pantsDk: '#28324a', hair: '#7a3b1e', hairHi: '#a5582c' },
    intro: 'אני עוד לא מאמינה שזה קורה. הוא היה כמו אבא בשבילי... רוב הזמן.',
    qa: [
      ['מתי ראית אותו לאחרונה?', 'אתמול בערב. הוא היה לחוץ, שרף ניירות בכיור ושלח אותי הביתה מוקדם. הוא אף פעם לא שולח אותי הביתה.'],
      ['רבתם לאחרונה?', 'כן... הוא לא שם את השם שלי על המאמר החדש. כעסתי מאוד. אבל אני לא פוגעת באנשים, בלש!'],
      ['מה זה "לב הסערה"?', 'ההמצאה שלו. מכשיר שאוסף אנרגיה מברקים. עיר שלמה יכולה לקבל ממנו חשמל, או צבא שלם. הרבה אנשים רוצים אותו.'],
    ] },
  { id: 'moti', face: '🔦', he: 'מוטי', role: 'שומר הלילה', pos: [6.6, -17.4], yaw: -Math.PI / 2,
    outfit: { hoodie: '#2b3a5a', hoodieDk: '#22304a', vest: '#1c2538', pouch: '#26324c', pants: '#1f2533', pantsDk: '#171c27', hair: '#5a5a5a', hairHi: '#7a7a7a' },
    intro: 'אני בעמדה הזאת כבר עשרים שנה. אף פעם לא קרה פה כלום. עד הלילה.',
    qa: [
      ['מה ראית הלילה?', 'האמת? ...נרדמתי בעמדה. כשהתעוררתי, הדלת של המעבדה הייתה פתוחה, והאור עוד דלק.'],
      ['מישהו זר היה פה?', 'רכב שחור עמד ברחוב שעה, ובתוכו אנשים בחליפות. הם לא נכנסו, רק חיכו והסתכלו על החלון שלו.'],
      ['הפרופסור אמר לך משהו?', 'הוא הביא לי עוגיות ואמר: "תשמור על עצמך, מוטי. אם ישאלו – לא ראית אותי." כאילו נפרד ממני.'],
    ] },
  { id: 'lia', face: '📰', he: 'ליה', role: 'עיתונאית', pos: [-6.3, 18.5], yaw: Math.PI / 2,
    outfit: { hoodie: '#a8323a', hoodieDk: '#86262d', vest: '#6e1f25', pouch: '#7a2228', pants: '#22242a', pantsDk: '#18191d', hair: '#121212', hairHi: '#333' },
    intro: 'עוד בלש? יופי. אולי אתה תמצא תשובות, כי לי אף אחד לא עונה.',
    qa: [
      ['למה את פה בשתיים בלילה?', 'קיבלתי מייל בלי שם: "הפרופסור בסכנה. בואי לבית הקפה בפינה." חיכיתי שעתיים. אף אחד לא הגיע.'],
      ['מה את יודעת על אורקס?', 'זאת חברה שמוכרת נשק בשקט. כבר שנה שהם מנסים לקנות את ההמצאה שלו, והוא תמיד מסרב.'],
      ['את הולכת לכתוב שזה רצח?', 'כתבה על רצח מוכרת עיתונים... אבל אין גופה, אין דם, ויש כרטיס רכבת שהוזמן מראש. משהו פה לא מסתדר לי.'],
    ] },
  { id: 'victor', face: '🕶️', he: 'ויקטור', role: 'מנכ״ל אורקס', pos: [3.4, 33.6], yaw: Math.PI,
    outfit: { hoodie: '#15161b', hoodieDk: '#0e0f12', vest: '#0b0b0d', pouch: '#1a1b20', strap: '#000', pants: '#15161b', pantsDk: '#0e0f12', hair: '#cfcfcf', hairHi: '#ffffff', mask: '#000' },
    intro: 'בלש. איזה לילה נעים לטיול.',
    qa: [
      ['מה אתה עושה פה?', 'עסקים. הפרופסור ואני היינו... שותפים לעתיד. הוא רק עוד לא ידע את זה.'],
      ['הצעת לקנות את ההמצאה?', 'הצעתי לו הון. הוא סירב שלוש פעמים. אנשים מתחרטים על סירובים, בלש.'],
      ['איפה הפרופסור?', 'אם הייתי יודע, לא הייתי עומד פה בגשם. האנשים שלי מחפשים אותו בכל העיר. ...שכח שאמרתי את זה.'],
    ] },
];
const CULPRITS = [...SUSPECTS.map((s) => ({ id: s.id, he: `${s.face} ${s.he}` })), { id: 'prof', he: '🧓 הפרופסור עצמו' }];
const MOTIVES = [
  { id: 'money', he: '💰 כסף מהמכירה של ההמצאה' },
  { id: 'revenge', he: '😤 נקמה על המאמר' },
  { id: 'story', he: '📰 סיפור מרעיש לעיתון' },
  { id: 'protect', he: '🛡️ להיעלם כדי להגן על ההמצאה ממי שרודף אחריה' },
];
const WRONG = {
  dana: 'לדנה היה כעס, אבל העקבות בסמטה הן של אדם שהלך לבד, ברגוע. אף אחד לא נגרר.',
  moti: 'מוטי ישן בעמדה. הוא לא היה מסוגל לתכנן כל כך הרבה.',
  lia: 'ליה מחפשת סיפור, לא הסתירה אחד. מישהו שלח לה את המייל כדי שתבוא.',
  victor: 'ויקטור רודף אחרי ההמצאה, אבל הוא עדיין מחפש. מי שנעלם יודע איפה הוא.',
  motive: 'האדם נכון, אבל המניע לא. תחשוב על הפתק בתא 17 ועל מה שהוא כתב בלוח: "הם מתקרבים".',
};
const READY_CLUES = 7;

// ---------- חומרים ----------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const asphalt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#23262d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, 30);
  const facade = (base, lit) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 6, 3); }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const on = Math.random() < lit;
      g.fillStyle = on ? (Math.random() < 0.5 ? '#ffd88a' : '#ffe9b8') : '#0d1118';
      g.fillRect(x * 64 + 14, y * 64 + 12, 36, 40);
      g.fillStyle = '#00000055'; g.fillRect(x * 64 + 31, y * 64 + 12, 2, 40);
    }
  });
  const winMask = (src) => { // רק החלונות הדולקים זוהרים
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.drawImage(src.image, 0, 0); const d = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const lit = d.data[i] > 200 && d.data[i + 1] > 170; if (!lit) d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const fac = ['#3a3236', '#2e3440', '#3d3a33', '#33363e'].map((c, i) => { const t = facade(c, 0.32 + i * 0.05); return std({ map: t, emissive: '#ffffff', emissiveMap: winMask(t), emissiveIntensity: 0.9, roughness: 0.75 }); });
  const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#ffffff66'); gr.addColorStop(1, '#fff0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  MAT = {
    road: std({ map: asphalt, roughness: 0.22, metalness: 0.35, color: '#9aa3b5' }),
    walk: std({ color: '#3b3f47', roughness: 0.3, metalness: 0.25 }),
    puddle: std({ color: '#0d1016', roughness: 0.04, metalness: 0.9 }),
    fac, floor: std({ color: '#5a4f45', roughness: 0.6 }), wallIn: std({ color: '#8b8172' }), wood: std({ color: '#5c3d26' }),
    metal: std({ color: '#5b616b', metalness: 0.6, roughness: 0.4 }), dark: std({ color: '#15171c', roughness: 0.5, metalness: 0.3 }),
    car: std({ color: '#0a0b0e', roughness: 0.15, metalness: 0.7 }), police: std({ color: '#e9edf2', roughness: 0.25, metalness: 0.4 }),
    glass: std({ color: '#111622', roughness: 0.05, metalness: 0.8 }),
    tape: new THREE.MeshBasicMaterial({ color: '#ffd400' }), bulb: new THREE.MeshBasicMaterial({ color: '#ffe2a8' }),
    neonP: new THREE.MeshBasicMaterial({ color: '#ff3ea5' }), neonC: new THREE.MeshBasicMaterial({ color: '#36e2ff' }),
    red: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), blue: new THREE.MeshBasicMaterial({ color: '#2a6bff' }),
    water: std({ color: '#0a1220', roughness: 0.08, metalness: 0.8 }),
    glowTex,
  };
  return MAT;
}

const CSS = `
.dt-lens { position:absolute; inset:0; pointer-events:none; display:none;
  background:radial-gradient(circle at 50% 46%, transparent 0 34vmin, #ffb02055 34.5vmin 35.5vmin, #000c 36vmin); }
.dt-lens.on { display:block; }
.dt-print { width:min(260px,72vw); height:min(260px,72vw); border-radius:16px; touch-action:none; align-self:center; background:#2a2d33; cursor:crosshair; }
.dt-bar { height:10px; background:#0b0d12; border-radius:6px; overflow:hidden; } .dt-bar i { display:block; height:100%; width:0; background:#ffb020; transition:width .1s; }
.dt-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.dt-clue { background:#0b0d12; border-radius:10px; padding:7px 9px; font-size:13px; line-height:1.4; }
.dt-clue.no { color:#4b5366; }
.dt-stars { text-align:center; font-size:34px; letter-spacing:4px; }
.dt-scan { height:6px; background:#0b0d12; border-radius:4px; overflow:hidden; } .dt-scan i { display:block; height:100%; width:0; background:#36e2ff; animation:dtscan 1s linear forwards; }
@keyframes dtscan { to { width:100%; } }
@media (max-width:420px) { .dt-grid { grid-template-columns:1fr; } }
`;

export const startDetective = replayable(createDetective);

function createDetective(scene, camera, ui, back, renderer) {
  const M = mats();
  const S = createSession({ scene, camera, ui, renderer, back, sky: '#070a12', fog: ['#0b1020', 12, 70], dim: 0.12, exposure: 1.15,
    skin: { hoodie: '#8a7350', hoodieDk: '#6b5a3e', vest: '#5e4e34', pouch: '#4f422c', pants: '#2e3138', pantsDk: '#24262c', boots: '#2a2018' },
    start: { x: 0, z: -29, yaw: 0 } });
  S.toolLabel = '<span>🔍</span>זכוכית';
  S.bounds = [-19, 26, -35, 58];
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const lens = document.createElement('div'); lens.className = 'dt-lens'; S.hud.prepend(lens);
  const root = S.root, W = S.world, G = S.worldG;

  // ---------- תאורה ----------
  root.add(new THREE.HemisphereLight('#4a5c86', '#0a0c12', 0.55));
  const moon = new THREE.DirectionalLight('#8fa8ff', 0.35); moon.position.set(-20, 30, 10); root.add(moon);
  const flashL = new THREE.DirectionalLight('#dfe8ff', 0); flashL.position.set(10, 40, 20); root.add(flashL);
  const pl = (x, y, z, c, i, d) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); root.add(l); return l; };
  pl(-13, 3.4, -15, '#ffd29a', 9, 14);      // מעבדה
  pl(15, 3.6, 9, '#ffc070', 7, 14);         // סמטה
  pl(-1, 4.6, 50, '#d8e6ff', 9, 18);        // תחנה
  pl(-6.5, 3, 18, '#ff4fb0', 6, 10);        // ניאון בית קפה
  const siren = pl(2.5, 1.8, -30, '#ff2a2a', 0, 12);
  const fill = new THREE.PointLight('#a8b8ff', 4, 9, 1.4); root.add(fill); // אור מילוי עדין על הבלש

  // ---------- עיר ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 110), M.road); ground.rotation.x = -Math.PI / 2; ground.position.set(3, 0, 12); G.add(ground);
  const flat = (x, z, w, d, mat, y = 0.01) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); G.add(m); return m; };
  flat(-6.5, 12, 3, 92, M.walk, 0.012); flat(6.5, 12, 3, 92, M.walk, 0.012);
  for (let z = -30; z < 42; z += 6) flat(0, z, 0.18, 2.6, new THREE.MeshBasicMaterial({ color: '#8c8a7a' }), 0.014); // פסי הפרדה
  // שלוליות
  const pud = new THREE.CircleGeometry(1, 20);
  [[-2, -24, 1.6], [2.5, -10, 1.2], [-1, 4, 2], [1.8, 22, 1.4], [-2.4, 38, 1.7], [14, 10, 1.3], [20, 7.5, 1], [-12, -13, 0.8], [1, 46, 1.5]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(pud, M.puddle); m.rotation.x = -Math.PI / 2; m.scale.set(r, r * 0.7, 1); m.position.set(x, 0.016, z); G.add(m);
  });
  const bld = (x0, x1, z0, z1, h, k) => W.add((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, M.fac[k % 4], 0, { uv: 4 });
  // שמאל
  bld(-19, -8, -36, -23, 13, 0); bld(-19, -8, -7, 9, 16, 1); bld(-19, -8, 27, 41, 12, 3);
  // בית קפה (שמאל, z 10–26) – בניין נמוך עם סוכך וניאון
  bld(-19, -8, 10, 26, 9, 2);
  W.add(-7.3, 18, 1.6, 0.12, 8, M.dark, 3.1, { collide: false });
  const neon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 4), M.neonP); neon.position.set(-7.95, 4.2, 18); G.add(neon);
  const neon2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 4.6), M.neonC); neon2.position.set(-7.95, 3.7, 18); G.add(neon2);
  for (const z of [16, 20]) { W.add(-6.4, z, 0.8, 0.75, 0.8, M.wood); }
  // ימין
  bld(8, 26, -36, -21, 14, 2); bld(8, 26, -13, 4, 18, 0); bld(8, 26, 14, 42, 15, 1);
  W.add(25.5, 9, 1, 8, 10, M.fac[3], 0, { uv: 4 }); // קיר סוף הסמטה
  // עמדת שומר
  W.add(9.2, -17.5, 2.2, 2.6, 2.2, M.metal); W.add(8.1, -17.5, 0.05, 1, 1.4, M.glass, 1.2, { collide: false });
  // מחסום משטרה בהתחלה + ניידת
  for (let x = -4; x <= 4; x += 2) W.add(x, -35.5, 1.8, 1, 0.3, M.tape);
  W.add(2.6, -30, 1.9, 1.3, 4.4, M.police, 0.25); W.add(2.6, -30.2, 1.7, 0.6, 2.4, M.glass, 1.5);
  const sirR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), M.red); sirR.position.set(2.2, 2.2, -30.2); G.add(sirR);
  const sirB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), M.blue); sirB.position.set(3.0, 2.2, -30.2); G.add(sirB);
  // רכב שחור של אורקס
  W.add(3.6, 30.5, 1.9, 1.1, 4.6, M.car, 0.3); W.add(3.6, 30.3, 1.7, 0.55, 2.6, M.glass, 1.4);

  // ---------- זירה 1: מעבדה (z -22..-8, x -18..-8, דלת z -17..-13) ----------
  W.add(-13, -15, 10, 0.05, 14, M.floor, 0, { collide: false });
  W.add(-18.2, -15, 0.4, 4.2, 14.4, M.wallIn); W.add(-13, -22.2, 10.8, 4.2, 0.4, M.wallIn); W.add(-13, -7.8, 10.8, 4.2, 0.4, M.wallIn);
  W.add(-7.8, -20, 0.4, 4.2, 4.4, M.wallIn); W.add(-7.8, -10.4, 0.4, 4.2, 5.2, M.wallIn); W.add(-7.8, -15, 0.4, 1.2, 4, M.wallIn, 3);
  W.add(-13, -15, 10.8, 0.3, 14.4, M.dark, 4.2); // גג
  W.add(-14.8, -13, 1.4, 0.8, 2.6, M.wood);       // שולחן
  const safeM = W.add(-17.4, -19.6, 1.1, 1.5, 1.1, M.metal);
  W.add(-16.6, -18.9, 0.08, 1.2, 0.9, M.metal, 0.15, { collide: false }).rotation.y = -1.1; // דלת הכספת פתוחה
  W.add(-17.9, -15.2, 0.1, 1.2, 1.6, new THREE.MeshStandardMaterial({ color: '#e8e2cf' }), 1.0, { collide: false }); // לוח שנה
  W.add(-12, -20.8, 4, 2.2, 0.8, M.wood); // מדפים
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 12), new THREE.MeshStandardMaterial({ color: '#f2f2f2' })); cup.position.set(-14.6, 0.86, -13.4); G.add(cup);
  // סליל טסלה (רמז להמצאה)
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 12), M.metal); coil.position.set(-10, 0.8, -20.6); G.add(coil);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), M.neonC); orb.position.set(-10, 1.85, -20.6); G.add(orb);
  // ---------- זירה 2: סמטה ----------
  W.add(16, 13, 2.4, 1.4, 1.2, new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.6 }));
  W.add(21, 13.2, 1.2, 1, 1.2, M.wood); W.add(11.6, 4.8, 1, 1, 1, M.wood);
  const umb = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.3, 8, 1, true), M.dark); umb.position.set(12.5, 0.18, 6.6); umb.rotation.z = 1.3; G.add(umb);
  const stepMat = new THREE.MeshBasicMaterial({ color: '#3a2c20', transparent: true, opacity: 0.8 });
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.3), stepMat); m.rotation.x = -Math.PI / 2; m.position.set(13 + i * 0.75, 0.02, 10.4 + (i % 2 ? 0.2 : -0.2)); m.rotation.z = -Math.PI / 2; G.add(m); }
  const tire = new THREE.MeshBasicMaterial({ color: '#0b0b0b', transparent: true, opacity: 0.6 });
  for (const dz of [-0.8, 0.8]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.28), tire); m.rotation.x = -Math.PI / 2; m.position.set(14, 0.018, 6.4 + dz * 0.4 + 0.2); G.add(m); }
  // ---------- זירה 3: תחנה ----------
  W.add(-1, 51, 16, 0.4, 12, M.walk, 0, { collide: false });
  W.add(-1, 58.6, 18, 3.4, 2.6, new THREE.MeshStandardMaterial({ color: '#7a1f24', roughness: 0.4, metalness: 0.4 }), 0.2); // רכבת
  const winM = new THREE.MeshBasicMaterial({ color: '#8f8766' });
  for (let x = -8; x <= 6; x += 3.5) W.add(x, 58.6 - 1.31, 1.4, 1.0, 0.02, winM, 1.7, { collide: false });
  W.add(-1, 51, 16, 0.2, 10, M.dark, 5.2); // גגון
  for (const x of [-8, 6]) for (const z of [47, 55]) W.add(x, z, 0.3, 5.2, 0.3, M.metal);
  W.add(-2.6, 49.6, 2.4, 0.5, 0.7, M.wood); // ספסל
  W.add(-7.6, 53, 0.8, 2.4, 4, M.metal);     // לוקרים
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) W.add(-7.18, 54.5 - i, 0.02, 0.7, 0.9, M.dark, 0.2 + j * 0.75, { collide: false });
  W.add(-1, 61, 22, 8, 1, M.fac[1], 0, { uv: 4 }); W.add(-10, 51, 1, 6, 14, M.fac[0], 0, { uv: 4 }); W.add(8, 51, 1, 6, 14, M.fac[2], 0, { uv: 4 });
  // סרט משטרה סביב הזירות
  const tapeAt = (x, z, w, d) => { W.add(x, z, w, 0.06, d, M.tape, 1.0, { collide: false }); };
  tapeAt(-7.4, -15, 0.04, 4.2); tapeAt(8.6, 9, 0.04, 10); tapeAt(-1, 45.2, 15, 0.04);

  // ---------- פנסי רחוב + השתקפויות על הכביש הרטוב ----------
  const reflGeo = new THREE.PlaneGeometry(1, 1);
  const refls = [];
  const refl = (x, z, color, w = 0.7, len = 5, op = 0.55) => {
    const m = new THREE.Mesh(reflGeo, new THREE.MeshBasicMaterial({ color, map: M.glowTex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.scale.set(w, len, 1); G.add(m); refls.push(m); return m;
  };
  const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.6, 6), bulbGeo = new THREE.SphereGeometry(0.2, 10, 8);
  for (const z of [-26, -14, -2, 10, 22, 34]) for (const side of [-1, 1]) {
    if ((z === -14 && side < 0) || (z === 10 && side > 0)) continue;
    const x = side * 5.6;
    const p = new THREE.Mesh(postGeo, M.dark); p.position.set(x, 2.3, z); G.add(p); W.solid(x, z, 0.2, 4.6, 0.2, 0, false);
    const b = new THREE.Mesh(bulbGeo, M.bulb); b.position.set(x - side * 0.5, 4.5, z); G.add(b);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTex, color: '#ffcf80', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(2.4, 2.4, 1); halo.position.copy(b.position); G.add(halo);
    refl(x - side * 0.5, z, '#ffc56a', 0.9, 6);
  }
  refl(-7.4, 18, '#ff3ea5', 1.2, 6, 0.6); refl(-7.2, 18.6, '#36e2ff', 0.8, 5, 0.4);
  refl(2.2, -30.2, '#ff2a2a', 0.6, 3, 0.0).userData.siren = 'r'; refl(3.0, -30.2, '#2a6bff', 0.6, 3, 0.0).userData.siren = 'b';

  // ---------- גשם ----------
  const RAIN = S.touch ? 900 : 1500, RB = { x: 34, y: 22, z: 34 };
  const rainPos = new Float32Array(RAIN * 6), rainSpd = new Float32Array(RAIN);
  for (let i = 0; i < RAIN; i++) {
    const x = rnd(-RB.x / 2, RB.x / 2), y = rnd(0, RB.y), z = rnd(-RB.z / 2, RB.z / 2);
    rainPos.set([x, y, z, x + 0.05, y + 0.45, z + 0.02], i * 6); rainSpd[i] = rnd(16, 22);
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#a9bde0', transparent: true, opacity: 0.38, depthWrite: false }));
  rain.frustumCulled = false; root.add(rain);
  const ringGeo = new THREE.RingGeometry(0.7, 1, 16);
  const ripples = Array.from({ length: S.touch ? 18 : 32 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#b9c9ea', transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.035; root.add(m); return { m, t: Math.random() };
  });

  // ---------- רמזים ----------
  const st = { found: new Set(), talked: {}, wrong: 0, solved: false, phase: 'investigate', caught: false, chaseT: 0, hinted: new Set(), visited: new Set(), lens: false, done: false, paid: false };
  const markGeo = new THREE.TorusGeometry(0.28, 0.035, 6, 24);
  const markMat = new THREE.MeshBasicMaterial({ color: '#36e2ff', transparent: true, opacity: 0.9, depthTest: false });
  for (const c of CLUES) {
    const m = new THREE.Mesh(markGeo, markMat); m.position.set(...c.pos); m.position.y += 0.35; m.renderOrder = 5; m.visible = false; root.add(m); c.mark = m;
    const sp = S.spot({ pos: new V3(c.pos[0], 0, c.pos[2]), r: 1.7, label: () => `סרוק: ${c.he}`, on: () => st.lens && !st.found.has(c.id) && st.phase === 'investigate', use: () => scan(c) });
    c.spot = sp;
  }

  // ---------- חשודים ----------
  const npcs = {};
  const qGeo = new THREE.PlaneGeometry(0.5, 0.5);
  const qTex = canvasTex(64, 64, (g) => { g.font = '900 52px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffb020'; g.fillText('?', 32, 36); });
  for (const s of SUSPECTS) {
    const n = makeNpc(G, s.outfit, s.pos[0], s.pos[1], s.yaw); n.home = s.yaw; npcs[s.id] = n;
    W.solid(s.pos[0], s.pos[1], 0.5, 1.8, 0.5, 0, false);
    const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: qTex, transparent: true, depthTest: false })); q.scale.set(0.45, 0.45, 1); q.position.set(s.pos[0], 2.25, s.pos[1]); root.add(q); n.q = q;
    S.spot({ pos: new V3(s.pos[0], 0, s.pos[1]), r: 2.3, label: `דבר עם ${s.he} (${s.role})`, on: () => st.phase === 'investigate', use: () => interview(s) });
  }
  // הפרופסור (מופיע בטוויסט) והסוכן (מרדף)
  const prof = makeNpc(G, { hoodie: '#6b5a3a', hoodieDk: '#574a30', vest: '#4a3e28', pouch: '#3e3422', pants: '#3a3a3a', pantsDk: '#2c2c2c', hair: '#ececec', hairHi: '#ffffff' }, 5.2, 55.5, Math.PI);
  prof.rig.root.visible = false;
  const agent = makeNpc(G, { hoodie: '#16171c', hoodieDk: '#0f1013', vest: '#2a2b30', pouch: '#222', pants: '#16171c', pantsDk: '#0f1013', hair: '#111', mask: '#050505' }, 6, 56, Math.PI);
  agent.rig.root.visible = false;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#2a6bff', emissive: '#1840a0' }));
  tube.rotation.z = Math.PI / 2; tube.position.set(0, -0.05, 0.05); agent.rig.j.handR?.add(tube);
  S.spot({ pos: new V3(4, 0, 53), r: 3.2, label: 'פגוש את מי שקרא לך', on: () => st.phase === 'meet', use: () => twist() });

  // ---------- HUD ----------
  const lensBtn = S.button('🔍 זכוכית', () => toggleLens(), 'F');
  S.button('📋 לוח', () => board(), 'B');
  function toggleLens(v = !st.lens) {
    st.lens = v; lens.classList.toggle('on', v); lensBtn.classList.toggle('on', v);
    for (const c of CLUES) c.mark.visible = v && !st.found.has(c.id);
    if (v) beep(880, 0.05, 'sine');
  }
  const interviews = () => Object.keys(st.talked).filter((k) => st.talked[k] >= 2).length;
  const ready = () => st.found.size >= READY_CLUES && interviews() >= 4;
  function objective() {
    if (st.phase === 'meet') return S.top('📱 "בוא לרציף. לבד." – לך לתחנת הרכבת');
    if (st.phase === 'chase') return S.top(`🏃 תפוס את הסוכן! מרחק ${agentDist().toFixed(0)} מ׳ · ⏱ ${Math.max(0, 45 - st.chaseT).toFixed(0)}`);
    if (st.phase !== 'investigate') return S.top('');
    const left = Object.values(SCENES).filter((z) => CLUES.some((c) => c.scene === z.key && !st.found.has(c.id)));
    S.top(`🔍 רמזים ${st.found.size}/${CLUES.length} · 🗣 חשודים ${interviews()}/4${ready() ? ' · <b style="color:#ffb020">📋 מוכן להאשמה!</b>' : left.length ? ` · ${left[0].n}. ${left[0].he}` : ''}`);
  }
  for (const [k, z] of Object.entries(SCENES)) z.key = k;
  const progress = () => saveStory('detective', { pct: Math.round(100 * (st.found.size + interviews() + (st.solved ? 3 : 0)) / 16) });

  // ---------- סריקה ----------
  function scan(c) {
    const m = S.modal(`<h2>${c.icon} סורק...</h2><div class="dt-scan"><i></i></div><p class="sk-muted" style="text-align:center">${c.he}</p>`);
    beep(520, 0.08, 'sine'); setTimeout(() => beep(780, 0.08, 'sine'), 300);
    setTimeout(() => { if (S.modalEl !== m) return; c.print ? dust(c) : reveal(c); }, 1000);
  }
  function reveal(c, extra = '') {
    st.found.add(c.id); c.mark.visible = false; buzz(25); beep(990, 0.1, 'triangle');
    const m = S.modal(`<h2>${c.icon} ${c.he}</h2><p>${c.text}</p>${extra}<button class="btn" data-k="ok">📒 לרשום במחברת</button>`);
    m.querySelector('[data-k=ok]').onclick = () => { S.close(); objective(); progress(); if (ready()) S.toast('📋 יש מספיק ראיות! פתח את הלוח (B) והאשם', 3000); };
  }
  // אבקת טביעות: משפשפים כדי לחשוף טביעה
  function dust(c) {
    const m = S.modal(`<h2>🧤 אבקת טביעות</h2><p class="sk-muted" style="text-align:center">שפשף עם האצבע או העכבר על המשטח כדי לחשוף את הטביעה</p>
      <canvas class="dt-print" width="260" height="260"></canvas><div class="dt-bar"><i></i></div>
      <button class="btn" data-k="skip" style="opacity:.6">דלג (בלי טביעה)</button>`);
    const cv = m.querySelector('canvas'), g = cv.getContext('2d'), bar = m.querySelector('.dt-bar i');
    const pc = document.createElement('canvas'); pc.width = pc.height = 260; const pg = pc.getContext('2d');
    pg.strokeStyle = '#f4ead2'; pg.lineWidth = 2.6; pg.lineCap = 'round';
    const seed = c.id.length * 1.7;
    for (let i = 1; i < 20; i++) { // קווים של טביעה: אליפסות מעוותות
      pg.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) {
        const wob = Math.sin(a * 3 + seed + i * 0.4) * 2.2 + Math.sin(a * 7 + i) * 1.2;
        const r = i * 4.6 + wob, x = 130 + Math.cos(a) * r * 0.82, y = 128 + Math.sin(a) * r * 1.08 - (a > Math.PI ? 0 : i * 0.6);
        if (i > 14 && Math.sin(a * 2 + i) > 0.6) { pg.moveTo(x, y); continue; }
        a === 0 ? pg.moveTo(x, y) : pg.lineTo(x, y);
      }
      pg.stroke();
    }
    const mc = document.createElement('canvas'); mc.width = mc.height = 260; const mg = mc.getContext('2d');
    const tc = document.createElement('canvas'); tc.width = tc.height = 260; const tg = tc.getContext('2d');
    const N = 14, cells = new Set(); let total = 0;
    const inPrint = (i, j) => { const x = (i + 0.5) / N * 260, y = (j + 0.5) / N * 260; return ((x - 130) / 82) ** 2 + ((y - 128) / 100) ** 2 < 1; };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (inPrint(i, j)) total++;
    const draw = () => {
      g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 260, 260);
      g.fillStyle = '#00000022'; for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 260, (i * 97) % 260, 30, 2);
      tg.clearRect(0, 0, 260, 260); tg.globalCompositeOperation = 'source-over'; tg.drawImage(pc, 0, 0);
      tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mc, 0, 0);
      g.drawImage(tc, 0, 0);
    };
    let done = false;
    const brush = (x, y) => {
      const gr = mg.createRadialGradient(x, y, 0, x, y, 26); gr.addColorStop(0, '#000f'); gr.addColorStop(1, '#0000');
      mg.fillStyle = gr; mg.beginPath(); mg.arc(x, y, 26, 0, 7); mg.fill();
      const i = Math.floor(x / 260 * N), j = Math.floor(y / 260 * N);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < N && jj < N && inPrint(ii, jj)) cells.add(ii * N + jj); }
      const k = cells.size / total; bar.style.width = Math.min(100, k / 0.75 * 100) + '%';
      draw();
      if (k >= 0.75 && !done) { done = true; beep(1200, 0.12, 'triangle'); setTimeout(() => reveal(c, `<p style="color:#36e2ff">🖐 טביעה נאספה. ${st.found.has('badge') ? 'השוואה לתג העובד: <b>תואמת לפרופסור גל ✔</b>' : 'צריך דוגמה להשוואה. אולי במעבדה?'}</p>`), 350); }
    };
    let down = false;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 260, (e.clientY - r.top) / r.height * 260]; };
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture?.(e.pointerId); brush(...pt(e)); });
    cv.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse' && e.buttons) brush(...pt(e)); });
    cv.addEventListener('pointerup', () => (down = false));
    m.querySelector('[data-k=skip]').onclick = () => reveal(c, '<p class="sk-muted">הטביעה נמרחה... אבל הרמז נרשם.</p>');
    m._brush = brush; // לבדיקות
    draw();
  }

  // ---------- חקירה ----------
  function interview(s) {
    const n = npcs[s.id];
    st.talked[s.id] = st.talked[s.id] || 0;
    const asked = (st.asked = st.asked || {})[s.id] = st.asked[s.id] || new Set();
    const render = (say) => {
      const m = S.modal(`${whoHtml(s.face, s.he, s.role)}<div class="sk-say">${say}</div>
        ${s.qa.map(([q], i) => `<button class="sk-opt ${asked.has(i) ? 'done' : ''}" data-q="${i}">❓ ${q}</button>`).join('')}
        <button class="btn" data-k="bye">👋 תודה, זה הכול</button>`);
      m.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
        const i = +b.dataset.q; if (!asked.has(i)) { asked.add(i); st.talked[s.id] = asked.size; }
        beep(440 + i * 90, 0.05, 'sine'); render(s.qa[i][1]);
      }));
      m.querySelector('[data-k=bye]').onclick = () => {
        S.close(); n.yaw = n.home; if (st.talked[s.id] >= 2) n.q.visible = false;
        else S.toast(`💡 שאל את ${s.he} עוד שאלה כדי לסמן את החקירה`, 2200);
        objective(); progress(); if (ready()) S.toast('📋 יש מספיק ראיות! פתח את הלוח (B) והאשם', 3000);
      };
    };
    render(s.intro);
  }

  // ---------- לוח הסקה ----------
  function board() {
    const pick = { who: null, why: null };
    const prints = CLUES.filter((c) => c.print);
    const render = (msg = '') => {
      const m = S.modal(`<h2>📋 לוח החקירה</h2>
        <h3>📒 רמזים (${st.found.size}/${CLUES.length})</h3>
        <div class="dt-grid">${CLUES.map((c) => st.found.has(c.id) ? `<div class="dt-clue">${c.icon} <b>${c.he}</b><br><span class="sk-muted">${c.text.split('.')[0]}.</span></div>`
          : `<div class="dt-clue no">❔ ${SCENES[c.scene].n}. ${SCENES[c.scene].he}</div>`).join('')}</div>
        <h3>🖐 טביעות אצבע</h3>
        <div class="dt-grid">${prints.map((c) => `<div class="dt-clue ${st.found.has(c.id) ? '' : 'no'}">${c.icon} ${c.he}: ${!st.found.has(c.id) ? '—' : st.found.has('badge') ? '<b style="color:#36e2ff">פרופ׳ גל ✔</b>' : 'אין דוגמה להשוואה'}</div>`).join('')}</div>
        <h3>🗣 חשודים (${interviews()}/4)</h3>
        <div class="dt-grid">${SUSPECTS.map((s) => `<div class="dt-clue ${st.talked[s.id] >= 2 ? '' : 'no'}">${s.face} ${s.he} · ${s.role} ${st.talked[s.id] >= 2 ? '✔' : ''}</div>`).join('')}</div>
        ${ready() ? `<h3>⚖️ מי עומד מאחורי ההיעלמות?</h3>
          ${CULPRITS.map((c) => `<button class="sk-opt ${pick.who === c.id ? 'on' : ''}" data-who="${c.id}">${c.he}</button>`).join('')}
          <h3>❓ ולמה?</h3>
          ${MOTIVES.map((c) => `<button class="sk-opt ${pick.why === c.id ? 'on' : ''}" data-why="${c.id}">${c.he}</button>`).join('')}
          ${msg ? `<div class="sk-say" style="border-color:#ff5a3b">${msg}</div>` : ''}
          <button class="btn" data-k="accuse" ${pick.who && pick.why ? '' : 'disabled style="opacity:.5"'}>⚖️ האשם</button>`
          : `<p class="sk-muted" style="text-align:center">כדי להאשים צריך לפחות ${READY_CLUES} רמזים ולחקור את כל 4 החשודים (2 שאלות לכל אחד).</p>`}
        <button class="btn" data-k="close">→ חזרה לחקירה</button>`);
      m.querySelectorAll('[data-who]').forEach((b) => (b.onclick = () => { pick.who = b.dataset.who; render(); }));
      m.querySelectorAll('[data-why]').forEach((b) => (b.onclick = () => { pick.why = b.dataset.why; render(); }));
      m.querySelector('[data-k=close]').onclick = () => S.close();
      const acc = m.querySelector('[data-k=accuse]');
      if (acc) acc.onclick = () => {
        if (!pick.who || !pick.why) return;
        if (pick.who === 'prof' && pick.why === 'protect') return solved();
        st.wrong++; buzz(80); beep(160, 0.25, 'sawtooth');
        const why = pick.who !== 'prof' ? WRONG[pick.who] : WRONG.motive;
        pick.who = pick.why = null; render(`❌ הראיות לא מתיישבות. ${why}`);
      };
      return m;
    };
    return render();
  }
  function solved() {
    st.solved = true; st.phase = 'meet'; progress();
    const m = S.modal(`<h2>⚖️ זה לא רצח</h2>
      <div class="sk-say">אין גופה ואין מאבק. הצעדים בבוץ רגועים, הכרטיס נקנה מראש, ועל הכספת, על המטרייה ועל המנעול נמצאו טביעות של אדם אחד בלבד.
      <b>הפרופסור ביים את ההיעלמות של עצמו.</b></div>
      <div class="sk-say">📱 <b>הודעה ממספר לא מזוהה:</b> "כל הכבוד, בלש. בוא לרציף. לבד."</div>
      <button class="btn" data-k="go">🚉 לתחנת הרכבת</button>`);
    m.querySelector('[data-k=go]').onclick = () => { S.close(); objective(); S.toast('🚉 לך לרציף בתחנת הרכבת', 2500); };
    prof.rig.root.visible = true; for (const s of SUSPECTS) npcs[s.id].q.visible = false;
    toggleLens(false);
  }
  function twist() {
    const lines = [
      'כל הכבוד, בלש. אף אחד לא רצח אותי. ביימתי את ההיעלמות.',
      'ויקטור ואורקס רוצים להפוך את "לב הסערה" לנשק. מכשיר שיכול להאיר עיר שלמה יכול גם להפיל אותה.',
      'הייתי חייב שכולם יחשבו שאני מת, כדי שיפסיקו לחפש. שלחתי לליה את המייל כדי שמישהו ישים לב שמשהו לא מסתדר. ושמתי את הפתק בתא 17 בשבילך.',
      '...רגע! התא פתוח! השרטוטים נעלמו! <b>האיש של ויקטור לקח אותם, הנה הוא בורח!</b>',
    ];
    let i = 0;
    st.phase = 'twist';
    const render = () => {
      const last = i === lines.length - 1;
      const m = S.modal(`${whoHtml('🧓', 'פרופ׳ נחום גל', 'הממציא ש"נעלם"')}<div class="sk-say">${lines[i]}</div>
        ${last ? `<button class="btn" data-k="chase">🏃 רדוף אחריו! <small>מרדף אופציונלי</small></button><button class="btn" data-k="skip">🚓 תן למשטרה לטפל</button>`
          : '<button class="btn" data-k="next">▶️ המשך</button>'}`);
      if (last) {
        agent.rig.root.visible = true; agent.pos.set(6, 0, 55);
        m.querySelector('[data-k=chase]').onclick = () => { S.close(); startChase(); };
        m.querySelector('[data-k=skip]').onclick = () => { agent.rig.root.visible = false; ending(false, true); };
      } else m.querySelector('[data-k=next]').onclick = () => { i++; render(); };
    };
    prof.face(S.P.pos); render();
  }

  // ---------- מרדף ----------
  const PATH = [[6, 52], [4, 44], [1.5, 34], [-2.5, 26], [2.5, 16], [10, 9.5], [20, 9.5], [21, 11.5], [11, 11.5], [3, 6], [-2.5, -4], [3.5, -12], [-1, -22], [0, -33]].map(([x, z]) => new V3(x, 0, z));
  let pathI = 0, tired = 0;
  const agentDist = () => Math.hypot(agent.pos.x - S.P.pos.x, agent.pos.z - S.P.pos.z);
  function startChase() {
    st.phase = 'chase'; st.chaseT = 0; pathI = 2; tired = 0; agent.pos.copy(PATH[1]);
    S.toast('🏃 החזק Shift (או דחוף את הג׳ויסטיק עד הסוף) כדי לרוץ!', 2800);
  }
  function updateChase(dt) {
    st.chaseT += dt;
    const tgt = PATH[pathI];
    if (!tgt) return ending(false);
    const dx = tgt.x - agent.pos.x, dz = tgt.z - agent.pos.z, d = Math.hypot(dx, dz);
    tired = Math.max(0, tired - dt);
    const close = agentDist() < 4;
    const spd = (tired > 0 ? 3.6 : 5.5) * (close ? 1.05 : 1);
    if (d < 0.6) { pathI++; if (Math.random() < 0.45) tired = 0.8; }
    else { agent.pos.x += dx / d * spd * dt; agent.pos.z += dz / d * spd * dt; agent.yaw += angDiff(agent.yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-12 * dt)); }
    agent.update(dt, spd / 6.2);
    if (agentDist() < 1.5) { st.caught = true; buzz(120); beep(1300, 0.2, 'triangle'); return ending(true); }
    if (st.chaseT > 45 || pathI >= PATH.length) return ending(false);
  }

  // ---------- סיום ----------
  function ending(caught, skipped = false) {
    st.phase = 'end'; st.done = true; agent.rig.root.visible = caught;
    const stars = 1 + (st.wrong === 0 ? 1 : 0) + (caught ? 1 : 0);
    const coins = st.paid ? 0 : 50 + st.found.size * 8 + interviews() * 10 + (st.wrong === 0 ? 40 : 0) + (caught ? 60 : 0);
    if (!st.paid) { addCoins(coins, 'detective'); st.paid = true; }
    const rec = saveStory('detective', { done: true, best: stars, pct: 100, endings: [caught ? 'caught' : 'escaped'] });
    const text = caught ? 'תפסת את הסוכן של אורקס, והשרטוטים חזרו לפרופסור. ויקטור נעצר עוד באותו לילה. "לב הסערה" יאיר את העיר ולא יפיל אותה.'
      : skipped ? 'המשטרה חסמה את הרחובות, אבל הסוכן נעלם בגשם. לפחות הפרופסור בטוח, ויש לו עותק אחד אחרון בראש.'
        : 'הסוכן ברח עם השרטוטים בגשם... אבל הפרופסור חייך: "הם לקחו גרסה ישנה. את הלב האמיתי אני שומר כאן", והצביע על הראש.';
    const m = S.modal(`<h2>${caught ? '🏆 התיק נסגר!' : '🌧️ התיק נסגר... כמעט'}</h2>
      <div class="dt-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <p>${text}</p>
      <div class="sk-muted" style="text-align:center">🔍 ${st.found.size}/${CLUES.length} רמזים · 🗣 ${interviews()}/4 חשודים · ❌ ${st.wrong} טעויות · שיא: ${'⭐'.repeat(rec.best || stars)}</div>
      <div style="text-align:center;font-size:20px;color:#ffd54a;font-weight:900">🪙 +${coins}</div>
      <button class="btn" data-k="again">🔁 שחק שוב</button><button class="btn" data-k="exit">→ חזרה לעלילות</button>`);
    m.querySelector('[data-k=again]').onclick = () => S.exit(true);
    m.querySelector('[data-k=exit]').onclick = () => S.exit();
    S.top('');
  }
  S.onExit = () => { style.remove(); };

  // ---------- פתיחה ----------
  function intro() {
    const prev = getStory('detective');
    const m = S.modal(`<h2>🔍 הרוצח בעיר הגשם</h2>
      <p>לילה גשום בעיר הנמל. <b>פרופ׳ נחום גל</b>, הממציא המפורסם של "לב הסערה", נעלם מהמעבדה שלו. ברחוב כבר מדברים על רצח.</p>
      <p>אתה הבלש. יש <b>3 זירות</b>, <b>4 חשודים</b>, ולילה אחד.</p>
      <div class="sk-say">🔍 הפעל <b>זכוכית מגדלת</b> (${S.touch ? 'כפתור 🔍' : 'F'}) כדי לראות רמזים · 🖐 אסוף <b>טביעות</b> עם אבקה · 🗣 <b>חקור</b> חשודים · 📋 <b>לוח</b> (${S.touch ? 'כפתור' : 'B'}) כדי להאשים</div>
      ${prev?.best ? `<div class="sk-muted" style="text-align:center">השיא שלך: ${'⭐'.repeat(prev.best)}</div>` : ''}
      <button class="btn" data-k="go">🕵️ להתחיל לחקור</button>`);
    m.querySelector('[data-k=go]').onclick = () => { S.close(); S.start(); objective(); };
  }

  // ---------- לולאה ----------
  let flashT = rnd(6, 12), flashK = 0, sirenT = 0;
  const _cp = new V3();
  const D = {
    active: true, S, st, CLUES, SUSPECTS, npcs, prof, agent,
    update(dt) {
      dt = Math.min(dt, 0.05);
      if (!S.active) { D.active = false; return; }
      if (st.phase === 'twist' || st.phase === 'end') S.P.frozen = true; else S.P.frozen = false;
      if (S.take('tool') && st.phase === 'investigate') toggleLens();
      if (S.take('board') && !S.busy) board();
      S.update(dt);
      const P = S.P, t = S.t;
      // גשם סביב המצלמה
      camera.getWorldPosition(_cp);
      rain.position.set(_cp.x, 0, _cp.z);
      const inside = P.pos.x < -8 && P.pos.x > -18.4 && P.pos.z > -22.2 && P.pos.z < -7.8;
      rain.visible = !inside; for (const r of ripples) r.m.visible = !inside;
      fill.position.set(P.pos.x, P.pos.y + 2.6, P.pos.z).addScaledVector(_cp.clone().sub(P.pos).setY(0).normalize(), 1.5);
      const fall = dt;
      for (let i = 0; i < RAIN; i++) {
        const k = i * 6; let y = rainPos[k + 1] - rainSpd[i] * fall;
        if (y < 0) { y += RB.y; rainPos[k] = rnd(-RB.x / 2, RB.x / 2); rainPos[k + 2] = rnd(-RB.z / 2, RB.z / 2); rainPos[k + 3] = rainPos[k] + 0.05; rainPos[k + 5] = rainPos[k + 2] + 0.02; }
        rainPos[k + 1] = y; rainPos[k + 4] = y + 0.45;
      }
      rainGeo.attributes.position.needsUpdate = true;
      for (const r of ripples) {
        r.t += dt * 1.8;
        if (r.t >= 1) { r.t = 0; r.m.position.x = P.pos.x + rnd(-9, 9); r.m.position.z = P.pos.z + rnd(-6, 12); }
        const s = 0.04 + r.t * 0.16; r.m.scale.set(s, s, 1); r.m.material.opacity = 0.35 * (1 - r.t);
      }
      // ברקים
      flashT -= dt;
      if (flashT <= 0) { flashK = 1; flashT = rnd(9, 20); setTimeout(() => beep(60, 0.5, 'sawtooth', 0.03), 700); }
      flashK = Math.max(0, flashK - dt * 2.5);
      flashL.intensity = flashK > 0.7 || (flashK > 0.3 && flashK < 0.45) ? 2.6 * flashK : 0;
      // סירנה
      sirenT += dt; const ph = Math.floor(sirenT * 3) % 2;
      siren.color.set(ph ? '#ff2a2a' : '#2a6bff'); siren.intensity = 5;
      sirR.visible = !!ph; sirB.visible = !ph;
      for (const r of refls) {
        if (r.userData.siren) r.material.opacity = (r.userData.siren === 'r') === !!ph ? 0.6 : 0;
        r.rotation.z = Math.atan2(_cp.x - r.position.x, _cp.z - r.position.z); // הפס תמיד פונה אל המצלמה, כמו השתקפות אמיתית
      }
      orb.material.color.setHSL(0.53, 1, 0.5 + Math.sin(t * 8) * 0.15);
      // סימני רמזים
      if (st.lens) for (const c of CLUES) if (c.mark.visible) { c.mark.rotation.y = t * 2; c.mark.position.y = c.pos[1] + 0.35 + Math.sin(t * 3) * 0.06; }
      // רמזים בלי זכוכית
      if (!st.lens && st.phase === 'investigate') for (const c of CLUES) {
        if (st.found.has(c.id) || st.hinted.has(c.id)) continue;
        if (Math.hypot(c.pos[0] - P.pos.x, c.pos[2] - P.pos.z) < 2.6) { st.hinted.add(c.id); S.toast(`🔍 משהו כאן... הפעל זכוכית מגדלת (${S.touch ? '🔍' : 'F'})`, 2200); }
      }
      // כניסה לזירה
      for (const z of Object.values(SCENES)) if (!st.visited.has(z.key) && Math.hypot(z.c.x - P.pos.x, z.c.z - P.pos.z) < z.r) { st.visited.add(z.key); S.toast(`📍 זירה ${z.n}: ${z.he}`, 2200); }
      // חשודים: מסתכלים עליך כשאתה קרוב
      for (const s of SUSPECTS) {
        const n = npcs[s.id]; const d = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z);
        if (d < 4) n.face(P.pos, dt, 4); n.update(dt, 0);
        n.q.position.y = 2.25 + Math.sin(t * 2.5 + n.t) * 0.06;
      }
      if (prof.rig.root.visible) { if (st.phase === 'meet' || st.phase === 'twist') prof.face(P.pos, dt, 4); prof.update(dt, 0); }
      if (st.phase === 'chase') updateChase(dt); else if (agent.rig.root.visible) agent.update(dt, 0);
      if (st.phase === 'chase' || st.phase === 'meet') objective();
    },
  };
  intro();
  return D;
}
