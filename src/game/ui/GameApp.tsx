import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CHARACTERS, TRACKS, type TrackDef } from "../data";
import type { NetState, PlayerSpec, RaceConfig, RaceResult } from "../engine";
import { fmt } from "../engine";
import { CHALLENGES, CUPS, MODES, challengeMet, newSeries, recordRace, rulesFor, trackById, type ChallengeDef, type Series } from "../modes";
import { Room, type RoomStart } from "../net";
import { customOf, defaultCustom, defaultUpgrades, levelFor, loadCustomTracks, loadProfile, loadSettings, saveProfile, saveSettings, upgradesOf, type Profile, type Settings } from "../store";
import { Btn, Screen, Stars, TrackPreview } from "./common";
import { ControlsScreen } from "./Controls";
import { Lobby, OnlineMenu } from "./Online";
import { PlayerSetup } from "./PlayerSetup";
import { RaceView } from "./RaceView";
import { cn } from "@/lib/utils";

type ModeId = (typeof MODES)[number]["id"];
type S =
  | { id: "menu" } | { id: "controls" } | { id: "options" }
  | { id: "setup"; players: 1 | 2 }
  | { id: "mode"; players: 1 | 2 }
  | { id: "track"; players: 1 | 2; mode: ModeId }
  | { id: "online"; tab: "create" | "browse" | "code"; code?: string }
  | { id: "lobby" };
interface RaceState { key: number; cfg: RaceConfig; series: Series | null; challenge: ChallengeDef | null; players: 1 | 2; test?: TrackDef; resync?: { states: NetState[] } | null }
interface ResultState { result: RaceResult; race: RaceState; winner: number | null; rewards: { slot: number; xp: number; coins: number }[]; challengeOk: boolean | null }

export const PENDING_KEY = "tt.pending";

function botSpecs(n: number, startSlot: number, taken: string[], difficulty: number, cpu: boolean, seed = 0): PlayerSpec[] {
  const pool = CHARACTERS.filter((c) => !taken.includes(c.id));
  const list = pool.length ? pool : CHARACTERS;
  return Array.from({ length: n }, (_, i) => {
    const ch = list[(i + seed) % list.length]!;
    const u = defaultUpgrades(); const lv = difficulty - 1; u.speed = lv; u.accel = lv; u.handling = lv;
    return { slot: startSlot + i, name: ch.name, charId: ch.id, custom: defaultCustom(ch.id), upgrades: u, ability: ch.ability, control: cpu ? "cpu" : "remote", cpuLabel: true };
  });
}

