# 37 — Homepage frames and motion

The homepage's architecture, typography and black/cream language are fixed.
This pass makes it feel like a living film-production world: real
cinematic frames where they matter, and restrained motion everywhere.

## Real frames (`public/frames/`)

Each image slot uses a real still when its file exists and its drawn
illustration otherwise (`apps/web/lib/frames.ts`, read at build/render time):

| Slot | Section | Fallback |
| --- | --- | --- |
| `hero` | Hero master shot; also reframed in Release | `MasterShot` |
| `world` | 01 World (the atlas stays as an inset map) | `WorldAtlas` |
| `story` | 03 Story (slate + subtitle overlaid) | `StoryCloseUp` |
| `voice` | 06 Voice presenter card | drawn presenter |
| `work-1` … `work-6` | 04 The Work example tiles | `CinemaArt` |

Generate them with CineForge's own image engine (gpt-image-1, as the
worker uses for seed frames). Run this, review, commit the ones you keep,
then redeploy:

    OPENAI_API_KEY=sk-... node apps/web/scripts/generate-frames.mjs        # missing slots
    OPENAI_API_KEY=sk-... node apps/web/scripts/generate-frames.mjs hero   # regenerate one

Featured showcase films still take precedence in the hero and The Work.

## Motion

All motion is CSS (plus two small timers). Every animation is off under
`prefers-reduced-motion`.

- **Hero:** a slow push-in on the master shot. The sun breathes, cloud
  drifts, sky craft cross, dust rises, the spire's light flickers, its ring
  turns and the banner moves in the wind. Film grain and an occasional
  light sweep run over the frame. Storyboard boards push in once drawn.
- **Headlines:** reveal like title cards as they scroll in.
- **Chapter frames:** a slow push-in while on screen.
- **Production:** the playhead scrubs the timeline. The active clip
  advances and the viewer cross-fades to its scene with its own slate
  (`WorkspacePreview`).
- **Release:** a lime crop frame reframes the 16:9 master to 9:16 on the
  queen, then opens back up. The 1:1 and 9:16 cut-downs land in sequence.
- **Voice:** the waveform pulses and each language's line arrives.
- **The Work and Marketplace:** frames push in on hover, and marketplace
  cards lift.
