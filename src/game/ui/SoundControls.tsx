import { audio } from "../audio";
import { Btn } from "./common";

export function SoundControls({ music, effects, onChange }: { music: number; effects: number; onChange: (music: number, effects: number) => void }) {
  return <div className="space-y-4">
    <label className="block text-left text-sm">Música: {Math.round(music * 100)}%
      <input aria-label="Volume da música" className="block h-8 w-full accent-accent" type="range" min={0} max={1} step={.05} value={music} onChange={(e) => onChange(Number(e.target.value), effects)} />
    </label>
    <label className="block text-left text-sm">Efeitos: {Math.round(effects * 100)}%
      <input aria-label="Volume dos efeitos" className="block h-8 w-full accent-accent" type="range" min={0} max={1} step={.05} value={effects} onChange={(e) => onChange(music, Number(e.target.value))} />
    </label>
    <Btn tone="muted" onClick={() => { audio.init(); audio.play("pickup"); }}>♪ Testar efeitos</Btn>
  </div>;
}