#!/usr/bin/env node
/**
 * Truth gate (DirectorOS W1 — DOS-72, DOS-73, DOS-74). Fails CI when:
 *
 *  1. Production source carries a TODO / FIXME / XXX / HACK marker. Hidden
 *     unfinished work is not allowed to ship (DOS-72): finish it, or record it
 *     as a not-built requirement in docs/directoros/requirements-index.md.
 *  2. A subsystem in apps/web/lib/system.ts claims VALIDATED or
 *     PRODUCTION_READY without `evidence` naming acceptance tests that exist
 *     (DOS-73: never self-certify).
 *  3. Code enables a substitute (stub plan, placeholder media) through an env
 *     flag that is not one of the reviewed, default-off flags below (DOS-74/75).
 *
 * Usage: node scripts/check-truth.mjs [repoRoot]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? process.cwd();
const SOURCE_DIRS = [
  "apps/worker/src", "apps/api/src", "apps/gpu-worker/app",
  "apps/web/app", "apps/web/components", "apps/web/lib",
  "packages/shared/src", "packages/model-adapters/src", "packages/gpu/src", "packages/realtime/src", "packages/db/src",
  "packages/movie/src",
];
const EXT = /\.(ts|tsx|mjs|js|py)$/;
const TEST = /(\.test\.|\.spec\.|\/tests?\/|\/e2e\/|__pycache__)/;
// The only switches that may turn on a substitute. Each defaults to off and is
// documented in docs/44-truth-layer.md. Adding one is a reviewed change here.
const SUBSTITUTE_FLAGS = new Set(["DIRECTOR_ALLOW_STUB", "ALLOW_PLACEHOLDER_MEDIA", "CINEFORGE_PLACEHOLDER"]);

const problems = [];
const files = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(name) && !TEST.test(p)) files.push(p);
  }
};
for (const d of SOURCE_DIRS) walk(join(root, d));

for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const where = `${relative(root, f)}:${i + 1}`;
    if (/(\/\/|#|\/\*|\*)\s*(TODO|FIXME|XXX|HACK)\b/.test(line)) problems.push(`${where}  hidden unfinished work: ${line.trim()}`);
    for (const m of line.matchAll(/(?:process\.env\.|process\.env\[\s*["']|os\.environ(?:\.get)?[(\[]\s*["'])([A-Z][A-Z0-9_]*)/g)) {
      const name = m[1];
      if (/STUB|PLACEHOLDER|FAKE|MOCK|DUMMY/.test(name) && !SUBSTITUTE_FLAGS.has(name)) {
        problems.push(`${where}  unreviewed substitute switch ${name}`);
      }
    }
  });
}

// Reality Gate: VALIDATED / PRODUCTION_READY need acceptance evidence on disk.
const systemTs = join(root, "apps/web/lib/system.ts");
if (existsSync(systemTs)) {
  const src = readFileSync(systemTs, "utf8");
  for (const m of src.matchAll(/\{\s*name:\s*"([^"]+)",\s*maturity:\s*"(VALIDATED|PRODUCTION_READY)"([^}]*)\}/g)) {
    const ev = /evidence:\s*\[([^\]]*)\]/.exec(m[3]);
    const paths = ev ? [...ev[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
    if (!paths.length) problems.push(`apps/web/lib/system.ts  "${m[1]}" claims ${m[2]} without evidence`);
    for (const p of paths) if (!existsSync(join(root, p))) problems.push(`apps/web/lib/system.ts  "${m[1]}" evidence missing: ${p}`);
  }
}

if (problems.length) {
  console.error(`Truth gate: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Truth gate: ${files.length} source files clean (no hidden TODOs, no unreviewed substitutes, no unproven maturity claims).`);
