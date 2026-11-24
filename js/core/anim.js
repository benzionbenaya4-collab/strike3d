// מערכת תנועה פרוצדורלית: שלד אחיד + Animator.
// הדמות פונה ל-+Z, שמאל הדמות = +X, יחידה = מטר.
// נשקים: המודל לאורך +X, userData.gripPoint (יד ימין), userData.supportPoint (יד שמאל, אופציונלי), userData.magPoint (טעינה, אופציונלי).
// הנשק יושב על "socket" שצמוד לחזה; הידיים נצמדות אליו ב-IK, כך שהאחיזה תמיד אמיתית.
import * as THREE from 'three';

const V = THREE.Vector3, Q = THREE.Quaternion;
const DOWN = new V(0, -1, 0);
const UP = new V(0, 1, 0), _aw = new V(), _am = new THREE.Matrix4(), _aq = new Q(), _aq2 = new Q();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const ease = (t) => t * t * (3 - 2 * t);

export const DIM = { hip: 0.95, spine: 0.22, chest: 0.26, neck: 0.08, upper: 0.28, fore: 0.26, thigh: 0.45, shin: 0.42, shoulderX: 0.19, shoulderY: 0.21, hipX: 0.1 };

/** שלד: root → hips → spine → chest → neck → head; chest → upperArm/foreArm/hand (L/R); hips → thigh/shin/foot (L/R); chest → socket → holder. */
export function makeRig() {
  const j = {};
  const G = (name, parent, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); if (parent) parent.add(g); j[name] = g; return g; };
  const root = G('root', null, 0, 0, 0);
  G('hips', root, 0, DIM.hip, 0);
  G('spine', j.hips, 0, 0.02, 0);
  G('chest', j.spine, 0, DIM.spine, 0);
  G('neck', j.chest, 0, DIM.chest, 0);
  G('head', j.neck, 0, DIM.neck, 0);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    G('upperArm' + s, j.chest, sx * DIM.shoulderX, DIM.shoulderY, 0);
    G('foreArm' + s, j['upperArm' + s], 0, -DIM.upper, 0);
    G('hand' + s, j['foreArm' + s], 0, -DIM.fore, 0);
    G('thigh' + s, j.hips, sx * DIM.hipX, -0.04, 0);
    G('shin' + s, j['thigh' + s], 0, -DIM.thigh, 0);
    G('foot' + s, j['shin' + s], 0, -DIM.shin, 0);
  }
  G('socket', j.chest, 0, 0, 0);
  G('holder', j.socket, 0, 0, 0).rotation.y = -Math.PI / 2; // +X של הנשק → קדימה (+Z)
  return { root, j };
}

// תנוחות socket (במרחב החזה): [x, y, z, rotX, rotY, rotZ]. rotX חיובי = קנה למטה.
const POSE = {
  pistol: { ready: [-0.06, 0.06, 0.33, 0.5, 0.1, 0], aim: [-0.03, 0.2, 0.46, 0, 0, 0], kick: 1.0 },
  rifle:  { ready: [-0.1, 0.05, 0.2, 0.38, 0.2, 0.1], aim: [-0.09, 0.17, 0.22, 0, 0.02, 0], kick: 0.6 },
  smg:    { ready: [-0.09, 0.06, 0.22, 0.35, 0.15, 0.05], aim: [-0.08, 0.17, 0.26, 0, 0.02, 0], kick: 0.45 },
  heavy:  { ready: [-0.11, 0.04, 0.2, 0.4, 0.22, 0.1], aim: [-0.1, 0.16, 0.2, 0, 0.02, 0], kick: 1.6 },
  knife:  { ready: [-0.17, 0.02, 0.3, -0.35, 0.15, -0.2], aim: [-0.15, 0.08, 0.36, -0.2, 0.1, -0.2], kick: 0 },
};
export const holdType = (weaponId) =>
  !weaponId ? 'unarmed' : weaponId === 'knife' ? 'knife' : weaponId === 'pistol' ? 'pistol'
  : weaponId === 'smg' ? 'smg' : ['shotgun', 'sniper', 'plasma'].includes(weaponId) ? 'heavy'
  : weaponId === 'grenade' ? 'unarmed' : 'rifle';

