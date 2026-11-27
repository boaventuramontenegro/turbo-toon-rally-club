<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## TURBO TOON — project rules
- Game simulation/rendering lives in plain TS under `src/game/` (engine.ts, track.ts, modes.ts, net.ts); React UI in `src/game/ui/`. Why: rules stay testable and screens only draw state.
- Each player's input is read only from that player's own KeyMap (`PlayerSpec.keys`); never share or split actions between players. Why: core user requirement.
- Local 2-player races render split-screen with one camera per player (`Race.views()`). Why: each player keeps their own view and HUD.
- Online multiplayer uses Lovable Cloud Realtime broadcast + presence on `tt-room-<CODE>` (no tables); the host simulates bots and answers `need-sync` with a snapshot for reconnecting players. Why: real-time sync without server code.
- Settings, keymaps, profiles and saved tracks are per-device localStorage (`tt.*` keys); published tracks go to `public.community_tracks` (anon read/insert only). Why: no accounts in the game.
- Obstacles move deterministically from race time so every client sees the same positions without syncing them.
- Dev-only debug hook: `window.__race` (set in RaceView when `import.meta.env.DEV`) exposes the running Race for browser checks.
- Personalization uses the existing PlayerSetup on every viewport; change only responsive sizing and grid placement. Why: desktop and mobile must expose the same options.
- Audio uses CDN music streams and a decoded PCM effects bank through separate Web Audio music/effects buses, with compressor/headroom and speed-driven engine loops. Why: avoid distorted overlapping oscillator bursts and keep independent volume control.
