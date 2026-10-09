-- Cineforge — schema part 49: the speech cache and the voice benchmark
-- (DirectorOS W14; Part 4 §136, §154).
--
--  speech_cache     one row per sentence ever generated: the same text, in the
--                   same voice, from the same engine version, language and
--                   style, is served from storage — no GPU time, no provider
--                   charge. Written and read by the worker only. A cloned
--                   voice's rows keep its id; when the voice is deleted the id
--                   is cleared and the worker deletes those clips (a deleted
--                   voice's speech never lingers).
--  benchmark_runs   gains the 'voice' suite (the voice benchmark, §136).

create table public.speech_cache (
  key             text primary key check (key ~ '^[0-9a-f]{64}$'),
  engine_id       text not null check (length(engine_id) between 1 and 64),
  engine_version  text not null check (length(engine_version) between 1 and 64),
  voice_id        uuid references public.voices (id) on delete set null,
  cloned          boolean not null,
  language        text not null check (length(language) between 2 and 16),
  chars           int not null check (chars > 0),
  storage_key     text not null unique check (storage_key like 'audio_cache/%'),
  format          text not null check (format in ('mp3', 'wav')),
  bytes           bigint check (bytes is null or bytes >= 0),
  hits            int not null default 0 check (hits >= 0),
  created_at      timestamptz not null default now(),
  last_hit_at     timestamptz,
  -- A built-in voice never names a CineForge voice.
  constraint speech_cache_stock_has_no_voice check (cloned or voice_id is null)
);
create index speech_cache_voice_idx on public.speech_cache (voice_id);
create index speech_cache_orphans_idx on public.speech_cache (created_at) where cloned and voice_id is null;

alter table public.speech_cache enable row level security;
revoke all on public.speech_cache from anon, authenticated;

alter table public.benchmark_runs drop constraint if exists benchmark_runs_suite_check;
alter table public.benchmark_runs add constraint benchmark_runs_suite_check
  check (suite in ('offline', 'live_planning', 'providers', 'sync_calibration', 'voice'));
