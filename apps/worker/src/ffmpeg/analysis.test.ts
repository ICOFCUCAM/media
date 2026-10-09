import { describe, expect, it } from "vitest";
import { parseFormat } from "./analysis";

describe("parseFormat (W18)", () => {
  it("reads codecs, pixel format, frame rates, audio layout and container duration", () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", avg_frame_rate: "24000/1001", r_frame_rate: "24000/1001" },
        { codec_type: "audio", codec_name: "aac", channels: 2, sample_rate: "48000" },
      ],
      format: { duration: "5.005" },
    });
    const f = parseFormat(json);
    expect(f).toMatchObject({ videoCodec: "h264", pixFmt: "yuv420p", audioCodec: "aac", channels: 2, sampleRate: 48_000, containerSec: 5.005 });
    expect(f.avgFps).toBeCloseTo(23.976, 3);
  });

  it("missing streams and 0/0 rates read as null", () => {
    const f = parseFormat(JSON.stringify({ streams: [{ codec_type: "video", codec_name: "vp9", avg_frame_rate: "0/0", r_frame_rate: "25" }] }));
    expect(f).toEqual({ videoCodec: "vp9", pixFmt: null, avgFps: null, rFps: 25, audioCodec: null, channels: null, sampleRate: null, containerSec: null });
  });
});
