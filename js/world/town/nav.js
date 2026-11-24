// ניווט לאזרחים: רשת 1×1 מ׳ מעל הזירה + A* + החלקת מסלול (קו ראייה ברשת).
// createNav(colliders, half) → { walkable(x,z), path(from, to) → [Vector3...], randomPoint(rand), nearestFree(x,z) }
import * as THREE from 'three';

const CELL = 1;

export function createNav(colliders, half, { inflate = 0.45, maxStep = 0.35 } = {}) {
  const N = Math.ceil((half * 2) / CELL);
  const grid = new Uint8Array(N * N); // 0 = פנוי, 1 = חסום
  const ix = (x) => Math.floor((x + half) / CELL), cx = (i) => -half + (i + 0.5) * CELL;
  // קצוות העולם חסומים
  for (let i = 0; i < N; i++) { grid[i] = grid[(N - 1) * N + i] = grid[i * N] = grid[i * N + N - 1] = 1; }
  for (const b of colliders) {
    if (b.min.y > 1.6 || b.max.y < maxStep) continue; // מעל הראש / נמוך מספיק לדרוך
    const x0 = Math.max(0, ix(b.min.x - inflate)), x1 = Math.min(N - 1, ix(b.max.x + inflate));
    const z0 = Math.max(0, ix(b.min.z - inflate)), z1 = Math.min(N - 1, ix(b.max.z + inflate));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * N + x] = 1;
  }
  const free = (i, j) => i >= 0 && j >= 0 && i < N && j < N && !grid[j * N + i];
  const walkable = (x, z) => free(ix(x), ix(z));

  function nearestFree(x, z) {
    let i = ix(x), j = ix(z);
    if (free(i, j)) return [i, j];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (free(i + di, j + dj)) return [i + di, j + dj];
    }
    return null;
  }
  // קו ראייה ברשת (DDA פשוט בצעדים של חצי תא)
  function los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / (CELL * 0.35));
    for (let k = 1; k < n; k++) { const t = k / n; if (!walkable(ax + dx * t, az + dz * t)) return false; }
    return true;
  }

  // A* עם ערימה בינארית
  const g = new Float32Array(N * N), came = new Int32Array(N * N), stamp = new Uint32Array(N * N), closed = new Uint32Array(N * N);
  let run = 0;
  const heap = [];
  const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
    return top[1];
  };
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

  function path(from, to) {
    const s = nearestFree(from.x, from.z), e = nearestFree(to.x, to.z);
    if (!s || !e) return [to.clone()];
    if (los(from.x, from.z, to.x, to.z)) return [new THREE.Vector3(to.x, 0, to.z)];
    run++; heap.length = 0;
    const sn = s[1] * N + s[0], en = e[1] * N + e[0];
    stamp[sn] = run; g[sn] = 0; came[sn] = -1; push(sn, 0);
    const h = (n) => { const dx = Math.abs((n % N) - e[0]), dz = Math.abs(((n / N) | 0) - e[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let found = false, iter = 0;
    while (heap.length && iter++ < 9000) {
      const n = pop();
      if (closed[n] === run) continue; closed[n] = run;
      if (n === en) { found = true; break; }
      const i = n % N, j = (n / N) | 0;
      for (const [di, dj, c] of NB) {
        const a = i + di, b = j + dj;
        if (!free(a, b)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue; // בלי לחתוך פינות
        const m = b * N + a;
        const ng = g[n] + c;
        if (stamp[m] === run && ng >= g[m]) continue;
        stamp[m] = run; g[m] = ng; came[m] = n; push(m, ng + h(m));
      }
    }
    if (!found) return [new THREE.Vector3(to.x, 0, to.z)];
    const cells = [];
    for (let n = en; n !== -1; n = came[n]) cells.push([cx(n % N), cx((n / N) | 0)]);
    cells.reverse();
    cells[cells.length - 1] = [to.x, to.z];
    // החלקה: מדלגים על נקודות כל עוד יש קו ראייה
    const out = [];
    let ax = from.x, az = from.z, k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let t = cells.length - 1; t > k + 1; t--) if (los(ax, az, cells[t][0], cells[t][1])) { far = t; break; }
      out.push(new THREE.Vector3(cells[far][0], 0, cells[far][1]));
      [ax, az] = cells[far]; k = far;
    }
    if (!out.length) out.push(new THREE.Vector3(to.x, 0, to.z));
    return out;
  }

  function randomPoint(rand = Math.random, near = null, radius = 12) {
    for (let k = 0; k < 60; k++) {
      const x = near ? near.x + (rand() * 2 - 1) * radius : (rand() * 2 - 1) * (half - 3);
      const z = near ? near.z + (rand() * 2 - 1) * radius : (rand() * 2 - 1) * (half - 3);
      if (walkable(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 10);
  }

  return { N, grid, walkable, path, randomPoint, nearestFree: (x, z) => { const c = nearestFree(x, z); return c ? new THREE.Vector3(cx(c[0]), 0, cx(c[1])) : new THREE.Vector3(x, 0, z); }, los };
}
