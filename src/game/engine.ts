// Race simulation + canvas renderer. Pure TS, no React. One Race instance per race.
import { ABILITIES, CHARACTERS, ITEMS, SOLID, type AbilityId, type CharacterDef, type ItemId, type TrackDef } from "./data";
import { buildTrack, ensurePaths, nearest, type BuiltTrack } from "./track";
import { keyLabel, type Custom, type KeyMap, type Upgrades } from "./store";
import { audio } from "./audio";

export type ModeId = "single" | "bo3" | "bo5" | "champ" | "time" | "survival" | "challenge" | "custom";
export interface Rules {
  laps: number; items: boolean; itemPool: ItemId[]; hp: number; lives: number; respawnDelay: number;
  damageMult: number; gripMult: number; speedMult: number; collisions: boolean; timeLimit: number; abilityRate: number; noBrakes: boolean;
}
export const DEFAULT_RULES: Rules = { laps: 3, items: true, itemPool: ["nitro", "shield", "missile", "mine", "oil", "heal", "zap"], hp: 100, lives: 3, respawnDelay: 3, damageMult: 1, gripMult: 1, speedMult: 1, collisions: true, timeLimit: 0, abilityRate: 1, noBrakes: false };

export interface PlayerSpec {
  slot: number; name: string; charId: string; custom: Custom; upgrades: Upgrades; ability: AbilityId;
  control: "local" | "cpu" | "remote"; keys?: KeyMap; cpuLabel?: boolean; pid?: string;
}
export interface RaceConfig { track: TrackDef; players: PlayerSpec[]; rules: Rules; mode: ModeId; difficulty: 1 | 2 | 3; online: boolean; elapsed?: number }
export interface KartStats { topSpeed: number; itemsUsed: number; hitsDealt: number; hitsTaken: number; drifts: number; boosts: number; crates: number; tricks: number; kos: number }
export interface KartResult { slot: number; name: string; charId: string; finished: boolean; time: number; bestLap: number; lapTimes: number[]; eliminated: boolean; place: number; stats: KartStats }
export interface RaceResult { karts: KartResult[]; winner: number | null; trackId: string }

export type NetMsg =
  | { t: "s"; st: NetState }
  | { t: "spawn"; o: Proj }
  | { t: "rm"; id: string }
  | { t: "fx"; kind: "zap" | "shock" | "steal"; from: number; to: number }
  | { t: "give"; item: ItemId | null; to: number }
  | { t: "box"; id: number }
  | { t: "crate"; id: number }
  | { t: "fin"; slot: number; time: number; lapTimes: number[]; stats: KartStats }
  | { t: "elim"; slot: number };
export interface NetState { slot: number; x: number; y: number; a: number; vx: number; vy: number; v: number; z: number; hp: number; lap: number; idx: number; item: ItemId | null; sh: number; gh: number; bo: number; sp: number; dr: number; lives: number; ch: number; ko: number; trick: number }

interface Proj { id: string; kind: "missile" | "mine" | "oil" | "ice"; x: number; y: number; vx: number; vy: number; owner: number; life: number; target: number; age: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const PCOL = ["#ffcf3f", "#3fd0ff"];

class Kart {
  x = 0; y = 0; a = 0; vx = 0; vy = 0; v = 0; z = 0; vz = 0;
  hp: number; maxHp: number; lives: number; item: ItemId | null = null;
  boost = 0; shield = 0; ghost = 0; spin = 0; slow = 0; ko = 0; trick = 0; trickDone = false; air = false;
  turbo = 0.4; dc = false; fall = 0;
  drifting = false; driftDir = 0; driftCharge = 0; charge = 0;
  lap = 0; idx = 0; lastIdx = 0; maxLapIdx = 0;
  finished = false; finishTime = 0; eliminated = false;
  lapStart = 0; lapTimes: number[] = []; offscreen = 0;
  stats: KartStats = { topSpeed: 0, itemsUsed: 0, hitsDealt: 0, hitsTaken: 0, drifts: 0, boosts: 0, crates: 0, tricks: 0, kos: 0 };
  ch: CharacterDef; maxSpeed: number; accel: number; turn: number; weight: number; r: number;
  // remote interpolation
  tx = 0; ty = 0; ta = 0;
  cpuItemDelay = 0; cpuSkill = 1;
  constructor(public spec: PlayerSpec, rules: Rules) {
    this.ch = CHARACTERS.find((c) => c.id === spec.charId) ?? CHARACTERS[0]!;
    const s = this.ch.stats, u = spec.upgrades;
    this.maxSpeed = (480 + s.speed * 34) * (1 + u.speed * 0.025) * rules.speedMult;
    this.accel = (230 + s.accel * 55) * (1 + u.accel * 0.05);
    this.turn = (2.3 + s.handling * 0.22) * (1 + u.handling * 0.04);
    this.weight = 1 + s.weight * 0.35;
    this.maxHp = Math.round(rules.hp * (0.8 + s.armor * 0.07 + u.armor * 0.04));
    this.hp = this.maxHp; this.lives = rules.lives;
    this.r = this.ch.vehicle === "truck" ? 18 : this.ch.vehicle === "moto" ? 12 : 15;
  }
  get progress() { return this.lap * 100000 + this.idx; }
}

export class Race {
  track: BuiltTrack; karts: Kart[]; rules: Rules; cfg: RaceConfig;
  ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement; light: HTMLCanvasElement | null = null;
  keys = new Set<string>(); prevKeys = new Set<string>();
  time = -3.5; countdownShown = 4; running = true; paused = false; over = false; endTimer = -1;
  projs: Proj[] = []; parts: Particle[] = []; boxCd = new Map<number, number>(); crateCd = new Map<number, number>();
  cams = [{ x: 0, y: 0, z: 0.8 }, { x: 0, y: 0, z: 0.8 }]; cam = this.cams[0]!; vw = 0; vx = 0; viewH = 0; msg: { text: string; t: number; c: string }[] = [];
  raf = 0; last = 0; acc = 0; netAcc = 0; pid = 0; peerStatus = "";
  onNet: ((m: NetMsg) => void) | null = null;
  onFinish: ((r: RaceResult) => void) | null = null;
  private kd = (e: KeyboardEvent) => { if (this.isGameKey(e.code)) e.preventDefault(); this.keys.add(e.code); };
  private ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  constructor(canvas: HTMLCanvasElement, cfg: RaceConfig) {
    this.canvas = canvas; this.cfg = cfg; this.rules = cfg.rules;
    this.ctx = canvas.getContext("2d")!;
    this.track = buildTrack(cfg.track); ensurePaths(this.track);
    const t = this.track;
    this.karts = cfg.players.map((p) => new Kart(p, cfg.rules));
    const s0 = t.main[t.n - 6]!;
    const nx = -Math.sin(s0.ang), ny = Math.cos(s0.ang);
    this.karts.forEach((k, i) => {
      const off = (i - (this.karts.length - 1) / 2) * 60;
      k.x = s0.x + nx * off - Math.cos(s0.ang) * (i % 2) * 10; k.y = s0.y + ny * off - Math.sin(s0.ang) * (i % 2) * 10;
      k.a = s0.ang; k.idx = t.n - 6; k.lastIdx = k.idx; k.lap = 0; k.maxLapIdx = 0; k.tx = k.x; k.ty = k.y; k.ta = k.a;
      k.cpuSkill = [0.86, 0.95, 1.03][cfg.difficulty - 1]!;
    });
    for (const c of this.cams) { c.x = s0.x; c.y = s0.y; }
    if (cfg.elapsed && cfg.elapsed > 0) { this.time = cfg.elapsed; this.countdownShown = 0; }
    window.addEventListener("keydown", this.kd); window.addEventListener("keyup", this.ku);
    audio.init();
    this.karts.forEach((k, i) => audio.engineStart(i, k.ch.vehicle === "truck" ? 45 : k.ch.vehicle === "moto" ? 80 : 60));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }
  destroy() {
    cancelAnimationFrame(this.raf); this.running = false;
    window.removeEventListener("keydown", this.kd); window.removeEventListener("keyup", this.ku);
    audio.engineStopAll();
  }
  isGameKey(code: string) {
    for (const p of this.cfg.players) if (p.keys && Object.values(p.keys).includes(code)) return true;
    return false;
  }
  local(k: Kart) { return k.spec.control !== "remote"; }
  humanKarts() { return this.karts.filter((k) => k.spec.control === "local"); }
  setPaused(p: boolean) { this.paused = p; audio.setRacePaused(p); if (p) this.keys.clear(); }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.paused || this.cfg.online) {
      this.acc += dt;
      const h = 1 / 120;
      while (this.acc >= h) { this.step(h); this.acc -= h; }
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  input(k: Kart) {
    const m = k.spec.keys;
    if (!m || this.paused) return { up: 0, down: 0, steer: 0, item: false, drift: false, ability: false, turbo: false };
    const on = (c: string) => this.keys.has(c), pressed = (c: string) => this.keys.has(c) && !this.prevKeys.has(c);
    return { up: on(m.up) ? 1 : 0, down: on(m.down) ? 1 : 0, steer: (on(m.right) ? 1 : 0) - (on(m.left) ? 1 : 0), item: pressed(m.item), drift: on(m.drift), ability: pressed(m.ability), turbo: on(m.turbo) };
  }
  cpuInput(k: Kart) {
    const t = this.track;
    const look = Math.floor(14 + Math.abs(k.v) / 45);
    const tgt = t.main[(Math.floor(k.idx) + look) % t.n]!;
    const d = angDiff(k.a, Math.atan2(tgt.y - k.y, tgt.x - k.x));
    const steer = clamp(d * 2.2, -1, 1);
    const opp = this.karts.find((o) => o !== k);
    let item = false;
    if (k.item) {
      k.cpuItemDelay -= 1 / 120;
      if (k.cpuItemDelay <= 0) {
        const ahead = opp ? opp.progress > k.progress : false;
        if (k.item === "missile" || k.item === "zap") item = ahead || Math.random() < 0.002;
        else if (k.item === "mine" || k.item === "oil") item = !ahead;
        else if (k.item === "heal") item = k.hp < k.maxHp * 0.7;
        else item = true;
      }
    } else k.cpuItemDelay = 1 + Math.random() * 2;
    return { up: Math.abs(d) > 1.3 && k.v > 250 ? 0 : 1, down: Math.abs(d) > 1.3 && k.v > 250 ? 1 : 0, steer, item, drift: Math.abs(d) > 0.5 && k.v > 300, ability: k.charge >= 1 && Math.random() < 0.01, turbo: k.turbo > 0.5 && Math.abs(d) < 0.15 };
  }

  step(dt: number) {
    const t = this.track, R = this.rules;
    const prevT = this.time; this.time += dt;
    if (this.time < 0) {
      const c = Math.ceil(-this.time);
      if (c < this.countdownShown && c <= 3) { this.countdownShown = c; audio.play("beep"); }
      this.prevKeys = new Set(this.keys);
      return;
    }
    if (prevT < 0) { audio.play("go"); this.karts.forEach((k) => (k.lapStart = 0)); this.countdownShown = 0; }

    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i]!;
      if (k.spec.control === "remote") { this.stepRemote(k, dt); continue; }
      this.stepKart(k, i, dt);
    }
    // kart collisions
    if (R.collisions) for (let i = 0; i < this.karts.length; i++) for (let j = i + 1; j < this.karts.length; j++) {
      const a = this.karts[i]!, b = this.karts[j]!;
      if (a.eliminated || b.eliminated || a.ko > 0 || b.ko > 0 || a.air || b.air || a.ghost > 0 || b.ghost > 0) continue;
      if (!this.local(a) && !this.local(b)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d < min && d > 0.01) {
        const nx = dx / d, ny = dy / d, ov = min - d, tw = a.weight + b.weight;
        const la = this.local(a), lb = this.local(b);
        if (la) { a.x -= nx * ov * (b.weight / tw) * (lb ? 1 : 2); a.y -= ny * ov * (b.weight / tw) * (lb ? 1 : 2); }
        if (lb) { b.x += nx * ov * (a.weight / tw) * (la ? 1 : 2); b.y += ny * ov * (a.weight / tw) * (la ? 1 : 2); }
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -rv * 1.3;
          if (la) { a.vx -= nx * imp * (b.weight / tw); a.vy -= ny * imp * (b.weight / tw); a.v *= 0.92; }
          if (lb) { b.vx += nx * imp * (a.weight / tw); b.vy += ny * imp * (a.weight / tw); b.v *= 0.92; }
          if (imp > 60) { audio.play("bump"); this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#ffe08a", 6); if (this.cfg.mode === "survival") { if (la) this.damage(a, 4 * (b.weight / a.weight), -1); if (lb) this.damage(b, 4 * (a.weight / b.weight), -1); } }
        }
      }
    }
    this.stepProjs(dt);
    for (const [id, v] of this.boxCd) { if (v - dt <= 0) this.boxCd.delete(id); else this.boxCd.set(id, v - dt); }
    for (const [id, v] of this.crateCd) { if (v - dt <= 0) this.crateCd.delete(id); else this.crateCd.set(id, v - dt); }
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    this.parts = this.parts.filter((p) => p.life > 0);
    this.msg = this.msg.filter((m) => (m.t -= dt) > 0);

