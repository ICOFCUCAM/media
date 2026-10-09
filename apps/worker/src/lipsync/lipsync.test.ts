import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { dialogueStemArgs, lipSyncKey, lipSyncTargets, type LipSyncLine, type LipSyncShot } from "./plan";
import { framedFromCast, lipSyncFilm, sceneLipSyncInputs, type LipSyncDeps, type LipSyncScene } from "./run";

const shots: LipSyncShot[] = [
  { shotId: "wide", videoKey: "w.mp4", startSec: 0, durSec: 4, size: "WS", framed: ["maya", "ewan"] },
  { shotId: "maya", videoKey: "m.mp4", startSec: 4, durSec: 3, size: "MCU", framed: ["maya"] },
  { shotId: "ewan", videoKey: "e.mp4", startSec: 7, durSec: 3, size: "CU", framed: ["ewan"] },
];
const lines: LipSyncLine[] = [
  { lineId: "l1", characterId: "maya", audioKey: "l1.wav", startSec: 3, durSec: 2.5 }, // spans the wide and Maya's close shot
  { lineId: "l2", characterId: "ewan", audioKey: "l2.wav", startSec: 6.5, durSec: 0.3 }, // Ewan speaks over Maya's shot: not his
];

describe("lip sync for dialogue shots (W21)", () => {
  it("only shots where a framed character speaks, never wides or inserts, each with its slice of the line", () => {
    expect(lipSyncTargets(shots, lines)).toEqual([
      { shotId: "maya", videoKey: "m.mp4", durSec: 3, speechSec: 1.5, segments: [{ lineId: "l1", audioKey: "l1.wav", atSec: 0, fromSec: 1, durSec: 1.5 }] },
    ]);
    // Too little speech is not worth a call.
    expect(lipSyncTargets(shots, [{ ...lines[0]!, startSec: 6.8, durSec: 0.3 }])).toEqual([]);
  });

  it("the stem lays each slice at its place and lasts exactly the shot", () => {
    const args = dialogueStemArgs(["a.wav", "b.wav"], [
      { lineId: "l1", audioKey: "a", atSec: 0.5, fromSec: 1, durSec: 1.2 },
      { lineId: "l2", audioKey: "b", atSec: 2, fromSec: 0, durSec: 0.8 },
    ], 3, "out.wav");
    expect(args.slice(0, 6)).toEqual(["-ss", "1.000", "-t", "1.200", "-i", "a.wav"]);
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("adelay=500:all=1");
    expect(fc).toContain("adelay=2000:all=1");
    expect(fc).toContain("amix=inputs=2");
    expect(fc).toContain("atrim=0:3.000");
  });

  it("a shot is lip-synced once per clip, lines and model", () => {
    const [t] = lipSyncTargets(shots, lines);
    expect(lipSyncKey("p", t!, "m1")).toBe(lipSyncKey("p", t!, "m1"));
    expect(lipSyncKey("p", t!, "m1")).not.toBe(lipSyncKey("p", t!, "m2"));
    expect(lipSyncKey("p", { ...t!, videoKey: "m2.mp4" }, "m1")).not.toBe(lipSyncKey("p", t!, "m1"));
    expect(lipSyncKey("p", t!, "m1")).toMatch(/^projects\/p\/lipsync\/maya-[0-9a-f]{20}\.mp4$/);
  });

  it("cast keys map to stored characters by name; a scene's shots sit on its clock with cuts", () => {
    const framedOf = framedFromCast([{ id: "char_maya", name: "Maya" }, { id: "char_ewan", name: "Ewan" }], [{ id: "db-maya", name: "maya " }]);
    expect(framedOf(["char_maya", "char_ewan", "loc_x"])).toEqual(["db-maya"]);
    const scene: LipSyncScene = {
      sceneId: "s", index: 0,
      shots: [
        { id: "a", videoKey: "a.mp4", durationSec: 5, cutSec: 3, size: "WS", subjectKeys: [] },
        { id: "b", videoKey: "b.mp4", durationSec: 4, cutSec: null, size: "CU", subjectKeys: ["char_maya"] },
      ],
      lines: [{ id: "l", characterId: "db-maya", audioKey: "l.wav", startMs: 3500, }, { id: "x", characterId: "db-maya", audioKey: null, startMs: 0 }],
      lineMs: { l: 2000 },
    };
    const { shots: s, lines: l } = sceneLipSyncInputs(scene, framedOf);
    expect(s.map((x) => [x.shotId, x.startSec, x.durSec, x.framed])).toEqual([["a", 0, 3, []], ["b", 3, 4, ["db-maya"]]]);
    expect(l).toEqual([{ lineId: "l", characterId: "db-maya", audioKey: "l.wav", startSec: 3.5, durSec: 2 }]);
  });

  it("makes, reuses and records: no provider is recorded once, a failure keeps the clip", async () => {
    const scene: LipSyncScene = {
      sceneId: "s", index: 0,
      shots: [{ id: "b", videoKey: "b.mp4", durationSec: 4, cutSec: null, size: "CU", subjectKeys: ["char_maya"] }],
      lines: [{ id: "l", characterId: "db-maya", audioKey: "l.wav", startMs: 500 }],
      lineMs: { l: 2000 },
    };
    const framedOf = () => ["db-maya"];
    const stored = new Map<string, number>();
    const deps = (sync: () => Promise<Uint8Array>): LipSyncDeps => ({
      provider: { id: "fal", model: "fal-ai/sync-lipsync", sync },
      download: async () => {}, getBytes: async () => new Uint8Array([1]),
      putBytes: async (k, b) => { stored.set(k, b.length); }, size: async (k) => stored.get(k) ?? 0,
      ffmpeg: async (a) => { await writeFile(a[a.length - 1]!, "RIFF"); },
    });
    const made = await lipSyncFilm(deps(async () => new Uint8Array([1, 2, 3])), "p", [scene], framedOf);
    expect([made.made, made.reused, made.gaps]).toEqual([1, 0, []]);
    expect(made.clips.get("b")).toMatch(/^projects\/p\/lipsync\/b-/);
    const again = await lipSyncFilm(deps(async () => { throw new Error("should not be called"); }), "p", [scene], framedOf);
    expect([again.made, again.reused]).toEqual([0, 1]);
    stored.clear();
    const failed = await lipSyncFilm(deps(async () => { throw new Error("model busy"); }), "p", [scene], framedOf);
    expect(failed.clips.size).toBe(0);
    expect(failed.gaps).toEqual([expect.objectContaining({ code: "LIP_SYNC_FAILED", refId: "b" })]);
    const none = await lipSyncFilm({ ...deps(async () => new Uint8Array()), provider: null }, "p", [scene], framedOf);
    expect(none.gaps.map((g) => g.code)).toEqual(["LIP_SYNC_UNAVAILABLE"]);
  });
});
