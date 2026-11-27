import { THEMES, UNIT, type DecorKind, type ThemeDef, type TrackDef, type TrackObject } from "./data";
export { UNIT };

export interface Sample { x: number; y: number; idx: number; w: number; dirt: boolean; ang: number }
export interface Decor { x: number; y: number; kind: DecorKind; s: number; c: string }
export interface BuiltTrack {
  def: TrackDef; theme: ThemeDef; samples: Sample[]; main: Sample[]; n: number;
  shortcuts: Sample[][]; secret: boolean[]; objects: (TrackObject & { id: number })[]; decor: Decor[];
  width: number; bounds: { minX: number; minY: number; maxX: number; maxY: number };
  mainPath: Path2D | null; shortPaths: Path2D[];
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export const SUB = 24; // samples per control segment before resampling

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function buildTrack(def: TrackDef): BuiltTrack {
  const theme = THEMES[def.theme] ?? THEMES["forest"]!;
  const pts = def.points.map(([x, y]) => [x * UNIT, y * UNIT] as [number, number]);
  const n0 = pts.length;
  const raw: { x: number; y: number; cp: number }[] = [];
  for (let i = 0; i < n0; i++) {
    const p0 = pts[(i - 1 + n0) % n0]!, p1 = pts[i]!, p2 = pts[(i + 1) % n0]!, p3 = pts[(i + 2) % n0]!;
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB;
      raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t), cp: i + t });
    }
  }
  // resample evenly every ~22px
  const step = 22;
  const main: Sample[] = [];
  const cpToIdx: number[] = [];
  let carry = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!, b = raw[(i + 1) % raw.length]!;
    if (Number.isInteger(a.cp) || Math.abs(a.cp - Math.round(a.cp)) < 1e-6) cpToIdx[Math.round(a.cp)] = main.length;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    let d = carry;
    while (d < len) {
      const t = d / len;
      main.push({ x: a.x + dx * t, y: a.y + dy * t, idx: main.length, w: def.width * UNIT, dirt: false, ang: Math.atan2(dy, dx) });
      d += step;
    }
    carry = d - len;
  }
  const n = main.length;
  const W = def.width * UNIT;
  const shortcuts: Sample[][] = [];
  const secretFlags: boolean[] = [];
  const addRoute = (ca: number, cb: number, via: [number, number][], secret: boolean) => {
    const ia = cpToIdx[ca], ib = cpToIdx[cb];
    if (ia === undefined || ib === undefined || ib <= ia) return;
    const a = main[ia]!, b = main[ib]!;
    const poly: [number, number][] = [[a.x, a.y], ...via.map(([x, y]) => [x * UNIT, y * UNIT] as [number, number]), [b.x, b.y]];
    const arr: Sample[] = [];
    let total = 0;
    for (let q = 0; q < poly.length - 1; q++) total += Math.hypot(poly[q + 1]![0] - poly[q]![0], poly[q + 1]![1] - poly[q]![1]);
    let acc = 0;
    for (let q = 0; q < poly.length - 1; q++) {
      const [x0, y0] = poly[q]!, [x1, y1] = poly[q + 1]!;
      const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      const cnt = Math.max(2, Math.floor(len / step));
      for (let k = q === 0 ? 0 : 1; k <= cnt; k++) {
        const t = k / cnt, d = acc + len * t;
        arr.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, idx: ia + (ib - ia) * (d / (total || 1)), w: W * (secret ? 0.5 : 0.6), dirt: true, ang });
      }
      acc += len;
    }
    shortcuts.push(arr); secretFlags.push(secret);
  };
  for (const [ca, cb] of def.shortcuts ?? []) addRoute(ca, cb, [], false);
  for (const r0 of def.routes ?? []) addRoute(r0.a, r0.b, r0.via, !!r0.secret);
  // official tracks get an auto-generated secret path that cuts the loopiest corner
  if (!def.custom && !(def.routes && def.routes.length) && n0 >= 6) {
    let best = -1, bestScore = 0;
    for (let a = 1; a + 2 < n0 - 1; a++) {
      const ia = cpToIdx[a], ib = cpToIdx[a + 2]; if (ia === undefined || ib === undefined) continue;
      const arc = (ib - ia) * step, ch = Math.hypot(main[ib]!.x - main[ia]!.x, main[ib]!.y - main[ia]!.y);
      if ((def.shortcuts ?? []).some(([x, y]) => x <= a + 2 && y >= a)) continue;
      const sc = arc / (ch || 1); if (sc > bestScore) { bestScore = sc; best = a; }
    }
    if (best >= 0 && bestScore > 1.25) {
      const pa = def.points[best]!, pb = def.points[best + 2]!, pm = def.points[best + 1]!;
      const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
      addRoute(best, best + 2, [[mx + (mx - pm[0]) * 0.15, my + (my - pm[1]) * 0.15]], true);
    }
  }
  const samples = [...main, ...shortcuts.flat()];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of samples) { minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y); }
  const r = rng(hash(def.id + def.name));

  // objects
  let objects: TrackObject[] = [];
  if (def.objects && (def.custom || def.objects.length)) {
    objects = def.objects.map((o) => ({ ...o, x: o.x * UNIT, y: o.y * UNIT }));
  } else {
    const at = (f: number, off: number) => { const s = main[Math.floor(f * n) % n]!; const nx = -Math.sin(s.ang), ny = Math.cos(s.ang); return { x: s.x + nx * off * W, y: s.y + ny * off * W, a: s.ang }; };
    const busy: number[] = [];
    const free = (f: number) => !busy.some((b) => Math.abs(b - f) < 0.035) && f > 0.06 && f < 0.95;
    const put = (f: number, o: Omit<TrackObject, "x" | "y">, off = 0) => { busy.push(f); objects.push({ ...o, ...at(f, off), ...(o.a !== undefined ? { a: o.a } : {}) }); };
    for (const f of [0.18, 0.5, 0.78]) { busy.push(f); for (const off of [-0.3, -0.1, 0.1, 0.3]) objects.push({ kind: "item", ...at(f, off) }); }
    const boosts = def.difficulty === 3 ? [0.32, 0.64, 0.9] : [0.35, 0.9];
    for (const f of boosts) put(f, { kind: "boost" }, (r() - 0.5) * 0.5);
    put(0.6 + r() * 0.08, { kind: "ramp" });
    if (def.difficulty >= 2) put(0.25 + r() * 0.05, { kind: "platform" });
    // narrow chicane: barriers squeezing the road from alternating sides
    const ch = 0.4 + r() * 0.12;
    if (free(ch)) { busy.push(ch); for (let q = 0; q < 3; q++) objects.push({ kind: "barrier", ...at(ch + q * 0.012, q % 2 ? 0.32 : -0.32) }); }
    // moving & rotating obstacles scale with difficulty
    for (let q = 0; q < def.difficulty; q++) { const f = 0.1 + r() * 0.85; if (free(f)) put(f, { kind: q % 2 ? "spinner" : "mover" }); }
    const hz = 3 + def.difficulty * 2;
    const pool: TrackObject["kind"][] = ["oil", "crate", "cone", "tire", "rock", "hole", "trap"];
    for (let i = 0; i < hz; i++) {
      const f = 0.1 + r() * 0.85; if (!free(f)) continue;
      const kind = pool[Math.floor(r() * (def.difficulty === 1 ? 4 : pool.length))]!;
      busy.push(f);
      if (kind === "cone") for (let q = -1; q <= 1; q++) objects.push({ kind, ...at(f, q * 0.22) });
      else objects.push({ kind, ...at(f, (r() - 0.5) * 0.6) });
    }
    if (theme.surface) for (const f of [0.42, 0.7]) objects.push({ kind: "surface", ...at(f, (r() - 0.5) * 0.4) });
    // shortcuts: real time savers, guarded by risk
    shortcuts.forEach((sc, si) => {
      const m = sc[Math.floor(sc.length / 2)]!;
      if (secretFlags[si]) { objects.push({ kind: "crate", x: m.x, y: m.y }); objects.push({ kind: "boost", x: sc[Math.floor(sc.length * 0.7)]!.x, y: sc[Math.floor(sc.length * 0.7)]!.y, a: m.ang }); }
      else { objects.push({ kind: "crate", x: m.x, y: m.y }); const q = sc[Math.floor(sc.length * 0.3)]!; objects.push({ kind: def.difficulty >= 2 ? "hole" : "oil", x: q.x + 18, y: q.y }); }
    });
  }

  // decor: scatter outside the road
  const decor: Decor[] = [];
  const pad = 400;
  const area = (maxX - minX + pad * 2) * (maxY - minY + pad * 2);
  const count = Math.floor(area / 26000);
  for (let i = 0; i < count; i++) {
    const x = minX - pad + r() * (maxX - minX + pad * 2), y = minY - pad + r() * (maxY - minY + pad * 2);
    let near = Infinity;
    for (let k = 0; k < samples.length; k += 2) { const s = samples[k]!; const d = Math.hypot(s.x - x, s.y - y) - s.w / 2; if (d < near) near = d; }
    if (near < 70) continue;
    const kind = theme.decor[Math.floor(r() * theme.decor.length)]!;
    decor.push({ x, y, kind, s: 0.7 + r() * 0.7, c: theme.decorColors[Math.floor(r() * theme.decorColors.length)]! });
  }
  return { def, theme, samples, main, n, shortcuts, secret: secretFlags, objects: objects.map((o, i) => ({ ...o, id: i })), decor, width: W, bounds: { minX, minY, maxX, maxY }, mainPath: null, shortPaths: [] };
}

export function ensurePaths(t: BuiltTrack) {
  if (t.mainPath) return;
  const p = new Path2D();
  t.main.forEach((s, i) => (i ? p.lineTo(s.x, s.y) : p.moveTo(s.x, s.y)));
  p.closePath();
  t.mainPath = p;
  t.shortPaths = t.shortcuts.map((sc) => { const q = new Path2D(); sc.forEach((s, i) => (i ? q.lineTo(s.x, s.y) : q.moveTo(s.x, s.y))); return q; });
}

export function nearest(t: BuiltTrack, x: number, y: number) {
  let best = t.samples[0]!, bd = Infinity;
  for (const s of t.samples) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  return { s: best, d: Math.sqrt(bd) };
}