const _m = new THREE.Matrix4(), _q = new Q(), _q2 = new Q(), _t = new V(), _p = new V(), _w = new V();

function solveArm(up, fo, targetW, poleW) {
  const la = DIM.upper, lb = DIM.fore;
  up.parent.updateMatrixWorld(true);
  _m.copy(up.parent.matrixWorld).invert();
  const t = _t.copy(targetW).applyMatrix4(_m).sub(up.position);
  const p = _p.copy(poleW).applyMatrix4(_m).sub(up.position);
  const d = clamp(t.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const dir = t.normalize();
  const A = Math.acos(clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1));
  const pole = p.sub(_w.copy(dir).multiplyScalar(p.dot(dir))).normalize();
  const elbow = dir.multiplyScalar(Math.cos(A)).add(pole.multiplyScalar(Math.sin(A)));
  up.quaternion.setFromUnitVectors(DOWN, elbow);
  up.updateMatrixWorld(true);
  _m.copy(up.matrixWorld).invert();
  const t2 = _t.copy(targetW).applyMatrix4(_m).sub(fo.position).normalize();
  fo.quaternion.setFromUnitVectors(DOWN, t2);
}

// אחיזה: כיוון כף היד במרחב הנשק. ציר Z של היד = קו המפרקים (צד האגודל ב-+Z), X = גב היד (החוצה), -Y = מפרק כף → אצבעות.
// IK מכוון לשורש כף היד, כך שמרכז האגרוף (FIST מתחת לשורש) יושב בדיוק על נקודת האחיזה.
const FIST = 0.06;
function handBasis(zh, xh) {
  const z = new V(...zh).normalize(), x = new V(...xh);
  x.sub(z.clone().multiplyScalar(x.dot(z))).normalize();
  return new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new V().crossVectors(z, x), z));
}
const gripQ = (rake) => handBasis([Math.sin(rake), Math.cos(rake), 0], [0, 0, -1]); // אגרוף סביב ידית משופעת, גב היד לימין
const Q_KNIFE = handBasis([Math.cos(0.6), Math.sin(0.6), 0], [0, 0, -1]);           // ידית הסכין עוברת באלכסון דרך האגרוף
const Q_SUPPORT = handBasis([1, 0, 0], [0, -0.97, -0.24]);                          // יד שמאל מתחת למגן היד, כף למעלה
const wristFor = (q, centerLocal) => new V(0, FIST, 0).applyQuaternion(q).add(centerLocal); // במרחב הנשק

function alignHand(hand, toObj, twist = 0) {
  hand.parent.updateMatrixWorld(true);
  hand.parent.getWorldQuaternion(_q).invert();
  toObj.getWorldQuaternion(_q2);
  hand.quaternion.copy(_q).multiply(_q2);
  if (twist) hand.rotateY(twist);
}

export class Animator {
  constructor(rig) {
    this.r = rig; this.j = rig.j;
    this.t = 0; this.phase = 0; this.speed = 0; this.aim = 0; this.aimHold = 0;
    this.type = 'unarmed'; this.weapon = null; this.equip = 1;
    this.rec = 0; this.recV = 0; this.act = null; this.actT = 0; this.yawLag = 0;
    this.blinkT = 2; this.look = new V();
  }

  /** model: THREE.Group של נשק (או null), weaponId לפי data/weapons.js */
  setWeapon(model, weaponId) {
    const h = this.j.holder;
    if (this.weapon) h.remove(this.weapon);
    this.weapon = model || null;
    this.type = holdType(model ? weaponId : null);
    if (model) {
      const g = model.userData.gripPoint || new V();
      model.position.copy(g).negate();
      h.add(model);
    }
    this.equip = 0; this.act = null;
  }

