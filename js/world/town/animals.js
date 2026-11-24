// כלבים וחתולים של העיר – מודלים קטנים עם רגליים, זנב ונביחה.
// buildDog(color) / buildCat(color) → { root, kind, update(dt, speed, mode) }  mode: 'idle'|'walk'|'run'|'bark'|'hiss'
import * as THREE from 'three';
import { skinify } from './batch.js';

const std = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

function quadruped({ kind, color, color2, len, h, legLen, headR }) {
  const root = new THREE.Group(); root.name = kind;
  const m1 = std(color), m2 = std(color2), dark = std('#111');
  const body = new THREE.Group(); body.position.y = legLen; root.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(h * 0.9, h, len), m1); body.add(torso);
  // ראש
  const head = new THREE.Group(); head.position.set(0, h * 0.55, len / 2 + headR * 0.4); body.add(head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(headR * 2, headR * 1.8, headR * 1.9), m1));
  const snout = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.1, headR * 0.8, headR * (kind === 'dog' ? 1.3 : 0.6)), m2);
  snout.position.set(0, -headR * 0.35, headR * (kind === 'dog' ? 1.4 : 1.1)); head.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.4, headR * 0.3, headR * 0.2), dark);
  nose.position.set(0, -headR * 0.1, headR * (kind === 'dog' ? 2.05 : 1.45)); head.add(nose);
  const jaw = new THREE.Group(); jaw.position.set(0, -headR * 0.8, headR * 1.2); head.add(jaw);
  jaw.add(new THREE.Mesh(new THREE.BoxGeometry(headR * 0.9, headR * 0.25, headR * 1.1), m2));
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.25, headR * 0.25, 0.01), kind === 'cat' ? new THREE.MeshBasicMaterial({ color: '#c8e04a' }) : dark);
    eye.position.set(sx * headR * 0.5, headR * 0.25, headR * 0.96); head.add(eye);
    const ear = new THREE.Mesh(kind === 'cat' ? new THREE.ConeGeometry(headR * 0.45, headR * 0.9, 4) : new THREE.BoxGeometry(headR * 0.5, headR * 1.0, headR * 0.15), kind === 'cat' ? m1 : m2);
    ear.position.set(sx * headR * 0.65, headR * (kind === 'cat' ? 1.2 : 0.6), -headR * 0.2);
    if (kind === 'dog') { ear.position.y = headR * 0.4; ear.position.x = sx * headR * 1.05; }
    head.add(ear);
  }
  // רגליים
  const legs = [];
  const legGeo = new THREE.BoxGeometry(h * 0.22, legLen, h * 0.22).translate(0, -legLen / 2, 0);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const p = new THREE.Group(); p.position.set(x * h * 0.3, 0, z * len * 0.38); body.add(p);
    p.add(new THREE.Mesh(legGeo, m1)); legs.push(p);
  }
  // זנב
  const tail = new THREE.Group(); tail.position.set(0, h * 0.3, -len / 2); body.add(tail);
  const tl = kind === 'cat' ? len * 0.9 : len * 0.5;
  const tm = new THREE.Mesh(new THREE.BoxGeometry(h * 0.15, h * 0.15, tl).translate(0, 0, -tl / 2), kind === 'cat' ? m1 : m2);
  tail.add(tm); tail.rotation.x = kind === 'cat' ? -1.1 : -0.6;

  skinify(root); // draw call אחד לחיה
  let ph = 0, t = 0;
  const A = {
    root, kind, head, jaw, tail, legs, body,
    update(dt, speed = 0, mode = 'idle') {
      t += dt;
      ph += dt * (4 + speed * 5) * (speed > 0.05 ? 1 : 0);
      const amp = Math.min(0.7, speed * 0.35);
      legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });
      body.position.y = legLen + Math.abs(Math.sin(ph)) * amp * 0.03;
      jaw.position.y = -headR * 0.8; head.rotation.set(0, 0, 0);
      if (kind === 'dog') {
        tail.rotation.y = Math.sin(t * (mode === 'bark' ? 6 : 14)) * (mode === 'bark' ? 0.2 : 0.6);
        tail.rotation.x = mode === 'bark' ? -0.2 : -0.7;
        if (mode === 'bark') { const b = Math.max(0, Math.sin(t * 9)); jaw.position.y -= b * headR * 0.4; head.rotation.x = -b * 0.25; body.rotation.x = -0.08; }
        else body.rotation.x = 0;
      } else {
        tail.rotation.x = mode === 'hiss' || mode === 'run' ? -0.3 : -1.1 + Math.sin(t * 1.3) * 0.15;
        tail.rotation.y = Math.sin(t * 2) * 0.3;
        body.rotation.x = mode === 'hiss' ? 0.15 : 0;
        if (mode === 'hiss') jaw.position.y -= headR * 0.25;
      }
    },
  };
  return A;
}

export const buildDog = (color = '#a06a3a', color2 = '#e8d2b0') => quadruped({ kind: 'dog', color, color2, len: 0.62, h: 0.26, legLen: 0.3, headR: 0.1 });
export const buildCat = (color = '#555', color2 = '#ddd') => quadruped({ kind: 'cat', color, color2, len: 0.42, h: 0.16, legLen: 0.17, headR: 0.075 });