export function GameApp() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<S>({ id: "menu" });
  const [race, setRace] = useState<RaceState | null>(null);
  const [results, setResults] = useState<ResultState | null>(null);
  const [profiles, setProfiles] = useState<[Profile, Profile] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customTracks, setCustomTracks] = useState<TrackDef[]>([]);
  const [pending, setPending] = useState<TrackDef | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    setProfiles([loadProfile(0), loadProfile(1)]); setSettings(loadSettings()); setCustomTracks(loadCustomTracks());
    const sala = new URLSearchParams(window.location.search).get("sala");
    if (sala) setScreen({ id: "online", tab: "code", code: sala });
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (raw) {
      sessionStorage.removeItem(PENDING_KEY);
      try {
        const p = JSON.parse(raw) as { track: TrackDef; test?: boolean };
        if (p.test) startLocal(p.track, "single", 1, { laps: p.track.laps ?? 3, bots: 3, items: true, difficulty: 2 }, null, null, p.track, [loadProfile(0), loadProfile(1)], loadSettings());
        else { setPending(p.track); setScreen({ id: "setup", players: 1 }); }
      } catch { /* ignore broken handoff */ }
    }
    return () => { void roomRef.current?.leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profiles || !settings) return <div className="grid min-h-screen place-items-center font-display text-accent">Carregando…</div>;

  const setProfile = (i: number, p: Profile) => { saveProfile(i, p); setProfiles((ps) => { const n: [Profile, Profile] = [...ps!] as [Profile, Profile]; n[i] = p; return n; }); };

  function startLocal(track: TrackDef, mode: ModeId, players: 1 | 2, o: { laps: number; bots: number; items: boolean; difficulty: 1 | 2 | 3 }, series: Series | null, challenge: ChallengeDef | null, test?: TrackDef, ps = profiles!, st = settings!) {
    const humans: PlayerSpec[] = Array.from({ length: players }, (_, i) => {
      const p = ps[i]!;
      return { slot: i, name: p.name || `Jogador ${i + 1}`, charId: p.character, custom: customOf(p, p.character), upgrades: upgradesOf(p, p.character), ability: p.ability, control: "local", keys: st.keys[i]! };
    });
    const bots = mode === "time" ? [] : botSpecs(o.bots, players, humans.map((h) => h.charId), o.difficulty, true, Math.floor(Math.random() * 8));
    let rules = rulesFor(mode, { laps: o.laps, items: o.items });
    if (challenge) rules = { ...rules, ...challenge.rules };
    const cfg: RaceConfig = { track, players: [...humans, ...bots], rules, mode: challenge && challenge.rules.lives === 1 ? "survival" : mode, difficulty: o.difficulty, online: false };
    setResults(null);
    setRace({ key: Date.now(), cfg, series, challenge, players, ...(test ? { test } : {}) });
  }

  function startOnline(start: RoomStart, elapsed = 0, resync: { states: NetState[] } | null = null) {
    const room = roomRef.current!; const me = room.me.pid;
    const s = start.settings;
    const humans: PlayerSpec[] = start.order.map((p, slot) => ({ slot, name: p.name, charId: p.charId, custom: p.custom, upgrades: p.upgrades, ability: p.ability, control: p.pid === me ? "local" : "remote", pid: p.pid, ...(p.pid === me ? { keys: settings!.keys[0] } : {}) }));
    if (!humans.some((h) => h.control === "local")) { toast.message("A corrida começou sem você. Aguarde a próxima no lobby."); return; }
    const bots = s.mode === "time" ? [] : botSpecs(s.bots, humans.length, humans.map((h) => h.charId), s.difficulty, room.isHost, start.raceId.charCodeAt(0));
    const cfg: RaceConfig = { track: s.track, players: [...humans, ...bots], rules: rulesFor(s.mode, { laps: s.laps, items: s.items }), mode: s.mode, difficulty: s.difficulty, online: true, ...(elapsed > 0 ? { elapsed } : {}) };
    setResults(null);
    setRace({ key: Date.now(), cfg, series: null, challenge: null, players: 1, resync });
  }

  const enterRoom = (room: Room) => {
    roomRef.current = room;
    room.on((e) => {
      if (e.type === "start") startOnline(e.start);
      else if (e.type === "resync") startOnline(e.start, e.elapsed, { states: e.states });
      else if (e.type === "lobby") { setRace(null); setResults(null); setScreen({ id: "lobby" }); }
    });
    setScreen({ id: "lobby" });
    if (room.status === "racing") room.requestSync();
  };
  const leaveRoom = async () => { const r = roomRef.current; roomRef.current = null; setRace(null); setResults(null); if (r) await r.leave(); setScreen({ id: "menu" }); };

  const onFinish = (rs: RaceState, result: RaceResult) => {
    const winner = rs.series ? recordRace(rs.series, result) : null;
    const humans = rs.cfg.players.filter((p) => p.control === "local");
    const rewards = humans.map((h) => {
      const k = result.karts.find((x) => x.slot === h.slot)!;
      const n = result.karts.length;
      const xp = 30 + Math.max(0, n - k.place) * 15 + (k.finished ? 20 : 0);
      const coins = k.eliminated ? 5 : k.place === 1 ? 60 : k.place === 2 ? 40 : k.place === 3 ? 25 : 10;
      const pi = rs.cfg.online ? 0 : h.slot;
      const p = profiles[pi]!;
      const best = { ...p.stats.bestLaps };
      if (k.bestLap > 0 && (!best[result.trackId] || k.bestLap < best[result.trackId]!)) best[result.trackId] = k.bestLap;
      setProfile(pi, { ...p, xp: p.xp + xp, coins: p.coins + coins, stats: { races: p.stats.races + 1, wins: p.stats.wins + (k.place === 1 ? 1 : 0), bestLaps: best } });
      return { slot: h.slot, xp, coins };
    });
    const challengeOk = rs.challenge ? challengeMet(rs.challenge, result, 0) : null;
    setResults({ result, race: rs, winner, rewards, challengeOk });
  };

  // ---------------- race & results ----------------
  if (race && !results) {
    const rs = race;
    return <RaceView key={rs.key} cfg={rs.cfg} room={rs.cfg.online ? roomRef.current : null} resync={rs.resync ?? null}
      onFinish={(r) => onFinish(rs, r)}
      onRestart={() => { if (rs.series) rs.series.race = Math.max(0, rs.series.race); setRace({ ...rs, key: Date.now() }); }}
      onExit={() => { setRace(null); if (rs.test) { void navigate({ to: "/editor", search: { id: rs.test.id } }); return; } if (rs.cfg.online) { void leaveRoom(); return; } setScreen({ id: "menu" }); }} />;
  }
  if (results) {
    const { result, race: rs, winner, rewards, challengeOk } = results;
    const series = rs.series;
    const seriesDone = !series || winner !== null;
    const nameOf = (slot: number) => rs.cfg.players.find((p) => p.slot === slot)?.name ?? "?";
    const next = () => {
      if (!series) return;
      const tr = series.tracks[series.race % series.tracks.length]!;
      startLocal(tr, series.mode as ModeId, rs.players, { laps: rs.cfg.rules.laps, bots: rs.cfg.players.filter((p) => p.control === "cpu").length, items: rs.cfg.rules.items, difficulty: rs.cfg.difficulty }, series, null);
    };
    return (
      <Screen title="Resultado">
        <div className="mx-auto max-w-3xl space-y-4">
          {challengeOk !== null && <div className={cn("toon-panel p-4 text-center font-display text-sm", challengeOk ? "bg-success text-primary-foreground" : "bg-destructive")}>{challengeOk ? "DESAFIO CONCLUÍDO!" : "Desafio não concluído — tente de novo!"}</div>}
          {series && winner !== null && <div className="toon-panel bg-accent p-4 text-center font-display text-sm text-accent-foreground">🏆 {nameOf(winner)} venceu {series.mode === "champ" ? "o campeonato" : "a série"}!</div>}
          <table className="toon-panel w-full overflow-hidden text-sm">
            <thead className="bg-muted text-left"><tr><th className="p-2">#</th><th className="p-2">Piloto</th><th className="p-2">Tempo</th><th className="p-2">Melhor volta</th>{series && <th className="p-2">{series.target ? "Vitórias" : "Pontos"}</th>}</tr></thead>
            <tbody>
              {result.karts.map((k) => (
                <tr key={k.slot} className={cn("border-t-2 border-border", rs.cfg.players.find((p) => p.slot === k.slot)?.control === "local" && "bg-primary/20")}>
                  <td className="p-2 font-display">{k.eliminated ? "✖" : `${k.place}º`}</td><td className="p-2 font-semibold">{k.name}</td>
                  <td className="p-2">{k.finished ? fmt(k.time) : k.eliminated ? "Eliminado" : "Não terminou"}</td><td className="p-2">{k.bestLap ? fmt(k.bestLap) : "—"}</td>
                  {series && <td className="p-2">{series.target ? series.wins[k.slot] ?? 0 : series.points[k.slot] ?? 0}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-2 sm:grid-cols-2">{rewards.map((r) => <div key={r.slot} className="toon-panel p-3 text-sm">{nameOf(r.slot)}: +{r.xp} XP · +🪙{r.coins}</div>)}</div>
          <div className="flex flex-wrap justify-center gap-2">
            {rs.cfg.online ? (<>
              {roomRef.current?.isHost && <Btn onClick={() => void roomRef.current?.backToLobby()}>Voltar à sala (todos)</Btn>}
              <Btn tone="secondary" onClick={() => { setRace(null); setResults(null); setScreen({ id: "lobby" }); }}>Ir para o lobby</Btn>
              <Btn tone="destructive" onClick={() => void leaveRoom()}>Sair da sala</Btn>
            </>) : (<>
              {series && !seriesDone && <Btn onClick={next}>Próxima corrida ({series.race + 1}/{series.mode === "champ" ? series.tracks.length : "?"}) ▶</Btn>}
              {(!series || seriesDone) && <Btn onClick={() => { if (series) { const s2 = newSeries(series.mode, series.tracks); startLocal(s2.tracks[0]!, series.mode as ModeId, rs.players, { laps: rs.cfg.rules.laps, bots: rs.cfg.players.filter((p) => p.control === "cpu").length, items: rs.cfg.rules.items, difficulty: rs.cfg.difficulty }, s2, null); } else { setResults(null); setRace({ ...rs, key: Date.now() }); } }}>Revanche</Btn>}
              {rs.test && <Btn tone="secondary" onClick={() => void navigate({ to: "/editor", search: { id: rs.test!.id } })}>Voltar ao editor</Btn>}
              <Btn tone="muted" onClick={() => { setRace(null); setResults(null); setScreen({ id: "menu" }); }}>Menu</Btn>
            </>)}
          </div>
        </div>
      </Screen>
    );
  }

  // ---------------- menu screens ----------------
  switch (screen.id) {
    case "menu": return <MainMenu go={setScreen} />;
    case "controls": return <ControlsScreen onBack={() => { setSettings(loadSettings()); setScreen({ id: "menu" }); }} />;
    case "options": return <Options settings={settings} onChange={(s) => { saveSettings(s); setSettings(s); }} onBack={() => setScreen({ id: "menu" })} />;
    case "setup": return (
      <Screen title={screen.players === 2 ? "2 jogadores — escolham pilotos" : "Escolha seu piloto"} onBack={() => setScreen({ id: "menu" })} right={<Btn onClick={() => setScreen({ id: "mode", players: screen.players })}>Continuar ▶</Btn>}>
        {screen.players === 2 && <p className="mb-3 text-center text-sm text-muted-foreground">Cada jogador escolhe com o mouse o próprio piloto, veículo, cores e acessórios. Amarelo = Jogador 1 · Azul = Jogador 2.</p>}
        <div className={cn("grid gap-4", screen.players === 2 && "lg:grid-cols-2")}>
          {Array.from({ length: screen.players }, (_, i) => <PlayerSetup key={i} slot={i} profile={profiles[i]!} onChange={(p) => setProfile(i, p)} />)}
        </div>
        <div className="mt-4 flex justify-center"><Btn className="px-8 py-3 text-base" onClick={() => setScreen({ id: "mode", players: screen.players })}>Continuar ▶</Btn></div>
      </Screen>
    );
    case "mode": return (
      <Screen title="Modo de jogo" onBack={() => setScreen({ id: "setup", players: screen.players })}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setScreen({ id: "track", players: screen.players, mode: m.id })} className="toon-btn bg-card p-4 text-left">
              <div className="font-display text-xs text-accent">{m.name}</div><p className="mt-2 text-sm font-normal text-muted-foreground">{m.desc}</p>
            </button>
          ))}
        </div>
      </Screen>
    );
    case "track": return <TrackSelect players={screen.players} mode={screen.mode} profile={profiles[0]!} customTracks={customTracks} pending={pending} onBack={() => setScreen({ id: "mode", players: screen.players })}
      onStart={(track, o, series, ch) => { setPending(null); startLocal(track, screen.mode, screen.players, o, series, ch); }} />;
    case "online": return <OnlineMenu tab={screen.tab} {...(screen.code ? { initialCode: screen.code } : {})} profile={profiles[0]!} onProfile={(p) => setProfile(0, p)} onEnter={(r) => { enterRoom(r); bump((x) => x + 1); }} onBack={() => setScreen({ id: "menu" })} />;
    case "lobby": return roomRef.current ? <Lobby room={roomRef.current} profile={profiles[0]!} onProfile={(p) => setProfile(0, p)} onLeave={() => void leaveRoom()} /> : <MainMenu go={setScreen} />;
  }
}