  /** 'shoot' | 'slash' | 'reload' */
  trigger(kind) {
    if (kind === 'shoot' && this.type !== 'unarmed' && this.type !== 'knife') {
      this.recV += 7 * (POSE[this.type]?.kick ?? 1); this.aimHold = 1.4; this.aim = Math.max(this.aim, 0.8); return;
    }
    if (kind === 'slash' || (kind === 'shoot' && this.type === 'knife')) { this.act = 'slash'; this.actT = 0; this.flip = !this.flip; return; }
    if (kind === 'shoot' && this.type === 'unarmed') { this.act = 'punch'; this.actT = 0; this.flip = !this.flip; return; }
    if (kind === 'reload' && this.type !== 'knife' && this.type !== 'unarmed') { this.act = 'reload'; this.actT = 0; }
  }

  /** speed: 0 עומד, ~0.5 הליכה, 1 ריצה. pitch: זווית כיוון (רדיאנים, חיובי = למעלה). yawRate: מהירות סיבוב (רד/ש). aiming: כוונת. */
  update(dt, { speed = 0, pitch = 0, yawRate = 0, aiming = false, aimPoint = null } = {}) {
    const j = this.j; dt = Math.min(dt, 0.05);
    this.t += dt;
    this.speed = damp(this.speed, speed, 8, dt);
    const s = this.speed, walk = clamp(s * 2, 0, 1), run = clamp(s * 2 - 1, 0, 1);
    const armed = this.type !== 'unarmed';
    this.aimHold = Math.max(0, this.aimHold - dt);
    this.aim = damp(this.aim, aiming || this.aimHold > 0 ? 1 : 0, 12, dt);
    this.equip = Math.min(1, this.equip + dt / 0.4);
    this.yawLag = damp(this.yawLag, clamp(yawRate * 0.06, -0.25, 0.25), 10, dt);
    // קפיץ רתע
    this.recV += (-90 * this.rec - 14 * this.recV) * dt; this.rec += this.recV * dt;

    // ---- רגליים ----
    if (s > 0.02) this.phase += dt * lerp(5.2, 10.5, run) * clamp(s * 3, 0.4, 1);
    const ph = this.phase, A = 0.42 * walk + 0.32 * run;
    for (const [side, off] of [['L', 0], ['R', Math.PI]]) {
      const p = ph + off;
      const sw = Math.sin(p);
      const stance = armed ? 0.12 : 0.04; // כריעה קלה במוכנות לקרב
      const spread = (side === 'L' ? 1 : -1) * (0.075 - 0.04 * walk); // A-stance: רגליים פתוחות בעמידה, מתקרבות בהליכה
      j['thigh' + side].rotation.set(-sw * A - stance - run * 0.15, 0, spread);
      const knee = Math.max(0, Math.sin(p - 1.1)) * (0.6 * walk + 0.9 * run) + stance * 1.8 + 0.04;
      j['shin' + side].rotation.x = knee;
      j['foot' + side].rotation.x = -(j['thigh' + side].rotation.x + knee) * 0.85 + Math.max(0, -Math.cos(p)) * 0.25 * walk;
      j['foot' + side].rotation.z = -spread; // כף רגל שטוחה על הקרקע
    }
    // אגן: קפיצה, נדנוד, העברת משקל בעמידה
    const bob = Math.abs(Math.cos(ph)) * (0.025 * walk + 0.04 * run);
    const breathe = Math.sin(this.t * 1.7);
    j.hips.position.y = DIM.hip - bob - (armed ? 0.035 : 0.01) - run * 0.04;
    j.hips.position.x = Math.sin(this.t * 0.45) * 0.012 * (1 - walk);
    j.hips.rotation.set(0, Math.sin(ph) * 0.12 * walk, Math.cos(ph) * 0.04 * walk + Math.sin(this.t * 0.45) * 0.015 * (1 - walk));

    // ---- גוף עליון ----
    const lean = run * 0.28 + walk * 0.05;
    const aimP = clamp(pitch, -1.1, 1.1);
    j.spine.rotation.set(lean - aimP * 0.35, -j.hips.rotation.y * 0.9 - this.yawLag * 0.6, -j.hips.rotation.z * 0.6);
    j.chest.rotation.set(breathe * 0.018 - aimP * 0.35, (armed ? 0.12 : 0) * (1 - this.aim * 0.5), 0);
    const ch = j.chest.scale; ch.set(1 + breathe * 0.008, 1, 1 + breathe * 0.012);
    // ראש: מסתכל לכוונה, מבט צדדי קטן בעמידה
    if (Math.random() < dt * 0.4) this.look.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.15, 0);
    const idleLook = (1 - walk) * (1 - this.aim);
    j.neck.rotation.set(-aimP * 0.3 + this.look.y * idleLook - lean * 0.6, this.look.x * idleLook - j.chest.rotation.y - j.spine.rotation.y * 0.5, 0);
    j.head.rotation.set(-run * 0.1, 0, 0);
    // מצמוץ
    this.blinkT -= dt;
    const eyes = j.head.userData.eyes;
    if (eyes) { const b = this.blinkT < 0.12 ? 0.1 : 1; eyes.forEach((e) => (e.scale.y = b)); if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3; }

