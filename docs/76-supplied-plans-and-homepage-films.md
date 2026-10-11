# 76: Plans written outside the Director, and homepage films (W31)

## Why

The AI Director (the master planning call) needs a working Anthropic or
OpenAI key with credit. When it is unavailable, films could not be made at
all, even though everything after planning (stills, video, voice, music,
render) does not need it. W31 lets a complete plan be supplied instead, and
lets films made for the homepage be reviewed before they replace a
placeholder.

## Supplied plans (`projects.supplied_plan`, migration 0064)

- A project may carry a complete Film IR package (`FilmPackage`,
  `packages/movie/src/ir/schema.ts`) in `supplied_plan`, and its author in
  `supplied_plan_by`.
- When the worker plans that project it does **not** call the Director. It
  runs the package through the same validator chain a Director plan passes
  (schema, references, story, canon, production, budget;
  `apps/worker/src/director/supplied.ts`).
- There is no revision call and nothing is repaired or invented: an invalid
  package fails the film as `DIRECTOR_OUTPUT_INVALID` with its issues.
- Everything else is unchanged: moderation, the tier length cap, credits,
  the persisted screenplay/scenes/shots, the decision log (provider
  `supplied`, model = the author), the gate chain and the whole media
  pipeline. The Cinematographer's coverage pass is skipped: it is an LLM call
  and the supplied plan's author is its cinematographer.

## Homepage films (`projects.showcase_slot`, `showcase.slot`)

- A film can be made for a homepage frame: `hero` or `work-1` … `work-6` (the
  six showreel frames). Only an admin (or the service role) can set it; a
  database trigger refuses anyone else.
- When it is finished, it waits on **/admin/showcase** ("Homepage films" in
  the admin view) next to what that frame shows now.
  - **Replace** copies the film to the public bucket and makes it the frame's
    film; the film that filled the frame before leaves the showcase.
  - **Dismiss** keeps it as a normal project.
- The homepage shows, per frame: the film featured for it, else a film
  featured without a frame (as before, newest first), else the placeholder.
  The hero shows the film featured for it, else the newest unframed film.

## Operating it

Insert the project (owner = an admin account with credits), with
`status = 'PLANNING'`, `mode = 'auto'`, `supplied_plan`, `supplied_plan_by`
and, for the homepage, `showcase_slot`. The worker's poller picks it up like
any other film.