function MainMenu({ go }: { go: (s: S) => void }) {
  const item = "toon-btn w-full px-4 py-3 text-left text-base";
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-10">
      <h1 className="title-toon mb-2 text-center text-4xl sm:text-6xl">TURBO<br />TOON</h1>
      <p className="mb-8 text-center text-muted-foreground">Corrida arcade cartunesca · local, online e pistas criadas por você</p>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <button type="button" className={cn(item, "bg-primary text-primary-foreground")} onClick={() => go({ id: "setup", players: 1 })}>🏁 Jogar sozinho contra bots</button>
        <button type="button" className={cn(item, "bg-p1 text-primary-foreground")} onClick={() => go({ id: "setup", players: 2 })}>🎮 2 jogadores no mesmo PC</button>
        <button type="button" className={cn(item, "bg-secondary text-secondary-foreground")} onClick={() => go({ id: "online", tab: "create" })}>🌐 Criar sala online</button>
        <button type="button" className={cn(item, "bg-secondary text-secondary-foreground")} onClick={() => go({ id: "online", tab: "browse" })}>🚪 Entrar em sala existente</button>
        <button type="button" className={cn(item, "bg-secondary text-secondary-foreground")} onClick={() => go({ id: "online", tab: "code" })}>🔑 Entrar com código de convite</button>
        <Link to="/editor" className={cn(item, "bg-accent text-accent-foreground")}>🛠️ Criar pista</Link>
        <Link to="/pistas" className={cn(item, "bg-accent text-accent-foreground")}>🖼️ Galeria de pistas</Link>
        <button type="button" className={cn(item, "bg-muted")} onClick={() => go({ id: "controls" })}>⌨️ Configurar controles</button>
        <button type="button" className={cn(item, "bg-muted sm:col-span-2")} onClick={() => go({ id: "options" })}>⚙️ Opções de som</button>
      </div>
    </div>
  );
}

