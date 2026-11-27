import { createFileRoute } from "@tanstack/react-router";
import { TrackEditor } from "@/game/ui/Editor";

export const Route = createFileRoute("/editor")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s["id"] === "string" ? { id: s["id"] } : {}),
  head: () => ({
    meta: [
      { title: "Criar pista — TURBO TOON" },
      { name: "description", content: "Editor de pistas: desenhe o traçado, coloque obstáculos, atalhos secretos e teste na hora." },
      { property: "og:title", content: "Criar pista — TURBO TOON" },
      { property: "og:description", content: "Editor de pistas: desenhe o traçado, coloque obstáculos, atalhos secretos e teste na hora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useSearch();
  return <TrackEditor {...(id ? { editId: id } : {})} />;
}
