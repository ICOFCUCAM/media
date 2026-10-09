# 65 — World and time: the full Film Bible, story clock, weather and sun, the shot record and shot end states (DirectorOS W20)

**Status:** implemented in code (2026-10-09). No migration.
Contract: [world-and-time.md](directoros/contracts/world-and-time.md).
Requirements: Part 1 §3, §6, §10, §32.3, §33 and §36.2.
It builds on W2 (the Film IR), W3 (world state and continuity), W4 (compilers)
and W6 (end frames).

## 1. The Film Bible (§3)

The bible in the Film IR gains the fields the requirements list:

- premise;
- audience;
- rating;
- era;
- geography;
- narrative structure.

They sit beside the existing fields: title, logline, synopsis, genre, tone,
themes, visual style and audio style. The bible is still the one source every
stage reads, versioned by canon revisions (W3).

## 2. Time and weather (§33, §32.3, §6.1)

**What a scene can state:**

- `storyTime.clock`: a 24-hour time, such as 14:00, when the hour matters.
- `weather`: for example heavy rain, clear or fog, when it shows on screen.

**What the World State Engine derives:**

- **The sun:** taken from the clock, as night, dawn, morning, midday,
  afternoon, golden hour or dusk. Without a clock it comes from the time of
  day.
- **Weather in force:** a scene that states none inherits the weather of an
  earlier scene on the same story day. Weather never carries into another day
  or into a flashback.

**What the validators refuse:** each of these sends the plan back for
revision, like any other canon issue.

| Code | When |
|---|---|
| `CLOCK_OUTSIDE_TIME_OF_DAY` | the clock is not the scene's time of day (an hour of grace on each side) |
| `TIME_REGRESSION` | the clock runs backwards within a story day, outside a flashback |
| `CONTINUOUS_TIME_JUMP` | continuous action picks up more than an hour later, or earlier |
| `WEATHER_CHANGE_IN_CONTINUOUS_ACTION` | continuous action changes its weather |

**Where they are used:**

- Shot prompts mention the weather, and the light of the sun when it differs
  from the time of day.
- The canonical request carries `clock`, `sun` and `weather`.
- The Visual Reviewer is told the clock and the weather.

## 3. The shot record (§10)

A shot may also state:

- its **composition**;
- its **depth of field** (shallow, medium or deep);
- its **focus**, or a rack focus.

These fields reach the model prompts and the canonical request.
`shots.camera_plan` now stores the full record: size, angle, movement, lens,
transition, subjects, composition, depth of field, focus, emotion and
lighting.

## 4. Where the previous shot ended (§36.2)

The end frame (W6) shows where a shot ended as a picture. W20 also records it
as data, a **shot end state** with three parts:

- who is in frame, with their wardrobe, what they hold, any visible state and
  their emotion;
- where the camera ended: size, angle, movement, side of the action line and
  screen direction;
- the light: time of day, clock, sun, weather and lighting.

**Where it goes:**

- **The next shot's request:** it carries the previous end state as
  `continuity.continuesFrom`. For a scene's first shot, that is the last shot
  of the scene it continues; after a time cut, there is none.
- **Every generated clip:** it records its own end state in its media
  version.

`continuesFrom` is outside the canonical hash. A change to another shot must
never invalidate this one: canon precision from W3 is kept.

## 5. Compatibility

Every new field is optional:

- Plans made before W20 stay valid.
- Their requests and prompts compile exactly as before, with the same hashes,
  so nothing regenerates.
- The Director's prompts ask for the new fields: `director.master` v7 and
  `director.revision` v6, with the prompt lock refreshed.

## 6. What is still open

- **Live action:** a structured character position within the frame. Today
  presence, side and screen direction are recorded.
- **Characters' goals** in film state (§92.1).

## 7. Owner steps

Deploy the worker. New plans include the new fields; existing films are
unaffected.
