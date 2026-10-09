-- Cineforge — schema part 51: tighten 0050's function grants (DirectorOS W15).
--
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- directly, so 0050's "revoke … from public" left them callable over RPC.
--   accept_voice_terms / revoke_voice_licence   signed-in users only
--   voice_usable_by                             internal: it would let anyone probe
--                                               another user's licences
--   voiceovers_voice_guard                      a trigger, never called directly

revoke execute on function public.accept_voice_terms(uuid), public.revoke_voice_licence(uuid) from anon;
revoke execute on function public.voice_usable_by(uuid, uuid) from anon, authenticated;
revoke execute on function public.voiceovers_voice_guard() from public, anon, authenticated;