    // ---- פעולות ----
    let slash = 0, reload = 0, punch = 0;
    if (this.act) {
      const dur = { slash: 0.38, reload: 1.3, punch: 0.3 }[this.act];
      this.actT += dt / dur;
      if (this.actT >= 1) this.act = null;
      else if (this.act === 'slash') slash = this.actT;
      else if (this.act === 'reload') reload = this.actT;
      else punch = this.actT;
    }

    if (!armed || !POSE[this.type]) return this.unarmedArms(dt, ph, walk, run, punch);

    // ---- socket: תנוחה + חיות ----
    const P = POSE[this.type];
    const k = ease(this.aim);
    const v = P.ready.map((x, i) => lerp(x, P.aim[i], k));
    const so = j.socket;
    const wobble = 1 - k * 0.7;
    so.position.set(
      v[0] + Math.sin(ph) * 0.018 * walk * wobble + Math.sin(this.t * 0.9) * 0.004,
      v[1] - Math.abs(Math.sin(ph)) * (0.018 * walk + 0.03 * run) * wobble + breathe * 0.005 - run * 0.03,
      v[2] - this.rec * 0.05,
    );
    so.rotation.set(
      v[3] - this.rec * 0.22 + Math.cos(ph * 2) * 0.03 * walk * wobble + run * 0.35 * (1 - k),
      v[4] - this.yawLag + Math.sin(ph) * 0.03 * walk * wobble - j.spine.rotation.y * 0.8,
      v[5] + Math.sin(ph) * 0.04 * walk * wobble,
    );
    // שליפה
    const e = ease(this.equip);
    so.position.y -= (1 - e) * 0.35; so.rotation.x += (1 - e) * 1.3;
    // כיוון אמיתי: הקנה מסתובב לנקודה שבמרכז הכוונת (במוכנות חלקית, בכיוון מלא)
    if (aimPoint && this.type !== 'knife') {
      so.parent.updateMatrixWorld(true);
      const sp = so.getWorldPosition(_aw);
      _am.lookAt(aimPoint, sp, UP);                       // ציר +Z של ה-socket → אל הנקודה
      _aq.setFromRotationMatrix(_am);
      so.parent.getWorldQuaternion(_aq2).invert();
      _aq.premultiply(_aq2);
      const w = (0.35 + 0.65 * k) * e;
      so.quaternion.slerp(_aq, w);
      so.rotateX(-this.rec * 0.22 * w);                    // הרתע נשאר גלוי
    }
    // דקירה/חיתוך בקשת (מתחלף ימינה/שמאלה)
    if (slash) {
      const dir = this.flip ? -1 : 1;
      const wind = ease(clamp(slash / 0.3, 0, 1)), cut = ease(clamp((slash - 0.3) / 0.45, 0, 1)), back = ease(clamp((slash - 0.75) / 0.25, 0, 1));
      const sx = lerp(lerp(0, 0.12 * dir, wind), -0.22 * dir, cut);
      so.position.x += sx * (1 - back);
      so.position.y += (wind * 0.14 - cut * 0.2) * (1 - back);
      so.position.z += (cut * 0.16 - wind * 0.05) * (1 - back);
      so.rotation.y += (wind * 0.6 * dir - cut * 1.5 * dir) * (1 - back);
      so.rotation.z += (cut * 0.9 * dir) * (1 - back);
      j.chest.rotation.y += (wind * 0.25 * dir - cut * 0.55 * dir) * (1 - back);
    }
    if (reload) {
      const r = Math.sin(reload * Math.PI);
      so.position.y -= r * 0.06; so.rotation.z += r * 0.55; so.rotation.x += r * 0.25;
      j.neck.rotation.x += r * 0.35;
    }

