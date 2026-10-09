#!/usr/bin/env bash
# Fail if the Prisma models for the Phase 4 tables disagree with the SQL
# migrations (column names, types, nullability, indexes) — docs/38 §AU.16.
#
# Usage: DATABASE_URL=<postgres migrated with stubs + 0026..0051> scripts/check-prisma-vs-migrations.sh
#
# The only accepted differences are the intended ones: the Prisma models carry
# scalar foreign keys (no @relation) and generate uuids client-side.
set -euo pipefail
cd "$(dirname "$0")/.."
TABLES='production_timelines|timeline_events|media_versions|video_generations|audio_generations|audio_events|sync_policies|av_sync_reports|av_sync_issues|repair_jobs|production_degradations|system_capabilities|ai_decisions|canon_revisions|wardrobe_references|quality_gate_results|voice_engine_artifacts|voice_jobs|edit_requests|shot_dependencies|scene_versions|director_messages|benchmark_runs|acceptance_runs|stripe_events|project_cast|show_bibles|editorial_reviews|edit_proposals|speech_cache|voice_licences'
diff_sql="$(pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script)"
# Parse whole statements (Prisma splits one ALTER TABLE over several lines) and
# drop only the accepted clauses; anything left on a Phase 4 table is drift.
drift="$(printf '%s\n' "$diff_sql" | TABLES="$TABLES" python3 -c '
import os, re, sys
tables = os.environ["TABLES"].split("|")
sql = "\n".join(l for l in sys.stdin.read().splitlines() if not l.startswith("--"))
for stmt in (s.strip() for s in sql.split(";")):
    m = re.match(r"(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX \"[^\"]+\" ON|DROP INDEX|CREATE TABLE|DROP TABLE)\s+\"([a-z_]+)\"", stmt)
    if not m or m.group(1) not in tables:
        if any(f"\"{t}\"" in stmt for t in tables):
            print(stmt)
        continue
    if stmt.startswith("ALTER TABLE"):
        body = stmt.split(None, 3)[3]
        clauses = [c.strip() for c in re.split(r",\s*\n", body)]
        rest = [c for c in clauses if not re.fullmatch(r"DROP CONSTRAINT \"[a-z_]+_fkey\"|ALTER COLUMN \"id\" DROP DEFAULT", c)]
        if rest:
            print(m.group(1) + ": " + "; ".join(rest))
    else:
        print(stmt)
')"
if [ -n "$drift" ]; then
  echo "Prisma models and migrations disagree on Phase 4 tables:"
  printf '%s\n' "$drift"
  exit 1
fi
echo "Prisma models match migrations 0028–0051."
