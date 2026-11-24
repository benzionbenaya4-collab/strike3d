// מתאם BroadcastChannel: "רשת" בין לשוניות של אותו דפדפן (אותו origin). לבדיקות מקומיות ול-Playwright.
// ערוץ לכל חדר: 's3d-room-<CODE>'. מעטפה: { k, from, to, m }.
import { makeHub, netErr, rid } from './transport.js';

const chan = (code) => new BroadcastChannel('s3d-room-' + code);

export async function bcHost(code) {
  if (typeof BroadcastChannel === 'undefined') throw netErr('unavailable', 'BroadcastChannel not supported');
  const ch = chan(code), id = 'h-' + rid(), hub = makeHub(), peers = new Set();
  // בודקים שאין כבר מארח עם אותו קוד
  const taken = await new Promise((res) => {
    const t = setTimeout(() => res(false), 250);
    ch.onmessage = (e) => { if (e.data?.k === 'here') { clearTimeout(t); res(true); } };
    ch.postMessage({ k: 'probe', from: id });
  });
  if (taken) { ch.close(); throw netErr('taken'); }
  let open = true;
  ch.onmessage = (e) => {
    const d = e.data; if (!d || d.from === id) return;
    if (d.k === 'probe') ch.postMessage({ k: 'here', from: id });
    else if (d.k === 'join') { const isNew = !peers.has(d.from); peers.add(d.from); ch.postMessage({ k: 'accept', from: id, to: d.from }); if (isNew) hub.emitJoin(d.from); }
    else if (d.k === 'm' && d.to === id && peers.has(d.from)) hub.emitMsg(d.from, d.m);
    else if (d.k === 'bye' && peers.delete(d.from)) hub.emitLeave(d.from);
  };
  const post = (o) => { if (open) ch.postMessage(o); };
  return {
    kind: 'bc', id, isHost: true, ...hub,
    send(to, m) { post({ k: 'm', from: id, to, m }); },
    broadcast(m) { if (peers.size) post({ k: 'm', from: id, to: '*', m }); },
    close() { post({ k: 'bye', from: id }); open = false; ch.close(); },
  };
}

export async function bcJoin(code, { timeout = 1500 } = {}) {
  if (typeof BroadcastChannel === 'undefined') throw netErr('unavailable', 'BroadcastChannel not supported');
  const ch = chan(code), id = 'c-' + rid(), hub = makeHub();
  const hostId = await new Promise((res, rej) => {
    const t = setTimeout(() => { ch.close(); rej(netErr('not-found')); }, timeout);
    ch.onmessage = (e) => { const d = e.data; if (d?.k === 'accept' && d.to === id) { clearTimeout(t); res(d.from); } };
    ch.postMessage({ k: 'join', from: id });
  });
  let open = true;
  ch.onmessage = (e) => {
    const d = e.data; if (!d || d.from !== hostId) return;
    if (d.k === 'm' && (d.to === id || d.to === '*')) hub.emitMsg(hostId, d.m);
    else if (d.k === 'bye') hub.emitLeave(hostId);
  };
  return {
    kind: 'bc', id, isHost: false, hostId, ...hub,
    send(_to, m) { if (open) ch.postMessage({ k: 'm', from: id, to: hostId, m }); },
    broadcast() {},
    close() { if (!open) return; ch.postMessage({ k: 'bye', from: id }); open = false; ch.close(); },
  };
}
