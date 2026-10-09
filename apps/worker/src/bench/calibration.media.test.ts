/** W10 sync instrument calibration on real FFmpeg (CI job media-regression). */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calibrate } from "./calibration";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

describe.runIf(HAVE_FFMPEG)("sync instrument calibration", () => {
  it("measures every dimension and resolves every default tolerance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cf-cal-"));
    try {
      const r = await calibrate(dir);
      for (const [d, st] of Object.entries(r.stats)) expect(st.failed, `${d} unmeasured`).toBe(0);
      expect(r.stats.video_duration.max).toBeLessThanOrEqual(1); // frames are counted, not estimated (1 µs = integer rounding)
      expect(r.stats.onset.p95).toBeLessThan(10_000);
      expect(r.stats.av_offset.p95).toBeLessThan(10_000);
      expect(r.stats.loudness.p95).toBeLessThan(0.2);
      expect(r.unresolvable).toEqual([]);
      expect(r.verdicts).toHaveLength(60);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
