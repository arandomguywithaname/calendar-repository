'use strict';
/* ------------------------------------------------------------------
   audio.js — every sound is synthesised with the Web Audio API, so no
   audio files are needed. Positional cues use distance attenuation plus
   stereo panning relative to where the player is looking.
   ------------------------------------------------------------------ */

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.listener = { pos: [0, 0, 0], right: [1, 0, 0], fwd: [0, 0, -1] };
    this.maxDistance = 55;
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    // A lowpass we can sweep down for the flashbang / deafened effect.
    this.deafen = this.ctx.createBiquadFilter();
    this.deafen.type = 'lowpass';
    this.deafen.frequency.value = 20000;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 8;
    this.master.connect(this.deafen);
    this.deafen.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    this._makeNoise();
    this._startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setListener(pos, fwd) {
    this.listener.pos = pos;
    this.listener.fwd = fwd;
    this.listener.right = V.norm(V.cross(fwd, [0, 1, 0]));
  }

  /** Returns { gain, pan } for a world position, or null if inaudible. */
  _spatial(pos, refDist = 6) {
    if (!pos) return { gain: 1, pan: 0 };
    const d = V.sub(pos, this.listener.pos);
    const dist = V.len(d);
    if (dist > this.maxDistance) return null;
    const gain = Math.pow(clamp(1 - dist / this.maxDistance, 0, 1), 1.7) *
      (refDist / Math.max(refDist, dist)) ** 0.35;
    const pan = dist < 0.5 ? 0 : clamp(V.dot(V.mul(d, 1 / dist), this.listener.right), -1, 1);
    return { gain, pan };
  }

  _chain(spatial, extraGain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = (spatial ? spatial.gain : 1) * extraGain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = spatial ? spatial.pan : 0;
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  _noise(dest, dur, { type = 'lowpass', freq = 2000, q = 1, gain = 1, attack = 0.001, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(env); env.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
    return { src, filt, env };
  }

  _tone(dest, freq, dur, { type = 'sine', gain = 0.3, sweepTo = null, delay = 0, attack = 0.004 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env); env.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }

  /* ----------------------------- events ----------------------------- */

  play(name, pos, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const sp = this._spatial(pos, opts.refDist);
    if (pos && !sp) return;
    const fn = this['snd_' + name];
    if (fn) fn.call(this, sp, opts);
  }

  snd_rifle(sp) {
    const d = this._chain(sp, 0.9);
    this._noise(d, 0.16, { type: 'lowpass', freq: 3200, gain: 0.85, rate: 1.2 });
    this._noise(d, 0.05, { type: 'highpass', freq: 3800, gain: 0.5 });
    this._tone(d, 190, 0.14, { type: 'square', gain: 0.32, sweepTo: 60 });
    this._tone(d, 78, 0.22, { type: 'sine', gain: 0.4, sweepTo: 40 });
    this._tail(d, 0.5, 0.10);
  }
  snd_rifle_heavy(sp) {
    const d = this._chain(sp, 1.0);
    this._noise(d, 0.20, { type: 'lowpass', freq: 2600, gain: 0.95, rate: 1.0 });
    this._noise(d, 0.06, { type: 'highpass', freq: 3000, gain: 0.55 });
    this._tone(d, 150, 0.18, { type: 'square', gain: 0.38, sweepTo: 48 });
    this._tone(d, 62, 0.28, { type: 'sine', gain: 0.5, sweepTo: 32 });
    this._tail(d, 0.62, 0.12);
  }
  snd_rifle_s(sp) {
    const d = this._chain(sp, 0.55);
    this._noise(d, 0.10, { type: 'bandpass', freq: 1400, q: 0.8, gain: 0.6 });
    this._tone(d, 120, 0.09, { type: 'triangle', gain: 0.22, sweepTo: 50 });
  }
  snd_smg(sp) {
    const d = this._chain(sp, 0.75);
    this._noise(d, 0.11, { type: 'lowpass', freq: 4200, gain: 0.7, rate: 1.4 });
    this._tone(d, 240, 0.09, { type: 'square', gain: 0.24, sweepTo: 80 });
    this._tone(d, 95, 0.14, { type: 'sine', gain: 0.28, sweepTo: 45 });
    this._tail(d, 0.32, 0.07);
  }
  snd_smg_s(sp) {
    const d = this._chain(sp, 0.5);
    this._noise(d, 0.08, { type: 'bandpass', freq: 1800, q: 0.9, gain: 0.5 });
    this._tone(d, 150, 0.07, { type: 'triangle', gain: 0.18, sweepTo: 60 });
  }
  snd_pistol(sp) {
    const d = this._chain(sp, 0.72);
    this._noise(d, 0.10, { type: 'lowpass', freq: 3800, gain: 0.65, rate: 1.3 });
    this._tone(d, 260, 0.08, { type: 'square', gain: 0.25, sweepTo: 90 });
    this._tone(d, 100, 0.14, { type: 'sine', gain: 0.3, sweepTo: 48 });
    this._tail(d, 0.3, 0.06);
  }
  snd_pistol_s(sp) {
    const d = this._chain(sp, 0.45);
    this._noise(d, 0.07, { type: 'bandpass', freq: 1600, q: 1.0, gain: 0.45 });
    this._tone(d, 170, 0.06, { type: 'triangle', gain: 0.16, sweepTo: 70 });
  }
  snd_deagle(sp) {
    const d = this._chain(sp, 1.0);
    this._noise(d, 0.22, { type: 'lowpass', freq: 2800, gain: 0.95, rate: 0.9 });
    this._tone(d, 130, 0.2, { type: 'square', gain: 0.4, sweepTo: 42 });
    this._tone(d, 55, 0.3, { type: 'sine', gain: 0.5, sweepTo: 28 });
    this._tail(d, 0.7, 0.14);
  }
  snd_sniper(sp) {
    const d = this._chain(sp, 1.0);
    this._noise(d, 0.26, { type: 'lowpass', freq: 3000, gain: 0.9, rate: 0.85 });
    this._tone(d, 160, 0.22, { type: 'sawtooth', gain: 0.32, sweepTo: 40 });
    this._tone(d, 58, 0.34, { type: 'sine', gain: 0.45, sweepTo: 26 });
    this._tail(d, 0.8, 0.15);
  }
  snd_awp(sp) {
    const d = this._chain(sp, 1.15);
    this._noise(d, 0.32, { type: 'lowpass', freq: 2400, gain: 1.0, rate: 0.75 });
    this._tone(d, 120, 0.28, { type: 'sawtooth', gain: 0.38, sweepTo: 34 });
    this._tone(d, 46, 0.42, { type: 'sine', gain: 0.55, sweepTo: 22 });
    this._tail(d, 1.0, 0.18);
  }
  snd_shotgun(sp) {
    const d = this._chain(sp, 1.0);
    this._noise(d, 0.28, { type: 'lowpass', freq: 2200, gain: 0.95, rate: 0.8 });
    this._tone(d, 90, 0.26, { type: 'square', gain: 0.4, sweepTo: 30 });
    this._tail(d, 0.6, 0.13);
  }
  snd_knife(sp) {
    const d = this._chain(sp, 0.6);
    this._noise(d, 0.09, { type: 'bandpass', freq: 5200, q: 2.5, gain: 0.5, rate: 1.6 });
  }
  snd_knife_hit(sp) {
    const d = this._chain(sp, 0.8);
    this._noise(d, 0.12, { type: 'lowpass', freq: 900, gain: 0.7 });
    this._tone(d, 180, 0.1, { type: 'triangle', gain: 0.3, sweepTo: 60 });
  }

  /** Distant reflection that makes shots feel like they happen in a place. */
  _tail(dest, dur, gain) {
    this._noise(dest, dur, { type: 'lowpass', freq: 900, gain, attack: 0.03, rate: 0.6 });
  }

  snd_dryfire(sp) {
    const d = this._chain(sp, 0.5);
    this._noise(d, 0.04, { type: 'highpass', freq: 3000, gain: 0.3 });
  }
  snd_reload_out(sp) {
    const d = this._chain(sp, 0.5);
    this._noise(d, 0.07, { type: 'bandpass', freq: 1200, q: 1.4, gain: 0.35 });
    this._tone(d, 320, 0.05, { type: 'square', gain: 0.1 });
  }
  snd_reload_in(sp) {
    const d = this._chain(sp, 0.55);
    this._noise(d, 0.06, { type: 'bandpass', freq: 900, q: 1.2, gain: 0.4 });
    this._tone(d, 210, 0.06, { type: 'square', gain: 0.14 });
  }
  snd_reload_done(sp) {
    const d = this._chain(sp, 0.5);
    this._noise(d, 0.05, { type: 'highpass', freq: 2200, gain: 0.35 });
    this._tone(d, 480, 0.04, { type: 'square', gain: 0.12 });
  }
  snd_switch(sp) {
    const d = this._chain(sp, 0.4);
    this._noise(d, 0.05, { type: 'bandpass', freq: 2600, q: 1.6, gain: 0.28 });
  }
  snd_step(sp, o = {}) {
    const d = this._chain(sp, o.volume || 0.5);
    this._noise(d, 0.075, {
      type: 'bandpass', freq: 520 + Math.random() * 380, q: 0.9,
      gain: 0.5, rate: 0.8 + Math.random() * 0.5,
    });
    this._noise(d, 0.03, { type: 'highpass', freq: 4200, gain: 0.14 });
  }
  snd_land(sp) {
    const d = this._chain(sp, 0.7);
    this._noise(d, 0.14, { type: 'lowpass', freq: 700, gain: 0.6 });
    this._tone(d, 90, 0.1, { type: 'sine', gain: 0.2, sweepTo: 40 });
  }
  snd_jump(sp) {
    const d = this._chain(sp, 0.35);
    this._noise(d, 0.06, { type: 'bandpass', freq: 700, q: 1, gain: 0.3 });
  }
  snd_impact(sp) {
    const d = this._chain(sp, 0.6);
    this._noise(d, 0.07, { type: 'bandpass', freq: 2600 + Math.random() * 1800, q: 1.2, gain: 0.5, rate: 1.5 });
    this._tone(d, 400 + Math.random() * 500, 0.05, { type: 'triangle', gain: 0.12, sweepTo: 200 });
  }
  snd_ricochet(sp) {
    const d = this._chain(sp, 0.5);
    this._tone(d, 2600 + Math.random() * 1500, 0.22, { type: 'sine', gain: 0.14, sweepTo: 700 });
  }
  snd_whiz(sp) {
    const d = this._chain(sp, 0.7);
    this._noise(d, 0.10, { type: 'bandpass', freq: 1700, q: 3.5, gain: 0.5, rate: 2.4 });
  }
  snd_hit(sp) {
    const d = this._chain(sp, 0.75);
    this._noise(d, 0.09, { type: 'lowpass', freq: 1100, gain: 0.6 });
    this._tone(d, 150, 0.08, { type: 'triangle', gain: 0.25, sweepTo: 70 });
  }
  snd_hitmarker() {
    const d = this._chain(null, 0.4);
    this._tone(d, 1400, 0.05, { type: 'square', gain: 0.12 });
  }
  snd_headshot() {
    const d = this._chain(null, 0.5);
    this._tone(d, 2100, 0.07, { type: 'square', gain: 0.16 });
    this._tone(d, 1500, 0.09, { type: 'sine', gain: 0.12, delay: 0.03 });
  }
  snd_death(sp) {
    const d = this._chain(sp, 0.8);
    this._noise(d, 0.35, { type: 'lowpass', freq: 600, gain: 0.5 });
    this._tone(d, 120, 0.4, { type: 'sine', gain: 0.2, sweepTo: 45 });
  }
  snd_explode(sp) {
    const d = this._chain(sp, 1.3);
    this._noise(d, 0.9, { type: 'lowpass', freq: 1400, gain: 1.0, rate: 0.5, attack: 0.005 });
    this._tone(d, 70, 0.8, { type: 'sine', gain: 0.7, sweepTo: 24 });
    this._tone(d, 160, 0.4, { type: 'sawtooth', gain: 0.3, sweepTo: 40 });
  }
  snd_bounce(sp) {
    const d = this._chain(sp, 0.45);
    this._tone(d, 700 + Math.random() * 400, 0.07, { type: 'triangle', gain: 0.2, sweepTo: 300 });
  }
  snd_flash(sp) {
    const d = this._chain(sp, 1.0);
    this._noise(d, 0.4, { type: 'highpass', freq: 1800, gain: 0.9, rate: 1.8 });
    this._tone(d, 900, 0.3, { type: 'sine', gain: 0.35, sweepTo: 300 });
  }
  /** Ear ring after a flashbang, with the world muffled underneath. */
  ring(duration) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.deafen.frequency.cancelScheduledValues(t);
    this.deafen.frequency.setValueAtTime(500, t);
    this.deafen.frequency.exponentialRampToValueAtTime(20000, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this.comp);
    for (const f of [4300, 6100]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + duration + 0.05);
    }
  }
  snd_smoke(sp) {
    const d = this._chain(sp, 0.9);
    this._noise(d, 2.4, { type: 'lowpass', freq: 1500, gain: 0.5, attack: 0.05, rate: 0.7 });
  }
  snd_pin(sp) {
    const d = this._chain(sp, 0.5);
    this._tone(d, 1800, 0.06, { type: 'square', gain: 0.15 });
    this._noise(d, 0.05, { type: 'highpass', freq: 4000, gain: 0.2 });
  }
  snd_beep(sp, o = {}) {
    const d = this._chain(sp, 0.8);
    this._tone(d, o.freq || 2400, 0.07, { type: 'square', gain: 0.18 });
  }
  snd_plant_tick(sp) {
    const d = this._chain(sp, 0.5);
    this._tone(d, 900, 0.04, { type: 'square', gain: 0.1 });
  }
  snd_planted(sp) {
    const d = this._chain(sp, 1.0);
    this._tone(d, 700, 0.25, { type: 'sawtooth', gain: 0.25, sweepTo: 1400 });
    this._tone(d, 350, 0.4, { type: 'sine', gain: 0.2 });
  }
  snd_defuse(sp) {
    const d = this._chain(sp, 0.55);
    this._noise(d, 0.12, { type: 'bandpass', freq: 700, q: 1.4, gain: 0.4, rate: 0.6 });
  }
  snd_defused(sp) {
    const d = this._chain(sp, 1.0);
    this._tone(d, 1200, 0.3, { type: 'sine', gain: 0.25, sweepTo: 500 });
    this._tone(d, 800, 0.4, { type: 'triangle', gain: 0.18, delay: 0.1 });
  }
  snd_buy() {
    const d = this._chain(null, 0.5);
    this._tone(d, 900, 0.07, { type: 'square', gain: 0.12 });
    this._tone(d, 1350, 0.09, { type: 'square', gain: 0.1, delay: 0.05 });
  }
  snd_error() {
    const d = this._chain(null, 0.5);
    this._tone(d, 260, 0.13, { type: 'square', gain: 0.12, sweepTo: 150 });
  }
  snd_roundstart() {
    const d = this._chain(null, 0.7);
    this._tone(d, 420, 0.5, { type: 'triangle', gain: 0.16, sweepTo: 620 });
    this._tone(d, 210, 0.6, { type: 'sine', gain: 0.14 });
  }
  snd_win() {
    const d = this._chain(null, 0.8);
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone(d, f, 0.42, { type: 'triangle', gain: 0.16, delay: i * 0.11 }));
  }
  snd_lose() {
    const d = this._chain(null, 0.8);
    [392, 349, 294, 233].forEach((f, i) =>
      this._tone(d, f, 0.45, { type: 'triangle', gain: 0.15, delay: i * 0.13 }));
  }
  snd_tenseconds() {
    const d = this._chain(null, 0.6);
    this._tone(d, 1500, 0.12, { type: 'square', gain: 0.1 });
  }

  /** Faint wind bed so silence between rounds is not dead air. */
  _startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.25;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 380;
    filt.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
    // slow swell
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    lfo.start();
  }
}
