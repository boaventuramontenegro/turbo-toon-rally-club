import { ABILITIES, CHARACTERS, type AbilityId } from "../data";
import { customOf, levelFor, upgradesOf, type Custom, type Profile, type Upgrades } from "../store";
import { Bar, KartPreview } from "./common";
import { cn } from "@/lib/utils";

const COLORS = ["#ff7a1a", "#c0392b", "#2ecc71", "#5dade2", "#9b59b6", "#f1c40f", "#ff4f9a", "#1abc9c", "#ecf0f1", "#2c3e50", "#e67e22", "#7cf9ff"];
const DECALS: [Custom["decal"], string][] = [["none", "Liso"], ["stripes", "Listras"], ["flames", "Chamas"], ["checker", "Xadrez"], ["dots", "Bolinhas"], ["number", "Número"]];
const WHEELS: [Custom["wheels"], string][] = [["std", "Padrão"], ["sport", "Esportiva"], ["offroad", "Off-road"], ["neon", "Neon"]];
const ACCS: [Custom["accessory"], string][] = [["none", "Nenhum"], ["spoiler", "Aerofólio"], ["antenna", "Antena"], ["horns", "Chifres"], ["crown", "Coroa"], ["flag", "Bandeira"]];
const TRAILS: [Custom["trail"], string][] = [["none", "Nenhum"], ["fire", "Fogo"], ["sparkle", "Brilho"], ["rainbow", "Arco-íris"], ["smoke", "Fumaça"]];
const UPS: [keyof Upgrades, string][] = [["speed", "Velocidade"], ["accel", "Aceleração"], ["handling", "Curvas"], ["armor", "Blindagem"], ["ability", "Habilidade"]];
export const upgradeCost = (lvl: number) => 60 + lvl * 50;

