import { describe, expect, it } from "vitest";
import { sharesWan22Pod } from "./factory";

describe("one pod switched from Wan 2.1 to Wan 2.2 (docs/75)", () => {
  const url = "https://abc-8000.proxy.runpod.net";
  it("is one machine when the pod id or the address is the same", () => {
    expect(sharesWan22Pod({ WAN_GPU_URL: url, RUNPOD_WAN_POD_ID: "abc", WAN22_GPU_URL: url, RUNPOD_WAN22_POD_ID: "abc" })).toBe(true);
    expect(sharesWan22Pod({ WAN_GPU_URL: `${url}/`, WAN22_GPU_URL: url })).toBe(true);
  });
  it("two pods, or no Wan 2.2 at all, stay separate", () => {
    expect(sharesWan22Pod({ WAN_GPU_URL: url, RUNPOD_WAN_POD_ID: "abc", WAN22_GPU_URL: "https://xyz-8000.proxy.runpod.net", RUNPOD_WAN22_POD_ID: "xyz" })).toBe(false);
    expect(sharesWan22Pod({ WAN_GPU_URL: url, RUNPOD_WAN_POD_ID: "abc" })).toBe(false);
  });
});
