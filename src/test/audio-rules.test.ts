import { describe, expect, it } from "vitest";
import { audio, engineRate, safeVolume } from "@/game/audio";

describe("mixagem de áudio", () => {
  it("música pode ficar muda sem silenciar efeitos", () => {
    audio.setVolumes(0, .7);
    expect(audio.musicVol).toBe(0);
    expect(audio.sfxVol).toBe(.7);
  });
  it("efeitos podem ficar mudos sem silenciar música", () => {
    audio.setVolumes(.5, 0);
    expect(audio.musicVol).toBe(.5);
    expect(audio.sfxVol).toBe(0);
  });
  it("motor acompanha aceleração, desaceleração e turbo", () => {
    expect(engineRate(1, false)).toBeGreaterThan(engineRate(0, false));
    expect(engineRate(.2, false)).toBeLessThan(engineRate(.8, false));
    expect(engineRate(.8, true)).toBeGreaterThan(engineRate(.8, false));
  });
  it("volumes inválidos não excedem o intervalo seguro", () => {
    expect(safeVolume(2)).toBe(1);
    expect(safeVolume(-1)).toBe(0);
    expect(safeVolume(Number.NaN)).toBe(0);
  });
});