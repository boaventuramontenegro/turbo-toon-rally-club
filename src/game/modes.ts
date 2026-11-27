// Game modes: rules per mode, challenges, championship points and best-of series. Pure TS.
import { TRACKS, type TrackDef } from "./data";
import { DEFAULT_RULES, type ModeId, type RaceResult, type Rules } from "./engine";

export interface ModeDef { id: Exclude<ModeId, "custom">; name: string; desc: string; bots: boolean }
export const MODES: ModeDef[] = [
  { id: "single", name: "Corrida rápida", desc: "Uma corrida em qualquer pista.", bots: true },
  { id: "champ", name: "Campeonato", desc: "4 pistas seguidas. Pontos por posição: 10, 8, 6, 5, 4, 3, 2, 1.", bots: true },
  { id: "bo3", name: "Melhor de 3", desc: "Quem vencer 2 corridas primeiro leva.", bots: true },
  { id: "bo5", name: "Melhor de 5", desc: "Quem vencer 3 corridas primeiro leva.", bots: true },
  { id: "time", name: "Contra o tempo", desc: "Sem rivais e sem itens. Bata seu recorde de volta.", bots: false },
  { id: "survival", name: "Sobrevivência", desc: "3 vidas, dano dobrado e batidas machucam. O último de pé vence.", bots: true },
  { id: "challenge", name: "Desafios", desc: "Metas especiais com regras malucas.", bots: true },
];

export function rulesFor(mode: ModeId, opts: { laps: number; items: boolean }): Rules {
  const base: Rules = { ...DEFAULT_RULES, laps: opts.laps, items: opts.items };
  switch (mode) {
    case "time": return { ...base, items: false, collisions: false };
    case "survival": return { ...base, lives: 3, damageMult: 2, respawnDelay: 2 };
    default: return base;
  }
}

export interface ChallengeDef { id: string; name: string; desc: string; trackId: string; bots: number; rules: Partial<Rules>; goal: { place?: number; time?: number } }
export const CHALLENGES: ChallengeDef[] = [
  { id: "nobrake", name: "Sem freio", desc: "Termine em 1º sem poder frear.", trackId: "bosque", bots: 3, rules: { noBrakes: true }, goal: { place: 1 } },
  { id: "ice", name: "Pista de sabão", desc: "Aderência mínima. Termine no pódio.", trackId: "pico", bots: 5, rules: { gripMult: 0.45 }, goal: { place: 3 } },
  { id: "chaos", name: "Chuva de mísseis", desc: "Só mísseis e raios. Vença!", trackId: "neon", bots: 5, rules: { itemPool: ["missile", "zap"] }, goal: { place: 1 } },
  { id: "speed", name: "Hipervelocidade", desc: "Tudo 35% mais rápido. Termine 2 voltas em menos de 1:30.", trackId: "dunas", bots: 0, rules: { speedMult: 1.35, laps: 2 }, goal: { time: 90 } },
  { id: "glass", name: "Vidro", desc: "Dano x3 e só 1 vida. Sobreviva e chegue em 1º.", trackId: "vulcao", bots: 4, rules: { damageMult: 3, lives: 1 }, goal: { place: 1 } },
  { id: "secret", name: "Caçador de atalhos", desc: "Ache o caminho secreto e feche 3 voltas em menos de 2:10.", trackId: "serra", bots: 0, rules: { laps: 3, items: false }, goal: { time: 130 } },
];

export function challengeMet(c: ChallengeDef, res: RaceResult, slot: number): boolean {
  const k = res.karts.find((x) => x.slot === slot);
  if (!k || !k.finished || k.eliminated) return false;
  if (c.goal.place !== undefined && k.place > c.goal.place) return false;
  if (c.goal.time !== undefined && k.time > c.goal.time) return false;
  return true;
}

export const CHAMP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
export const pointsFor = (place: number, eliminated = false) => (eliminated ? 0 : CHAMP_POINTS[place - 1] ?? 0);

export const CUPS: { id: string; name: string; tracks: string[] }[] = [
  { id: "folha", name: "Copa Folha", tracks: ["bosque", "neon", "dunas", "ponte"] },
  { id: "chama", name: "Copa Chama", tracks: ["pico", "vulcao", "praia", "serra"] },
  { id: "estrela", name: "Copa Estrela", tracks: ["orbital", "doce", "pantano", "hyper"] },
];

export interface Series { mode: ModeId; tracks: TrackDef[]; race: number; points: Record<number, number>; wins: Record<number, number>; target: number }
export function newSeries(mode: ModeId, tracks: TrackDef[]): Series {
  const target = mode === "bo3" ? 2 : mode === "bo5" ? 3 : 0;
  return { mode, tracks, race: 0, points: {}, wins: {}, target };
}
/** Adds a race result to the series. Returns the series winner slot once decided, else null. */
export function recordRace(s: Series, res: RaceResult): number | null {
  for (const k of res.karts) s.points[k.slot] = (s.points[k.slot] ?? 0) + pointsFor(k.place, k.eliminated);
  const w = res.karts.find((k) => k.place === 1 && !k.eliminated);
  if (w) s.wins[w.slot] = (s.wins[w.slot] ?? 0) + 1;
  s.race++;
  if (s.target > 0) {
    const champ = Object.entries(s.wins).find(([, v]) => v >= s.target);
    return champ ? Number(champ[0]) : null;
  }
  if (s.mode === "champ" && s.race >= s.tracks.length) {
    const top = Object.entries(s.points).sort((a, b) => b[1] - a[1])[0];
    return top ? Number(top[0]) : null;
  }
  return null;
}
export const trackById = (id: string) => TRACKS.find((t) => t.id === id);
