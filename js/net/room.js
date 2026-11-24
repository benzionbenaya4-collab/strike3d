// חדר: מעל Transport. לחיצת יד (hello/welcome), מזהי שחקנים קצרים (p1, p2...), ping ו-timeout, מגבלת 8.
// הודעות המשחק עצמן (in / shot / s ...) עוברות דרך onMsg בלי שינוי.
//
//   const room = hostRoom(transport, { max, count, onJoin(pid, {name, skin}), onLeave(pid), onMsg(pid, msg) });
//   room.send(pid, msg)  room.broadcast(msg)  room.close()
//
//   const room = await joinRoom(transport, { name, skin }, { onMsg(msg), onLost(reason) });
//   room.id (המזהה שלי במשחק)  room.send(msg)  room.close()
import { netErr } from './transport.js';

const now = () => performance.now();
export const cleanName = (s) => String(s || '').replace(/[<>&"'`]/g, '').trim().slice(0, 14) || 'שחקן';

export function hostRoom(tr, { max = 8, count = () => 0, onJoin, onLeave, onMsg, isOpen = () => true }) {
  const peers = new Map(); // peerId -> { pid, last }
  let n = 0, closed = false;
  const drop = (peerId, why = 'left') => {
    const pe = peers.get(peerId); if (!pe) return;
    peers.delete(peerId); onLeave?.(pe.pid, why);
  };
  tr.onMessage((from, m) => {
    if (closed || !m || typeof m !== 'object') return;
    let pe = peers.get(from);
    if (m.t === 'hello') {
      if (pe) return;
      if (count() >= max) { tr.send(from, { t: 'full' }); return; }
      if (!isOpen()) { tr.send(from, { t: 'closed' }); return; }
      pe = { pid: 'p' + (++n), last: now() }; peers.set(from, pe);
      tr.send(from, { t: 'welcome', id: pe.pid });
      onJoin?.(pe.pid, { name: cleanName(m.name), skin: String(m.skin || 'default').slice(0, 16) });
      return;
    }
    if (!pe) return;
    pe.last = now();
    if (m.t === 'bye') return drop(from);
    if (m.t === 'pong') return;
    onMsg?.(pe.pid, m);
  });
  tr.onLeave((peerId) => drop(peerId));
  const iv = setInterval(() => {
    tr.broadcast({ t: 'ping' });
    for (const [k, pe] of peers) if (now() - pe.last > 8000) drop(k, 'timeout');
  }, 2000);
  const peerOf = (pid) => { for (const [k, pe] of peers) if (pe.pid === pid) return k; return null; };
  return {
    get size() { return peers.size; },
    send(pid, m) { const k = peerOf(pid); if (k) tr.send(k, m); },
    broadcast(m) { tr.broadcast(m); },
    kick(pid) { const k = peerOf(pid); if (k) { tr.send(k, { t: 'kick' }); drop(k, 'kick'); } },
    close() { if (closed) return; closed = true; clearInterval(iv); try { tr.broadcast({ t: 'bye' }); } catch (_) {} setTimeout(() => tr.close(), 50); },
  };
}

export function joinRoom(tr, hello, { onMsg, onLost, timeout = 6000 }) {
  return new Promise((res, rej) => {
    let id = null, last = now(), done = false, iv = 0;
    const lost = (why) => { if (done) return; done = true; clearInterval(iv); try { tr.close(); } catch (_) {} onLost?.(why); };
    const t = setTimeout(() => { if (!id) { done = true; tr.close(); rej(netErr('timeout')); } }, timeout);
    tr.onMessage((_from, m) => {
      if (done || !m || typeof m !== 'object') return;
      last = now();
      if (!id) {
        if (m.t === 'welcome') {
          id = m.id; clearTimeout(t);
          iv = setInterval(() => { if (now() - last > 8000) lost('timeout'); }, 1000);
          res(room);
        } else if (m.t === 'full' || m.t === 'closed') { clearTimeout(t); done = true; tr.close(); rej(netErr(m.t)); }
        return;
      }
      if (m.t === 'ping') { tr.send(null, { t: 'pong' }); return; }
      if (m.t === 'bye') return lost('host-left');
      if (m.t === 'kick') return lost('kick');
      onMsg?.(m);
    });
    tr.onLeave(() => { if (id) lost('host-left'); });
    const room = {
      get id() { return id; },
      send(m) { if (!done) tr.send(null, m); },
      close() { if (done) return; done = true; clearInterval(iv); try { tr.send(null, { t: 'bye' }); } catch (_) {} setTimeout(() => tr.close(), 50); },
    };
    tr.send(null, { t: 'hello', name: hello.name, skin: hello.skin });
  });
}
