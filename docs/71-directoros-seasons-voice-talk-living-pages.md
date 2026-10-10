# DirectorOS W26 — further seasons, one voice screen, talking with an avatar, living pages

## Further seasons (DOS-178.2)

A show made episode by episode can now run past Season 1.
- **Data:** each episode has a `season_number` (migration 0058; null means
  season 1). Episode numbers run on across seasons, so the order is unchanged.
  The database refuses a later episode in an earlier season, and an earlier
  episode in a later one.
- **Show page:** "Start season N+1 with this episode" opens the next season.
  Episodes are labelled "Season S · Episode N", and the show lists what each
  season covered.
- **Director:** the Director is told the season. A season premiere may begin a
  new chapter (time passed, new characters), but everything from earlier
  seasons stays canon. The PREVIOUSLY section names each earlier episode's
  season.

## One voice screen (DOS-176.1)

At the top of Voice Studio is the simple screen from Part 4 §176: Voice,
Language, Style (Cinematic, Narrator, Presenter), Emotion (Natural,
Authoritative, Calm, Warm, Excited, Sad, Angry), Speed, the text, and
**Generate voice**. It writes the same reading row as the full Studio below
it, so everything underneath (Voice API, router, engines, cache, mastering) is
unchanged.

## Talking with an avatar (DOS-111.3, 117.4)

A live conversation runs through the pipeline CineForge already has:

1. **Your line:** typed, or recorded in the browser.
2. **Speech recognition:** a recorded line is heard by a hosted model on fal
   (`FAL_TRANSCRIBE_MODEL`, default Whisper).
3. **Reply:** a role call writes the avatar's answer in its persona
   (`avatar.talk`, task `conversation`). It gets the last 12 lines only, and
   the answer is kept short enough to say in under about 40 seconds.
4. **Voice:** the reply becomes a Voice Studio reading in the avatar's voice.
   A cloned voice works, with consent and licence rules as before.
5. **Video:** with a portrait, the reading becomes a talking-avatar video.
   Without one, the avatar only speaks.

Each step is claimed by the poller. A failure stops that turn and shows its
reason; the conversation goes on.
- **Tables:** `avatar_conversations` and `avatar_turns` (migration 0059). A
  client may add only its own pending line, in its own conversation; the worker
  writes everything else.
- **Storage fix:** migration 0059 also adds owner-folder storage policies
  (`voices/`, `avatars/`, `voiceovers/`, `talk/` + the owner's id). Without
  them the web could not upload voice samples or portraits, nor play back
  readings and avatar videos.

## Living pages (DOS-181.4, 181.5)

Storybook pages and motion-comic panels are moved by the camera, as before:
cheap, no GPU. `STILL_MOTION_ANIMATE` adds character animation inside the page:

| setting | effect |
|---|---|
| `off` (default) | camera moves only |
| `characters` | pages that frame a character go to the production's video model from the drawn page itself (image-to-video) |
| `all` | every page does |

An animated page's prompt keeps the drawing (lines, colours, composition) and
moves the characters: breathing, blinking, gestures, the action of the moment.
It runs only while the film's budget has room for a full shot. It falls back
to the camera move, recorded as `CHARACTER_ANIMATION_SKIPPED`, when the budget
has no room or the model fails.
