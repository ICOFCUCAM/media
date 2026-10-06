-- Cineforge — schema part 18: the Agency tier, between Studio and Enterprise.
-- Applied live as "tier_agency".
alter type public.tier add value if not exists 'AGENCY' after 'STUDIO';