    // network state
    if (this.onNet) {
      this.netAcc += dt;
      if (this.netAcc >= 0.05) { this.netAcc = 0; for (const k of this.karts) if (this.local(k) && !k.dc) this.onNet({ t: "s", st: this.netState(k) }); }
    }
    this.checkEnd(dt);
    this.prevKeys = new Set(this.keys);
    // audio engines
    const listeners = this.humanKarts();
    this.karts.forEach((k, i) => {
      const distance = Math.min(...listeners.map((h) => Math.hypot(h.x - k.x, h.y - k.y)));
      const audible = k.dc || k.eliminated || k.finished ? 0 : k.spec.control === "local" ? 1 : .35 / (1 + distance / 180);
      audio.engineSet(i, clamp(Math.abs(k.v) / k.maxSpeed, 0, 1.3), k.boost > 0, k.ch.vehicle === "truck" ? 45 : k.ch.vehicle === "moto" ? 80 : 60, k.drifting && !k.air, audible);
    });
  }

  stepRemote(k: Kart, dt: number) {
    const f = Math.min(1, dt * 12);
    k.tx += k.vx * dt; k.ty += k.vy * dt;
    k.x += (k.tx - k.x) * f; k.y += (k.ty - k.y) * f;
    k.a += angDiff(k.a, k.ta) * f;
    if (k.spin > 0) k.spin -= dt;
    if (k.boost > 0) { k.boost -= dt; this.trail(k); }
    if (k.drifting && Math.random() < 0.5) this.spark(k);
  }

  stepKart(k: Kart, i: number, dt: number) {
    const t = this.track, R = this.rules;
    if (k.eliminated || k.dc) return;
    if (k.fall > 0) {
      k.fall -= dt; k.v *= 0.9; k.vx *= 0.9; k.vy *= 0.9; k.x += k.vx * dt; k.y += k.vy * dt;
      if (k.fall <= 0) { this.respawn(k); k.hp = Math.max(k.hp, 1); }
      return;
    }
    if (k.ko > 0) {
      k.ko -= dt; k.v = 0; k.vx = k.vy = 0;
      if (k.ko <= 0) this.respawn(k);
      return;
    }
    const inp = k.finished ? this.cpuInput(k) : k.spec.control === "cpu" ? this.cpuInput(k) : this.input(k);
    const finishedCoast = k.finished;
    let { up, down, steer } = inp;
    if (R.noBrakes) down = 0;
    if (finishedCoast) { up = 0.6; down = 0; }
    const stunned = k.spin > 0;
    if (stunned) { up = 0; down = 0; steer = 0; k.drifting = false; }

    // timers
    if (k.boost > 0) k.boost -= dt; if (k.shield > 0) k.shield -= dt; if (k.ghost > 0) k.ghost -= dt;
    if (k.spin > 0) k.spin -= dt; if (k.slow > 0) k.slow -= dt;
    k.charge = Math.min(1, k.charge + dt * 0.045 * R.abilityRate * (k.drifting ? 3 : 1));
    k.turbo = Math.min(1, k.turbo + dt * 0.025);
    if (inp.turbo && k.turbo > 0.02 && !stunned && !k.finished) { k.turbo = Math.max(0, k.turbo - dt * 0.5); k.boost = Math.max(k.boost, 0.08); if (Math.random() < 0.04) audio.play("boost"); }

    // surface
    const near = nearest(t, k.x, k.y);
    const s = near.s;
    const half = s.w / 2;
    let cap = k.maxSpeed, grip = 7 * R.gripMult;
    if (k.spec.control === "cpu" && !finishedCoast) {
      cap *= k.cpuSkill;
      const opp = this.karts.find((o) => o !== k);
      if (opp && opp.progress > k.progress + 60) cap *= 1.08;
    }
    const onRoad = near.d < half;
    if (!k.air) {
      if (!onRoad && near.d < half + 90) cap *= k.ch.vehicle === "hover" ? 0.75 : k.ch.vehicle === "buggy" ? 0.7 : 0.55;
      else if (s.dirt && onRoad && k.boost <= 0) cap *= k.ch.vehicle === "buggy" ? 0.95 : 0.82;
      for (const o of t.objects) {
        if (o.kind !== "surface") continue;
        if ((o.x - k.x) ** 2 + (o.y - k.y) ** 2 < 110 * 110) {
          const sf = o.sf ?? t.theme.surface;
          if (sf === "ice") grip *= 0.22; else if (sf === "mud") cap *= k.ch.vehicle === "buggy" || k.ch.vehicle === "truck" ? 0.8 : 0.6; else if (sf === "sand") cap *= k.ch.vehicle === "buggy" ? 0.92 : 0.75; else if (sf === "grass") cap *= 0.72;
          else if (sf === "lava" && k.ghost <= 0) { cap *= 0.85; this.damage(k, 22 * dt, -1, true); if (Math.random() < 0.3) this.burst(k.x, k.y, "#ff6a1f", 1); }
        }
      }
    }
    if (k.slow > 0) cap *= 0.6;
    if (k.boost > 0) { cap *= 1.38; up = 1; }
    if (k.ch.vehicle === "hover") grip *= 0.7;

    // throttle
    if (up && k.v < cap) {
      const ratio = clamp(k.v / cap, 0, 1);
      const curve = k.v < 0 ? 1.6 : 1.35 * (1 - 0.65 * ratio); // progressive: strong launch, tapering near top speed
      k.v += k.accel * curve * (k.boost > 0 ? 2.2 : 1) * (1.15 - k.weight * 0.06) * dt;
    }
    else if (k.v > cap) k.v -= (k.v - cap) * 2.5 * dt;
    if (down) k.v -= (k.v > 0 ? 700 : 220) * dt;
    if (!up && !down) k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), 180 * dt);
    k.v = clamp(k.v, -cap * 0.35, cap * 1.6);
    k.stats.topSpeed = Math.max(k.stats.topSpeed, k.v);

    // steering / drift
    const sp01 = clamp(Math.abs(k.v) / 220, 0, 1);
    if (inp.drift && !k.drifting && !k.air && steer !== 0 && k.v > 220 && !stunned) { k.drifting = true; k.driftDir = Math.sign(steer); k.driftCharge = 0; k.vz = 120; k.z = 0.1; k.air = true; k.stats.drifts++; }
    if (k.drifting && (!inp.drift || k.v < 150 || stunned)) {
      k.drifting = false;
      const c = k.driftCharge;
      if (c > 0.8 && !stunned) { k.boost = Math.max(k.boost, c > 3 ? 1.5 : c > 1.8 ? 1.0 : 0.5); audio.play("miniturbo"); k.stats.boosts++; }
      k.turbo = Math.min(1, k.turbo + Math.min(0.35, c * 0.08));
    }
    if (k.air && !k.drifting && k.z > 8 && steer !== 0 && !k.trickDone) { k.trick = 0.45; k.trickDone = true; audio.play("trick"); k.stats.tricks++; }
    if (k.drifting) {
      const tight = steer * k.driftDir;
      k.a += k.driftDir * k.turn * (0.75 + 0.5 * tight) * dt * sp01;
      k.driftCharge += dt * (1 + Math.max(0, tight));
      grip *= 0.32;
      if (Math.random() < 0.6) this.spark(k);
      if (Math.random() < 0.05) audio.play("drift");
    } else if (!k.air || k.z < 4) {
      k.a += steer * k.turn * dt * sp01 * (k.v < 0 ? -1 : 1) * (k.boost > 0 ? 0.85 : 1);
    }
    if (k.spin > 0) k.a += 14 * dt;
    if (k.trick > 0) k.trick -= dt;

    // velocity integrate
    const fx = Math.cos(k.a), fy = Math.sin(k.a);
    const g = k.air && !k.drifting ? 0.5 : grip;
    k.vx += (fx * k.v - k.vx) * Math.min(1, g * dt);
    k.vy += (fy * k.v - k.vy) * Math.min(1, g * dt);
    k.x += k.vx * dt; k.y += k.vy * dt;

    // vertical
    if (k.air) {
      k.vz -= 900 * dt; k.z += k.vz * dt;
      if (k.z <= 0) {
        k.z = 0; k.vz = 0; k.air = false;
        if (k.trickDone) { if (k.trick <= 0.2) { k.boost = Math.max(k.boost, 0.8); audio.play("miniturbo"); this.say(`${k.spec.name}: Manobra!`, "#ffd34d"); } k.trickDone = false; }
        if (!k.drifting) audio.play("land");
      }
    }

    // walls (track limits)
    const n2 = nearest(t, k.x, k.y);
    const lim = n2.s.w / 2 + 90;
    if (n2.d > lim) {
      const dx = k.x - n2.s.x, dy = k.y - n2.s.y, d = n2.d;
      k.x = n2.s.x + (dx / d) * lim; k.y = n2.s.y + (dy / d) * lim;
      const nx = dx / d, ny = dy / d, dot = k.vx * nx + k.vy * ny;
      if (dot > 0) { k.vx -= 1.6 * dot * nx; k.vy -= 1.6 * dot * ny; k.v *= 0.6; if (dot > 120) { audio.play("bump"); this.burst(k.x, k.y, "#ccc", 5); } }
    }
    // dust off-road
    if (!onRoad && !k.air && Math.abs(k.v) > 120 && Math.random() < 0.3) this.parts.push({ x: k.x, y: k.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.5, max: 0.5, c: t.theme.dirt, s: 5 });
    if (k.boost > 0) this.trail(k);
    else if (k.spec.custom.trail !== "none" && Math.abs(k.v) > 200 && Math.random() < 0.4) this.trail(k, true);

    // progress & laps
    const ni = n2.s.idx;
    const n = t.n;
    if (k.lastIdx > n * 0.75 && ni < n * 0.25) {
      if (k.maxLapIdx > n * 0.6 || k.lap === 0) this.lapDone(k);
      k.maxLapIdx = 0;
    } else if (k.lastIdx < n * 0.25 && ni > n * 0.75) {
      k.lap = Math.max(0, k.lap - 1); k.maxLapIdx = n;
    }
    if (ni > k.maxLapIdx && ni - k.maxLapIdx < n * 0.4) k.maxLapIdx = ni;
    k.lastIdx = ni; k.idx = ni;

    // objects
    if (!k.air || k.z < 10) for (const o of t.objects) {
      const d2 = (o.x - k.x) ** 2 + (o.y - k.y) ** 2;
      if (o.kind === "item" && d2 < 30 * 30 && R.items && !this.boxCd.has(o.id)) {
        this.boxCd.set(o.id, 3); this.onNet?.({ t: "box", id: o.id });
        if (!k.item && !k.finished) { k.item = this.rollItem(k); audio.play("pickup"); }
        k.turbo = Math.min(1, k.turbo + 0.1);
        this.burst(o.x, o.y, "#fff", 8);
      } else if (o.kind === "boost" && d2 < 40 * 40 && !k.air) {
        if (k.boost < 0.9) { audio.play("boost"); k.stats.boosts++; } k.boost = Math.max(k.boost, 1);
      } else if (o.kind === "platform" && d2 < 46 * 46 && !k.air) {
        k.air = true; k.vz = 560; k.z = 1; k.trickDone = false; k.boost = Math.max(k.boost, 0.7); audio.play("jump"); k.drifting = false;
      } else if (o.kind === "hole" && d2 < 30 * 30 && !k.air && k.ghost <= 0) {
        k.fall = 1; k.drifting = false; audio.play("spin"); this.say(`${k.spec.name} caiu no buraco!`, "#ff8a3d");
      } else if (o.kind === "trap" && d2 < 32 * 32 && !k.air && k.ghost <= 0 && k.spin <= 0 && this.trapOn(o)) {
        k.spin = 0.6; k.slow = Math.max(k.slow, 1); this.damage(k, 10, -1); audio.play("hit"); this.burst(o.x, o.y, "#ddd", 10);
      } else if (o.kind === "cone" && d2 < 24 * 24 && !this.crateCd.has(o.id)) {
        this.crateCd.set(o.id, 10); this.onNet?.({ t: "crate", id: o.id }); k.v *= 0.92; audio.play("bump");
        for (let q = 0; q < 8; q++) this.parts.push({ x: o.x, y: o.y, vx: k.vx * 0.6 + (Math.random() - 0.5) * 200, vy: k.vy * 0.6 + (Math.random() - 0.5) * 200, life: 0.7, max: 0.7, c: q % 2 ? "#ff7a1a" : "#fff", s: 5 });
      } else if (o.kind === "ramp" && d2 < 45 * 45 && !k.air && k.v > 150) {
        k.air = true; k.vz = 300 + k.v * 0.25; k.z = 1; k.trickDone = false; audio.play("jump"); k.drifting = false;
      } else if (o.kind === "oil" && d2 < 30 * 30 && !k.air && k.ghost <= 0 && k.spin <= 0) {
        k.spin = 0.7; k.v *= 0.6; audio.play("spin"); k.drifting = false;
      } else if (o.kind === "crate" && d2 < 34 * 34 && !this.crateCd.has(o.id) && !k.air && k.ghost <= 0) {
        this.crateCd.set(o.id, 8); this.onNet?.({ t: "crate", id: o.id });
        k.v *= k.ch.vehicle === "truck" ? 0.9 : 0.6; this.damage(k, 6, -1); audio.play("crate"); k.stats.crates++;
        for (let q = 0; q < 14; q++) this.parts.push({ x: o.x, y: o.y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.5) * 400, life: 0.8, max: 0.8, c: q % 2 ? "#8a5a2b" : "#c4884a", s: 6 });
      }
    }

    if (!k.air || k.z < 14) this.solidCollide(k);

    // item & ability use
    if (inp.item && k.item && !stunned && !k.finished) this.useItem(k, i);
    if (inp.ability && k.charge >= 1 && !stunned && !k.finished) this.useAbility(k, i);

    // offscreen catch-up for shared screen
    if (!this.cfg.online && this.humanKarts().length >= 2 && this.views().length === 1 && !k.finished) {
      const view = this.viewRect(this.cams[0]!, this.canvas.clientWidth, this.canvas.clientHeight);
      const out = k.x < view.x0 - 20 || k.x > view.x1 + 20 || k.y < view.y0 - 20 || k.y > view.y1 + 20;
      k.offscreen = out ? k.offscreen + dt : 0;
      if (k.offscreen > 1.2) {
        const leader = [...this.karts].filter((o) => !o.eliminated && o !== k).sort((a, b) => b.progress - a.progress)[0];
        if (leader && leader.progress > k.progress) {
          const tgtIdx = (leader.idx - 18 + n) % n;
          const sm = t.main[tgtIdx]!;
          k.x = sm.x; k.y = sm.y; k.a = sm.ang; k.vx = k.vy = 0; k.v = leader.v * 0.7; k.idx = k.lastIdx = tgtIdx;
          if (tgtIdx > leader.idx) k.lap = leader.lap - 1; else k.lap = leader.lap;
          k.maxLapIdx = tgtIdx; k.offscreen = 0; k.ghost = 1.2; this.say(`${k.spec.name} reposicionado`, PCOL[k.spec.slot] ?? "#fff");
        }
      }
    }
  }

  // ---------- obstacles ----------
  trapOn(o: { id: number }) { return Math.sin(this.time * 2.2 + o.id) > 0.1; }
  /** Current world geometry of a (possibly moving) obstacle: a segment p0-p1 with a radius. */
  obstacleShape(o: BuiltTrack["objects"][number]) {
    const a = o.a ?? 0, nx = -Math.sin(a), ny = Math.cos(a);
    switch (o.kind) {
      case "barrier": return { x0: o.x - nx * 30, y0: o.y - ny * 30, x1: o.x + nx * 30, y1: o.y + ny * 30, r: 10, soft: 0.45 };
      case "mover": { const off = Math.sin(Math.max(0, this.time) * 1.3 + o.id) * 70; const cx = o.x + nx * off, cy = o.y + ny * off; return { x0: cx - nx * 26, y0: cy - ny * 26, x1: cx + nx * 26, y1: cy + ny * 26, r: 11, soft: 0.4 }; }
      case "spinner": { const ang = Math.max(0, this.time) * 2.2 + o.id; const c = Math.cos(ang) * 78, sn = Math.sin(ang) * 78; return { x0: o.x - c, y0: o.y - sn, x1: o.x + c, y1: o.y + sn, r: 9, soft: 0.5 }; }
      case "tire": return { x0: o.x, y0: o.y, x1: o.x, y1: o.y, r: 20, soft: 0.8 };
      case "rock": return { x0: o.x, y0: o.y, x1: o.x, y1: o.y, r: 26, soft: 0.35 };
      default: return null;
    }
  }
  solidCollide(k: Kart) {
    for (const o of this.track.objects) {
      if (!SOLID.includes(o.kind)) continue;
      if (Math.abs(o.x - k.x) > 140 || Math.abs(o.y - k.y) > 140) continue;
      const sh = this.obstacleShape(o); if (!sh) continue;
      const sx = sh.x1 - sh.x0, sy = sh.y1 - sh.y0, L2 = sx * sx + sy * sy;
      const tt = L2 > 0 ? clamp(((k.x - sh.x0) * sx + (k.y - sh.y0) * sy) / L2, 0, 1) : 0;
      const px = sh.x0 + sx * tt, py = sh.y0 + sy * tt;
      const dx = k.x - px, dy = k.y - py, d = Math.hypot(dx, dy), min = k.r + sh.r;
      if (d >= min) continue;
      const nx = d > 0.01 ? dx / d : -Math.cos(k.a), ny = d > 0.01 ? dy / d : -Math.sin(k.a);
      k.x = px + nx * min; k.y = py + ny * min;
      const dot = k.vx * nx + k.vy * ny;
      if (dot < 0) {
        k.vx -= (1 + sh.soft) * dot * nx; k.vy -= (1 + sh.soft) * dot * ny;
        k.v *= 0.35 + sh.soft * 0.5 + Math.min(0.15, k.weight * 0.04);
        if (dot < -160) { audio.play("bump"); this.burst(px, py, "#ddd", 6); if (o.kind !== "tire") this.damage(k, Math.min(10, -dot / 60) / k.weight, -1, true); }
      }
      if (o.kind === "spinner" || o.kind === "mover") { k.vx += nx * 160; k.vy += ny * 160; }
    }
  }
  /** Snapshot of every kart this client simulates, for a reconnecting player. */
  snapshot(): NetState[] { return this.karts.map((k) => this.netState(k)); }
  /** Restores karts (including our own) from a host snapshot after reconnecting mid-race. */
  restore(states: NetState[]) {
    for (const s of states) {
      const k = this.karts.find((o) => o.spec.slot === s.slot); if (!k) continue;
      k.x = k.tx = s.x; k.y = k.ty = s.y; k.a = k.ta = s.a; k.vx = s.vx; k.vy = s.vy; k.v = s.v; k.hp = s.hp; k.lap = s.lap; k.idx = k.lastIdx = s.idx; k.maxLapIdx = s.idx; k.item = s.item; k.lives = s.lives; k.charge = s.ch;
      k.lapStart = this.time;
    }
  }
  /** A new host takes over simulating the bots. */
  adoptBots() { for (const k of this.karts) if (k.spec.cpuLabel && k.spec.control === "remote") { k.spec.control = "cpu"; k.tx = k.x; k.ty = k.y; } }
  setDc(slot: number, dc: boolean) {
    const k = this.karts.find((o) => o.spec.slot === slot); if (!k || k.dc === dc) return;
    k.dc = dc; this.say(dc ? `${k.spec.name} desconectou` : `${k.spec.name} voltou!`, dc ? "#ff8a3d" : "#5be37b");
  }

  lapDone(k: Kart) {
    if (k.lap > 0) {
      const lt = this.time - k.lapStart; k.lapTimes.push(lt); k.lapStart = this.time;
    } else k.lapStart = 0;
    k.lap++;
    const L = this.rules.laps;
    if (k.lap > L && !k.finished) {
      k.finished = true; k.finishTime = this.time;
      this.say(`${k.spec.name} cruzou a linha!`, PCOL[k.spec.slot] ?? "#fff");
      if (k.spec.control === "local") audio.play("lap");
      this.onNet?.({ t: "fin", slot: k.spec.slot, time: k.finishTime, lapTimes: k.lapTimes, stats: k.stats });
    } else if (k.lap === L && L > 1) { this.say("VOLTA FINAL!", "#ff5a5a"); audio.play("lap"); }
    else if (k.lap > 1) audio.play("lap");
  }

  respawn(k: Kart) {
    const t = this.track;
    const idx = (Math.floor(k.idx) - 8 + t.n) % t.n;
    const s = t.main[idx]!;
    k.x = s.x; k.y = s.y; k.a = s.ang; k.vx = k.vy = k.v = 0; k.hp = k.maxHp; k.ghost = 2; k.spin = 0; k.slow = 0;
    if (idx > k.idx) k.lap = Math.max(0, k.lap - 1);
    k.idx = k.lastIdx = idx;
  }

  damage(k: Kart, amt: number, by: number, silent = false) {
    if (k.ko > 0 || k.eliminated || k.finished) return;
    k.hp -= amt * this.rules.damageMult;
    if (!silent) k.stats.hitsTaken++;
    if (by >= 0) { const b = this.karts.find((o) => o.spec.slot === by); if (b) b.stats.hitsDealt++; }
    if (k.hp <= 0) {
      k.hp = 0; k.stats.kos++; audio.play("ko"); this.burst(k.x, k.y, "#ff8a3d", 30);
      if (this.cfg.mode === "survival") {
        k.lives--;
        if (k.lives <= 0) { k.eliminated = true; this.say(`${k.spec.name} ELIMINADO!`, "#ff4d4d"); this.onNet?.({ t: "elim", slot: k.spec.slot }); return; }
      }
      k.ko = this.rules.respawnDelay; k.drifting = false; this.say(`${k.spec.name} KO! Volta em ${this.rules.respawnDelay}s`, "#ff8a3d");
    }
  }

  hit(k: Kart, kind: "missile" | "mine" | "oil" | "ice" | "zap" | "shock", by: number) {
    if (k.ghost > 0 || k.ko > 0) return;
    if (k.shield > 0 && kind !== "oil") { k.shield = 0; audio.play("shield"); this.burst(k.x, k.y, "#4fc3f7", 14); return; }
    switch (kind) {
      case "missile": k.spin = 1.1; k.v *= 0.3; this.damage(k, 25, by); audio.play("explode"); this.burst(k.x, k.y, "#ff6b3d", 20); break;
      case "mine": k.spin = 1.0; k.v *= 0.2; k.air = true; k.vz = 260; this.damage(k, 22, by); audio.play("explode"); this.burst(k.x, k.y, "#ff3b6b", 20); break;
      case "oil": k.spin = 0.8; k.v *= 0.6; audio.play("spin"); break;
      case "ice": k.slow = 2.5; this.damage(k, 8, by); audio.play("freeze"); this.burst(k.x, k.y, "#aef3ff", 16); break;
      case "zap": k.slow = 2.5; k.spin = 0.4; this.damage(k, 12, by); audio.play("zap"); this.burst(k.x, k.y, "#f5e663", 16); break;
      case "shock": k.spin = 0.9; k.v *= 0.4; this.damage(k, 15, by); audio.play("hit"); break;
    }
    k.drifting = false;
  }

  rollItem(k: Kart): ItemId {
    const pool = this.rules.itemPool.length ? this.rules.itemPool : (["nitro"] as ItemId[]);
    const sorted = [...this.karts].sort((a, b) => b.progress - a.progress);
    const leading = sorted[0] === k;
    const w: Record<ItemId, number> = leading ? { nitro: 2, shield: 3, missile: 1, mine: 3, oil: 3, heal: 2, zap: 0.3 } : { nitro: 3, shield: 1, missile: 3, mine: 1, oil: 1, heal: 2, zap: 1.5 };
    const tot = pool.reduce((s, i) => s + w[i], 0);
    let r = Math.random() * tot;
    for (const i of pool) { r -= w[i]; if (r <= 0) return i; }
    return pool[0]!;
  }

  opponent(k: Kart) {
    const others = this.karts.filter((o) => o !== k && !o.eliminated);
    others.sort((a, b) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(b.x - k.x, b.y - k.y));
    const ahead = others.filter((o) => o.progress > k.progress).sort((a, b) => a.progress - b.progress)[0];
    return ahead ?? others[0];
  }

  spawn(o: Omit<Proj, "id" | "age">) {
    const p: Proj = { ...o, id: `${o.owner}-${this.pid++}`, age: 0 };
    this.projs.push(p); this.onNet?.({ t: "spawn", o: p });
  }

  useItem(k: Kart, _i: number) {
    const it = k.item!; k.item = null; k.stats.itemsUsed++;
    const fx = Math.cos(k.a), fy = Math.sin(k.a);
    const back = { x: k.x - fx * (k.r + 22), y: k.y - fy * (k.r + 22) };
    switch (it) {
      case "nitro": k.boost = Math.max(k.boost, 1.5); audio.play("nitro"); k.stats.boosts++; break;
      case "shield": k.shield = 8; audio.play("shield"); break;
      case "heal": k.hp = Math.min(k.maxHp, k.hp + 40); audio.play("heal"); this.burst(k.x, k.y, "#5be37b", 12); break;
      case "missile": { const tg = this.opponent(k); this.spawn({ kind: "missile", x: k.x + fx * 30, y: k.y + fy * 30, vx: fx * 900, vy: fy * 900, owner: k.spec.slot, life: 4, target: tg ? tg.spec.slot : -1 }); audio.play("missile"); break; }
      case "mine": this.spawn({ kind: "mine", ...back, vx: 0, vy: 0, owner: k.spec.slot, life: 40, target: -1 }); audio.play("drop"); break;
      case "oil": this.spawn({ kind: "oil", ...back, vx: 0, vy: 0, owner: k.spec.slot, life: 30, target: -1 }); audio.play("drop"); break;
      case "zap": {
        audio.play("zap");
        for (const o of this.karts) if (o !== k && !o.eliminated) {
          if (this.local(o)) this.hit(o, "zap", k.spec.slot);
          else this.onNet?.({ t: "fx", kind: "zap", from: k.spec.slot, to: o.spec.slot });
          for (let q = 0; q < 6; q++) this.parts.push({ x: o.x + (Math.random() - 0.5) * 40, y: o.y - Math.random() * 60, vx: 0, vy: 200, life: 0.3, max: 0.3, c: "#fff59a", s: 4 });
        }
        break;
      }
    }
  }

  useAbility(k: Kart, _i: number) {
    k.charge = 0; audio.play("ability");
    const lvl = k.spec.upgrades.ability;
    const fx = Math.cos(k.a), fy = Math.sin(k.a);
    const name = ABILITIES.find((a) => a.id === k.spec.ability)?.name ?? "";
    this.say(`${k.spec.name}: ${name}!`, PCOL[k.spec.slot] ?? "#fff");
    switch (k.spec.ability) {
      case "dash": k.boost = Math.max(k.boost, 2.2 + lvl * 0.3); break;
      case "phase": k.ghost = 3 + lvl * 0.4; break;
      case "repair": k.hp = Math.min(k.maxHp, k.hp + 50 + lvl * 8); k.slow = 0; this.burst(k.x, k.y, "#5be37b", 18); break;
      case "hop": k.air = true; k.vz = 520 + lvl * 30; k.z = 1; k.trickDone = false; k.boost = Math.max(k.boost, 0.6); break;
      case "freeze": this.spawn({ kind: "ice", x: k.x + fx * 30, y: k.y + fy * 30, vx: fx * 1000, vy: fy * 1000, owner: k.spec.slot, life: 2.5, target: this.opponent(k)?.spec.slot ?? -1 }); break;
      case "mines": for (let q = 0; q < 3; q++) this.spawn({ kind: "mine", x: k.x - fx * (40 + q * 45) + (q - 1) * fy * 40, y: k.y - fy * (40 + q * 45) - (q - 1) * fx * 40, vx: 0, vy: 0, owner: k.spec.slot, life: 30, target: -1 }); break;
      case "steal": {
        const tg = this.opponent(k);
        if (!tg) break;
        if (this.local(tg)) { const it = tg.item; tg.item = null; k.item = it ?? this.rollItem(k); }
        else this.onNet?.({ t: "fx", kind: "steal", from: k.spec.slot, to: tg.spec.slot });
        break;
      }
      case "shock": {
        for (let q = 0; q < 30; q++) { const a = (q / 30) * TAU; this.parts.push({ x: k.x, y: k.y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, life: 0.5, max: 0.5, c: "#ffb347", s: 6 }); }
        for (const o of this.karts) if (o !== k && Math.hypot(o.x - k.x, o.y - k.y) < 280 + lvl * 20) {
          if (this.local(o)) { const d = Math.hypot(o.x - k.x, o.y - k.y) || 1; o.vx += ((o.x - k.x) / d) * 500; o.vy += ((o.y - k.y) / d) * 500; this.hit(o, "shock", k.spec.slot); }
          else this.onNet?.({ t: "fx", kind: "shock", from: k.spec.slot, to: o.spec.slot });
        }
        break;
      }
    }
  }

  stepProjs(dt: number) {
    for (const p of this.projs) {
      p.age += dt; p.life -= dt;
      if (p.kind === "missile" || p.kind === "ice") {
        const tg = this.karts.find((k) => k.spec.slot === p.target);
        if (tg && p.kind === "missile" && p.age > 0.15) {
          const sp = Math.hypot(p.vx, p.vy);
          const cur = Math.atan2(p.vy, p.vx), want = Math.atan2(tg.y - p.y, tg.x - p.x);
          const na = cur + clamp(angDiff(cur, want), -4 * dt, 4 * dt);
          p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.random() < 0.7) this.parts.push({ x: p.x, y: p.y, vx: -p.vx * 0.1, vy: -p.vy * 0.1, life: 0.4, max: 0.4, c: p.kind === "ice" ? "#bff6ff" : "#ffa94d", s: 5 });
        const n = nearest(this.track, p.x, p.y);
        if (n.d > n.s.w / 2 + 100) p.life = 0;
      }
      for (const k of this.karts) {
        if (!this.local(k) || k.eliminated || k.ko > 0) continue;
        if (k.spec.slot === p.owner && p.age < (p.kind === "missile" || p.kind === "ice" ? 99 : 1.0)) continue;
        if (k.air && k.z > 12) continue;
        if (Math.hypot(k.x - p.x, k.y - p.y) < k.r + (p.kind === "oil" ? 24 : 14)) {
          this.hit(k, p.kind, p.owner); p.life = 0; this.onNet?.({ t: "rm", id: p.id });
        }
      }
    }
    this.projs = this.projs.filter((p) => p.life > 0);
  }

  checkEnd(dt: number) {
    if (this.over) return;
    const alive = this.karts.filter((k) => !k.eliminated && !k.dc);
    let end = false;
    if (this.cfg.mode === "survival" && this.karts.length > 1 && alive.length <= 1) end = true;
    if (alive.every((k) => k.finished)) end = true;
    if (this.rules.timeLimit > 0 && this.time >= this.rules.timeLimit) end = true;
    if (!end && alive.some((k) => k.finished)) {
      if (this.endTimer < 0) { this.endTimer = 20; }
      this.endTimer -= dt;
      if (this.endTimer <= 0) end = true;
    }
    if (end) {
      this.over = true;
      setTimeout(() => this.onFinish?.(this.result()), 1800);
    }
  }

  result(): RaceResult {
    const order = [...this.karts].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    const karts = order.map((k, i) => ({
      slot: k.spec.slot, name: k.spec.name, charId: k.spec.charId, finished: k.finished, time: k.finished ? k.finishTime : this.time,
      bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : 0, lapTimes: k.lapTimes, eliminated: k.eliminated, place: i + 1, stats: k.stats,
    }));
    return { karts, winner: karts[0]?.slot ?? null, trackId: this.cfg.track.id };
  }

  standings() {
    return [...this.karts].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
  }

  // ---------- network ----------
  netState(k: Kart): NetState {
    const r = (v: number) => Math.round(v * 10) / 10;
    return { slot: k.spec.slot, x: r(k.x), y: r(k.y), a: r(k.a * 100) / 100, vx: r(k.vx), vy: r(k.vy), v: r(k.v), z: r(k.z), hp: Math.round(k.hp), lap: k.lap, idx: k.idx, item: k.item, sh: r(k.shield), gh: r(k.ghost), bo: r(k.boost), sp: r(k.spin), dr: k.drifting ? k.driftDir : 0, lives: k.lives, ch: r(k.charge), ko: r(k.ko), trick: r(k.trick) };
  }
  receive(m: NetMsg) {
    switch (m.t) {
      case "s": {
        const k = this.karts.find((o) => o.spec.slot === m.st.slot && o.spec.control === "remote"); if (!k) return;
        const s = m.st;
        if (Math.hypot(s.x - k.x, s.y - k.y) > 400) { k.x = s.x; k.y = s.y; }
        k.tx = s.x; k.ty = s.y; k.ta = s.a; k.vx = s.vx; k.vy = s.vy; k.v = s.v; k.z = s.z; k.air = s.z > 0; k.hp = s.hp; k.lap = s.lap; k.idx = s.idx; k.item = s.item;
        k.shield = s.sh; k.ghost = s.gh; k.boost = s.bo; k.spin = s.sp; k.drifting = s.dr !== 0; k.driftDir = s.dr; k.lives = s.lives; k.charge = s.ch; k.ko = s.ko; k.trick = s.trick;
        break;
      }
      case "spawn": if (!this.projs.some((p) => p.id === m.o.id)) this.projs.push({ ...m.o }); break;
      case "rm": { const p = this.projs.find((q) => q.id === m.id); if (p) { this.burst(p.x, p.y, "#ff8a3d", 12); p.life = 0; } break; }
      case "box": this.boxCd.set(m.id, 3); break;
      case "crate": this.crateCd.set(m.id, 8); break;
      case "fx": {
        const k = this.karts.find((o) => o.spec.slot === m.to && this.local(o)); if (!k) return;
        if (m.kind === "zap") this.hit(k, "zap", m.from);
        else if (m.kind === "shock") { const f = this.karts.find((o) => o.spec.slot === m.from); if (f) { const d = Math.hypot(k.x - f.x, k.y - f.y) || 1; k.vx += ((k.x - f.x) / d) * 500; k.vy += ((k.y - f.y) / d) * 500; } this.hit(k, "shock", m.from); }
        else if (m.kind === "steal") { const it = k.item; k.item = null; this.onNet?.({ t: "give", item: it ?? this.rollItem(k), to: m.from }); this.say("Seu item foi roubado!", "#ff4d4d"); }
        break;
      }
      case "give": { const k = this.karts.find((o) => o.spec.slot === m.to && this.local(o)); if (k) { k.item = m.item; audio.play("pickup"); } break; }
      case "fin": { const k = this.karts.find((o) => o.spec.slot === m.slot); if (k && !k.finished) { k.finished = true; k.finishTime = m.time; k.lapTimes = m.lapTimes; k.stats = m.stats; this.say(`${k.spec.name} cruzou a linha!`, PCOL[k.spec.slot] ?? "#fff"); } break; }
      case "elim": { const k = this.karts.find((o) => o.spec.slot === m.slot); if (k) { k.eliminated = true; this.say(`${k.spec.name} ELIMINADO!`, "#ff4d4d"); } break; }
    }
  }

  // ---------- fx helpers ----------
  say(text: string, c: string) { this.msg.push({ text, t: 2.2, c }); if (this.msg.length > 3) this.msg.shift(); }
  burst(x: number, y: number, c: string, n: number) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 0.6, max: 0.6, c, s: 4 + Math.random() * 4 }); }
  spark(k: Kart) {
    const c = k.driftCharge > 3 ? "#d36bff" : k.driftCharge > 1.8 ? "#ff9a2e" : k.driftCharge > 0.8 ? "#48b8ff" : "#ddd";
    const bx = k.x - Math.cos(k.a) * k.r, by = k.y - Math.sin(k.a) * k.r;
    this.parts.push({ x: bx + Math.sin(k.a) * 8 * k.driftDir, y: by - Math.cos(k.a) * 8 * k.driftDir, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.3, max: 0.3, c, s: 3 + Math.random() * 3 });
  }
  trail(k: Kart, custom = false) {
    const tr = custom ? k.spec.custom.trail : "fire";
    const bx = k.x - Math.cos(k.a) * (k.r + 4), by = k.y - Math.sin(k.a) * (k.r + 4);
    let c = "#ff8a2e";
    if (tr === "sparkle") c = Math.random() < 0.5 ? "#fff6a8" : "#ffffff";
    else if (tr === "rainbow") c = `hsl(${(this.time * 300) % 360} 90% 60%)`;
    else if (tr === "smoke") c = "#9a9aa8";
    else c = Math.random() < 0.5 ? "#ffcf3f" : "#ff5a1f";
    this.parts.push({ x: bx, y: by, vx: -Math.cos(k.a) * 80 + (Math.random() - 0.5) * 50, vy: -Math.sin(k.a) * 80 + (Math.random() - 0.5) * 50, life: 0.4, max: 0.4, c, s: custom ? 4 : 6 });
  }

  // ---------- camera & render ----------
  /** Local 2-player races use a split screen with one camera per player; otherwise one shared view. */
  views() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const humans = this.karts.filter((k) => k.spec.control === "local");
    if (!this.cfg.online && humans.length === 2) return humans.map((k, i) => ({ x: i * (W / 2), w: W / 2, h: H, cam: this.cams[i]!, focus: [k] }));
    let focus = humans.filter((k) => !k.eliminated);
    if (!focus.length) focus = this.karts.filter((k) => !k.eliminated && !k.dc);
    return [{ x: 0, w: W, h: H, cam: this.cams[0]!, focus }];
  }
  viewRect(cam = this.cam, W = this.vw || this.canvas.clientWidth, H = this.viewH || this.canvas.clientHeight) {
    const z = cam.z;
    return { x0: cam.x - W / 2 / z, x1: cam.x + W / 2 / z, y0: cam.y - H / 2 / z, y1: cam.y + H / 2 / z };
  }
  updateCam(cam: { x: number; y: number; z: number }, focus: Kart[], W: number, H: number) {
    if (!focus.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of focus) { const lx = k.x + k.vx * 0.35, ly = k.y + k.vy * 0.35; x0 = Math.min(x0, lx, k.x); y0 = Math.min(y0, ly, k.y); x1 = Math.max(x1, lx, k.x); y1 = Math.max(y1, ly, k.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const sp = Math.max(...focus.map((k) => Math.abs(k.v))) / 700;
    let z = Math.min(W / (x1 - x0 + 520), H / (y1 - y0 + 420));
    z = clamp(z, 0.32, (focus.length === 1 ? 0.95 : 1.05) - sp * 0.25);
    cam.x += (cx - cam.x) * 0.12; cam.y += (cy - cam.y) * 0.12; cam.z += (z - cam.z) * 0.06;
  }

  render() {
    const c = this.canvas, ctx = this.ctx, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) { c.width = Math.floor(W * dpr); c.height = Math.floor(H * dpr); }
    const views = this.views();
    for (const v of views) {
      this.updateCam(v.cam, v.focus, v.w, v.h);
      this.cam = v.cam; this.vw = v.w; this.vx = v.x; this.viewH = v.h;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath(); ctx.rect(v.x, 0, v.w, v.h); ctx.clip();
      this.renderWorld(v.x, v.w, v.h, dpr);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (views.length === 2) { ctx.fillStyle = "#111"; ctx.fillRect(W / 2 - 3, 0, 6, H); }
    this.cam = this.cams[0]!; this.vw = 0; this.vx = 0; this.viewH = 0;
    this.renderHud(W, H, views);
  }

  renderWorld(ox: number, W: number, H: number, dpr: number) {
    const ctx = this.ctx, t = this.track, th = t.theme, z = this.cam.z;
    ctx.fillStyle = th.ground; ctx.fillRect(ox, 0, W, H);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (ox + W / 2 - this.cam.x * z), dpr * (H / 2 - this.cam.y * z));
    const v = this.viewRect(this.cam, W, H);
    // ground tiles
    ctx.fillStyle = th.ground2;
    const ts = 160;
    for (let gx = Math.floor(v.x0 / ts) * ts; gx < v.x1; gx += ts) for (let gy = Math.floor(v.y0 / ts) * ts; gy < v.y1; gy += ts) if (((gx + gy) / ts) % 2 === 0) ctx.fillRect(gx, gy, ts, ts);
    if (th.id === "space" || th.id === "future") { ctx.fillStyle = "#fff"; for (let i = 0; i < 160; i++) { const sx = ((i * 7919) % 5000) - 500, sy = ((i * 6007) % 5000) - 500; ctx.fillRect(sx, sy, 3, 3); } }
    // track
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const mp = t.mainPath!;
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = t.width + 200; ctx.stroke(mp);
    ctx.strokeStyle = th.dirt; ctx.lineWidth = t.width + 170; ctx.globalAlpha = 0.35; ctx.stroke(mp); ctx.globalAlpha = 1;
    t.shortPaths.forEach((sp, i) => {
      if (t.secret[i]) { ctx.strokeStyle = th.ground2; ctx.lineWidth = t.width * 0.5 + 10; ctx.globalAlpha = 0.9; ctx.stroke(sp); ctx.globalAlpha = 0.35; ctx.strokeStyle = th.dirt; ctx.setLineDash([6, 30]); ctx.lineWidth = 8; ctx.stroke(sp); ctx.setLineDash([]); ctx.globalAlpha = 1; return; }
      ctx.strokeStyle = th.dirt; ctx.lineWidth = t.width * 0.6 + 14; ctx.stroke(sp); ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.setLineDash([12, 18]); ctx.lineWidth = 3; ctx.stroke(sp); ctx.setLineDash([]);
    });
    ctx.strokeStyle = th.edgeA; ctx.lineWidth = t.width + 20; ctx.stroke(mp);
    ctx.strokeStyle = th.edgeB; ctx.setLineDash([36, 36]); ctx.stroke(mp); ctx.setLineDash([]);
    ctx.strokeStyle = th.road; ctx.lineWidth = t.width; ctx.stroke(mp);
    ctx.strokeStyle = th.line; ctx.globalAlpha = 0.6; ctx.lineWidth = 4; ctx.setLineDash([30, 40]); ctx.stroke(mp); ctx.setLineDash([]); ctx.globalAlpha = 1;
    // start line
    const s0 = t.main[0]!;
    ctx.save(); ctx.translate(s0.x, s0.y); ctx.rotate(s0.ang);
    const sq = 14, rows = Math.ceil(t.width / sq);
    for (let r = 0; r < rows; r++) for (let q = 0; q < 2; q++) { ctx.fillStyle = (r + q) % 2 ? "#111" : "#fff"; ctx.fillRect(-sq + q * sq, -t.width / 2 + r * sq, sq, sq); }
    ctx.restore();
    for (const o of t.objects) {
      if (o.x < v.x0 - 150 || o.x > v.x1 + 150 || o.y < v.y0 - 150 || o.y > v.y1 + 150) continue;
      this.drawObject(o);
    }
    for (const d of t.decor) { if (d.x < v.x0 - 120 || d.x > v.x1 + 120 || d.y < v.y0 - 120 || d.y > v.y1 + 120) continue; this.drawDecor(d); }
    for (const p of this.projs) this.drawProj(p);
    const order = [...this.karts].sort((a, b) => a.z - b.z);
    for (const k of order) if (!k.eliminated) this.drawKart(k);
    for (const p of this.parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    ctx.globalAlpha = 1;
    for (const k of this.karts) {
      if (k.eliminated) continue;
      ctx.font = "bold 14px 'Press Start 2P', monospace"; ctx.textAlign = "center";
      const label = (k.spec.control === "cpu" || k.spec.cpuLabel ? "CPU " : "") + k.spec.name.slice(0, 10) + (k.dc ? " (OFF)" : "");
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(label, k.x + 2, k.y - 34 - k.z + 2);
      ctx.fillStyle = PCOL[k.spec.slot] ?? "#fff"; ctx.fillText(label, k.x, k.y - 34 - k.z);
      if (k.ko > 0) { ctx.fillStyle = "#ff8a3d"; ctx.fillText(Math.ceil(k.ko).toString(), k.x, k.y + 6); }
    }
    if (th.night) this.renderLight(ox, W, H, dpr, v);
  }

  renderLight(ox: number, W: number, H: number, dpr: number, v: { x0: number; y0: number; x1: number; y1: number }) {
    if (this.canvas.width === 0 || this.canvas.height === 0) return;
    if (!this.light) this.light = document.createElement("canvas");
    const L = this.light; if (L.width !== this.canvas.width || L.height !== this.canvas.height) { L.width = this.canvas.width; L.height = this.canvas.height; }
    const g = L.getContext("2d")!; const z = this.cam.z;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, L.width, L.height); g.fillStyle = "rgba(5,6,25,0.55)"; g.fillRect(ox * dpr, 0, W * dpr, H * dpr);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (ox + W / 2 - this.cam.x * z), dpr * (H / 2 - this.cam.y * z));
    g.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const k of this.karts) { if (k.eliminated) continue; hole(k.x, k.y, 90, 0.9); hole(k.x + Math.cos(k.a) * 140, k.y + Math.sin(k.a) * 140, 150, 0.85); }
    for (const d of this.track.decor) if (d.kind === "lamp" || d.kind === "crystal" || d.kind === "tower") { if (d.x > v.x0 - 200 && d.x < v.x1 + 200 && d.y > v.y0 - 200 && d.y < v.y1 + 200) hole(d.x, d.y, 200 * d.s, 0.8); }
    for (const o of this.track.objects) if (o.kind === "boost" || o.kind === "item" || o.kind === "surface" || o.kind === "trap" || o.kind === "spinner") hole(o.x, o.y, o.kind === "surface" ? 160 : 90, 0.7);
    for (let i = 0; i < this.track.n; i += 30) { const s = this.track.main[i]!; hole(s.x, s.y, 170, 0.35); }
    for (const p of this.projs) hole(p.x, p.y, 70, 0.8);
    this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(L, 0, 0);
    this.ctx.restore();
  }

  drawObject(o: BuiltTrack["objects"][number]) {
    const ctx = this.ctx, th = this.track.theme;
    switch (o.kind) {
      case "item": {
        if (this.boxCd.has(o.id)) return;
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(this.time * 1.5 + o.id);
        const hue = (this.time * 120 + o.id * 40) % 360;
        ctx.fillStyle = `hsla(${hue} 90% 60% / 0.85)`; ctx.fillRect(-14, -14, 28, 28);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(-14, -14, 28, 28);
        ctx.rotate(-(this.time * 1.5 + o.id)); ctx.fillStyle = "#fff"; ctx.font = "bold 18px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", 0, 1);
        ctx.restore(); break;
      }
      case "boost": {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a ?? 0);
        ctx.fillStyle = "rgba(255,170,0,0.25)"; ctx.fillRect(-40, -26, 80, 52);
        for (let i = 0; i < 3; i++) { const ph = ((this.time * 3 + i / 3) % 1); ctx.fillStyle = `rgba(255,${180 + i * 25},40,${0.5 + ph * 0.5})`; ctx.beginPath(); const x = -30 + i * 22; ctx.moveTo(x, -20); ctx.lineTo(x + 16, 0); ctx.lineTo(x, 20); ctx.lineTo(x + 6, 0); ctx.closePath(); ctx.fill(); }
        ctx.restore(); break;
      }
      case "ramp": {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a ?? 0);
        ctx.fillStyle = "#6a4a2a"; ctx.fillRect(-30, -50, 60, 100);
        ctx.fillStyle = "#ffcf3f"; for (let i = 0; i < 5; i++) ctx.fillRect(-30 + i * 12, -50, 6, 100);
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(22, -50, 8, 100);
        ctx.restore(); break;
      }
      case "oil": { ctx.fillStyle = "rgba(10,10,20,0.85)"; ctx.beginPath(); ctx.ellipse(o.x, o.y, 28, 20, 0.4, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(120,80,200,0.35)"; ctx.beginPath(); ctx.ellipse(o.x - 6, o.y - 4, 10, 5, 0.4, 0, TAU); ctx.fill(); break; }
      case "crate": {
        if (this.crateCd.has(o.id)) return;
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(o.x - 16, o.y - 12, 34, 34);
        ctx.fillStyle = "#b07a3e"; ctx.fillRect(o.x - 18, o.y - 18, 36, 36); ctx.strokeStyle = "#6a4421"; ctx.lineWidth = 4; ctx.strokeRect(o.x - 18, o.y - 18, 36, 36);
        ctx.beginPath(); ctx.moveTo(o.x - 18, o.y - 18); ctx.lineTo(o.x + 18, o.y + 18); ctx.moveTo(o.x + 18, o.y - 18); ctx.lineTo(o.x - 18, o.y + 18); ctx.stroke(); break;
      }
      case "barrier": case "mover": case "spinner": case "tire": case "rock": {
        const sh = this.obstacleShape(o)!;
        if (o.kind === "tire") { for (let q = 0; q < 3; q++) { ctx.fillStyle = "#1b1b1b"; ctx.beginPath(); ctx.arc(o.x + (q - 1) * 12, o.y + (q % 2) * 6 - 3, 11, 0, TAU); ctx.fill(); ctx.fillStyle = "#555"; ctx.beginPath(); ctx.arc(o.x + (q - 1) * 12, o.y + (q % 2) * 6 - 3, 4, 0, TAU); ctx.fill(); } break; }
        if (o.kind === "rock") { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(o.x + 5, o.y + 7, 28, 18, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#7d7468"; ctx.beginPath(); ctx.moveTo(o.x - 26, o.y + 8); ctx.lineTo(o.x - 14, o.y - 20); ctx.lineTo(o.x + 12, o.y - 24); ctx.lineTo(o.x + 28, o.y + 2); ctx.lineTo(o.x + 10, o.y + 20); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#3d3832"; ctx.lineWidth = 3; ctx.stroke(); break; }
        if (o.kind === "spinner") { ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(o.x, o.y, 16, 0, TAU); ctx.fill(); }
        ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = sh.r * 2 + 6;
        ctx.beginPath(); ctx.moveTo(sh.x0, sh.y0); ctx.lineTo(sh.x1, sh.y1); ctx.stroke();
        ctx.strokeStyle = o.kind === "spinner" ? "#ff4d4d" : o.kind === "mover" ? "#ffcf3f" : "#e8e8e8"; ctx.lineWidth = sh.r * 2;
        ctx.setLineDash(o.kind === "spinner" ? [] : [12, 10]); ctx.beginPath(); ctx.moveTo(sh.x0, sh.y0); ctx.lineTo(sh.x1, sh.y1); ctx.stroke(); ctx.setLineDash([]);
        if (o.kind === "barrier") { ctx.strokeStyle = "#d93a3a"; ctx.lineWidth = sh.r * 2; ctx.setLineDash([10, 12]); ctx.lineDashOffset = 10; ctx.beginPath(); ctx.moveTo(sh.x0, sh.y0); ctx.lineTo(sh.x1, sh.y1); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
        break;
      }
      case "cone": {
        if (this.crateCd.has(o.id)) return;
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(o.x + 3, o.y + 4, 10, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ff7a1a"; ctx.beginPath(); ctx.arc(o.x, o.y, 10, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = "#ff7a1a"; ctx.beginPath(); ctx.arc(o.x, o.y, 3, 0, TAU); ctx.fill();
        break;
      }
      case "hole": {
        const gr = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, 34); gr.addColorStop(0, "#000"); gr.addColorStop(0.7, "#0b0b10"); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.x, o.y, 34, 0, TAU); ctx.fill(); break;
      }
      case "trap": {
        const on = this.trapOn(o);
        ctx.fillStyle = "#3a3a44"; ctx.fillRect(o.x - 26, o.y - 26, 52, 52); ctx.strokeStyle = "#ffcf3f"; ctx.lineWidth = 3; ctx.strokeRect(o.x - 26, o.y - 26, 52, 52);
        ctx.fillStyle = on ? "#e8e8e8" : "#666";
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const x = o.x - 16 + i * 16, y = o.y - 16 + j * 16; ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.lineTo(x, on ? y - 9 : y + 1); ctx.lineTo(x + 5, y + 5); ctx.fill(); }
        break;
      }
      case "platform": {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a ?? 0);
        ctx.fillStyle = "#2a6fdb"; ctx.fillRect(-40, -40, 80, 80); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.strokeRect(-40, -40, 80, 80);
        ctx.fillStyle = "#fff"; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-14 + i * 18, -18); ctx.lineTo(6 + i * 18, 0); ctx.lineTo(-14 + i * 18, 18); ctx.closePath(); ctx.fill(); }
        ctx.restore(); break;
      }
      case "surface": {
        const sf = o.sf ?? th.surface;
        const col = sf === "ice" ? "rgba(190,235,255,0.75)" : sf === "mud" ? "rgba(90,60,30,0.8)" : sf === "sand" ? "rgba(230,200,120,0.8)" : sf === "grass" ? "rgba(70,150,60,0.8)" : `rgba(255,${90 + Math.sin(this.time * 4) * 30},20,0.85)`;
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(o.x, o.y, 110, 80, o.a ?? 0, 0, TAU); ctx.fill();
        if (sf === "lava" || !sf) { ctx.fillStyle = "rgba(255,230,120,0.6)"; ctx.beginPath(); ctx.ellipse(o.x, o.y, 50, 30, o.a ?? 0, 0, TAU); ctx.fill(); }
        break;
      }
    }
  }

  drawDecor(d: BuiltTrack["decor"][number]) {
    const ctx = this.ctx, s = d.s;
    ctx.save(); ctx.translate(d.x, d.y); ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(8, 10, 26, 14, 0, 0, TAU); ctx.fill();
    switch (d.kind) {
      case "tree": ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(-8, -8, 12, 0, TAU); ctx.fill(); break;
      case "pine": ctx.fillStyle = d.c; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, -34 + i * 10); ctx.lineTo(22 - i * 4, 10 + i * 6); ctx.lineTo(-22 + i * 4, 10 + i * 6); ctx.closePath(); ctx.fill(); } break;
      case "building": ctx.fillStyle = d.c; ctx.fillRect(-36, -36, 72, 72); ctx.fillStyle = "#ffd96a"; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i * 3 + j * 5 + Math.floor(d.x)) % 3) ctx.fillRect(-28 + i * 16, -28 + j * 16, 8, 8); break;
      case "cactus": ctx.fillStyle = d.c; ctx.fillRect(-6, -30, 12, 50); ctx.fillRect(-20, -14, 10, 20); ctx.fillRect(10, -20, 10, 18); break;
      case "rock": ctx.fillStyle = d.c; ctx.beginPath(); ctx.moveTo(-24, 10); ctx.lineTo(-14, -16); ctx.lineTo(10, -20); ctx.lineTo(26, 4); ctx.lineTo(10, 16); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(-10, -12, 14, 6); break;
      case "crystal": ctx.fillStyle = d.c; ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(14, 0); ctx.lineTo(0, 14); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(-3, -24, 4, 18); break;
      case "lamp": ctx.fillStyle = "#333"; ctx.fillRect(-3, -3, 6, 6); ctx.fillStyle = "#ffc46b"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,196,107,0.18)"; ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill(); break;
      case "palm": ctx.fillStyle = d.c; for (let i = 0; i < 5; i++) { ctx.save(); ctx.rotate((i / 5) * TAU); ctx.beginPath(); ctx.ellipse(18, 0, 20, 7, 0, 0, TAU); ctx.fill(); ctx.restore(); } ctx.fillStyle = "#8a5a2b"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill(); break;
      case "candy": ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill(); ctx.strokeStyle = d.c; ctx.lineWidth = 6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 6 + i * 6, i, i + 3); ctx.stroke(); } break;
      case "snowman": ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 6, 16, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -14, 10, 0, TAU); ctx.fill(); ctx.fillStyle = "#ff8a2e"; ctx.fillRect(0, -15, 8, 3); break;
      case "mushroom": ctx.fillStyle = "#f4e6d0"; ctx.fillRect(-5, -4, 10, 16); ctx.fillStyle = d.c === "#ff9ec7" ? d.c : "#d9342b"; ctx.beginPath(); ctx.arc(0, -4, 18, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(-8, -14, 5, 5); ctx.fillRect(4, -10, 4, 4); break;
      case "tower": ctx.fillStyle = d.c; ctx.fillRect(-18, -18, 36, 36); ctx.strokeStyle = "#7cf9ff"; ctx.lineWidth = 3; ctx.strokeRect(-18, -18, 36, 36); ctx.fillStyle = `rgba(124,249,255,${0.5 + Math.sin(this.time * 3 + d.x) * 0.4})`; ctx.fillRect(-6, -6, 12, 12); break;
    }
    ctx.restore();
  }

  drawProj(p: Proj) {
    const ctx = this.ctx;
    if (p.kind === "missile" || p.kind === "ice") {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = p.kind === "ice" ? "#bff6ff" : "#ff4d4d";
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -8); ctx.lineTo(-6, 0); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.kind === "mine") {
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = Math.floor(this.time * 4) % 2 ? "#ff3b6b" : "#661a2a"; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#555"; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12); ctx.lineTo(p.x + Math.cos(a) * 17, p.y + Math.sin(a) * 17); ctx.stroke(); }
    } else { ctx.fillStyle = "rgba(15,10,25,0.9)"; ctx.beginPath(); ctx.ellipse(p.x, p.y, 26, 18, 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(160,110,255,0.4)"; ctx.beginPath(); ctx.ellipse(p.x - 6, p.y - 4, 9, 4, 0.3, 0, TAU); ctx.fill(); }
  }

  drawKart(k: Kart) {
    const ctx = this.ctx, cu = k.spec.custom, vt = k.ch.vehicle;
    const scale = 1 + k.z / 220;
    ctx.save();
    ctx.globalAlpha = k.dc ? 0.35 : k.ghost > 0 ? 0.45 + Math.sin(this.time * 20) * 0.15 : 1;
    if (k.fall > 0) { ctx.translate(k.x, k.y); ctx.scale(Math.max(0.05, k.fall), Math.max(0.05, k.fall)); ctx.translate(-k.x, -k.y); }
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(k.x + 4 + k.z * 0.3, k.y + 6 + k.z * 0.5, k.r * 1.3, k.r * 0.9, k.a, 0, TAU); ctx.fill();
    ctx.translate(k.x, k.y - k.z * 0.6); ctx.rotate(k.a + (k.trick > 0 ? (0.45 - k.trick) / 0.45 * TAU : 0) + (k.drifting ? k.driftDir * 0.35 : 0)); ctx.scale(scale, scale);
    const L = vt === "truck" ? 46 : vt === "moto" ? 36 : vt === "rocket" ? 44 : 38;
    const Wd = vt === "truck" ? 30 : vt === "moto" ? 12 : vt === "rocket" ? 18 : 24;
    // wheels
    const wc = cu.wheels === "neon" ? cu.color2 : "#151515";
    const wheel = (x: number, y: number, w = 10, h = 6) => { ctx.fillStyle = wc; ctx.fillRect(x - w / 2, y - h / 2, w, h); if (cu.wheels === "sport") { ctx.fillStyle = "#ccc"; ctx.fillRect(x - 2, y - 2, 4, 4); } if (cu.wheels === "offroad") { ctx.fillStyle = "#333"; ctx.fillRect(x - w / 2 - 1, y - h / 2 - 1, 3, h + 2); } };
    if (vt === "moto") { wheel(L / 2 - 4, 0, 12, 6); wheel(-L / 2 + 4, 0, 12, 6); }
    else if (vt === "hover" || vt === "rocket" || vt === "dragon") { ctx.fillStyle = vt === "dragon" ? cu.color2 : "rgba(120,240,255,0.6)"; if (vt === "dragon") { ctx.beginPath(); ctx.moveTo(-4, -Wd / 2); ctx.lineTo(-14, -Wd / 2 - 18 - Math.sin(this.time * 12) * 6); ctx.lineTo(8, -Wd / 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-4, Wd / 2); ctx.lineTo(-14, Wd / 2 + 18 + Math.sin(this.time * 12) * 6); ctx.lineTo(8, Wd / 2); ctx.fill(); } else { ctx.fillRect(-L / 2, -Wd / 2 - 4, L, 3); ctx.fillRect(-L / 2, Wd / 2 + 1, L, 3); } }
    else { const ww = vt === "buggy" || cu.wheels === "offroad" ? 13 : 10, wh = vt === "buggy" ? 9 : 7; wheel(L / 2 - 8, -Wd / 2 - 1, ww, wh); wheel(L / 2 - 8, Wd / 2 + 1, ww, wh); wheel(-L / 2 + 8, -Wd / 2 - 1, ww, wh); wheel(-L / 2 + 8, Wd / 2 + 1, ww, wh); }
    // body
    ctx.fillStyle = cu.color;
    ctx.beginPath();
    if (vt === "rocket") { ctx.moveTo(L / 2 + 6, 0); ctx.lineTo(L / 2 - 10, -Wd / 2); ctx.lineTo(-L / 2, -Wd / 2); ctx.lineTo(-L / 2 - 6, -Wd / 2 - 8); ctx.lineTo(-L / 2 - 6, Wd / 2 + 8); ctx.lineTo(-L / 2, Wd / 2); ctx.lineTo(L / 2 - 10, Wd / 2); ctx.closePath(); }
    else if (vt === "hover") { ctx.ellipse(0, 0, L / 2, Wd / 2 + 2, 0, 0, TAU); }
    else if (vt === "dragon") { ctx.ellipse(0, 0, L / 2, Wd / 2, 0, 0, TAU); ctx.moveTo(L / 2 - 4, -5); ctx.lineTo(L / 2 + 12, 0); ctx.lineTo(L / 2 - 4, 5); ctx.moveTo(-L / 2 + 2, -3); ctx.lineTo(-L / 2 - 16, 0); ctx.lineTo(-L / 2 + 2, 3); }
    else ctx.roundRect(-L / 2, -Wd / 2, L, Wd, vt === "truck" ? 4 : 7);
    ctx.fill();
    // decal
    ctx.save(); ctx.clip();
    ctx.fillStyle = cu.color2;
    if (cu.decal === "stripes") { ctx.fillRect(-L / 2, -3, L, 2.5); ctx.fillRect(-L / 2, 1, L, 2.5); }
    else if (cu.decal === "flames") { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(L / 2 - 4, -Wd / 2 + 4 + i * (Wd - 8) / 2); ctx.lineTo(-L / 6 + i * 4, -Wd / 2 + 2 + i * (Wd - 4) / 2); ctx.lineTo(L / 2 - 14, -Wd / 2 + 8 + i * (Wd - 8) / 2); ctx.fill(); } }
    else if (cu.decal === "checker") { for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) ctx.fillRect(-L / 2 + i * 5, -Wd / 2 + j * (Wd / 4), 5, Wd / 4); }
    else if (cu.decal === "dots") { for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-L / 2 + 6 + i * 9, (i % 2 ? 1 : -1) * Wd / 5, 2.5, 0, TAU); ctx.fill(); } }
    else if (cu.decal === "number") { ctx.beginPath(); ctx.arc(-L / 5, 0, Math.min(8, Wd / 2 - 1), 0, TAU); ctx.fill(); ctx.fillStyle = "#111"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(k.spec.slot + 1), -L / 5, 1); }
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    // windshield / exhaust
    if (vt === "car" || vt === "truck") { ctx.fillStyle = "rgba(160,220,255,0.85)"; ctx.fillRect(L / 2 - (vt === "truck" ? 16 : 14), -Wd / 2 + 3, 6, Wd - 6); }
    // driver
    ctx.fillStyle = k.ch.skin; ctx.beginPath(); ctx.arc(vt === "truck" ? 10 : -2, 0, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = cu.helmet; ctx.beginPath(); ctx.arc(vt === "truck" ? 9 : -3, 0, 6.5, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    // accessory
    ctx.fillStyle = cu.color2;
    if (cu.accessory === "spoiler") { ctx.fillStyle = "#222"; ctx.fillRect(-L / 2 - 4, -Wd / 2 - 2, 5, Wd + 4); }
    else if (cu.accessory === "antenna") { ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-L / 2 + 6, Wd / 2 - 4); ctx.lineTo(-L / 2 - 8, Wd / 2 + 4); ctx.stroke(); ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.arc(-L / 2 - 8, Wd / 2 + 4, 2.5, 0, TAU); ctx.fill(); }
    else if (cu.accessory === "horns") { ctx.fillStyle = "#f4e6d0"; ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(4, -13); ctx.lineTo(2, -4); ctx.moveTo(-2, 5); ctx.lineTo(4, 13); ctx.lineTo(2, 4); ctx.fill(); }
    else if (cu.accessory === "crown") { ctx.fillStyle = "#ffd34d"; ctx.fillRect(-6, -5, 4, 10); ctx.fillRect(-8, -5, 2, 2); ctx.fillRect(-8, 3, 2, 2); ctx.fillRect(-8, -1, 2, 2); }
    else if (cu.accessory === "flag") { ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-L / 2 + 4, 0); ctx.lineTo(-L / 2 - 12, 0); ctx.stroke(); ctx.fillStyle = cu.color2; ctx.fillRect(-L / 2 - 12, 0, 8, 6 + Math.sin(this.time * 10) * 2); }
    // headlights
    ctx.fillStyle = "#fff6c4"; if (vt !== "moto") { ctx.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 4); ctx.fillRect(L / 2 - 3, Wd / 2 - 6, 3, 4); } else ctx.fillRect(L / 2 - 2, -2, 3, 4);
    ctx.restore();
    // shield
    if (k.shield > 0) { ctx.strokeStyle = `rgba(79,195,247,${0.5 + Math.sin(this.time * 8) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(k.x, k.y - k.z * 0.6, k.r + 14, 0, TAU); ctx.stroke(); }
    if (k.slow > 0) { ctx.strokeStyle = "rgba(190,240,255,0.7)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(k.x, k.y - k.z * 0.6, k.r + 8, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  }

  renderHud(W: number, H: number, views: { x: number; w: number; focus: Kart[] }[]) {
    const ctx = this.ctx;
    const font = (s: number) => `${s}px 'Press Start 2P', monospace`;
    const st = this.standings();
    const humans = this.karts.filter((k) => k.spec.control === "local");
    const shown = humans.length ? humans : this.karts.slice(0, 1);
    const split = views.length === 2;
    shown.forEach((k, i) => {
      const pw = 300, ph = 150;
      const x = split ? (views[i]?.x ?? 0) + 16 : i === 1 ? W - pw - 16 : 16, y = split ? H - ph - 16 : 16;
      ctx.fillStyle = "rgba(12,10,30,0.72)"; ctx.fillRect(x, y, pw, ph);
      ctx.strokeStyle = PCOL[k.spec.slot] ?? "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x, y, pw, ph);
      const place = st.indexOf(k) + 1;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = PCOL[k.spec.slot] ?? "#fff"; ctx.font = font(30); ctx.fillText(`${place}º`, x + 12, y + 12);
      ctx.fillStyle = "#fff"; ctx.font = font(10);
      ctx.fillText(k.spec.name.slice(0, 12), x + 90, y + 14);
      const lapShow = Math.min(Math.max(1, k.lap), this.rules.laps);
      ctx.fillText(this.cfg.mode === "survival" ? `VOLTA ${lapShow}/${this.rules.laps}  ♥${k.lives}` : `VOLTA ${lapShow}/${this.rules.laps}`, x + 90, y + 32);
      // speed bar
      const sp01 = clamp(Math.abs(k.v) / (k.maxSpeed * 1.38), 0, 1);
      ctx.fillStyle = "#333"; ctx.fillRect(x + 90, y + 48, 100, 8); ctx.fillStyle = k.boost > 0 ? "#ff8a2e" : "#ffcf3f"; ctx.fillRect(x + 90, y + 48, 100 * sp01, 8);
      ctx.fillStyle = "#ffcf3f"; ctx.font = font(7); ctx.fillText(`${Math.round(Math.abs(k.v) * 0.32)} km/h${k.v < -5 ? " RÉ" : ""}`, x + 90, y + 60);
      ctx.font = font(10);
      // hp
      ctx.fillStyle = "#333"; ctx.fillRect(x + 12, y + 74, 180, 12);
      const hpP = k.hp / k.maxHp; ctx.fillStyle = hpP > 0.5 ? "#5be37b" : hpP > 0.25 ? "#ffcf3f" : "#ff4d4d"; ctx.fillRect(x + 12, y + 74, 180 * hpP, 12);
      ctx.fillStyle = "#fff"; ctx.font = font(7); ctx.fillText("VIDA", x + 14, y + 76);
      // turbo gauge
      ctx.fillStyle = "#333"; ctx.fillRect(x + 12, y + 94, 180, 10);
      ctx.fillStyle = k.boost > 0 ? "#ff8a2e" : k.drifting ? (k.driftCharge > 3 ? "#d36bff" : k.driftCharge > 1.8 ? "#ff9a2e" : "#48b8ff") : "#ff5a1f"; ctx.fillRect(x + 12, y + 94, 180 * k.turbo, 10);
      ctx.fillStyle = "#fff"; ctx.fillText(k.drifting ? "DRIFT!" : "TURBO", x + 14, y + 95);
      // ability
      ctx.fillStyle = "#333"; ctx.fillRect(x + 12, y + 112, 180, 10);
      ctx.fillStyle = k.charge >= 1 ? `hsl(${(this.time * 200) % 360} 90% 60%)` : "#9b59b6"; ctx.fillRect(x + 12, y + 112, 180 * k.charge, 10);
      ctx.fillStyle = "#fff"; ctx.fillText((ABILITIES.find((a) => a.id === k.spec.ability)?.name ?? "").toUpperCase() + (k.charge >= 1 ? " PRONTA!" : ""), x + 14, y + 113);
      if (k.spec.keys) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = font(6); ctx.fillText(`${keyLabel(k.spec.keys.turbo)}: turbo  ${keyLabel(k.spec.keys.item)}: item  ${keyLabel(k.spec.keys.ability)}: hab.`, x + 12, y + 132); }
      const ix = x + pw - 86, iy = y + 70;
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(ix, iy, 70, 62); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(ix, iy, 70, 62);
      if (k.item) { const d = ITEMS.find((it) => it.id === k.item)!; ctx.fillStyle = d.color === "#333" ? "#aaa" : d.color; ctx.font = "34px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.icon, ix + 35, iy + 26); ctx.font = font(6); ctx.fillStyle = "#fff"; ctx.fillText(d.name.toUpperCase(), ix + 35, iy + 52); ctx.textAlign = "left"; ctx.textBaseline = "top"; }
      const ny = split ? y - 22 : y + ph + 8;
      if (k.ko > 0) { ctx.fillStyle = "rgba(255,80,40,0.9)"; ctx.font = font(12); ctx.fillText(`KO! ${Math.ceil(k.ko)}s`, x + 12, ny); }
      if (k.finished) { ctx.fillStyle = "#5be37b"; ctx.font = font(12); ctx.fillText(`CHEGOU! ${fmt(k.finishTime)}`, x + 12, ny); }
      if (k.eliminated) { ctx.fillStyle = "#ff4d4d"; ctx.font = font(12); ctx.fillText("ELIMINADO", x + 12, ny); }
    });
    // timer
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "rgba(12,10,30,0.72)"; ctx.fillRect(W / 2 - 110, 16, 220, 44);
    ctx.fillStyle = "#fff"; ctx.font = font(18);
    const tm = this.rules.timeLimit > 0 ? Math.max(0, this.rules.timeLimit - Math.max(0, this.time)) : Math.max(0, this.time);
    ctx.fillText(fmt(tm), W / 2, 30);
    if (this.endTimer >= 0 && !this.over) { ctx.font = font(10); ctx.fillStyle = "#ff8a3d"; ctx.fillText(`Fim em ${Math.ceil(this.endTimer)}s`, W / 2, 68); }
    if (this.peerStatus) { ctx.font = font(10); ctx.fillStyle = "#ff8a3d"; ctx.fillText(this.peerStatus, W / 2, 86); }
    // countdown
    if (this.time < 0.8) {
      const c = Math.ceil(-this.time);
      const txt = this.time >= 0 ? "VAI!" : c <= 3 ? String(c) : "PREPARAR";
      ctx.font = font(this.time >= 0 ? 72 : c <= 3 ? 96 : 36); ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText(txt, W / 2 + 5, H / 2 + 5);
      ctx.fillStyle = this.time >= 0 ? "#5be37b" : "#ffcf3f"; ctx.fillText(txt, W / 2, H / 2);
    }
    // messages
    ctx.textBaseline = "middle";
    this.msg.forEach((m, i) => { ctx.font = font(14); ctx.globalAlpha = Math.min(1, m.t * 2); ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(m.text, W / 2 + 3, H * 0.28 + i * 34 + 3); ctx.fillStyle = m.c; ctx.fillText(m.text, W / 2, H * 0.28 + i * 34); });
    ctx.globalAlpha = 1;
    // minimap
    const t = this.track, b = t.bounds, mw = split ? 150 : 200, mh = split ? 150 : 200;
    const sc = Math.min(mw / (b.maxX - b.minX), mh / (b.maxY - b.minY));
    const mx = split ? W / 2 - mw / 2 : W - mw - 20, my = split ? 70 : H - mh - 20;
    ctx.fillStyle = "rgba(12,10,30,0.6)"; ctx.fillRect(mx - 10, my - 10, mw + 20, mh + 20);
    ctx.save(); ctx.translate(mx, my); ctx.scale(sc, sc); ctx.translate(-b.minX, -b.minY);
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 6 / sc * 0.6; ctx.stroke(t.mainPath!);
    ctx.strokeStyle = "rgba(255,200,120,0.6)"; for (const p of t.shortPaths) ctx.stroke(p);
    for (const k of this.karts) { if (k.eliminated) continue; ctx.fillStyle = PCOL[k.spec.slot] ?? "#fff"; ctx.beginPath(); ctx.arc(k.x, k.y, 7 / sc, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

export function fmt(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s * 100) % 100);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
