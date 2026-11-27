import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CHARACTERS, TRACKS, type TrackDef } from "../data";
import { LAST_ROOM_KEY, Room, makeCode, normalizeCode, watchLobby, type LobbyRoom, type RoomPlayer, type RoomSettings } from "../net";
import { customOf, levelFor, loadCustomTracks, playerId, upgradesOf, type Profile } from "../store";
import { Btn, KartPreview, Screen, TrackPreview } from "./common";
import { PlayerSetup } from "./PlayerSetup";
import { cn } from "@/lib/utils";

export function meFromProfile(p: Profile): Omit<RoomPlayer, "joinedAt" | "host"> {
  return { pid: playerId(), name: p.name || "Piloto", charId: p.character, custom: customOf(p, p.character), upgrades: upgradesOf(p, p.character), ability: p.ability };
}
const defaultSettings = (): RoomSettings => ({ track: TRACKS[0]!, mode: "single", laps: 3, bots: 2, items: true, difficulty: 2 });

export function OnlineMenu({ tab: initialTab, initialCode, profile, onProfile, onEnter, onBack }: {
  tab: "create" | "browse" | "code"; initialCode?: string; profile: Profile; onProfile: (p: Profile) => void; onEnter: (r: Room) => void; onBack: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { setLast(localStorage.getItem(LAST_ROOM_KEY)); }, []);
  useEffect(() => (tab === "browse" ? watchLobby(setRooms) : undefined), [tab]);

  const join = async (c: string) => {
    const cc = normalizeCode(c); if (cc.length !== 5) { toast.error("O código tem 5 letras/números."); return; }
    setBusy(true);
    const room = new Room(cc, meFromProfile(profile), false);
    const r = await room.connect();
    setBusy(false);
    if (r === "notfound") { await room.leave(); toast.error(`Sala ${cc} não encontrada ou vazia.`); return; }
    localStorage.setItem(LAST_ROOM_KEY, cc);
    onEnter(room);
  };
  const create = async () => {
    setBusy(true);
    const room = new Room(makeCode(), meFromProfile(profile), true);
    room.me.settings = defaultSettings();
    await room.connect();
    room.advertise();
    setBusy(false);
    localStorage.setItem(LAST_ROOM_KEY, room.code);
    onEnter(room);
  };
  const tabs: [typeof tab, string][] = [["create", "Criar sala"], ["browse", "Salas abertas"], ["code", "Código de convite"]];
  return (
    <Screen title="Multiplayer online" onBack={onBack}>
      <div className="mb-4 flex flex-wrap justify-center gap-2" role="tablist">
        {tabs.map(([t, l]) => <Btn key={t} role="tab" aria-selected={tab === t} tone={tab === t ? "accent" : "muted"} onClick={() => setTab(t)}>{l}</Btn>)}
      </div>
      <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PlayerSetup slot={0} profile={profile} onChange={onProfile} compact />
        <div className="toon-panel space-y-3 p-4">
          {tab === "create" && (<>
            <p className="text-sm">Crie uma sala, compartilhe o código e escolha a pista. Cada amigo entra pelo próprio computador.</p>
            <Btn className="w-full" disabled={busy} onClick={create}>{busy ? "Criando…" : "Criar sala online"}</Btn>
          </>)}
          {tab === "code" && (<>
            <label className="block text-sm font-semibold" htmlFor="room-code">Código da sala</label>
            <input id="room-code" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="EX: K7P2Q" className="w-full rounded-md border-2 border-border bg-input px-3 py-2 text-center font-display text-lg tracking-widest" />
            <Btn className="w-full" disabled={busy} onClick={() => join(code)}>{busy ? "Procurando sala…" : "Entrar na sala"}</Btn>
          </>)}
          {tab === "browse" && (<>
            {rooms.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sala aberta agora. Crie uma!</p>}
            {rooms.map((r) => (
              <div key={r.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted p-2">
                <div className="min-w-0"><div className="truncate font-semibold">{r.hostName} · <span className="font-display text-xs">{r.code}</span></div><div className="truncate text-xs text-muted-foreground">{r.trackName} · {r.players} jogador(es) · {r.status === "racing" ? "correndo" : "no lobby"}</div></div>
                <Btn disabled={busy} onClick={() => join(r.code)}>Entrar</Btn>
              </div>
            ))}
          </>)}
          {last && <Btn tone="secondary" className="w-full" disabled={busy} onClick={() => join(last)}>Reconectar à sala {last}</Btn>}
        </div>
      </div>
    </Screen>
  );
}

export function Lobby({ room, profile, onProfile, onLeave }: { room: Room; profile: Profile; onProfile: (p: Profile) => void; onLeave: () => void }) {
  const [players, setPlayers] = useState<RoomPlayer[]>(room.players);
  const [, force] = useState(0);
  const [customTracks, setCustomTracks] = useState<TrackDef[]>([]);
  useEffect(() => { setCustomTracks(loadCustomTracks()); }, []);
  useEffect(() => room.on((e) => { if (e.type === "players") setPlayers([...e.players]); if (e.type === "status") force((x) => x + 1); }), [room]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => void room.update(meFromProfile(profile)), 250);
    return () => clearTimeout(t);
  }, [profile, room]);
  const s = room.settings() ?? defaultSettings();
  const host = room.isHost;
  const set = (patch: Partial<RoomSettings>) => { void room.setSettings({ ...s, ...patch }); force((x) => x + 1); };
  const link = typeof window !== "undefined" ? `${window.location.origin}/?sala=${room.code}` : "";
  const lvl = levelFor(profile.xp);
  const tracks = [...TRACKS.filter((t) => t.unlockLevel <= lvl), ...customTracks];
  return (
    <Screen title={`Sala ${room.code}`} onBack={onLeave} right={<Btn tone="muted" onClick={() => { void navigator.clipboard.writeText(room.code); toast.success("Código copiado!"); }}>Copiar código</Btn>}>
      <div className="toon-panel mb-4 grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Código de convite</div>
          <div className="font-display text-2xl tracking-widest text-accent" data-testid="room-code">{room.code}</div>
          <div className="truncate text-xs text-muted-foreground">{link}</div>
        </div>
        <Btn tone="secondary" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link de convite copiado!"); }}>Copiar link de convite</Btn>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="toon-panel p-4" aria-label="Jogadores na sala">
            <h2 className="mb-2 font-display text-xs">Jogadores ({players.length})</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {players.map((p) => {
                const ch = CHARACTERS.find((c) => c.id === p.charId);
                return (
                  <div key={p.pid} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted p-2", p.pid === room.me.pid && "ring-3 ring-ring")}>
                    <KartPreview charId={p.charId} custom={p.custom} size={56} />
                    <div className="min-w-0"><div className="truncate font-semibold">{p.name}{p.pid === room.me.pid ? " (você)" : ""}</div><div className="truncate text-xs text-muted-foreground">{ch?.name} · {ch?.vehicleName}</div>{p.pid === room.hostPid() && <div className="text-xs text-accent">👑 Anfitrião</div>}</div>
                  </div>
                );
              })}
            </div>
          </section>
          <PlayerSetup slot={0} profile={profile} onChange={onProfile} compact />
        </div>
        <section className="toon-panel space-y-3 p-4" aria-label="Configurações da partida">
          <h2 className="font-display text-xs">Partida {host ? "" : "(definida pelo anfitrião)"}</h2>
          <TrackPreview def={s.track} />
          <div className="font-semibold">{s.track.name}</div>
          {host ? (<>
            <select aria-label="Pista" value={s.track.id} onChange={(e) => { const t = tracks.find((x) => x.id === e.target.value); if (t) set({ track: t, laps: t.laps ?? s.laps }); }} className="w-full rounded-md border-2 border-border bg-input px-2 py-1">
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.custom ? "★ " : ""}{t.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>Modo<select value={s.mode} onChange={(e) => set({ mode: e.target.value as RoomSettings["mode"] })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1"><option value="single">Corrida</option><option value="survival">Sobrevivência</option><option value="time">Contra o tempo</option></select></label>
              <label>Voltas<input type="number" min={1} max={9} value={s.laps} onChange={(e) => set({ laps: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1" /></label>
              <label>Bots<input type="number" min={0} max={6} value={s.bots} onChange={(e) => set({ bots: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1" /></label>
              <label>Dificuldade<select value={s.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) as 1 | 2 | 3 })} className="w-full rounded-md border-2 border-border bg-input px-2 py-1"><option value={1}>Fácil</option><option value={2}>Normal</option><option value={3}>Difícil</option></select></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.items} onChange={(e) => set({ items: e.target.checked })} /> Itens ligados</label>
            <Btn className="w-full py-3 text-base" onClick={() => void room.start(players)}>Iniciar corrida ▶</Btn>
          </>) : (
            <div className="space-y-1 text-sm">
              <div>Modo: {{ single: "Corrida", survival: "Sobrevivência", time: "Contra o tempo" }[s.mode]} · {s.laps} voltas · {s.bots} bots · itens {s.items ? "ligados" : "desligados"}</div>
              <p className="animate-pulse text-accent">Aguardando o anfitrião iniciar a corrida…</p>
            </div>
          )}
        </section>
      </div>
    </Screen>
  );
}