function Chips<T extends string>({ value, options, onPick, label }: { value: T; options: [T, string][]; onPick: (v: T) => void; label: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onPick(v)} className={cn("rounded-md border-2 border-border px-2 py-0.5 text-xs", value === v ? "bg-accent text-accent-foreground" : "bg-muted")}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function PlayerSetup({ slot, profile, onChange, compact = false }: { slot: number; profile: Profile; onChange: (p: Profile) => void; compact?: boolean }) {
  const lvl = levelFor(profile.xp);
  const ch = CHARACTERS.find((c) => c.id === profile.character) ?? CHARACTERS[0]!;
  const cu = customOf(profile, ch.id);
  const up = upgradesOf(profile, ch.id);
  const setCustom = (patch: Partial<Custom>) => onChange({ ...profile, customs: { ...profile.customs, [ch.id]: { ...cu, ...patch } } });
  const pick = (id: string) => {
    const c = CHARACTERS.find((x) => x.id === id)!;
    if (!profile.unlocked.includes(id)) {
      if (lvl < c.unlockLevel || profile.coins < c.price) return;
      onChange({ ...profile, coins: profile.coins - c.price, unlocked: [...profile.unlocked, id], character: id, ability: c.ability });
      return;
    }
    onChange({ ...profile, character: id, ability: c.ability });
  };
  const buyUp = (k: keyof Upgrades) => {
    const cost = upgradeCost(up[k]);
    if (up[k] >= 5 || profile.coins < cost) return;
    onChange({ ...profile, coins: profile.coins - cost, upgrades: { ...profile.upgrades, [ch.id]: { ...up, [k]: up[k] + 1 } } });
  };
  const color = slot === 0 ? "border-p1" : "border-p2";
  return (
    <section className={cn("toon-panel border-4 p-4", color)} aria-label={`Jogador ${slot + 1}`}>
      <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <span className={cn("rounded-md px-2 py-1 font-display text-xs text-primary-foreground", slot === 0 ? "bg-p1" : "bg-p2")}>P{slot + 1}</span>
        <input aria-label={`Nome do jogador ${slot + 1}`} value={profile.name} maxLength={14} onChange={(e) => onChange({ ...profile, name: e.target.value })} className="min-w-0 rounded-md border-2 border-border bg-input px-2 py-1 font-semibold" />
        <span className="shrink-0 text-xs text-muted-foreground">Nv {lvl} · 🪙 {profile.coins}</span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <div className="flex flex-col items-center rounded-lg bg-muted p-2">
          <KartPreview charId={ch.id} custom={cu} size={compact ? 80 : 110} slot={slot} />
          <div className="mt-1 text-center font-semibold">{ch.name}</div>
          <div className="text-center text-xs text-muted-foreground">{ch.vehicleName}</div>
        </div>
        <div className="space-y-1 text-xs">
          <p className="text-muted-foreground">{ch.bio}</p>
          {(["speed", "accel", "handling", "weight", "armor"] as const).map((s) => (
            <div key={s} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
              <span>{{ speed: "Velocidade", accel: "Aceleração", handling: "Curvas", weight: "Peso", armor: "Blindagem" }[s]}</span>
              <Bar value={ch.stats[s]} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {CHARACTERS.map((c) => {
          const owned = profile.unlocked.includes(c.id), canBuy = lvl >= c.unlockLevel && profile.coins >= c.price;
          return (
            <button key={c.id} type="button" onClick={() => pick(c.id)} aria-pressed={c.id === ch.id} disabled={!owned && !canBuy}
              className={cn("rounded-lg border-2 border-border p-1 text-xs", c.id === ch.id ? "bg-accent text-accent-foreground" : "bg-muted", !owned && "opacity-70")}>
              <div className="mx-auto h-4 w-8 rounded" style={{ background: customOf(profile, c.id).color }} />
              <div className="truncate font-semibold">{c.name}</div>
              {!owned && <div className="truncate">{lvl < c.unlockLevel ? `🔒 Nv ${c.unlockLevel}` : `🪙 ${c.price}`}</div>}
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-3 space-y-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Cor principal / secundária / capacete</div>
            <div className="flex flex-wrap items-center gap-1">
              {COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setCustom({ color: c })} className={cn("h-6 w-6 rounded-full border-2 border-border", cu.color === c && "ring-3 ring-ring")} style={{ background: c }} />)}
              <input type="color" aria-label="Cor secundária" value={cu.color2} onChange={(e) => setCustom({ color2: e.target.value })} className="h-7 w-9 rounded border-2 border-border bg-transparent" />
              <input type="color" aria-label="Cor do capacete" value={cu.helmet} onChange={(e) => setCustom({ helmet: e.target.value })} className="h-7 w-9 rounded border-2 border-border bg-transparent" />
            </div>
          </div>
          <Chips label="Pintura" value={cu.decal} options={DECALS} onPick={(v) => setCustom({ decal: v })} />
          <Chips label="Rodas" value={cu.wheels} options={WHEELS} onPick={(v) => setCustom({ wheels: v })} />
          <Chips label="Acessório" value={cu.accessory} options={ACCS} onPick={(v) => setCustom({ accessory: v })} />
          <Chips label="Rastro" value={cu.trail} options={TRAILS} onPick={(v) => setCustom({ trail: v })} />
          <Chips label="Habilidade especial" value={profile.ability} options={ABILITIES.filter((a) => a.unlockLevel <= lvl || a.id === ch.ability).map((a) => [a.id, a.name] as [AbilityId, string])} onPick={(v) => onChange({ ...profile, ability: v })} />
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Evoluir {ch.name} (moedas)</div>
            <div className="grid gap-1">
              {UPS.map(([k, l]) => (
                <div key={k} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                  <span>{l}</span><Bar value={up[k]} tone="bg-success" />
                  <button type="button" disabled={up[k] >= 5 || profile.coins < upgradeCost(up[k])} onClick={() => buyUp(k)} className="toon-btn bg-success px-2 py-0.5 text-xs text-primary-foreground">{up[k] >= 5 ? "MÁX" : `+ 🪙${upgradeCost(up[k])}`}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
