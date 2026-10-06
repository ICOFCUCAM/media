# Cineforge design references

Static HTML designs for the redesign of every Cineforge surface. Each file
is the visual spec for one page. The containers, type and spacing are
followed exactly; the page's real data and handlers come from the existing
components listed below.

| Design | App route | Component(s) it restyles | Status |
|---|---|---|---|
| `homepage.html` | `/` | `app/page.tsx`, `app/home.css` | **Implemented** |
| `create-anything.html` | `/create` | `CreateStudio.tsx` | Pending |
| `create-film.html` (`create-film-v1.html` = earlier draft) | `/create/film` | `FilmStudio.tsx` | Pending |
| `create-series.html` | `/create/series` | `SeriesStudio.tsx` | Pending |
| `writers-room-series.html` | `/create/series` (writing step) | `SeriesStudio.tsx` | Pending |
| `create-trailer.html` | `/create/trailer` | `TrailerStudio.tsx` | Pending |
| `create-shorts.html` | `/create/shorts` | `ShortsStudio.tsx` | Pending |
| `short-form-studio.html` | `/create/shorts` (studio step) | `ShortsStudio.tsx` | Pending |
| `create-advert.html` | `/create/advert` | `app/(app)/create/advert/page.tsx` | Pending |
| `commercial-studio.html` | `/create/advert` (studio step) | `app/(app)/create/advert/page.tsx` | Pending |
| `storyboard.html` | storyboard mode inside create | `StoryboardStudio.tsx` | Pending |
| `cutting-room.html` | `/projects/[id]` (edit) | `app/(app)/projects/[id]/page.tsx` | Pending |
| `production-archive.html` (`production-archive-v1.html` = earlier draft) | `/projects` | `app/(app)/projects/page.tsx` | Pending |
| `casting-room-characters.html` | `/library/characters` | `CharacterLibrary.tsx` | Pending |
| `production-design-worlds.html` | `/library/worlds` | `WorldLibrary.tsx` | Pending |
| `asset-archive.html` | `/library/assets` | `AssetLibrary.tsx` | Pending |
| `voice-room.html` | `/library/voices` | `VoiceLab.tsx` | Pending |
| `score-room-music.html` | `/library/music` | `MusicLibrary.tsx` | Pending |
| `distribution-desk-publish.html` | `/publish` | `SocialLaunchpad.tsx` | Pending |
| `screening-room.html` | `/publish/streaming` | `StreamingChannel.tsx` | Pending |
| `exchange-marketplace.html` | `/marketplace` | `MarketplaceVoices.tsx` | Pending |
| `access-pricing.html` | `/pricing` | `PricingPage.tsx` | Pending |
| `analytics-revenue.html` | `/analytics/revenue` | `analytics/AnalyticsSection.tsx` | Pending |
| `analytics-audience.html` | `/analytics/audience` | `analytics/AnalyticsSection.tsx` | Pending |
| `analytics-performance.html` | `/analytics/performance` | `analytics/AnalyticsSection.tsx` | Pending |
| `enterprise-teams.html` | `/enterprise/teams` | `enterprise/TeamsPage.tsx` | Pending |
| `enterprise-permissions.html` | `/enterprise/permissions` | `enterprise/PermissionsPage.tsx` | Pending |
| `enterprise-brand.html` | `/enterprise/brand` | `enterprise/BrandPage.tsx` | Pending |
| `view-creator.html` | app shell, role = Creator | `Sidebar.tsx`, `RoleContext.tsx`, `(app)/layout.tsx` | Pending |
| `view-studio.html` | app shell, role = Studio Owner | `Sidebar.tsx`, `RoleContext.tsx` | Pending |
| `view-super-admin.html` | app shell, role = Super Admin | `Sidebar.tsx`, `RoleContext.tsx`, `/admin` | Pending |

Original upload names: homepage = `preview(12)`, then `preview(14)`–`preview(44)`
in the order create-film-v1, storyboard, writers-room, casting-room,
cutting-room, short-form, commercial, archive-v1, worlds, assets, voice,
score, distribution, exchange, access, revenue, audience, performance,
teams, permissions, brand, creator/studio/super views, create-anything,
create-film, series, trailer, shorts, advert, production-archive.
