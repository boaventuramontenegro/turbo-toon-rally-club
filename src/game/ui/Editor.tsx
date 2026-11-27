import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { OBJECT_INFO, THEMES, UNIT, type ObjKind, type SurfaceKind, type TrackDef, type TrackObject } from "../data";
import { buildTrack, ensurePaths, nearest } from "../track";
import { loadCustomTracks, loadSettings, saveCustomTracks, upsertCustomTrack } from "../store";
import { supabase } from "@/integrations/supabase/client";
import { Btn, TrackPreview } from "./common";
import { PENDING_KEY } from "./GameApp";
import { cn } from "@/lib/utils";

type Tool = "select" | "draw" | "route" | "object";
type Sel = { t: "pt"; i: number } | { t: "obj"; i: number } | { t: "via"; r: number; j: number } | null;
const KINDS = Object.keys(OBJECT_INFO) as ObjKind[];
const SURFACES: [SurfaceKind, string][] = [["mud", "Lama"], ["ice", "Gelo"], ["sand", "Areia"], ["lava", "Lava"], ["grass", "Grama"]];

export function newTrack(creator: string): TrackDef {
  const pts: [number, number][] = [[20, 30], [45, 18], [72, 22], [86, 45], [76, 72], [50, 82], [24, 74], [12, 50]];
  return { id: `custom-${crypto.randomUUID().slice(0, 8)}`, name: "Minha pista", theme: "forest", difficulty: 2, unlockLevel: 1, width: 4.2, laps: 3, points: pts, routes: [], creator, custom: true, objects: [
    { kind: "item", x: 45, y: 16 }, { kind: "item", x: 45, y: 20 }, { kind: "boost", x: 76, y: 72 }, { kind: "ramp", x: 86, y: 45, a: Math.PI / 2 },
  ] };
}

// keep route indices valid when control points change
function shiftRoutes(d: TrackDef, fn: (i: number) => number | null): TrackDef {
  const routes = (d.routes ?? []).map((r) => { const a = fn(r.a), b = fn(r.b); return a === null || b === null || a >= b ? null : { ...r, a, b }; }).filter((r): r is NonNullable<typeof r> => !!r);
  const shortcuts = (d.shortcuts ?? []).map(([x, y]) => { const a = fn(x), b = fn(y); return a === null || b === null || a >= b ? null : ([a, b] as [number, number]); }).filter((r): r is [number, number] => !!r);
  return { ...d, routes, shortcuts };
}

