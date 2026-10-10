# DirectorOS W25 — multi-department scene revisions, speech placed on the timeline

## "Make scene 7 darker and more disturbing" (DOS-45.1, 45.2)

The director chat used to apply a single canon change: wardrobe, looks,
visible state, a location or a prop. Requests about tone were answered but not
carried out. W25 adds one more change kind, `scene_revision`, which revises
one scene across departments in the order Part 1 §45 gives:

1. **Tone:** the scene's emotional arc (start, middle, end).
2. **Cinematography:** any shot's size, angle, movement, lens, composition,
   depth of field or emotion, by shot index.
3. **Lighting:** one line for every shot, or one per shot.
4. **Music:** the scene's cue, or `null` for silence; and the ambience bed.
5. **Dialogue:** a line's new words and/or delivery, by line index. Only when
   the words themselves must change, and with the same speaker and meaning.

Who is in the scene and what happens there stay the same. The change goes
through the same canon revision path as every other change:
- It is re-validated, including canon knowledge and film grammar.
- It is refused if it touches a locked scene or film.
- The compiler names the shots whose generation changed, and only those
  regenerate.

The sound departments know what to make again (`CanonRevision.audio`):

| change | what is made again |
|---|---|
| changed lines | the scene's lines are rewritten and its voice track is dropped, so the resume voices it again |
| a changed cue or mood | the film's score is dropped and composed again |
| a changed ambience | that scene's bed is drawn again |

The director chat prompt is `director.edit` v3. Migration 0057 lets
`edit_requests` hold `scene_revision` changes, up to 12,000 characters.

## Speech placed on the timeline; ducking from it (DOS-40.3)

The voice bed used to be every scene's narration joined back to back, so a film
whose only narration was in scene 3 heard it at 0:00. Now the render builds the
film's speech timeline from the measured cut (`planVoicePlacement`):

- **Placement:** each scene's voice starts where its scene starts.
- **Padding:** a short voice leaves a pause until the next scene.
- **Extension:** a long one runs on, and the next scene's voice waits for it.
  Speech is never cut and never overlaps. Narration that runs past the
  picture is judged by the narration fit as before (fail by default).
- **Ducking:** music and ambience dip exactly where speech is placed (music
  −12 dB, ambience −8 dB, 0.25 s ramps). The dip is volume automation driven
  by the placements, not a compressor listening to the voice.
- **Fades:** the score fades in and out (1.5 s); ambience beds fade at their
  scene's edges.

Tested with real ffmpeg: narration on scene 2 alone starts at scene 2, and the
music under it is more than 8 dB lower than the music around it.
`RENDER_VOICE_PLACEMENT=concat` restores the old back-to-back bed.
