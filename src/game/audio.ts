import menuAsset from "@/assets/audio/menu.mp3.asset.json";
import selectionAsset from "@/assets/audio/selection.mp3.asset.json";
import raceAsset from "@/assets/audio/race.mp3.asset.json";
import effectsAsset from "@/assets/audio/effects.wav.asset.json";
import { AUDIO_CLIPS } from "./audio-clips";

export type AudioScene = "menu" | "selection" | "race";
type ClipName = keyof typeof AUDIO_CLIPS;
type EngineVoice = { base: number; speed: number; audible: number; boost: boolean; drifting: boolean; source?: AudioBufferSourceNode; gain?: GainNode; tire?: AudioBufferSourceNode; tireGain?: GainNode };
const MUSIC = { menu: menuAsset.url, selection: selectionAsset.url, race: raceAsset.url };
const MIX: Partial<Record<ClipName, number>> = { click: .14, beep: .34, go: .38, bump: .28, hit: .36, crate: .3, land: .3, explode: .38, drift: .13, boost: .3, nitro: .32, win: .45, lose: .4, pickup: .3 };
export const safeVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export const engineRate = (speed: number, boost: boolean) => .72 + Math.max(0, Math.min(1.3, speed)) * 1.65 + (boost ? .16 : 0);

/** Sample playback only: separate buses, smooth gain changes, voice limits and master headroom. */
class AudioEngine {
  ctx: AudioContext | null = null;
  music: GainNode | null = null;
  sfx: GainNode | null = null;
  master: GainNode | null = null;
  musicVol = .5; sfxVol = .7;
  private engineBus: GainNode | null = null;
  private bank: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private scene: AudioScene = "menu";
  private tracks: { media: HTMLAudioElement; gain: GainNode }[] = [];
  private activeTrack = -1;
  private engines = new Map<number, EngineVoice>();
  private voices = new Set<AudioBufferSourceNode>();
  private lastPlay = new Map<string, number>();
  private paused = false;

