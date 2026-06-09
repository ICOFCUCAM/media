# 26 — Creation modes (multi-entry studio)

Cineforge is not a prompt-to-video tool — it's a production OS. A project can
begin from many different assets, so the studio exposes **multiple creation
entry points** rather than a single prompt box. Every mode resolves to the same
data model (`projects` → `scenes` → `shots`) and the same render pipeline; they
differ only in how the initial scene plan is produced.

## Project modes (`projects.mode`)

| mode | how it starts | UI |
|---|---|---|
| `auto` | one prompt → whole film | `FilmStudio` (Auto tab) |
| `storyboard` | scene-by-scene authoring | `StoryboardStudio` |

More entry points are surfaced in the **Create** hub (`/create`) and resolve
into one of the modes above by pre-filling the scene plan.

## Creation entry points (`/create`)

A project can begin from any asset, not just a prompt. Each path lands in the
Create Film workspace at a specific mode rail tab (`?mode=`), or in the library
/ series builder. Source: `apps/web/lib/creation.ts`.

| Entry point | Status | Lands in |
|---|---|---|
| Prompt → Film | live | mode rail · Prompt (one-prompt Auto) |
| Script → Film | live | mode rail · Script → parsed scenes → Storyboard |
| Scene-by-Scene | live | mode rail · Storyboard |
| Image → Video | live | mode rail · Image (image-to-video per shot) |
| Storyboard → Film (upload boards) | beta | mode rail · Image |
| Audio → Film | beta | mode rail · Audio → scene plan → Storyboard |
| Video → Video | beta | mode rail · Video → scaffolded scenes |
| Character-First | soon | Library · Characters |
| World-First | soon | Library · Worlds |
| Episode-First | live | Create Series |

The **Script** path parses sluglines (`INT.`/`EXT.`) — or paragraphs as a
fallback — into editable scenes. **Image**, **Audio** and **Video** scaffold an
initial scene plan and drop into the same scene workbench, so every entry point
shares one editing/regeneration surface and one schema.

## Storyboard mode

The professional path. Each scene is an independent unit of work:

- **Write** the script/action per scene (editable `scenes.heading` + `summary`).
- **Choose a source per shot** — `text` (text-to-video) or `image`
  (image-to-video), stored on `shots.source`.
- **Seed frame** for image-to-video (`shots.seed_image_key`): upload your own
  (real upload to `cineforge-assets/projects/{id}/seeds/…`), AI-generate
  (labeled stub until an image adapter is wired), or reference a saved
  character/world.
- **Generate one scene at a time** and **regenerate a single scene** without
  touching the rest — granular, cheap, job-per-artifact. Per-scene status
  streams back over Supabase Realtime (`scenes` table).
- **Assemble** once every scene is `READY` → writes the `films` row.

This is the same job-per-artifact philosophy as an async render farm, but on our
own Wan/Hunyuan pipeline (no Runway) and persisted in our own schema instead of
a parallel `pipeline_jobs` table.

## Worker boundary

The browser only ever writes intent (project/scene/shot rows, seed uploads).
Status transitions shown here are driven by a worker stand-in that writes back
to Supabase; in production `apps/worker` performs those same writes with the
service-role key after running the Director, the GPU job (text-to-video or
image-to-video) and QC. See `docs/25-supabase.md`.