    // ---- IK ידיים ----
    j.root.updateMatrixWorld(true);
    const chestM = j.chest.matrixWorld;
    const poleR = new V(-0.7, -0.9, -0.4).applyMatrix4(chestM);
    const poleL = new V(0.7, -0.9, -0.4).applyMatrix4(chestM);
    const ud = this.weapon?.userData || {};
    const qR = this.type === 'knife' ? Q_KNIFE : gripQ(ud.gripAngle ?? 0.25);
    const gripW = wristFor(qR, new V()).applyMatrix4(j.holder.matrixWorld);
    solveArm(j.upperArmR, j.foreArmR, gripW, poleR);
    alignHand(j.handR, j.holder); j.handR.quaternion.multiply(qR);

    let supW;
    if (this.type === 'knife') {
      // יד שמאל בשמירה, זזה עם החיתוך
      supW = new V(0.16, 0.14 + breathe * 0.01 - slash * 0.05, 0.27 - slash * 0.1).applyMatrix4(chestM);
      solveArm(j.upperArmL, j.foreArmL, supW, poleL);
      j.handL.rotation.set(0, 0, 0.3);
    } else {
      const sp = (ud.supportPoint || new V(0.03, -0.01, -0.035)).clone().sub(ud.gripPoint || new V());
      const qL = this.type === 'pistol' ? gripQ(ud.gripAngle ?? 0.25) : Q_SUPPORT;
      if (this.type !== 'pistol') sp.y -= 0.012; // אגרוף מתחת למגן היד, לא בתוכו
      supW = wristFor(qL, sp).applyMatrix4(j.holder.matrixWorld);
      if (reload) {
        const mag = (ud.magPoint || new V(0.02, -0.14, 0)).clone().sub(ud.gripPoint || new V()).applyMatrix4(j.holder.matrixWorld);
        mag.y -= 0.1 * Math.sin(clamp((reload - 0.25) / 0.4, 0, 1) * Math.PI);
        supW.lerp(mag, Math.sin(reload * Math.PI));
      }
      solveArm(j.upperArmL, j.foreArmL, supW, poleL);
      alignHand(j.handL, j.holder); j.handL.quaternion.multiply(qL);
    }
  }

  unarmedArms(dt, ph, walk, run, punch) {
    const j = this.j;
    for (const [side, off, sx] of [['L', Math.PI, 1], ['R', 0, -1]]) {
      const sw = Math.sin(ph + off);
      const guard = 0.2; // אגרופים קצת מורמים
      j['upperArm' + side].rotation.set(-sw * (0.45 * walk + 0.5 * run) - run * 0.25 - guard * 0.3, 0, sx * (0.12 + Math.sin(this.t * 1.7) * 0.01));
      j['foreArm' + side].rotation.set(-0.25 - run * 1.0 - walk * 0.2 - guard + Math.max(0, sw) * 0.2 * walk, 0, 0);
      j['hand' + side].rotation.set(0, 0, 0);
    }
    if (punch) {
      const side = this.flip ? 'L' : 'R';
      const p = Math.sin(punch * Math.PI);
      j['upperArm' + side].rotation.x = lerp(j['upperArm' + side].rotation.x, -1.45, p);
      j['foreArm' + side].rotation.x = lerp(j['foreArm' + side].rotation.x, -0.1, p);
      j.chest.rotation.y += (side === 'R' ? 0.35 : -0.35) * p;
    }
  }
}