  init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const c = new Ctx(); this.ctx = c;
      const compressor = c.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 12;
      compressor.ratio.value = 6; compressor.attack.value = .003; compressor.release.value = .18;
      this.master = c.createGain(); this.master.gain.value = .65;
      this.master.connect(compressor); compressor.connect(c.destination);
      this.music = c.createGain(); this.sfx = c.createGain(); this.engineBus = c.createGain();
      this.music.connect(this.master); this.sfx.connect(this.master); this.engineBus.connect(this.sfx);
      this.engineBus.gain.value = .65;
      for (let i = 0; i < 2; i++) {
        const media = new Audio(); media.crossOrigin = "anonymous"; media.preload = "metadata";
        const gain = c.createGain(); gain.gain.value = 0;
        c.createMediaElementSource(media).connect(gain); gain.connect(this.music);
        media.addEventListener("timeupdate", () => {
          if (this.tracks[this.activeTrack]?.media === media && media.duration - media.currentTime < 1.2 && !media.paused) this.switchMusic();
        });
        // Fallback if a browser skips timeupdate while a tab is in the background.
        media.addEventListener("ended", () => { if (this.tracks[this.activeTrack]?.media === media) this.switchMusic(); });
        this.tracks.push({ media, gain });
      }
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { this.tracks.forEach((t) => t.media.pause()); void c.suspend(); }
        else this.unlock();
      });
      this.setVolumes(this.musicVol, this.sfxVol);
      this.preload();
    }
    this.preload(); this.unlock();
  }

  unlock() {
    const c = this.ctx; if (!c || document.hidden) return;
    void c.resume().then(() => {
      if (this.activeTrack < 0) this.switchMusic();
      else {
        const t = this.tracks[this.activeTrack];
        if (t?.media.paused) void t.media.play().catch(() => { /* retry on the next user gesture */ });
      }
    }).catch(() => { /* Browser requires a user gesture. */ });
  }

  private smooth(node: GainNode | null | undefined, value: number, seconds = .04) {
    const c = this.ctx; if (!node || !c) return;
    node.gain.setTargetAtTime(value, c.currentTime, seconds);
  }
  setVolumes(music: number, effects: number) {
    this.musicVol = safeVolume(music); this.sfxVol = safeVolume(effects);
    this.smooth(this.music, this.musicVol * .48);
    this.smooth(this.sfx, this.sfxVol * .65);
  }
  setScene(scene: AudioScene) {
    if (scene === this.scene && this.activeTrack >= 0) return;
    this.scene = scene;
    if (this.ctx) this.switchMusic();
  }
  private switchMusic() {
    const c = this.ctx; if (!c) return;
    const old = this.tracks[this.activeTrack];
    const index = this.activeTrack === 0 ? 1 : 0;
    const next = this.tracks[index]; if (!next) return;
    this.activeTrack = index;
    next.media.pause(); next.media.src = MUSIC[this.scene]; next.media.currentTime = 0;
    next.gain.gain.cancelScheduledValues(c.currentTime); next.gain.gain.setValueAtTime(0, c.currentTime);
    void next.media.play().then(() => {
      if (this.tracks[this.activeTrack] !== next) return;
      this.smooth(next.gain, 1, .3);
      if (old) this.smooth(old.gain, 0, .3);
    }).catch(() => { /* unlock() retries on tap/key. */ });
  }
  private preload() {
    if (this.loading || !this.ctx) return;
    const c = this.ctx;
    this.loading = fetch(effectsAsset.url).then((r) => {
      if (!r.ok) throw new Error("Sound bank unavailable");
      return r.arrayBuffer();
    }).then((data) => c.decodeAudioData(data)).then((bank) => {
      this.bank = bank;
      for (const voice of this.engines.values()) this.attachEngine(voice);
    }).catch(() => { this.loading = null; });
  }
  play(name: string) {
    const c = this.ctx;
    if (!c || !this.sfx || !this.bank || !(name in AUDIO_CLIPS) || c.state !== "running") return;
    const id = name as ClipName;
    // Drift is a continuous tire layer now, not randomly retriggered bursts.
    if (id === "drift" || id.startsWith("engine-")) return;
    const group = ["hit", "bump", "crate", "explode"].includes(id) ? "impact" : id;
    const cooldown = group === "impact" ? .1 : id === "boost" ? .55 : .08;
    if (c.currentTime - (this.lastPlay.get(group) ?? -10) < cooldown || this.voices.size >= 12) return;
    this.lastPlay.set(group, c.currentTime);
    const source = c.createBufferSource(), gain = c.createGain(), clip = AUDIO_CLIPS[id];
    source.buffer = this.bank; gain.gain.value = MIX[id] ?? .32;
    source.connect(gain); gain.connect(this.sfx); this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(0, clip.offset, clip.duration);
  }
  private loopClip(id: ClipName, gain: GainNode) {
    const c = this.ctx; if (!c || !this.bank) return;
    const clip = AUDIO_CLIPS[id], source = c.createBufferSource();
    source.buffer = this.bank; source.loop = true;
    source.loopStart = clip.offset; source.loopEnd = clip.offset + clip.duration;
    source.connect(gain); source.start(0, clip.offset);
    return source;
  }
  engineStart(id: number, base: number) {
    if (this.engines.has(id)) return;
    const voice: EngineVoice = { base, speed: 0, audible: .8, boost: false, drifting: false };
    this.engines.set(id, voice); this.attachEngine(voice);
  }
  private attachEngine(voice: EngineVoice) {
    const c = this.ctx; if (!c || !this.bank || !this.engineBus || voice.source) return;
    const gain = c.createGain(), tireGain = c.createGain(), filter = c.createBiquadFilter();
    gain.gain.value = 0; tireGain.gain.value = 0;
    filter.type = "lowpass"; filter.frequency.value = 2400; filter.Q.value = .5;
    gain.connect(filter); filter.connect(this.engineBus); tireGain.connect(this.engineBus);
    const source = this.loopClip(voice.base < 50 ? "engine-truck" : voice.base > 70 ? "engine-moto" : "engine-kart", gain);
    const tire = this.loopClip("drift", tireGain);
    if (source) voice.source = source;
    if (tire) voice.tire = tire;
    voice.gain = gain; voice.tireGain = tireGain;
    this.updateEngine(voice);
  }
  engineSet(id: number, speed: number, boost: boolean, base: number, drifting = false, audible = .8) {
    const voice = this.engines.get(id); if (!voice) return;
    voice.speed = Math.max(0, Math.min(1.3, speed)); voice.boost = boost; voice.base = base;
    voice.drifting = drifting; voice.audible = safeVolume(audible);
    this.updateEngine(voice);
  }
  private updateEngine(voice: EngineVoice) {
    const c = this.ctx; if (!c) return;
    voice.source?.playbackRate.setTargetAtTime(engineRate(voice.speed, voice.boost), c.currentTime, .09);
    const headroom = 1 / Math.sqrt(Math.max(1, this.engines.size));
    this.smooth(voice.gain, (.08 + voice.speed * .13) * voice.audible * headroom, .08);
    this.smooth(voice.tireGain, voice.drifting ? .18 * Math.min(1, voice.speed) * voice.audible * headroom : 0, .06);
  }
  setRacePaused(paused: boolean) {
    this.paused = paused;
    this.smooth(this.engineBus, paused ? 0 : .65, .08);
  }
  engineStopAll() {
    const c = this.ctx;
    for (const voice of this.engines.values()) {
      this.smooth(voice.gain, 0, .015); this.smooth(voice.tireGain, 0, .015);
      voice.source?.stop((c?.currentTime ?? 0) + .1); voice.tire?.stop((c?.currentTime ?? 0) + .1);
    }
    this.engines.clear(); this.lastPlay.clear();
    this.setRacePaused(false);
  }
  diagnostics() {
    return { context: this.ctx?.state ?? "uninitialized", scene: this.scene, loadedEffects: Boolean(this.bank), activeVoices: this.voices.size, engines: this.engines.size, paused: this.paused, musicPlaying: this.tracks[this.activeTrack]?.media.paused === false, musicVolume: this.musicVol, effectsVolume: this.sfxVol };
  }
}
export const audio = new AudioEngine();