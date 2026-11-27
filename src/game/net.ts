// Online rooms over Lovable Cloud Realtime: presence = who is in the room (and the host's settings),
// broadcast = race start, engine messages (positions, items, hits) and resync for reconnecting players.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AbilityId, TrackDef } from "./data";
import type { ModeId, NetMsg, NetState } from "./engine";
import type { Custom, Upgrades } from "./store";

export interface RoomPlayer {
  pid: string; name: string; charId: string; custom: Custom; upgrades: Upgrades; ability: AbilityId;
  joinedAt: number; host: boolean; settings?: RoomSettings; status?: "lobby" | "racing"; start?: RoomStart;
}
export interface RoomSettings { track: TrackDef; mode: Extract<ModeId, "single" | "survival" | "time">; laps: number; bots: number; items: boolean; difficulty: 1 | 2 | 3 }
export interface RoomStart { raceId: string; settings: RoomSettings; order: RoomPlayer[]; startedAt: number }
export interface LobbyRoom { code: string; hostName: string; trackName: string; players: number; status: "lobby" | "racing" }

type Ev =
  | { type: "players"; players: RoomPlayer[] }
  | { type: "start"; start: RoomStart }
  | { type: "resync"; start: RoomStart; elapsed: number; states: NetState[] }
  | { type: "net"; msg: NetMsg }
  | { type: "lobby" }
  | { type: "status"; status: "connecting" | "online" | "offline" };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode() { let c = ""; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
export const LAST_ROOM_KEY = "tt.lastRoom";

export class Room {
  channel: RealtimeChannel | null = null;
  players: RoomPlayer[] = [];
  me: RoomPlayer;
  status: "lobby" | "racing" = "lobby";
  current: RoomStart | null = null;
  private listeners = new Set<(e: Ev) => void>();
  private lobby: RealtimeChannel | null = null;
  getRaceSnapshot: (() => { elapsed: number; states: NetState[] } | null) | null = null;

  constructor(public code: string, me: Omit<RoomPlayer, "joinedAt" | "host">, host: boolean) {
    this.me = { ...me, joinedAt: Date.now(), host };
  }
  on(fn: (e: Ev) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(e: Ev) { for (const l of this.listeners) l(e); }
  get isHost() { return this.hostPid() === this.me.pid; }
  hostPid() {
    const flagged = this.players.find((p) => p.host);
    if (flagged) return flagged.pid;
    return [...this.players].sort((a, b) => a.joinedAt - b.joinedAt)[0]?.pid ?? this.me.pid;
  }
  settings(): RoomSettings | undefined {
    const h = this.players.find((p) => p.pid === this.hostPid());
    return h?.settings ?? this.me.settings;
  }

  /** Joins the room. Resolves "notfound" when joining a code nobody is in. */
  connect(): Promise<"ok" | "notfound"> {
    this.emit({ type: "status", status: "connecting" });
    const ch = supabase.channel(`tt-room-${this.code}`, { config: { presence: { key: this.me.pid }, broadcast: { self: false } } });
    this.channel = ch;
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<RoomPlayer>();
      const list: RoomPlayer[] = [];
      for (const k of Object.keys(st)) { const arr = st[k]; const last = arr?.[arr.length - 1]; if (last) list.push(last); }
      this.players = list.sort((a, b) => a.joinedAt - b.joinedAt);
      const host = this.players.find((p) => p.pid === this.hostPid());
      if (host && host.pid !== this.me.pid && host.status) this.status = host.status;
      this.emit({ type: "players", players: this.players });
      if (this.isHost && !this.me.host && this.players.length) { this.me.host = true; const st = this.me.settings ?? host?.settings; if (st) this.me.settings = st; void this.track(); }
      this.updateLobby();
    });
    ch.on("broadcast", { event: "start" }, ({ payload }) => { const s = payload as RoomStart; this.current = s; this.status = "racing"; this.emit({ type: "start", start: s }); });
    ch.on("broadcast", { event: "net" }, ({ payload }) => this.emit({ type: "net", msg: payload as NetMsg }));
    ch.on("broadcast", { event: "lobby" }, () => { this.status = "lobby"; this.emit({ type: "lobby" }); });
    ch.on("broadcast", { event: "need-sync" }, ({ payload }) => {
      if (!this.isHost || this.status !== "racing" || !this.current) return;
      const snap = this.getRaceSnapshot?.(); if (!snap) return;
      void ch.send({ type: "broadcast", event: "resync", payload: { to: (payload as { pid: string }).pid, start: this.current, ...snap } });
    });
    ch.on("broadcast", { event: "resync" }, ({ payload }) => {
      const p = payload as { to: string; start: RoomStart; elapsed: number; states: NetState[] };
      if (p.to !== this.me.pid) return;
      this.current = p.start; this.status = "racing";
      this.emit({ type: "resync", start: p.start, elapsed: p.elapsed, states: p.states });
    });
    return new Promise((resolve) => {
      let resolved = false;
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          this.emit({ type: "status", status: "online" });
          await this.track();
          if (!resolved) {
            if (this.me.host) { resolved = true; resolve("ok"); return; }
            // wait for presence to show someone else in the room
            const t0 = Date.now();
            const poll = () => {
              if (this.players.some((p) => p.pid !== this.me.pid)) { resolved = true; resolve("ok"); this.requestSync(); return; }
              if (Date.now() - t0 > 4000) { resolved = true; resolve("notfound"); return; }
              setTimeout(poll, 200);
            };
            poll();
          } else this.requestSync();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          this.emit({ type: "status", status: "offline" });
        }
      });
    });
  }
  requestSync() { if (!this.isHost) void this.channel?.send({ type: "broadcast", event: "need-sync", payload: { pid: this.me.pid } }); }
  async track() { if (this.channel) await this.channel.track({ ...this.me, status: this.status, ...(this.current && this.isHost ? { start: this.current } : {}) }); }
  async update(patch: Partial<RoomPlayer>) { this.me = { ...this.me, ...patch }; await this.track(); }
  async setSettings(s: RoomSettings) { this.me.settings = s; await this.track(); }
  async start(order: RoomPlayer[]) {
    const settings = this.settings(); if (!settings || !this.channel) return;
    const start: RoomStart = { raceId: crypto.randomUUID(), settings, order, startedAt: Date.now() };
    this.current = start; this.status = "racing";
    await this.channel.send({ type: "broadcast", event: "start", payload: start });
    await this.track();
    this.emit({ type: "start", start });
  }
  async backToLobby() {
    this.status = "lobby"; this.current = null;
    await this.channel?.send({ type: "broadcast", event: "lobby", payload: {} });
    await this.track();
    this.emit({ type: "lobby" });
  }
  send(msg: NetMsg) { void this.channel?.send({ type: "broadcast", event: "net", payload: msg }); }

  /** Hosts advertise their room on a shared lobby channel so others can browse open rooms. */
  advertise() {
    if (this.lobby) return;
    this.lobby = supabase.channel("tt-lobby", { config: { presence: { key: `room-${this.code}` } } });
    this.lobby.subscribe((s) => { if (s === "SUBSCRIBED") this.updateLobby(); });
  }
  private updateLobby() {
    if (!this.lobby || !this.isHost) return;
    const info: LobbyRoom = { code: this.code, hostName: this.me.name, trackName: this.settings()?.track.name ?? "—", players: this.players.length, status: this.status };
    void this.lobby.track(info);
  }
  async leave() {
    if (this.lobby) { await supabase.removeChannel(this.lobby); this.lobby = null; }
    if (this.channel) { await this.channel.untrack(); await supabase.removeChannel(this.channel); this.channel = null; }
    this.listeners.clear();
  }
}

/** Live list of advertised rooms. Returns an unsubscribe function. */
export function watchLobby(cb: (rooms: LobbyRoom[]) => void) {
  const ch = supabase.channel("tt-lobby", { config: { presence: { key: `viewer-${Math.random().toString(36).slice(2)}` } } });
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState<LobbyRoom>();
    const rooms: LobbyRoom[] = [];
    for (const k of Object.keys(st)) { if (!k.startsWith("room-")) continue; const r = st[k]?.[0]; if (r) rooms.push(r); }
    cb(rooms);
  });
  ch.subscribe();
  return () => { void supabase.removeChannel(ch); };
}
