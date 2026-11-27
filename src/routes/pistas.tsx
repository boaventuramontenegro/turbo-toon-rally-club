import { createFileRoute } from "@tanstack/react-router";
import { Gallery } from "@/game/ui/Gallery";

export const Route = createFileRoute("/pistas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Galeria de pistas — TURBO TOON" },
      { name: "description", content: "Pistas criadas pelos jogadores do TURBO TOON. Jogue, copie e edite." },
      { property: "og:title", content: "Galeria de pistas — TURBO TOON" },
      { property: "og:description", content: "Pistas criadas pelos jogadores do TURBO TOON. Jogue, copie e edite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Gallery,
});
