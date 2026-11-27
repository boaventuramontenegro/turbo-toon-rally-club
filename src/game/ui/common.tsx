import { useEffect, useMemo, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CHARACTERS, THEMES, type TrackDef } from "../data";
import { Race } from "../engine";
import { buildTrack } from "../track";
import type { Custom } from "../store";
import { cn } from "@/lib/utils";

type Tone = "primary" | "secondary" | "accent" | "muted" | "destructive" | "p1" | "p2";
const TONES: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  accent: "bg-accent text-accent-foreground",
  muted: "bg-muted text-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  p1: "bg-p1 text-primary-foreground",
  p2: "bg-p2 text-primary-foreground",
};
export function Btn({ tone = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button type="button" {...p} className={cn("toon-btn px-4 py-2 text-sm", TONES[tone], className)} />;
}

export function Screen({ title, onBack, children, right }: { title: string; onBack?: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6">
      <header className="mb-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        {onBack ? <Btn tone="muted" onClick={onBack}>← Voltar</Btn> : <span />}
        <h1 className="min-w-0 break-words text-center font-display text-xs leading-relaxed text-accent sm:text-xl">{title}</h1>
        {right && <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">{right}</div>}
      </header>
      {children}
    </div>
  );
}

/** Draws a kart with the race renderer so previews always match the race. */
export function KartPreview({ charId, custom, size = 96, slot = 0 }: { charId: string; custom: Custom; size?: number; slot?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const ch = CHARACTERS.find((x) => x.id === charId) ?? CHARACTERS[0]!;
    let raf = 0; const t0 = performance.now();
    const draw = () => {
      const time = (performance.now() - t0) / 1000;
      c.width = size * 2; c.height = size * 2;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2); ctx.scale(size / 70, size / 70);
      const fake = { x: 0, y: 0, a: -Math.PI / 2 + Math.sin(time * 1.5) * 0.25, z: 0, dc: false, ghost: 0, fall: 0, trick: 0, drifting: false, driftDir: 0, shield: 0, slow: 0, r: 15, ch, spec: { custom, slot } };
      (Race.prototype as unknown as { drawKart: (k: unknown) => void }).drawKart.call({ ctx, time }, fake);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [charId, custom, size, slot]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Thumbnail of a track (the "image" shown in galleries and menus). */
export function TrackPreview({ def, className }: { def: TrackDef; className?: string }) {
  const data = useMemo(() => {
    try {
      const t = buildTrack(def);
      const b = t.bounds, pad = 120;
      const d = t.main.map((s, i) => `${i ? "L" : "M"}${s.x.toFixed(0)} ${s.y.toFixed(0)}`).join(" ") + "Z";
      const routes = t.shortcuts.map((sc) => sc.map((s, i) => `${i ? "L" : "M"}${s.x.toFixed(0)} ${s.y.toFixed(0)}`).join(" "));
      return { d, routes, secret: t.secret, vb: `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`, w: t.width, start: t.main[0]! };
    } catch { return null; }
  }, [def]);
  const th = THEMES[def.theme] ?? THEMES["forest"]!;
  if (!data) return <div className={cn("aspect-video rounded-lg bg-muted", className)} />;
  return (
    <svg viewBox={data.vb} className={cn("aspect-video w-full rounded-lg", className)} style={{ background: th.ground }} role="img" aria-label={`Traçado de ${def.name}`}>
      {data.routes.map((r, i) => <path key={i} d={r} fill="none" stroke={th.dirt} strokeWidth={data.w * 0.55} strokeDasharray={data.secret[i] ? "20 30" : undefined} strokeLinecap="round" opacity={data.secret[i] ? 0.5 : 1} />)}
      <path d={data.d} fill="none" stroke={th.edgeA} strokeWidth={data.w + 30} strokeLinejoin="round" />
      <path d={data.d} fill="none" stroke={th.road} strokeWidth={data.w} strokeLinejoin="round" />
      <circle cx={data.start.x} cy={data.start.y} r={data.w * 0.45} fill="#fff" stroke="#111" strokeWidth={12} />
    </svg>
  );
}

export function Stars({ n }: { n: number }) {
  return <span className="text-accent" aria-label={`Dificuldade ${n} de 3`}>{"★".repeat(n)}<span className="opacity-30">{"★".repeat(3 - n)}</span></span>;
}

export function Bar({ value, max = 5, tone = "bg-primary" }: { value: number; max?: number; tone?: string }) {
  return <div className="h-2 w-full rounded-full bg-muted"><div className={cn("h-2 rounded-full", tone)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>;
}
