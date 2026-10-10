-- Cineforge — schema part 55: resume a paused production (W23; docs/24 §C8).
--
--  projects.resume_requested_at  the owner pressed Resume on a film the budget
--                                governor paused. The worker claims it (clears
--                                it), re-estimates the budget from the shots
--                                already made and re-enqueues the film; the
--                                owner's update policy already covers the row.

alter table public.projects
  add column if not exists resume_requested_at timestamptz;
