// מתאם PeerJS: WebRTC DataChannel דרך שרת האיתות החינמי של PeerJS (0.peerjs.com), בלי חשבון.
// המארח נרשם בשם קבוע לפי קוד החדר; הלקוח מקבל מזהה אקראי ומתחבר אליו.
// הספרייה נטענת רק כשצריך (לא במצב לא מקוון), מ-CDN בגרסה נעולה.
import { makeHub, netErr } from './transport.js';

export const PEERJS_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 's3d-strike3d-v1-';       // כדי לא להתנגש בחדרים של אתרים אחרים על אותו שרת
export const peerIdFor = (code) => PREFIX + code;

let loading = null;
export function loadPeerJS(timeout = 10000) {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PEERJS_SRC; s.async = true; s.crossOrigin = 'anonymous';
    const fail = (why) => { clearTimeout(t); loading = null; s.remove(); rej(netErr('unavailable', why)); };
    const t = setTimeout(() => fail('peerjs load timeout'), timeout);
    s.onload = () => { clearTimeout(t); window.Peer ? res(window.Peer) : fail('peerjs missing'); };
    s.onerror = () => fail('peerjs blocked');
    document.head.appendChild(s);
  });
  return loading;
}

function mapErr(e) {
  const type = e?.type || '';
  if (type === 'unavailable-id') return netErr('taken', e.message);
  if (type === 'peer-unavailable') return netErr('not-found', e.message);
  if (type === 'browser-incompatible') return netErr('unavailable', 'WebRTC not supported');
  return netErr('unavailable', e?.message || type);
}

function waitOpen(peer, timeout) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { peer.destroy(); rej(netErr('timeout')); }, timeout);
    peer.once('open', (id) => { clearTimeout(t); res(id); });
    peer.once('error', (e) => { clearTimeout(t); peer.destroy(); rej(mapErr(e)); });
  });
}

/** opts.peer: אפשרויות ל-new Peer (למשל שרת PeerJS משלכם או TURN ב-config.iceServers) */
export async function peerHost(code, { timeout = 12000, peer: popts = {} } = {}) {
  const Peer = await loadPeerJS();
  const peer = new Peer(peerIdFor(code), { debug: 0, ...popts });
  const id = await waitOpen(peer, timeout);
  const hub = makeHub(), conns = new Map();
  peer.on('connection', (c) => {
    c.on('open', () => { conns.set(c.peer, c); hub.emitJoin(c.peer); });
    c.on('data', (d) => hub.emitMsg(c.peer, d));
    const gone = () => { if (conns.get(c.peer) === c) { conns.delete(c.peer); hub.emitLeave(c.peer); } };
    c.on('close', gone); c.on('error', gone);
  });
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); }); // איבוד שרת האיתות לא מנתק ערוצים פתוחים
  peer.on('error', (e) => console.warn('[peerjs]', e.type, e.message));
  const sendTo = (c, m) => { if (c?.open) try { c.send(m); } catch (_) {} };
  return {
    kind: 'peer', id, isHost: true, ...hub,
    send(to, m) { sendTo(conns.get(to), m); },
    broadcast(m) { for (const c of conns.values()) sendTo(c, m); },
    close() { for (const c of conns.values()) c.close(); peer.destroy(); },
  };
}

export async function peerJoin(code, { timeout = 12000, peer: popts = {} } = {}) {
  const Peer = await loadPeerJS();
  const peer = new Peer({ debug: 0, ...popts });
  const id = await waitOpen(peer, timeout);
  const hub = makeHub(), hostId = peerIdFor(code);
  const conn = await new Promise((res, rej) => {
    const t = setTimeout(() => { peer.destroy(); rej(netErr('not-found')); }, timeout);
    const c = peer.connect(hostId, { reliable: true, serialization: 'json' });
    c.on('open', () => { clearTimeout(t); res(c); });
    peer.on('error', (e) => { clearTimeout(t); peer.destroy(); rej(mapErr(e)); });
  });
  let left = false;
  const leave = () => { if (!left) { left = true; hub.emitLeave(hostId); } };
  conn.on('data', (d) => hub.emitMsg(hostId, d));
  conn.on('close', leave); conn.on('error', leave);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  return {
    kind: 'peer', id, isHost: false, hostId, ...hub,
    send(_to, m) { if (conn.open) try { conn.send(m); } catch (_) {} },
    broadcast() {},
    close() { left = true; conn.close(); peer.destroy(); },
  };
}
