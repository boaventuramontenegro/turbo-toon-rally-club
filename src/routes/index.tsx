import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/game/ui/GameApp";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "TURBO TOON — corrida arcade multiplayer" },
      { name: "description", content: "Corra contra bots, com um amigo no mesmo PC ou online, e crie suas próprias pistas." },
      { property: "og:title", content: "TURBO TOON — corrida arcade multiplayer" },
      { property: "og:description", content: "Corra contra bots, com um amigo no mesmo PC ou online, e crie suas próprias pistas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GameApp,
});
