// node --test scripts/ — proves the truth gate catches what it claims to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const gate = new URL("./check-truth.mjs", import.meta.url).pathname;

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "truth-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return spawnSync(process.execPath, [gate, root], { encoding: "utf8" });
}

test("clean source passes", () => {
  const r = repo({ "apps/worker/src/a.ts": "export const a = 1;\n" });
  assert.equal(r.status, 0, r.stderr);
});

test("a hidden TODO fails", () => {
  const r = repo({ "apps/worker/src/a.ts": "// TODO: real QC later\nexport const a = 1;\n" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /hidden unfinished work/);
});

test("TODOs in tests are allowed", () => {
  const r = repo({ "apps/worker/src/a.test.ts": "// TODO: more cases\n" });
  assert.equal(r.status, 0, r.stderr);
});

test("an unreviewed substitute switch fails; reviewed ones pass", () => {
  const bad = repo({ "packages/shared/src/x.ts": "if (process.env.ALLOW_FAKE_AUDIO) {}\n" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unreviewed substitute switch ALLOW_FAKE_AUDIO/);
  const ok = repo({ "packages/shared/src/x.ts": "if (process.env.DIRECTOR_ALLOW_STUB === '1') {}\n" });
  assert.equal(ok.status, 0, ok.stderr);
  const py = repo({ "apps/gpu-worker/app/p.py": "X = os.environ.get(\"MOCK_GPU\")\n" });
  assert.equal(py.status, 1);
});

test("VALIDATED without evidence fails; with existing evidence passes", () => {
  const sys = (extra) => `export const SUBSYSTEMS = [\n  { name: "Render", maturity: "VALIDATED", blurb: "x", doc: "d"${extra} },\n];\n`;
  const bad = repo({ "apps/web/lib/system.ts": sys("") });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /claims VALIDATED without evidence/);
  const missing = repo({ "apps/web/lib/system.ts": sys(', evidence: ["e2e/film.test.ts"]') });
  assert.match(missing.stderr, /evidence missing: e2e\/film.test.ts/);
  const ok = repo({ "apps/web/lib/system.ts": sys(', evidence: ["e2e/film.test.ts"]'), "e2e/film.test.ts": "" });
  assert.equal(ok.status, 0, ok.stderr);
});
