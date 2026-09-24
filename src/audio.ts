import { store } from './store.ts';
// All sound is synthesised with WebAudio — no asset files.

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = store.get('onitama.muted') === '1';

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.0;
    this.amb.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m: boolean) {
    this.muted = m;
    store.set('onitama.muted', m ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  private noise(dur: number, t0: number, out: AudioNode, filter: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    return f;
  }

  private tone(freq: number, t0: number, dur: number, gain: number, type: OscillatorType = 'sine', out: AudioNode = this.sfx, endFreq?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** Stone set down on slate. */
  clack(weight = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = 0.9 + Math.random() * 0.2;
    this.noise(0.05, t, this.sfx, 'bandpass', 3000 * p, 1.4, 0.55 * weight);
    this.tone(1250 * p, t, 0.09, 0.18 * weight, 'triangle', this.sfx, 820 * p);
    this.tone(2630 * p, t, 0.05, 0.06 * weight);
    this.tone(190 * p, t, 0.08, 0.25 * weight, 'sine', this.sfx, 120);
  }

  /** Stone thumping into gravel. */
  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(0.22, t, this.sfx, 'lowpass', 700, 0.7, 0.6);
    this.noise(0.35, t + 0.02, this.sfx, 'bandpass', 2400, 0.6, 0.12, 0.02);
    this.tone(95, t, 0.15, 0.35, 'sine', this.sfx, 60);
  }

  lift() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(0.06, t, this.sfx, 'highpass', 4000, 0.7, 0.05);
  }

  /** Paper card sliding. */
  swish() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.noise(0.42, t, this.sfx, 'bandpass', 900, 0.9, 0.16, 0.12);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
  }

  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1800, t, 0.05, 0.07, 'sine');
    this.tone(900, t, 0.06, 0.05, 'triangle');
  }

  chime(win = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Yo pentatonic scale on D
    const scale = win ? [587.3, 659.3, 784.0, 880.0, 987.8, 1174.7, 1318.5] : [293.7, 329.6, 392.0, 440.0, 493.9];
    for (let i = 0; i < (win ? 9 : 5); i++) {
      const f = scale[Math.floor(Math.random() * scale.length)];
      const t0 = t + i * (win ? 0.16 : 0.35) + Math.random() * 0.05;
      this.tone(f, t0, 2.8, 0.08, 'sine');
      this.tone(f * 2.76, t0, 1.2, 0.02, 'sine');
      this.tone(f * 5.4, t0, 0.6, 0.008, 'sine');
    }
  }

  /** Synthesised one-shots for the card capture effects. */
  fx(kind: 'slash' | 'fire' | 'water' | 'whoosh' | 'snap' | 'boom' | 'shimmer' | 'hoof' | 'zap' | 'hiss') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    switch (kind) {
      case 'slash':
        for (let i = 0; i < 3; i++) {
          const f = this.noise(0.16, t + i * 0.06, this.sfx, 'bandpass', 2500, 1.2, 0.35, 0.01);
          f.frequency.exponentialRampToValueAtTime(7000, t + i * 0.06 + 0.12);
        }
        break;
      case 'fire': {
        const f = this.noise(1.3, t, this.sfx, 'bandpass', 300, 0.8, 0.55, 0.08);
        f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
        f.frequency.exponentialRampToValueAtTime(500, t + 1.3);
        this.noise(1.2, t, this.sfx, 'lowpass', 220, 0.7, 0.5, 0.05);
        for (let i = 0; i < 14; i++) this.noise(0.03, t + Math.random() * 1.1, this.sfx, 'highpass', 3500, 1, 0.12);
        break;
      }
      case 'water':
        this.tone(380, t, 0.14, 0.22, 'sine', this.sfx, 950);
        this.tone(520, t + 0.08, 0.12, 0.14, 'sine', this.sfx, 1200);
        this.noise(0.5, t, this.sfx, 'highpass', 2500, 0.6, 0.22, 0.01);
        for (let i = 0; i < 6; i++) this.tone(900 + Math.random() * 900, t + 0.15 + Math.random() * 0.4, 0.06, 0.05, 'sine', this.sfx, 1800);
        break;
      case 'whoosh': {
        const f = this.noise(0.4, t, this.sfx, 'bandpass', 500, 1.5, 0.35, 0.12);
        f.frequency.exponentialRampToValueAtTime(3000, t + 0.3);
        break;
      }
      case 'snap':
        this.noise(0.04, t, this.sfx, 'bandpass', 4200, 2, 0.7);
        this.noise(0.04, t + 0.035, this.sfx, 'bandpass', 3000, 2, 0.5);
        this.tone(1600, t, 0.06, 0.12, 'triangle', this.sfx, 700);
        break;
      case 'boom':
        this.tone(70, t, 0.9, 0.55, 'sine', this.sfx, 32);
        this.noise(0.7, t, this.sfx, 'lowpass', 400, 0.7, 0.6, 0.005);
        break;
      case 'shimmer':
        for (let i = 0; i < 7; i++) {
          const f = [1318.5, 1568, 1760, 1975.5, 2349.3, 2637][Math.floor(Math.random() * 6)];
          this.tone(f, t + i * 0.05, 1.2, 0.035, 'sine');
        }
        break;
      case 'hoof':
        this.tone(160, t, 0.07, 0.3, 'sine', this.sfx, 90);
        this.noise(0.05, t, this.sfx, 'bandpass', 1200, 1.5, 0.3);
        break;
      case 'zap': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        for (let i = 0; i < 14; i++) {
          const tt = t + i * 0.045;
          o.frequency.setValueAtTime(60 + Math.random() * 180, tt);
          g.gain.setValueAtTime(Math.random() < 0.7 ? 0.14 : 0.02, tt);
        }
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 300;
        o.connect(hp).connect(g).connect(this.sfx);
        o.start(t);
        o.stop(t + 0.75);
        for (let i = 0; i < 8; i++) this.noise(0.03, t + Math.random() * 0.6, this.sfx, 'highpass', 5000, 1, 0.25);
        break;
      }
      case 'hiss': {
        const f = this.noise(0.9, t, this.sfx, 'highpass', 4500, 0.8, 0.28, 0.15);
        f.frequency.linearRampToValueAtTime(6500, t + 0.8);
        break;
      }
    }
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // wind: filtered noise with slow swells
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const wg = ctx.createGain();
    wg.gain.value = 0.25;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.18;
    lfo.connect(lfoG).connect(wg.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.11;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 160;
    lfo2.connect(lfo2G).connect(lp.frequency);
    src.connect(lp).connect(wg).connect(this.amb);
    src.start();
    lfo.start();
    lfo2.start();
    // crickets: amplitude-modulated high tone, in intermittent bursts
    const cr = ctx.createOscillator();
    cr.frequency.value = 4400;
    const crG = ctx.createGain();
    crG.gain.value = 0;
    const am = ctx.createOscillator();
    am.type = 'square';
    am.frequency.value = 28;
    const amG = ctx.createGain();
    amG.gain.value = 0.5;
    const bias = ctx.createConstantSource();
    bias.offset.value = 0.5;
    const env = ctx.createGain();
    env.gain.value = 0;
    am.connect(amG).connect(crG.gain);
    bias.connect(crG.gain);
    cr.connect(crG).connect(env).connect(this.amb);
    cr.start();
    am.start();
    bias.start();
    const chirp = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t0 = t + i * 0.32;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(0.018, t0 + 0.02);
        env.gain.linearRampToValueAtTime(0, t0 + 0.16);
      }
      setTimeout(chirp, 1500 + Math.random() * 4000);
    };
    setTimeout(chirp, 2000);
    this.amb.gain.setTargetAtTime(0.5, ctx.currentTime, 2);
  }
}
