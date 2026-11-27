import { useEffect, useState } from "react";
import { ACTIONS, DEFAULT_KEYS, findConflicts, keyLabel, loadSettings, saveSettings, type Action, type KeyMap } from "../store";
import { Btn, Screen } from "./common";
import { cn } from "@/lib/utils";

export function ControlsScreen({ onBack }: { onBack: () => void }) {
  const [keys, setKeys] = useState<[KeyMap, KeyMap]>(() => loadSettings().keys);
  const [waiting, setWaiting] = useState<{ p: number; a: Action } | null>(null);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const conflicts = findConflicts(keys);
  const conflictKeys = new Set(conflicts.map((c) => c.code));

  const persist = (k: [KeyMap, KeyMap]) => { setKeys(k); const s = loadSettings(); saveSettings({ ...s, keys: k }); };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (waiting) {
        e.preventDefault();
        if (e.code !== "Escape") {
          const next: [KeyMap, KeyMap] = [{ ...keys[0] }, { ...keys[1] }];
          next[waiting.p]![waiting.a] = e.code;
          persist(next);
        }
        setWaiting(null);
        return;
      }
      setHeld((h) => new Set(h).add(e.code));
    };
    const up = (e: KeyboardEvent) => setHeld((h) => { const n = new Set(h); n.delete(e.code); return n; });
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [waiting, keys]);

  return (
    <Screen title="Configurar controles" onBack={onBack}>
      <p className="mb-4 text-center text-sm text-muted-foreground">Clique em um comando e pressione a nova tecla (Esc cancela). Tudo é salvo automaticamente. Segure as teclas para testar: cada jogador acende só os próprios comandos.</p>
      {conflicts.length > 0 && (
        <div role="alert" className="toon-panel mb-4 border-destructive bg-destructive/20 p-3 text-sm">
          <strong>Conflito de teclas:</strong>{" "}
          {conflicts.map((c) => `${keyLabel(c.code)} → ${c.uses.map((u) => `P${u.player + 1} ${ACTIONS.find((a) => a.id === u.action)?.label}`).join(" e ")}`).join("; ")}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((p) => (
          <section key={p} className={cn("toon-panel border-4 p-4", p === 0 ? "border-p1" : "border-p2")} aria-label={`Controles do jogador ${p + 1}`}>
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <h2 className={cn("font-display text-sm", p === 0 ? "text-p1" : "text-p2")}>Jogador {p + 1}</h2>
              <Btn tone="muted" onClick={() => { const next: [KeyMap, KeyMap] = [{ ...keys[0] }, { ...keys[1] }]; next[p] = { ...DEFAULT_KEYS[p]! }; persist(next); }}>Restaurar padrão</Btn>
            </div>
            <div className="grid gap-2">
              {ACTIONS.map((a) => {
                const code = keys[p]![a.id];
                const isWaiting = waiting?.p === p && waiting.a === a.id;
                return (
                  <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2">
                    <span className={cn("flex items-center gap-2 text-sm", held.has(code) && "font-bold text-success")}>
                      <span className={cn("h-3 w-3 shrink-0 rounded-full border-2 border-border", held.has(code) ? "bg-success" : "bg-muted")} aria-hidden="true" />{a.label}
                    </span>
                    <button type="button" aria-label={`${a.label} do jogador ${p + 1}: ${keyLabel(code)}`} onClick={() => setWaiting({ p, a: a.id })}
                      className={cn("toon-btn px-2 py-1 font-display text-[10px]", isWaiting ? "animate-pulse bg-accent text-accent-foreground" : conflictKeys.has(code) ? "bg-destructive text-destructive-foreground" : "bg-muted")}>
                      {isWaiting ? "Pressione…" : keyLabel(code)}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">No online, cada computador usa os controles do Jogador 1 configurados aqui.</p>
    </Screen>
  );
}
