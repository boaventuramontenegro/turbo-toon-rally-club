import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, findConflicts } from "@/game/store";
import { newSeries, recordRace, pointsFor } from "@/game/modes";
import type { RaceResult } from "@/game/engine";

describe("controles independentes", () => {
  it("padrões: P1 e P2 não compartilham nenhuma tecla", () => {
    expect(findConflicts([DEFAULT_KEYS[0], DEFAULT_KEYS[1]])).toEqual([]);
  });
  it("padrões pedidos para cada jogador", () => {
    expect(DEFAULT_KEYS[0]).toMatchObject({ up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", drift: "Space", turbo: "ShiftLeft", item: "KeyE" });
    expect(DEFAULT_KEYS[1]).toMatchObject({ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", drift: "Enter", turbo: "ShiftRight", item: "ControlRight" });
  });
  it("avisa conflito quando dois comandos usam a mesma tecla", () => {
    const c = findConflicts([{ ...DEFAULT_KEYS[0], item: "Space" }, DEFAULT_KEYS[1]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.code).toBe("Space");
  });
});

const res = (order: number[]): RaceResult => ({ trackId: "t", winner: order[0]!, karts: order.map((slot, i) => ({ slot, name: String(slot), charId: "nova", finished: true, time: 60 + i, bestLap: 20, lapTimes: [], eliminated: false, place: i + 1, stats: { topSpeed: 0, itemsUsed: 0, hitsDealt: 0, hitsTaken: 0, drifts: 0, boosts: 0, crates: 0, tricks: 0, kos: 0 } })) });

describe("modos", () => {
  it("pontos do campeonato 10/8/6", () => { expect([1, 2, 3].map((p) => pointsFor(p))).toEqual([10, 8, 6]); });
  it("melhor de 3 termina com 2 vitórias", () => {
    const s = newSeries("bo3", []);
    expect(recordRace(s, res([0, 1]))).toBeNull();
    expect(recordRace(s, res([1, 0]))).toBeNull();
    expect(recordRace(s, res([1, 0]))).toBe(1);
  });
});
