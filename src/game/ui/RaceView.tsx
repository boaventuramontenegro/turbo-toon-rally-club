import { useEffect, useRef, useState } from "react";
import { Race, type NetState, type RaceConfig, type RaceResult } from "../engine";
import { audio } from "../audio";
import { loadSettings, saveSettings } from "../store";
import type { Room } from "../net";
import { Btn } from "./common";
import { SoundControls } from "./SoundControls";

export function RaceView({ cfg, room, resync, onFinish, onExit, onRestart }: {
  cfg: RaceConfig; room?: Room | null; resync?: { states: NetState[] } | null;
  onFinish: (r: RaceResult) => void; onExit: () => void; onRestart?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raceRef = useRef<Race | null>(null);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(() => loadSettings());
  const [netStatus, setNetStatus] = useState<string>("");
  const finishRef = useRef(onFinish); finishRef.current = onFinish;

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const st = loadSettings();
    audio.init(); audio.setVolumes(st.music, st.sfx);
    const race = new Race(c, cfg);
    raceRef.current = race;
    if (import.meta.env.DEV) (window as unknown as { __race?: Race }).__race = race; // dev-only debug hook
    race.onFinish = (r) => finishRef.current(r);
    if (resync) race.restore(resync.states);
    audio.setScene("race");
    const offs: (() => void)[] = [];
    if (room) {
      race.onNet = (m) => room.send(m);
      room.getRaceSnapshot = () => ({ elapsed: race.time, states: race.snapshot() });
      const syncDc = () => {
        const present = new Set(room.players.map((p) => p.pid));
        for (const p of cfg.players) if (p.pid && p.control === "remote") race.setDc(p.slot, !present.has(p.pid));
        if (room.isHost) race.adoptBots();
      };
      syncDc();
      offs.push(room.on((e) => {
        if (e.type === "net") race.receive(e.msg);
        else if (e.type === "players") syncDc();
        else if (e.type === "status") { setNetStatus(e.status === "offline" ? "Conexão perdida — reconectando…" : e.status === "connecting" ? "Conectando…" : ""); race.peerStatus = e.status === "offline" ? "SEM CONEXÃO" : ""; }
      }));
    }
    return () => { offs.forEach((f) => f()); race.destroy(); raceRef.current = null; if (room) room.getRaceSnapshot = null; };
    // the race is created once per mount; parents remount with a new key for a new race
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); setPaused((p) => { raceRef.current?.setPaused(!p); return !p; }); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const resume = () => { raceRef.current?.setPaused(false); setPaused(false); };
  return (
    <div className="fixed inset-0 bg-black" data-testid="race">
      <canvas ref={ref} className="h-full w-full" />
      <button type="button" onClick={() => { raceRef.current?.setPaused(true); setPaused(true); }} className="toon-btn absolute right-3 top-3 bg-muted px-3 py-1 text-xs" aria-label="Pausar">❚❚ Esc</button>
      {netStatus && <div role="status" className="toon-panel absolute left-1/2 top-20 -translate-x-1/2 bg-destructive px-4 py-2 text-sm">{netStatus}</div>}
      {paused && (
        <div className="absolute inset-0 grid place-items-center bg-black/60">
          <div className="toon-panel max-h-[90dvh] w-80 max-w-[calc(100%-2rem)] space-y-3 overflow-y-auto p-6 text-center">
            <h2 className="title-toon text-xl">PAUSA</h2>
            {cfg.online && <p className="text-xs text-muted-foreground">No online a corrida continua para os outros.</p>}
            <SoundControls music={sound.music} effects={sound.sfx} onChange={(music, sfx) => { const next = { ...sound, music, sfx }; setSound(next); saveSettings(next); audio.setVolumes(music, sfx); }} />
            <Btn className="w-full" onClick={resume}>Continuar</Btn>
            {onRestart && !cfg.online && <Btn tone="secondary" className="w-full" onClick={onRestart}>Reiniciar corrida</Btn>}
            <Btn tone="destructive" className="w-full" onClick={onExit}>{cfg.online ? "Sair da corrida" : "Sair para o menu"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
