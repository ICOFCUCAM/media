-- Cineforge — schema part 53: pin the search_path of 0052's trigger functions
-- (the Supabase advisor's function_search_path_mutable; DirectorOS W17).
alter function public.image_generations_append_only() set search_path = public;
alter function public.world_references_append_only() set search_path = public;
