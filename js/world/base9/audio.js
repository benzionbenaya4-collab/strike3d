// בסיס 9 – סאונד ב-WebAudio, בלי קבצים. מתחיל רק אחרי קליק (start()).
// API: const au = createAudio();  au.start()  au.setAmbience('outdoor'|'indoor'|'hangar'|null)
//      au.setDanger(0..1)  (דופק + צליל מאיים)  au.sfx(name)  au.radio(sec)  au.setMuted(b)  au.dispose()
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, amb = null, danger = null, muted = false, dLevel = 0, hbT = 0, alive = true;
  const A = {
    get ready() { return !!ctx; },
    start() {
      if (ctx) { ctx.resume?.(); return; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ctx = null; return; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      buildDanger();
      if (A._want) A.setAmbience(A._want);
    },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
    setAmbience(kind) {
      A._want = kind;
      if (!ctx) return;
      if (amb?.kind === kind) return;
      if (amb) { const old = amb; fade(old.g, 0, 1.5); setTimeout(() => old.nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch (_) {} }), 1700); amb = null; }
      if (!kind) return;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
      const nodes = [];
      // צליל עמוק קבוע (drone): שני מתנדים מעט לא מכוונים + פילטר
      const base = kind === 'outdoor' ? 46 : kind === 'hangar' ? 38 : 55;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(g);
      for (const f of [base, base * 1.007, base * 1.5]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = f > base * 1.2 ? 0.03 : 0.06; o.connect(og); og.connect(lp); o.start(); nodes.push(o, og);
      }
      // רוח (בחוץ) / זמזום אוורור (בפנים): רעש מסונן עם LFO
      const n = noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = kind === 'outdoor' ? 420 : 180; bp.Q.value = kind === 'outdoor' ? 0.6 : 2;
      const ng = ctx.createGain(); ng.gain.value = kind === 'outdoor' ? 0.22 : 0.08;
      n.connect(bp); bp.connect(ng); ng.connect(g); n.start(); nodes.push(n, bp, ng);
      const lfo = ctx.createOscillator(); lfo.frequency.value = kind === 'outdoor' ? 0.13 : 0.07;
      const lg = ctx.createGain(); lg.gain.value = kind === 'outdoor' ? 260 : 40; lfo.connect(lg); lg.connect(bp.frequency); lfo.start(); nodes.push(lfo, lg);
      if (kind !== 'outdoor') { // זמזום חשמלי חלש
        const h = ctx.createOscillator(); h.type = 'square'; h.frequency.value = 100;
        const hg = ctx.createGain(); hg.gain.value = 0.006; h.connect(hg); hg.connect(g); h.start(); nodes.push(h, hg);
      }
      fade(g, 1, 2.5);
      amb = { kind, g, nodes };
    },
    setDanger(v) { dLevel = Math.max(0, Math.min(1, v)); if (danger) danger.g.gain.setTargetAtTime(dLevel * 0.12, ctx.currentTime, 0.4); },
    /** לקרוא בכל פריים – דופק לב לפי רמת הסכנה */
    tick(dt) {
      if (!ctx || dLevel < 0.15) return;
      hbT -= dt;
      if (hbT <= 0) { hbT = 1.1 - dLevel * 0.55; thump(0, 0.5 * dLevel); thump(0.16, 0.35 * dLevel); }
    },
    radio(sec = 1) { // רחש רדיו מתחת לקול
      if (!ctx) return;
      const t = ctx.currentTime, n = noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.05);
      g.gain.setValueAtTime(0.06, t + sec); g.gain.linearRampToValueAtTime(0, t + sec + 0.2);
      n.connect(bp); bp.connect(g); g.connect(master); n.start(t); n.stop(t + sec + 0.3);
      blip(1200, 0.06, 0.08); blip(900, 0.06, 0.06, sec);
    },
    sfx(name) {
      if (!ctx) return;
      const t = ctx.currentTime;
      switch (name) {
        case 'shot': burst(0.25, 1600, 0.5, 0.18); boom(90, 0.6, 0.25); break;
        case 'empty': blip(2400, 0.02, 0.05); break;
        case 'knife': burst(0.12, 3200, 0.25, 0.1); break;
        case 'click': blip(1800, 0.03, 0.1); break;
        case 'pickup': blip(660, 0.08, 0.12); blip(990, 0.1, 0.12, 0.08); break;
        case 'page': burst(0.18, 2600, 0.12, 0.04); break;
        case 'door': boom(55, 1.2, 0.35); burst(0.6, 400, 0.15, 0.3); break;
        case 'denied': blip(220, 0.18, 0.12); blip(180, 0.2, 0.12, 0.2); break;
        case 'beep': blip(1320, 0.07, 0.1); break;
        case 'ok': blip(880, 0.08, 0.1); blip(1320, 0.12, 0.1, 0.1); break;
        case 'gen': boom(40, 2.4, 0.5); { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(20, t); o.frequency.exponentialRampToValueAtTime(100, t + 2);
          const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.linearRampToValueAtTime(0, t + 2.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.7); } break;
        case 'sting': { // צליל בהלה: אשכול צורם
          for (const f of [311, 330, 466, 622]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.92, t + 1.2);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.5); }
          burst(0.5, 900, 0.2, 0.4); break; }
        case 'hiss': burst(0.6, 5000, 0.12, 0.5); break; // צל נשרף באור
        case 'whisper': { const n = noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(700 + Math.random() * 900, t); bp.Q.value = 8;
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 1.3);
          n.connect(bp); bp.connect(g); g.connect(master); n.start(t); n.stop(t + 1.4); break; }
        case 'hurt': boom(70, 0.4, 0.5); burst(0.2, 800, 0.3, 0.15); break;
        case 'die': boom(40, 2, 0.6); burst(1.5, 300, 0.3, 1.2); break;
        case 'flick': blip(4000, 0.01, 0.03); break;
        case 'engine': { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(420, t + 5);
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.09, t + 1.5); g.gain.linearRampToValueAtTime(0, t + 7);
          o.connect(g); g.connect(master); o.start(t); o.stop(t + 7.2); burst(6, 700, 0.18, 5.5); break; }
        case 'step': burst(0.05, 500, 0.06, 0.04); break;
      }
    },
    dispose() {
      alive = false;
      try { ctx?.close(); } catch (_) {}
      ctx = null; amb = null;
    },
  };

  function noise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function fade(g, v, sec) { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + sec); }
  function blip(f, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, freq, vol, decay) {
    const t = ctx.currentTime, n = noise(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.02, decay));
    n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + dur + 0.05);
  }
  function boom(f, dur, vol) {
    const t = ctx.currentTime, o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function thump(delay, vol) { if (!alive || !ctx) return; const t = ctx.currentTime + delay, o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.15);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25); }
  function buildDanger() { // צליל גבוה ורועד שמתגבר כשצל קרוב
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 880;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 932;
    const g = ctx.createGain(); g.gain.value = 0; o.connect(g); o2.connect(g); g.connect(master); o.start(); o2.start();
    danger = { g, o, o2 };
  }
  return A;
}
