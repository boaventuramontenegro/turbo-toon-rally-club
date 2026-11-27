// Local persistence for settings, controls, profiles (progression/garage) and custom tracks.
import { CHARACTERS, type AbilityId, type TrackDef } from "./data";

export type Action = "up" | "down" | "left" | "right" | "drift" | "turbo" | "item" | "ability";
export type KeyMap = Record<Action, string>;
export const ACTIONS: { id: Action; label: string }[] = [
  { id: "up", label: "Acelerar" }, { id: "down", label: "Frear / Ré" }, { id: "left", label: "Virar à esquerda" },
  { id: "right", label: "Virar à direita" }, { id: "drift", label: "Drift" }, { id: "turbo", label: "Turbo" },
  { id: "item", label: "Usar item" }, { id: "ability", label: "Habilidade especial" },
];
export const DEFAULT_KEYS: [KeyMap, KeyMap] = [
  { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", drift: "Space", turbo: "ShiftLeft", item: "KeyE", ability: "KeyQ" },
  { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", drift: "Enter", turbo: "ShiftRight", item: "ControlRight", ability: "Slash" },
];
export const cloneDefaultKeys = (): [KeyMap, KeyMap] => [{ ...DEFAULT_KEYS[0] }, { ...DEFAULT_KEYS[1] }];

export interface KeyConflict { code: string; uses: { player: number; action: Action }[] }
/** Every key bound to more than one command, across both players (they share one keyboard). */
export function findConflicts(keys: KeyMap[]): KeyConflict[] {
  const by = new Map<string, { player: number; action: Action }[]>();
  keys.forEach((m, player) => { for (const a of ACTIONS) { const c = m[a.id]; if (!c) continue; const l = by.get(c) ?? []; l.push({ player, action: a.id }); by.set(c, l); } });
  return [...by.entries()].filter(([, u]) => u.length > 1).map(([code, uses]) => ({ code, uses }));
}

export interface Custom {
  color: string; color2: string; decal: "none" | "stripes" | "flames" | "checker" | "dots" | "number";
  wheels: "std" | "sport" | "offroad" | "neon"; accessory: "none" | "spoiler" | "antenna" | "horns" | "crown" | "flag";
  trail: "none" | "fire" | "sparkle" | "rainbow" | "smoke"; helmet: string;
}
export interface Upgrades { speed: number; accel: number; handling: number; armor: number; ability: number }
export interface Profile {
  name: string; xp: number; coins: number; unlocked: string[]; character: string; ability: AbilityId;
  customs: Record<string, Custom>; upgrades: Record<string, Upgrades>;
  stats: { races: number; wins: number; bestLaps: Record<string, number> };
}
export interface Settings { music: number; sfx: number; keys: [KeyMap, KeyMap]; difficulty: 1 | 2 | 3; name: string }

export const levelFor = (xp: number) => Math.floor(Math.sqrt(xp / 120)) + 1;
export const xpForLevel = (lvl: number) => (lvl - 1) ** 2 * 120;

export function defaultCustom(charId: string): Custom {
  const c = CHARACTERS.find((x) => x.id === charId) ?? CHARACTERS[0]!;
  return { color: c.color, color2: "#ffffff", decal: "stripes", wheels: "std", accessory: "none", trail: "none", helmet: "#ffffff" };
}
export const defaultUpgrades = (): Upgrades => ({ speed: 0, accel: 0, handling: 0, armor: 0, ability: 0 });

function defaultProfile(i: number): Profile {
  const ch = i === 0 ? "nova" : "kiko";
  return { name: i === 0 ? "Jogador 1" : "Jogador 2", xp: 0, coins: 100, unlocked: ["nova", "brutus", "kiko", "yuki"], character: ch, ability: CHARACTERS.find((c) => c.id === ch)!.ability, customs: {}, upgrades: {}, stats: { races: 0, wins: 0, bestLaps: {} } };
}

const isBrowser = () => typeof window !== "undefined";
function read<T>(k: string, fb: T): T {
  if (!isBrowser()) return fb;
  try { const v = localStorage.getItem(k); return v ? { ...fb, ...JSON.parse(v) } as T : fb; } catch { return fb; }
}
function write(k: string, v: unknown) { if (isBrowser()) localStorage.setItem(k, JSON.stringify(v)); }

export const loadSettings = (): Settings => {
  const s = read<Settings>("tt.settings", { music: 0.5, sfx: 0.7, keys: cloneDefaultKeys(), difficulty: 2, name: "Piloto" });
  s.keys = [{ ...DEFAULT_KEYS[0], ...s.keys[0] }, { ...DEFAULT_KEYS[1], ...s.keys[1] }];
  if (!s.name) s.name = "Piloto";
  return s;
};
export const saveSettings = (s: Settings) => write("tt.settings", s);
export const loadProfile = (i: number): Profile => {
  const p = read<Profile>(`tt.profile.${i}`, defaultProfile(i));
  p.stats = { ...defaultProfile(i).stats, ...p.stats };
  return p;
};
export const saveProfile = (i: number, p: Profile) => write(`tt.profile.${i}`, p);
export const customOf = (p: Profile, ch: string) => p.customs[ch] ?? defaultCustom(ch);
export const upgradesOf = (p: Profile, ch: string) => p.upgrades[ch] ?? defaultUpgrades();

export const loadCustomTracks = (): TrackDef[] => {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("tt.tracks") ?? "[]") as TrackDef[]; } catch { return []; }
};
export const saveCustomTracks = (t: TrackDef[]) => write("tt.tracks", t);

export function keyLabel(code: string) {
  const map: Record<string, string> = { Space: "Espaço", ShiftLeft: "Shift E", ShiftRight: "Shift D", ControlLeft: "Ctrl E", ControlRight: "Ctrl D", Enter: "Enter", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Slash: "/", AltLeft: "Alt E", AltRight: "Alt D", Period: ".", Comma: ",", Semicolon: ";", Backspace: "⌫", Tab: "Tab" };
  if (map[code]) return map[code]!;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  return code;
}

export function playerId(): string {
  if (!isBrowser()) return "server";
  let id = localStorage.getItem("tt.pid");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("tt.pid", id); }
  return id;
}
export function upsertCustomTrack(t: TrackDef) {
  const all = loadCustomTracks().filter((x) => x.id !== t.id);
  saveCustomTracks([{ ...t, custom: true }, ...all]);
}
