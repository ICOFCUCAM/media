import { describe, expect, it } from "vitest";
import { allProbes, runProbes, type Probe } from "./probes";
import { exitCode, formatReport, parseRequired, suiteVerdict, type ProbeResult } from "./report";
import { ArtifactError } from "./verify";

const r = (id: string, capability: ProbeResult["capability"], status: ProbeResult["status"]): ProbeResult =>
  ({ id, capability, provider: id.split(":")[1]!, status, reason: null, evidence: {}, latencyMs: 1 });

describe("real-provider verdict (Part 2 §76)", () => {
  it("passes only when every required capability has a passing probe", () => {
    const all = [r("planning:anthropic", "planning", "PASS"), r("image:openai", "image", "PASS"), r("video:wan", "video", "PASS"),
      r("voice:openai-tts", "voice", "PASS"), r("music:fal", "music", "PASS"), r("image:comfyui", "image", "GATED")];
    expect(suiteVerdict(all).status).toBe("PASS");
    expect(exitCode(suiteVerdict(all))).toBe(0);
  });

  it("nothing configured is INCOMPLETE, never green", () => {
    const v = suiteVerdict([r("planning:anthropic", "planning", "NOT_CONFIGURED"), r("image:comfyui", "image", "GATED")]);
    expect(v.status).toBe("INCOMPLETE");
    expect(v.missing).toEqual(["planning", "image", "video", "voice", "music"]);
    expect(exitCode(v)).toBe(3);
  });

  it("a configured provider that fails is FAIL even when another provider passes", () => {
    const v = suiteVerdict([r("voice:openai-tts", "voice", "PASS"), r("voice:fal-minimax", "voice", "FAIL")], ["voice"]);
    expect(v).toEqual({ status: "FAIL", missing: [], failed: ["voice:fal-minimax"] });
    expect(formatReport([], v)).toContain("REAL_PROVIDERS: FAIL");
  });

  it("parses the required list strictly", () => {
    expect(parseRequired("planning, voice")).toEqual(["planning", "voice"]);
    expect(() => parseRequired("planning,lipsync")).toThrow(/unknown capability/);
  });
});

describe("probes", () => {
  it("with no credentials every probe says why it cannot run; ComfyUI and self-hosted voices are gated", async () => {
    const results = await runProbes(allProbes(), { env: {}, fetch, dir: "/nonexistent" });
    expect(results.every((x) => x.status === "NOT_CONFIGURED" || x.status === "GATED")).toBe(true);
    expect(results.find((x) => x.id === "image:comfyui")).toMatchObject({ status: "GATED", reason: expect.stringMatching(/Phase 1/) });
    expect(results.filter((x) => x.capability === "voice" && x.status === "GATED").map((x) => x.provider)).toEqual(
      expect.arrayContaining(["qwen3-tts", "cosyvoice-3", "gpt-sovits"]));
    expect(results.find((x) => x.id === "planning:anthropic")?.reason).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("the OpenAI planning probe needs a model it was told to use", () => {
    const p = allProbes().find((x) => x.id === "planning:openai")!;
    expect(p.ready({ OPENAI_API_KEY: "k" })?.reason).toMatch(/OPENAI_PLAN_MODEL/);
    expect(p.ready({ OPENAI_API_KEY: "k", INTELLIGENCE_ROUTES: "film_plan=anthropic:claude-opus-5-5|openai:gpt-test" })).toBeNull();
  });

  it("self-hosted video needs the gateway database and storage; the URL alone is not enough", () => {
    const wan = allProbes().find((x) => x.id === "video:wan")!;
    expect(wan.ready({})?.reason).toMatch(/WAN_GPU_URL/);
    expect(wan.ready({ WAN_GPU_URL: "http://gpu" })?.reason).toMatch(/DATABASE_URL, S3_BUCKET/);
    expect(wan.ready({ WAN_GPU_URL: "http://gpu", DATABASE_URL: "x", S3_BUCKET: "b" })).toBeNull();
  });

  it("records a failure with its evidence and keeps going", async () => {
    const mk = (id: string, run: Probe["run"]): Probe => ({ id, capability: "image", provider: id, ready: () => null, run });
    const dir = (await import("node:os")).tmpdir();
    const results = await runProbes([
      mk("image:bad", async () => { throw new ArtifactError("the image is a flat colour", { spread: 0 }); }),
      mk("image:good", async () => ({ width: 1024 })),
    ], { env: {}, fetch, dir });
    expect(results[0]).toMatchObject({ status: "FAIL", reason: "the image is a flat colour", evidence: { spread: 0 } });
    expect(results[1]).toMatchObject({ status: "PASS", evidence: { width: 1024 } });
  });
});
