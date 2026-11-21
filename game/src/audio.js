// audio.js — every sound is synthesised with WebAudio. No audio files,
// no network. Footsteps are stereo-panned by direction and distance, so
// a guard's patrol tells you where he is before you see him.
let ctx = null;
let master = null;
let muted = false;
let humNodes = null;

function ensureContext() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

export function initAudio() {
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  startAmbientHum();
  return !!c;
}

export function setMuted(value) {
  muted = !!value;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

// Pan -1 (left) .. 1 (right) from the player's view: the guard's x
// relative to the player, scaled by distance.
export function panFor(sourceX, playerX, dist) {
  const raw = (sourceX - playerX) / 9;
  return Math.max(-1, Math.min(1, raw));
}

function gainFor(dist, maxDist) {
  return Math.max(0, 1 - dist / maxDist);
}

function noiseBurst(duration, filterFreq, volume, pan) {
  if (!ctx || muted) return;
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan || 0;
    src.connect(filter).connect(g).connect(panner).connect(master);
    src.start();
  } catch (err) { /* audio is cosmetic; never break the game */ }
}

function tone(freq, duration, volume, pan, type, slideTo) {
  if (!ctx || muted) return;
  try {
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan || 0;
    osc.connect(g).connect(panner).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch (err) { /* cosmetic */ }
}

// A soft heel-toe thud. Player steps are quieter than guard steps.
export function playFootstep(isGuard, pan, dist) {
  const vol = isGuard ? 0.22 * gainFor(dist, 14) : 0.1;
  if (vol <= 0.01) return;
  noiseBurst(0.09, isGuard ? 320 : 260, vol, pan);
}

export function playCoinClink(pan, dist) {
  const vol = 0.3 * gainFor(dist, 12);
  tone(2093, 0.12, vol, pan, 'triangle');
  setTimeout(() => tone(1568, 0.18, vol * 0.8, pan, 'triangle'), 70);
}

export function playPickupChime() {
  tone(880, 0.15, 0.25, 0, 'sine');
  setTimeout(() => tone(1318, 0.25, 0.25, 0, 'sine'), 90);
  setTimeout(() => tone(1760, 0.3, 0.2, 0, 'sine'), 180);
}

export function playStarChime() {
  [523, 659, 784, 1046].forEach((f, i) => {
    setTimeout(() => tone(f, 0.4, 0.25, 0, 'triangle'), i * 110);
  });
}

export function playAlarmSting() {
  tone(220, 0.5, 0.3, 0, 'sawtooth', 440);
  setTimeout(() => tone(220, 0.5, 0.3, 0, 'sawtooth', 440), 450);
}

export function playCaughtSting() {
  tone(330, 0.7, 0.3, 0, 'sawtooth', 110);
}

export function playWinFanfare() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => {
    setTimeout(() => tone(f, 0.5, 0.22, 0, 'triangle'), i * 130);
  });
}

// Low night hum: two detuned sines + filtered noise, barely there.
export function startAmbientHum() {
  if (!ctx || humNodes || muted) return;
  try {
    const g = ctx.createGain();
    g.gain.value = 0.035;
    g.connect(master);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 55.7;
    o1.connect(g);
    o2.connect(g);
    o1.start();
    o2.start();
    humNodes = { o1, o2, g };
  } catch (err) { /* cosmetic */ }
}
