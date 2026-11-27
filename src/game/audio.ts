// Procedural Web Audio: engine hum per kart, sound effects and a per-track music sequencer.
import type { ThemeDef } from "./data";

class AudioEngine {
  ctx: AudioContext | null = null;
  music!: GainNode; sfx!: GainNode; master!: GainNode;
  musicVol = 0.5; sfxVol = 0.7;
  private noiseBuf: AudioBuffer | null = null;
  private seqTimer: number | null = null;
  private engines = new Map<number, { o: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode }>();

  init() {
    if (this.ctx || typeof window === "undefined") { void this.ctx?.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, len);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setVolumes(m: number, s: number) {
    this.musicVol = m; this.sfxVol = s;
    if (!this.ctx) return;
    this.music.gain.value = m * 0.35; this.sfx.gain.value = s * 0.6;
  }
  private tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.3, slide = 0, when = 0, dest?: AudioNode) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest ?? this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol = 0.3, freq = 1200, when = 0, dest?: AudioNode, q = 1) {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest ?? this.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  play(name: string) {
    if (!this.ctx) return;
    switch (name) {
      case "beep": this.tone(440, 0.18, "square", 0.25); break;
      case "go": this.tone(880, 0.5, "square", 0.3); break;
      case "pickup": [0, 0.05, 0.1].forEach((w, i) => this.tone(600 + i * 250, 0.08, "square", 0.15, 0, w)); break;
      case "nitro": case "boost": this.noise(0.6, 0.35, 800, 0, undefined, 0.6); this.tone(200, 0.5, "sawtooth", 0.15, 600); break;
      case "shield": this.tone(300, 0.4, "sine", 0.3, 500); this.tone(450, 0.4, "triangle", 0.2, 700, 0.05); break;
      case "missile": this.noise(0.4, 0.3, 2500); this.tone(900, 0.4, "sawtooth", 0.1, -600); break;
      case "drop": this.tone(200, 0.15, "square", 0.2, -100); break;
      case "hit": this.noise(0.35, 0.5, 400, 0, undefined, 0.5); this.tone(120, 0.3, "square", 0.3, -80); break;
      case "explode": this.noise(0.7, 0.6, 250, 0, undefined, 0.4); this.tone(80, 0.6, "sawtooth", 0.3, -50); break;
      case "bump": this.tone(90, 0.12, "square", 0.3, -40); this.noise(0.1, 0.2, 300); break;
      case "crate": this.noise(0.25, 0.4, 900); this.tone(160, 0.15, "square", 0.2, -60); break;
      case "heal": [0, 0.08, 0.16].forEach((w, i) => this.tone(523 * (1 + i * 0.26), 0.15, "triangle", 0.2, 0, w)); break;
      case "zap": this.noise(0.3, 0.4, 3000, 0, undefined, 2); this.tone(1500, 0.3, "sawtooth", 0.15, -1200); break;
      case "freeze": this.tone(1200, 0.4, "sine", 0.2, 800); this.noise(0.4, 0.2, 5000); break;
      case "spin": this.tone(500, 0.6, "triangle", 0.2, -350); break;
      case "drift": this.noise(0.15, 0.08, 1800, 0, undefined, 3); break;
      case "miniturbo": this.tone(700, 0.2, "square", 0.15, 400); this.noise(0.3, 0.2, 1000); break;
      case "jump": this.tone(300, 0.25, "square", 0.15, 300); break;
      case "land": this.tone(110, 0.1, "square", 0.25, -40); break;
      case "trick": this.tone(660, 0.1, "square", 0.15); this.tone(990, 0.12, "square", 0.15, 0, 0.08); break;
      case "lap": [0, 0.1, 0.2].forEach((w, i) => this.tone(660 + i * 110, 0.12, "square", 0.2, 0, w)); break;
      case "ability": this.tone(220, 0.5, "sawtooth", 0.2, 880); this.tone(330, 0.5, "square", 0.1, 990, 0.05); break;
      case "click": this.tone(1000, 0.04, "square", 0.08); break;
      case "win": [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, "square", 0.2, 0, i * 0.13)); break;
      case "lose": [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.25, 0, i * 0.2)); break;
      case "ko": this.tone(400, 0.8, "sawtooth", 0.3, -350); this.noise(0.8, 0.4, 300); break;
    }
  }
  engineStart(id: number, base: number) {
    const c = this.ctx; if (!c || this.engines.has(id)) return;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = "sawtooth"; o2.type = "square"; o.frequency.value = base; o2.frequency.value = base / 2;
    f.type = "lowpass"; f.frequency.value = 600; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o.start(); o2.start();
    this.engines.set(id, { o, o2, g, f });
  }
  engineSet(id: number, speed01: number, boost: boolean, base: number) {
    const e = this.engines.get(id); if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const fr = base + speed01 * base * 2.2 + (boost ? 40 : 0);
    e.o.frequency.setTargetAtTime(fr, t, 0.05); e.o2.frequency.setTargetAtTime(fr / 2, t, 0.05);
    e.f.frequency.setTargetAtTime(400 + speed01 * 1400, t, 0.05);
    e.g.gain.setTargetAtTime(0.035 + speed01 * 0.05, t, 0.08);
  }
  engineStopAll() {
    for (const e of this.engines.values()) { try { e.g.gain.value = 0; e.o.stop(); e.o2.stop(); } catch { /* already stopped */ } }
    this.engines.clear();
  }
  stopMusic() { if (this.seqTimer !== null) { clearInterval(this.seqTimer); this.seqTimer = null; } }
  startMusic(m: ThemeDef["music"], intensity = 1) {
    this.init(); this.stopMusic();
    const c = this.ctx; if (!c) return;
    const spb = 60 / m.bpm / 2; // eighth notes
    let step = 0; let next = c.currentTime + 0.1;
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const prog = [0, 3, 4, 2];
    const r = (k: number) => ((k * 9301 + 49297) % 233280) / 233280;
    const tick = () => {
      while (next < c.currentTime + 0.25) {
        const when = next - c.currentTime;
        const bar = Math.floor(step / 8) % 4, s = step % 8;
        const chord = prog[bar]!;
        const deg = (d: number) => { const sc = m.scale; const o = Math.floor(d / sc.length); return m.root + sc[((d % sc.length) + sc.length) % sc.length]! + o * 12; };
        if (s % 2 === 0) this.tone(midi(deg(chord) - 12), spb * 1.6, "triangle", 0.35, 0, when, this.music);
        if (intensity > 0) { const n = deg(chord + [0, 2, 4, 2, 5, 4, 2, 4][s]! + (r(step) > 0.8 ? 1 : 0)); this.tone(midi(n + 12), spb * 0.9, m.wave, 0.07, 0, when, this.music); }
        if (s === 0 || s === 4) this.tone(110, 0.15, "sine", 0.6, -70, when, this.music);
        if (s === 2 || s === 6) this.noise(0.12, 0.25, 1800, when, this.music);
        this.noise(0.03, 0.1, 7000, when, this.music, 2);
        if (s === 7 && bar === 3) this.tone(midi(deg(chord + 7) + 12), spb * 2, "square", 0.05, 0, when, this.music);
        next += spb; step++;
      }
    };
    tick();
    this.seqTimer = window.setInterval(tick, 50);
  }
}

export const audio = new AudioEngine();
