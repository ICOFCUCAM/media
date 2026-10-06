# Cineforge design references

Static HTML designs for every Cineforge surface. They are **visual specs, not
the application**: each one was re-implemented in the existing Next.js app on
the shared design system (`apps/web/components/cf`, tokens in
`apps/web/app/globals.css`), wired to the existing engines. Demo content in
these files was used only to understand the interface; the app renders real
data, and where a backend does not exist yet the UI says so instead of
pretending.

Room: **paper** = `.cf-light`, **dark** = `.cf-dark` (chosen per route in
`components/cf/nav.ts`).

| Design | Route | Engine it dresses | Room | Notes |
|---|---|---|---|---|
| `homepage.html` | `/` | `app/page.tsx`, `app/home.css` | institution black | Live showreel, real products, plans |
| `create-anything.html` | `/create` | `PROJECT_TYPES`, `CREATION_MODES` → `components/cf/CreateGate.tsx` | paper | Resolves (type, material) to the real studio route |
| `create-film.html` (`-v1` = earlier draft) | `/create/film?mode=…` | `FilmStudio` → `CreateStudio`, `HybridStudio`, `ScriptStudio`, `StoryboardStudio`, `ImageStudio`, `AudioStudio`, `VideoStudio`; `useCreateRun`, `RunPanel` | paper | `?mode=` read and written; `?type=` labels doc / music productions |
| `storyboard.html` | `/create/film?mode=storyboard` | `StoryboardStudio` (Supabase persistence, Realtime scene status, Continuity Engine) | dark board in paper room | Scenes and assembly run on the worker queues; AI seed painted at render |
| `create-series.html`, `writers-room-series.html` | `/create/series` | `SeriesStudio` | paper | Premise, seasons, episodes, outline → `useCreateRun` |
| `create-trailer.html` | `/create/trailer` | `TrailerStudio` | paper | Demo beat timings not reproduced |
| `create-shorts.html`, `short-form-studio.html` | `/create/shorts` | `ShortsStudio` (`SHORT_PLATFORMS`) | paper | |
| `create-advert.html`, `commercial-studio.html` | `/create/advert` | `CreateStudio` + `AD_PRESETS` | paper | |
| `production-archive.html` (`-v1` = earlier draft) | `/projects` | `listProjects` + Realtime board | paper | Filters use real fields (state, mode) |
| `cutting-room.html` | `/projects/[id]` | `SupabaseRun` attach mode + `RunPanel` | dark | |
| `casting-room-characters.html` | `/library/characters` | `CharacterLibrary` | dark | |
| `production-design-worlds.html` | `/library/worlds` | `WorldLibrary` | dark | |
| `asset-archive.html` | `/library/assets` | `AssetLibrary` + `GeneratedMedia` | dark | |
| `voice-room.html` | `/library/voices` | `VoiceLab` | paper | |
| `score-room-music.html` | `/library/music` | `MusicLibrary` | paper | Narration + the film score (fal text-to-music) |
| `distribution-desk-publish.html` | `/publish` | `SocialLaunchpad` | paper | |
| `screening-room.html` | `/publish/streaming` | `StreamingChannel` | paper + dark stage | Channel modal / access toggles have no backend — not reproduced |
| `exchange-marketplace.html` | `/marketplace` | `MarketplaceVoices` | paper | Only community voices trade today; paid catalogues marked not open |
| `access-pricing.html` | `/pricing` | `PricingPage` (Stripe checkout edge function) | paper | |
| `analytics-revenue.html`, `-audience`, `-performance` | `/analytics/[section]` | `AnalyticsSection` + `Charts` | paper | |
| `enterprise-teams.html` | `/enterprise/teams` | `TeamsPage` + `team-invite` edge function | paper | Invites emailed via Supabase Auth |
| `enterprise-permissions.html` | `/enterprise/permissions` | `PermissionsPage` | paper | |
| `enterprise-brand.html` | `/enterprise/brand` | `BrandPage` | paper | Preview mirrors the rendered end card |
| `view-creator.html` | `/view/creator` | `CreatorView` (RoleContext) | paper | New route — the VIEW family |
| `view-studio.html` | `/view/studio` | `StudioView` | paper | |
| `view-super-admin.html` | `/view/super` | `SuperView` (`admin_list_users`, `SUBSYSTEMS`) | paper | Admin-only data; no invented platform figures |
| — | `/admin`, `/admin/users`, `/admin/moderation`, `/admin/credits` | existing admin components | paper | Restyled to the Super context |

Original upload names: homepage = `preview(12)`, then `preview(14)`–`preview(44)`
in the order create-film-v1, storyboard, writers-room, casting-room,
cutting-room, short-form, commercial, archive-v1, worlds, assets, voice,
score, distribution, exchange, access, revenue, audience, performance,
teams, permissions, brand, creator/studio/super views, create-anything,
create-film, series, trailer, shorts, advert, production-archive.
