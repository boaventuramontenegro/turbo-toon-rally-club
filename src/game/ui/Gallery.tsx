import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { THEMES, type TrackDef } from "../data";
import { loadCustomTracks, saveCustomTracks, upsertCustomTrack } from "../store";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Screen, Stars, TrackPreview } from "./common";
import { PENDING_KEY } from "./GameApp";
import { cn } from "@/lib/utils";

interface Row { id: string; name: string; creator: string; theme: string; data: unknown; created_at: string }

export function Gallery() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"mine" | "community">("community");
  const [mine, setMine] = useState<TrackDef[]>([]);
  useEffect(() => { setMine(loadCustomTracks()); }, []);
  const community = useQuery({
    queryKey: ["community_tracks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("community_tracks").select("id,name,creator,theme,data,created_at").order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return (data as Row[]).map((r) => ({ ...(r.data as TrackDef), id: `pub-${r.id}`, name: r.name, creator: r.creator, theme: r.theme, custom: true }));
    },
  });
  const play = (t: TrackDef) => { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ track: t })); void navigate({ to: "/" }); };
  const copyToMine = (t: TrackDef) => { const c = { ...t, id: `custom-${crypto.randomUUID().slice(0, 8)}`, name: `${t.name} (cópia)` }; upsertCustomTrack(c); setMine(loadCustomTracks()); toast.success("Copiada para Minhas pistas"); return c; };
  const list = tab === "mine" ? mine : community.data ?? [];
  return (
    <Screen title="Galeria de pistas" right={<Link to="/editor" className="toon-btn bg-accent px-4 py-2 text-sm text-accent-foreground">+ Criar pista</Link>} onBack={() => void navigate({ to: "/" })}>
      <div className="mb-4 flex justify-center gap-2" role="tablist">
        <Btn role="tab" aria-selected={tab === "community"} tone={tab === "community" ? "accent" : "muted"} onClick={() => setTab("community")}>Comunidade</Btn>
        <Btn role="tab" aria-selected={tab === "mine"} tone={tab === "mine" ? "accent" : "muted"} onClick={() => setTab("mine")}>Minhas pistas ({mine.length})</Btn>
      </div>
      {tab === "community" && community.isLoading && <p className="text-center text-muted-foreground">Carregando pistas…</p>}
      {tab === "community" && community.isError && <p className="text-center text-destructive">Não foi possível carregar a galeria agora.</p>}
      {list.length === 0 && !community.isLoading && <p className="text-center text-muted-foreground">{tab === "mine" ? "Você ainda não salvou pistas." : "Nenhuma pista publicada ainda — seja o primeiro!"}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <article key={t.id} className="toon-panel p-3">
            <TrackPreview def={t} />
            <h2 className="mt-2 truncate font-semibold">{t.name}</h2>
            <div className="flex justify-between text-xs text-muted-foreground"><span>por {t.creator ?? "Anônimo"} · {THEMES[t.theme]?.name}</span><Stars n={t.difficulty} /></div>
            <div className={cn("mt-2 grid gap-1", tab === "mine" ? "grid-cols-3" : "grid-cols-2")}>
              <Btn onClick={() => play(t)}>Jogar</Btn>
              {tab === "mine" ? (<>
                <Btn tone="secondary" onClick={() => void navigate({ to: "/editor", search: { id: t.id } })}>Editar</Btn>
                <Btn tone="destructive" onClick={() => { const n = mine.filter((x) => x.id !== t.id); saveCustomTracks(n); setMine(n); }}>Excluir</Btn>
              </>) : <Btn tone="secondary" onClick={() => { const c = copyToMine(t); void navigate({ to: "/editor", search: { id: c.id } }); }}>Copiar e editar</Btn>}
            </div>
          </article>
        ))}
      </div>
    </Screen>
  );
}