function Options({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  return (
    <Screen title="Opções" onBack={onBack}>
      <div className="toon-panel mx-auto max-w-md space-y-4 p-5">
        <label className="block">Música: {Math.round(settings.music * 100)}%<input className="w-full" type="range" min={0} max={1} step={0.05} value={settings.music} onChange={(e) => onChange({ ...settings, music: Number(e.target.value) })} /></label>
        <label className="block">Efeitos: {Math.round(settings.sfx * 100)}%<input className="w-full" type="range" min={0} max={1} step={0.05} value={settings.sfx} onChange={(e) => onChange({ ...settings, sfx: Number(e.target.value) })} /></label>
      </div>
    </Screen>
  );
}

function TrackSelect({ players, mode, profile, customTracks, pending, onBack, onStart }: {
  players: 1 | 2; mode: ModeId; profile: Profile; customTracks: TrackDef[]; pending: TrackDef | null; onBack: () => void;
  onStart: (t: TrackDef, o: { laps: number; bots: number; items: boolean; difficulty: 1 | 2 | 3 }, series: Series | null, ch: ChallengeDef | null) => void;
}) {
  const lvl = levelFor(profile.xp);
  const all = [...(pending ? [pending] : []), ...customTracks.filter((t) => t.id !== pending?.id), ...TRACKS];
  const [sel, setSel] = useState<TrackDef>(all[0]!);
  const [laps, setLaps] = useState(sel.laps ?? 3);
  const [bots, setBots] = useState(players === 2 ? 4 : 5);
  const [items, setItems] = useState(true);
  const [diff, setDiff] = useState<1 | 2 | 3>(2);
  const o = { laps, bots: mode === "time" ? 0 : bots, items, difficulty: diff };
  if (mode === "challenge") return (
    <Screen title="Desafios" onBack={onBack}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHALLENGES.map((c) => { const t = trackById(c.trackId)!; return (
          <button key={c.id} type="button" className="toon-btn bg-card p-3 text-left" onClick={() => onStart(t, { laps: c.rules.laps ?? 3, bots: c.bots, items: c.rules.items ?? true, difficulty: 2 }, null, c)}>
            <TrackPreview def={t} /><div className="mt-2 font-display text-xs text-accent">{c.name}</div><p className="text-sm font-normal">{c.desc}</p><p className="text-xs font-normal text-muted-foreground">{t.name}</p>
          </button>); })}
      </div>
    </Screen>
  );
  if (mode === "champ") return (
    <Screen title="Campeonato — escolha a copa" onBack={onBack}>
      <div className="grid gap-3 md:grid-cols-3">
        {CUPS.map((c) => { const ts = c.tracks.map((id) => trackById(id)!); const locked = ts.some((t) => t.unlockLevel > lvl); return (
          <button key={c.id} type="button" disabled={locked} className="toon-btn bg-card p-3 text-left" onClick={() => onStart(ts[0]!, o, newSeries("champ", ts), null)}>
            <div className="font-display text-xs text-accent">{c.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-1">{ts.map((t) => <TrackPreview key={t.id} def={t} />)}</div>
            <p className="mt-1 text-xs font-normal text-muted-foreground">{ts.map((t) => t.name).join(" · ")}{locked ? " · 🔒 suba de nível" : ""}</p>
          </button>); })}
      </div>
      <OptionsRow players={players} mode={mode} laps={laps} setLaps={setLaps} bots={bots} setBots={setBots} items={items} setItems={setItems} diff={diff} setDiff={setDiff} />
    </Screen>
  );
  return (
    <Screen title="Escolha a pista" onBack={onBack} right={<Btn onClick={() => onStart(sel, o, mode === "bo3" || mode === "bo5" ? newSeries(mode, [sel]) : null, null)}>Correr ▶</Btn>}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {all.map((t) => { const locked = !t.custom && t.unlockLevel > lvl; return (
            <button key={t.id} type="button" disabled={locked} aria-pressed={sel.id === t.id} onClick={() => { setSel(t); setLaps(t.laps ?? 3); }} className={cn("toon-btn bg-card p-2 text-left", sel.id === t.id && "ring-4 ring-ring")}>
              <TrackPreview def={t} />
              <div className="mt-1 truncate text-sm">{t.custom ? "★ " : ""}{t.name}</div>
              <div className="flex justify-between text-xs font-normal text-muted-foreground"><Stars n={t.difficulty} /><span>{locked ? `🔒 Nv ${t.unlockLevel}` : t.custom ? `por ${t.creator ?? "você"}` : ""}</span></div>
            </button>); })}
        </div>
        <div className="space-y-3">
          <div className="toon-panel p-3"><TrackPreview def={sel} /><div className="mt-2 font-semibold">{sel.name}</div>{profile.stats.bestLaps[sel.id] && <div className="text-xs text-muted-foreground">Seu recorde de volta: {fmt(profile.stats.bestLaps[sel.id]!)}</div>}</div>
          <OptionsRow players={players} mode={mode} laps={laps} setLaps={setLaps} bots={bots} setBots={setBots} items={items} setItems={setItems} diff={diff} setDiff={setDiff} />
          <Btn className="w-full py-3 text-base" onClick={() => onStart(sel, o, mode === "bo3" || mode === "bo5" ? newSeries(mode, [sel]) : null, null)}>Correr ▶</Btn>
        </div>
      </div>
    </Screen>
  );
}

function OptionsRow(p: { players: number; mode: ModeId; laps: number; setLaps: (n: number) => void; bots: number; setBots: (n: number) => void; items: boolean; setItems: (b: boolean) => void; diff: 1 | 2 | 3; setDiff: (d: 1 | 2 | 3) => void }) {
  return (
    <div className="toon-panel mt-3 grid grid-cols-2 gap-2 p-3 text-sm">
      <label>Voltas<input type="number" min={1} max={9} value={p.laps} onChange={(e) => p.setLaps(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} className="w-full rounded-md border-2 border-border bg-input px-2 py-1" /></label>
      {p.mode !== "time" && <label>Bots<input type="number" min={0} max={8 - p.players} value={p.bots} onChange={(e) => p.setBots(Math.max(0, Math.min(8 - p.players, Number(e.target.value) || 0)))} className="w-full rounded-md border-2 border-border bg-input px-2 py-1" /></label>}
      <label>Dificuldade<select value={p.diff} onChange={(e) => p.setDiff(Number(e.target.value) as 1 | 2 | 3)} className="w-full rounded-md border-2 border-border bg-input px-2 py-1"><option value={1}>Fácil</option><option value={2}>Normal</option><option value={3}>Difícil</option></select></label>
      {p.mode !== "time" && <label className="flex items-center gap-2"><input type="checkbox" checked={p.items} onChange={(e) => p.setItems(e.target.checked)} /> Itens</label>}
    </div>
  );
}