export function TrackEditor({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const [def, setDef] = useState<TrackDef | null>(null);
  const [undo, setUndo] = useState<TrackDef[]>([]);
  const [redo, setRedo] = useState<TrackDef[]>([]);
  const [tool, setTool] = useState<Tool>("draw");
  const [kind, setKind] = useState<ObjKind>("barrier");
  const [sf, setSf] = useState<SurfaceKind>("mud");
  const [secret, setSecret] = useState(true);
  const [sel, setSel] = useState<Sel>(null);
  const [routeDraft, setRouteDraft] = useState<{ a: number; via: [number, number][] } | null>(null);
  const [view, setView] = useState({ x: -40, y: -20, z: 7 }); // px per unit, offset in px
  const [saved, setSaved] = useState<TrackDef[]>([]);
  const [publishing, setPublishing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: "pan" | "move"; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const list = loadCustomTracks(); setSaved(list);
    const found = editId ? list.find((t) => t.id === editId) : undefined;
    setDef(found ?? newTrack(loadSettings().name || "Piloto"));
  }, [editId]);

  const commit = useCallback((next: TrackDef) => { setDef((cur) => { if (cur) setUndo((u) => [...u.slice(-60), cur]); return next; }); setRedo([]); }, []);
  const doUndo = () => { const prev = undo[undo.length - 1]; if (!prev || !def) return; setRedo((r) => [...r, def]); setUndo((u) => u.slice(0, -1)); setDef(prev); setSel(null); };
  const doRedo = () => { const nx = redo[redo.length - 1]; if (!nx || !def) return; setUndo((u) => [...u, def]); setRedo((r) => r.slice(0, -1)); setDef(nx); setSel(null); };

  const built = useMemo(() => { if (!def || def.points.length < 3) return null; try { const t = buildTrack(def); ensurePaths(t); return t; } catch { return null; } }, [def]);

  const toWorld = (cx: number, cy: number) => ({ x: (cx - view.x) / view.z, y: (cy - view.y) / view.z });
  const hit = (wx: number, wy: number): Sel => {
    if (!def) return null;
    const r = 1.6;
    const pi = def.points.findIndex(([x, y]) => Math.hypot(x - wx, y - wy) < r); if (pi >= 0) return { t: "pt", i: pi };
    for (let ri = 0; ri < (def.routes ?? []).length; ri++) { const j = def.routes![ri]!.via.findIndex(([x, y]) => Math.hypot(x - wx, y - wy) < r); if (j >= 0) return { t: "via", r: ri, j }; }
    const oi = (def.objects ?? []).findIndex((o) => Math.hypot(o.x - wx, o.y - wy) < (o.kind === "surface" ? 2.6 : 1.4)); if (oi >= 0) return { t: "obj", i: oi };
    return null;
  };

  const removeSel = useCallback(() => {
    if (!def || !sel) return;
    if (sel.t === "pt") {
      if (def.points.length <= 4) { toast.error("A pista precisa de pelo menos 4 pontos."); return; }
      const d2 = { ...def, points: def.points.filter((_, i) => i !== sel.i) };
      commit(shiftRoutes(d2, (i) => (i === sel.i ? null : i > sel.i ? i - 1 : i)));
    } else if (sel.t === "obj") commit({ ...def, objects: (def.objects ?? []).filter((_, i) => i !== sel.i) });
    else { const routes = [...(def.routes ?? [])]; const r = routes[sel.r]!; routes[sel.r] = { ...r, via: r.via.filter((_, j) => j !== sel.j) }; commit({ ...def, routes }); }
    setSel(null);
  }, [def, sel, commit]);
  const rotateSel = useCallback((d = Math.PI / 12) => {
    if (!def || sel?.t !== "obj") return;
    const objects = [...(def.objects ?? [])]; const o = objects[sel.i]!; objects[sel.i] = { ...o, a: (o.a ?? 0) + d }; commit({ ...def, objects });
  }, [def, sel, commit]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      if (e.code === "Delete" || e.code === "Backspace") { e.preventDefault(); removeSel(); }
      else if (e.code === "KeyR") rotateSel(e.shiftKey ? -Math.PI / 12 : Math.PI / 12);
      else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); doRedo(); }
      else if (e.code === "Escape") { setRouteDraft(null); setSel(null); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  // ---------- drawing ----------
  useEffect(() => {
    const c = canvasRef.current; if (!c || !def) return;
    const ctx = c.getContext("2d")!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight; c.width = W * dpr; c.height = H * dpr;
    const th = THEMES[def.theme] ?? THEMES["forest"]!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = th.ground; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1 / view.z;
    for (let g = -100; g <= 200; g += 5) { ctx.beginPath(); ctx.moveTo(g, -100); ctx.lineTo(g, 200); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-100, g); ctx.lineTo(200, g); ctx.stroke(); }
    if (built) {
      ctx.save(); ctx.scale(1 / UNIT, 1 / UNIT); ctx.lineJoin = "round"; ctx.lineCap = "round";
      built.shortPaths.forEach((p, i) => { ctx.strokeStyle = built.secret[i] ? "rgba(255,255,255,0.35)" : th.dirt; ctx.setLineDash(built.secret[i] ? [20, 20] : []); ctx.lineWidth = built.width * 0.55; ctx.stroke(p); ctx.setLineDash([]); });
      ctx.strokeStyle = th.edgeA; ctx.lineWidth = built.width + 20; ctx.stroke(built.mainPath!);
      ctx.strokeStyle = th.road; ctx.lineWidth = built.width; ctx.stroke(built.mainPath!);
      const s0 = built.main[0]!; ctx.save(); ctx.translate(s0.x, s0.y); ctx.rotate(s0.ang); for (let r = 0; r < 8; r++) for (let q = 0; q < 2; q++) { ctx.fillStyle = (r + q) % 2 ? "#111" : "#fff"; ctx.fillRect(-14 + q * 14, -built.width / 2 + r * (built.width / 8), 14, built.width / 8); } ctx.restore();
      ctx.restore();
    }
    // objects
    (def.objects ?? []).forEach((o, i) => {
      const s = sel?.t === "obj" && sel.i === i;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a ?? 0);
      const col: Record<string, string> = { item: "#ffcf3f", boost: "#ff8a2e", ramp: "#8a5a2b", platform: "#2a6fdb", oil: "#111", crate: "#b07a3e", barrier: "#e8e8e8", tire: "#222", cone: "#ff7a1a", rock: "#7d7468", hole: "#000", mover: "#ffcf3f", spinner: "#ff4d4d", trap: "#9aa", surface: o.sf === "ice" ? "#bdf" : o.sf === "lava" ? "#f60" : o.sf === "sand" ? "#ec8" : o.sf === "grass" ? "#4a4" : "#643" };
      ctx.fillStyle = col[o.kind] ?? "#fff"; ctx.globalAlpha = o.kind === "surface" ? 0.6 : 1;
      if (o.kind === "surface") { ctx.beginPath(); ctx.ellipse(0, 0, 2.75, 2, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (o.kind === "barrier" || o.kind === "mover") ctx.fillRect(-0.3, -0.8, 0.6, 1.6);
      else if (o.kind === "spinner") { ctx.fillRect(-2, -0.2, 4, 0.4); ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, 7); ctx.fill(); }
      else if (o.kind === "ramp" || o.kind === "boost" || o.kind === "platform") { ctx.fillRect(-0.9, -0.9, 1.8, 1.8); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-0.4, -0.5); ctx.lineTo(0.5, 0); ctx.lineTo(-0.4, 0.5); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(0, 0, 0.7, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (s) { ctx.strokeStyle = "#ffef5a"; ctx.lineWidth = 0.25; ctx.strokeRect(-1.4, -1.4, 2.8, 2.8); }
      ctx.restore();
    });
    // route via points
    (def.routes ?? []).forEach((r, ri) => r.via.forEach(([x, y], j) => { ctx.fillStyle = r.secret ? "#d36bff" : "#ffa94d"; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, 7); ctx.fill(); if (sel?.t === "via" && sel.r === ri && sel.j === j) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.25; ctx.stroke(); } }));
    if (routeDraft) { const a = def.points[routeDraft.a]!; ctx.strokeStyle = "#d36bff"; ctx.lineWidth = 0.4; ctx.setLineDash([1, 1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); for (const [x, y] of routeDraft.via) ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); }
    // control points
    def.points.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? "#5be37b" : sel?.t === "pt" && sel.i === i ? "#ffef5a" : routeDraft?.a === i ? "#d36bff" : "#ffffff";
      ctx.strokeStyle = "#111"; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.font = "bold 1.2px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(i === 0 ? "🏁" : String(i), x, y + 0.05);
    });
  }, [def, built, view, sel, routeDraft]);

  if (!def) return <div className="grid min-h-screen place-items-center font-display text-accent">Carregando editor…</div>;

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top; const w = toWorld(cx, cy);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) { drag.current = { mode: "pan", sx: cx, sy: cy, vx: view.x, vy: view.y, moved: false }; return; }
    const h = hit(w.x, w.y);
    if (tool === "route") {
      if (h?.t === "pt") {
        if (!routeDraft) { setRouteDraft({ a: h.i, via: [] }); return; }
        let a = routeDraft.a, b = h.i, via = routeDraft.via;
        if (a === b) { setRouteDraft(null); return; }
        if (a > b) { [a, b] = [b, a]; via = [...via].reverse(); }
        if (b === 0 || a === 0 && b === def.points.length - 1) { toast.error("O caminho não pode cruzar a linha de chegada."); setRouteDraft(null); return; }
        commit({ ...def, routes: [...(def.routes ?? []), { a, b, via, secret }] }); setRouteDraft(null);
        toast.success(secret ? "Atalho secreto criado!" : "Caminho alternativo criado!");
      } else if (routeDraft) setRouteDraft({ ...routeDraft, via: [...routeDraft.via, [w.x, w.y]] });
      else toast.message("Clique primeiro em um ponto da pista para começar o caminho.");
      return;
    }
    if (h && (tool === "select" || tool === "draw" || tool === "object")) {
      setSel(h); setUndo((u) => [...u.slice(-60), def]); setRedo([]);
      drag.current = { mode: "move", sx: cx, sy: cy, vx: 0, vy: 0, moved: false }; return;
    }
    if (tool === "draw") {
      // insert into the closest segment when clicking near the road, else append
      let best = -1, bd = Infinity;
      def.points.forEach((p, i) => { const q = def.points[(i + 1) % def.points.length]!; const sx = q[0] - p[0], sy = q[1] - p[1]; const L = sx * sx + sy * sy; const t = Math.max(0, Math.min(1, ((w.x - p[0]) * sx + (w.y - p[1]) * sy) / L)); const d = Math.hypot(p[0] + sx * t - w.x, p[1] + sy * t - w.y); if (d < bd) { bd = d; best = i; } });
      const at = bd < 8 ? best + 1 : def.points.length;
      const pts = [...def.points]; pts.splice(at, 0, [Math.round(w.x * 2) / 2, Math.round(w.y * 2) / 2]);
      commit(shiftRoutes({ ...def, points: pts }, (i) => (i >= at ? i + 1 : i))); setSel({ t: "pt", i: at });
    } else if (tool === "object") {
      let a = 0; if (built) a = nearest(built, w.x * UNIT, w.y * UNIT).s.ang;
      const o: TrackObject = { kind, x: Math.round(w.x * 4) / 4, y: Math.round(w.y * 4) / 4, a, ...(kind === "surface" ? { sf } : {}) };
      commit({ ...def, objects: [...(def.objects ?? []), o] }); setSel({ t: "obj", i: (def.objects ?? []).length });
    } else { setSel(null); drag.current = { mode: "pan", sx: cx, sy: cy, vx: view.x, vy: view.y, moved: false }; }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d) return;
    const r = e.currentTarget.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
    if (d.mode === "pan") { setView((v) => ({ ...v, x: d.vx + cx - d.sx, y: d.vy + cy - d.sy })); return; }
    const w = toWorld(cx, cy); const x = Math.round(w.x * 4) / 4, y = Math.round(w.y * 4) / 4;
    setDef((cur) => {
      if (!cur || !sel) return cur;
      if (sel.t === "pt") { const pts = [...cur.points]; pts[sel.i] = [x, y]; return { ...cur, points: pts }; }
      if (sel.t === "obj") { const ob = [...(cur.objects ?? [])]; ob[sel.i] = { ...ob[sel.i]!, x, y }; return { ...cur, objects: ob }; }
      const routes = [...(cur.routes ?? [])]; const rt = routes[sel.r]!; const via = [...rt.via]; via[sel.j] = [x, y]; routes[sel.r] = { ...rt, via }; return { ...cur, routes };
    });
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
    zoomAt(cx, cy, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };
  const zoomAt = (cx: number, cy: number, f: number) => setView((v) => { const z = Math.max(2, Math.min(30, v.z * f)); const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z; return { z, x: cx - wx * z, y: cy - wy * z }; });

  const valid = def.points.length >= 4 && def.name.trim().length > 0;
  const save = () => { if (!valid) { toast.error("Dê um nome e use pelo menos 4 pontos."); return false; } upsertCustomTrack({ ...def, createdAt: def.createdAt ?? Date.now() }); setSaved(loadCustomTracks()); toast.success("Pista salva!"); return true; };
  const test = () => { if (!save()) return; sessionStorage.setItem(PENDING_KEY, JSON.stringify({ track: { ...def, custom: true }, test: true })); void navigate({ to: "/" }); };
  const publish = async () => {
    if (!save()) return;
    setPublishing(true);
    const { error } = await supabase.from("community_tracks").insert({ name: def.name.slice(0, 40), creator: (def.creator || "Anônimo").slice(0, 24), theme: def.theme, data: JSON.parse(JSON.stringify({ ...def, custom: true })) });
    setPublishing(false);
    if (error) toast.error("Não foi possível publicar agora. Tente de novo."); else toast.success("Pista publicada na galeria!");
  };
  const setStart = () => {
    if (sel?.t !== "pt" || sel.i === 0) return; const n = def.points.length, s0 = sel.i;
    const pts = def.points.map((_, i) => def.points[(i + s0) % n]!);
    commit(shiftRoutes({ ...def, points: pts }, (i) => (i - s0 + n) % n)); setSel({ t: "pt", i: 0 });
  };
  const tools: [Tool, string, string][] = [["draw", "✏️ Traçado", "Clique para criar pontos (perto da pista insere na curva). Arraste para mover."], ["select", "🖐️ Selecionar/mover", "Clique para selecionar, arraste para mover. Arraste o fundo para mover a câmera."], ["object", "📦 Objetos", "Escolha um objeto e clique na pista para colocar."], ["route", "🔀 Caminhos/atalhos", "Clique em um ponto, depois no fundo para curvar, e termine em outro ponto à frente."]];
  const selObj = sel?.t === "obj" ? def.objects?.[sel.i] : undefined;

  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex flex-wrap items-center gap-2 border-b-4 border-border bg-card px-3 py-2">
        <Link to="/" className="toon-btn bg-muted px-3 py-1 text-sm">← Menu</Link>
        <h1 className="font-display text-xs text-accent">Criar pista</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn tone="muted" disabled={!undo.length} onClick={doUndo} aria-label="Desfazer">↶ Desfazer</Btn>
          <Btn tone="muted" disabled={!redo.length} onClick={doRedo} aria-label="Refazer">↷ Refazer</Btn>
          <Btn tone="secondary" onClick={() => { commit(newTrack(def.creator ?? "Piloto")); setSel(null); }}>Nova</Btn>
          <Btn onClick={save}>💾 Salvar</Btn>
          <Btn tone="accent" onClick={test}>▶ Testar pista</Btn>
          <Btn tone="p2" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publicando…" : "🌍 Publicar na galeria"}</Btn>
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-[17rem_minmax(0,1fr)_16rem]">
        <aside className="space-y-3 overflow-y-auto border-r-4 border-border bg-card p-3 text-sm">
          <div className="grid gap-1">{tools.map(([t, l]) => <Btn key={t} tone={tool === t ? "accent" : "muted"} onClick={() => { setTool(t); setRouteDraft(null); }} className="text-left">{l}</Btn>)}</div>
          <p className="text-xs text-muted-foreground">{tools.find((t) => t[0] === tool)?.[2]}</p>
          {tool === "route" && <label className="flex items-center gap-2"><input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> Atalho secreto (escondido)</label>}
          {tool === "object" && (<>
            <div className="grid grid-cols-2 gap-1">{KINDS.map((k) => <button key={k} type="button" title={OBJECT_INFO[k].desc} onClick={() => setKind(k)} className={cn("rounded-md border-2 border-border px-1 py-1 text-xs", kind === k ? "bg-accent text-accent-foreground" : "bg-muted")}>{OBJECT_INFO[k].name}</button>)}</div>
            <p className="text-xs text-muted-foreground">{OBJECT_INFO[kind].desc}</p>
            {kind === "surface" && <div className="flex flex-wrap gap-1">{SURFACES.map(([s, l]) => <button key={s} type="button" onClick={() => setSf(s)} className={cn("rounded-md border-2 border-border px-2 text-xs", sf === s ? "bg-accent text-accent-foreground" : "bg-muted")}>{l}</button>)}</div>}
          </>)}
          {sel && (
            <div className="toon-panel space-y-2 p-2">
              <div className="font-semibold">{sel.t === "pt" ? (sel.i === 0 ? "Largada/chegada" : `Ponto ${sel.i}`) : sel.t === "obj" ? OBJECT_INFO[selObj?.kind ?? "item"].name : "Curva do caminho"}</div>
              <div className="flex flex-wrap gap-1">
                {sel.t === "obj" && <><Btn tone="muted" onClick={() => rotateSel(-Math.PI / 12)}>⟲</Btn><Btn tone="muted" onClick={() => rotateSel()}>⟳ Girar (R)</Btn></>}
                {sel.t === "pt" && sel.i !== 0 && <Btn tone="muted" onClick={setStart}>🏁 Definir largada aqui</Btn>}
                <Btn tone="destructive" onClick={removeSel}>Excluir (Del)</Btn>
              </div>
            </div>
          )}
          <div className="flex gap-1"><Btn tone="muted" onClick={() => zoomAt(400, 300, 1.25)}>＋ Zoom</Btn><Btn tone="muted" onClick={() => zoomAt(400, 300, 0.8)}>－</Btn><Btn tone="muted" onClick={() => setView({ x: -40, y: -20, z: 7 })}>Centralizar</Btn></div>
          <p className="text-xs text-muted-foreground">Botão direito ou arrastar o fundo move a câmera · roda do mouse dá zoom · Ctrl+Z / Ctrl+Y.</p>
        </aside>
        <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label="Área de construção da pista" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
        <aside className="space-y-3 overflow-y-auto border-l-4 border-border bg-card p-3 text-sm">
          <label className="block">Nome<input value={def.name} maxLength={40} onChange={(e) => setDef({ ...def, name: e.target.value })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1" /></label>
          <label className="block">Criador<input value={def.creator ?? ""} maxLength={24} onChange={(e) => setDef({ ...def, creator: e.target.value })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1" /></label>
          <label className="block">Cenário<select value={def.theme} onChange={(e) => commit({ ...def, theme: e.target.value })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1">{Object.values(THEMES).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="block">Voltas: {def.laps ?? 3}<input type="range" min={1} max={9} value={def.laps ?? 3} onChange={(e) => setDef({ ...def, laps: Number(e.target.value) })} className="w-full" /></label>
          <label className="block">Largura da pista: {def.width.toFixed(1)}<input type="range" min={2.6} max={6.5} step={0.1} value={def.width} onChange={(e) => setDef({ ...def, width: Number(e.target.value) })} className="w-full" /></label>
          <label className="block">Dificuldade<select value={def.difficulty} onChange={(e) => setDef({ ...def, difficulty: Number(e.target.value) as 1 | 2 | 3 })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1"><option value={1}>Fácil</option><option value={2}>Média</option><option value={3}>Difícil</option></select></label>
          <div className="text-xs text-muted-foreground">{def.points.length} pontos · {(def.objects ?? []).length} objetos · {(def.routes ?? []).length} caminhos extras</div>
          <div>
            <div className="mb-1 font-semibold">Minhas pistas salvas</div>
            {saved.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>}
            <div className="grid gap-2">
              {saved.map((t) => (
                <div key={t.id} className="rounded-lg bg-muted p-1">
                  <TrackPreview def={t} />
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 pt-1"><span className="truncate text-xs">{t.name}</span>
                    <button type="button" className="toon-btn bg-secondary px-2 text-xs text-secondary-foreground" onClick={() => { setUndo([]); setRedo([]); setDef(t); setSel(null); }}>Editar</button>
                    <button type="button" aria-label={`Excluir ${t.name}`} className="toon-btn bg-destructive px-2 text-xs" onClick={() => { const n = saved.filter((x) => x.id !== t.id); saveCustomTracks(n); setSaved(n); }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
