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

## Creation modes (mode rail)

Create Film now exposes the modes as a rail (read from `?mode=`):

- **Auto** — one prompt → whole film.
- **Hybrid** — auto-drafts the screenplay/scene plan, then opens the Storyboard
  editor so the creator refines each scene before rendering.
- **Scene-by-Scene** (Storyboard), **Script**, **Image**, **Audio**, **Video**.

Hybrid is the bridge between beginner and pro: it never forces a single image
source and lands every project in the same editable Storyboard.

## The scene as a production object

Each scene card is a complete production object, not just an image-to-video
request. Per scene the creator can mix:

| Field | Storage |
|---|---|
| Scene prompt | `scenes.summary` / `shots.prompt` |
| Character (Library) | `scenes.character_ref` |
| World (Library) | `scenes.world_ref` |
| Source (text / image) + seed frame | `shots.source`, `shots.seed_image_key` (upload / AI-generate / reference) |
| Reference video (motion style) | `shots.reference_video_key` |
| Camera type | `shots.camera_type` (Wide/Medium/Close-Up/POV/Drone/Tracking/Crane/Handheld) |
| Camera movement | `shots.camera_movement` (Static/Dolly/Orbit/Push-In/Pull-Out) |
| Dialogue / Narration | `scenes.dialogue` / `scenes.narration` |
| Music style | `scenes.music` |
| Location / Mood | `scenes.location_note` / `scenes.mood` |
| Duration | 5 / 10 / 15 / 30 / 60s |

Schema: migration `0008_scene_production_object.sql` adds
`scenes.character_ref/world_ref` and
`shots.camera_type/camera_movement/reference_video_key`. The three seed sources
(upload my own / AI-generate / reference a character or world) are all
supported; uploads (image and reference video) go to `cineforge-assets` and
persist on first generate, exactly like the seed frame.

## Scene Workbench (per-scene depth)

Each scene card expands into a full editable object. Beyond the action/script
(`scenes.summary`), every scene carries **dialogue**, **narration**, **camera**,
**location**, **mood** and **music** (`scenes.dialogue/narration/camera/
location_note/mood/music`), plus its per-shot **source** + **seed frame**. A
creator can regenerate one scene — or one shot — without touching the rest, so
control is granular and re-render cost is low. Fields are saved on blur and
persisted with the scene row.

## Visual Asset Studio (reusable assets)

Beyond characters and worlds, the Library holds **props, vehicles, creatures,
logos and brands** (`/library/assets`), persisted to `world_objects` with a
`category`. Like characters/worlds they live in the per-user `library` project
and are reusable across every project. Source: `apps/web/lib/library.ts`
(`createAsset` / `listAssets`, `ASSET_CATEGORIES`).

## Asset reuse (Characters & Worlds)

Characters and worlds are first-class, reusable assets, created in the Library
(`/library/characters`, `/library/worlds`) and persisted to the existing
`characters` / `locations` tables. Because those tables require a `project_id`,
reusable assets are parented to a per-user **sentinel project** (`projects.mode
= 'library'`, hidden from the Projects list). RLS scopes every read to the
owner, so the Library lists the user's whole catalog across projects — true
reuse — and a scene in any project can reference an asset by id (both
`owns_character` and `owns_scene` pass for the owner). The storyboard's
**Reference** picker reads this catalog (`listAnchors`) so seed frames can be
anchored to a saved character or world. Source: `apps/web/lib/library.ts`.

The **Character-First** and **World-First** entry points (`/create`) are these
Library creators; once you've made an asset, "Use in a film" drops into the
scene workbench.

## Worker boundary

The browser only ever writes intent (project/scene/shot rows, seed uploads).
Status transitions shown here are driven by a worker stand-in that writes back
to Supabase; in production `apps/worker` performs those same writes with the
service-role key after running the Director, the GPU job (text-to-video or
image-to-video) and QC. See `docs/25-supabase.md`.
