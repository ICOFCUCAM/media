import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "@cineforge/movie";
import { processDirectorMessage, type ConversationDeps } from "./conversation";

const msg = { id: "m1", projectId: "p1", userId: "u1", body: "Make Maya's coat red from the harbour on" };
const change = { kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya", wardrobe: { id: "wardrobe_red_wool", description: "red wool coat" } };

function deps(over: Partial<ConversationDeps> = {}) {
  const replies: { body: string; editId: string | null }[] = [];
  const filed: Record<string, unknown>[] = [];
  const reviews: { by: string | null; instruction: string }[] = [];
  const d: ConversationDeps = {
    claim: async () => true,
    loadPackage: async () => mayaCoatFixture(),
    available: () => true,
    interpret: async () => ({ action: "change", change, reply: "Maya will wear a red coat from scene 2 on." }),
    fileEdit: async (_p, by, c) => { filed.push({ by, ...c }); return "e1"; },
    fileReview: async (_p, by, instruction) => { reviews.push({ by, instruction }); return "r1"; },
    reply: async (_p, _r, body, editId) => { replies.push({ body, editId }); },
    ...over,
  };
  return { d, replies, filed, reviews };
}

describe("director chat (W9)", () => {
  it("hands a timing request to the Editor (W13; Part 1 §46) and changes nothing yet", async () => {
    const t = deps({ interpret: async () => ({ action: "editorial", change: null, reply: "I'll ask the Editor to tighten the opening." }) });
    const timing = { ...msg, body: "Make the opening 15 seconds faster." };
    expect(await processDirectorMessage(timing, t.d)).toBe("review_filed");
    expect(t.reviews).toEqual([{ by: "u1", instruction: "Make the opening 15 seconds faster." }]);
    expect(t.filed).toEqual([]);
    expect(t.replies[0]!.body).toMatch(/tighten the opening\. The Editor will propose the exact edits .* nothing changes until you approve them/);
  });

  it("files a valid change as the owner's edit request and answers with it", async () => {
    const t = deps();
    expect(await processDirectorMessage(msg, t.d)).toBe("edit_filed");
    expect(t.filed).toEqual([{ by: "u1", ...change }]);
    expect(t.replies).toEqual([{ body: expect.stringMatching(/red coat from scene 2 on\. I've filed the change/), editId: "e1" }]);
  });

  it("answers without filing when it is not a canon change", async () => {
    const t = deps({ interpret: async () => ({ action: "none", change: null, reply: "Camera moves are set in the shot plan." }) });
    expect(await processDirectorMessage(msg, t.d)).toBe("answered");
    expect(t.filed).toEqual([]);
    expect(t.replies[0]!.body).toBe("Camera moves are set in the shot plan.");
  });

  it("never files a change the edit command would refuse", async () => {
    const t = deps({ interpret: async () => ({ action: "change", change: { kind: "scene_wardrobe", sceneId: "harbour", characterId: "maya" }, reply: "Sure." }) });
    await processDirectorMessage(msg, t.d);
    expect(t.filed).toEqual([]);
    expect(t.replies[0]!.body).toMatch(/couldn't turn it into a valid change/);
  });

  it("says why when the film has no IR, the Director is not configured, or reading failed", async () => {
    const noIr = deps({ loadPackage: async () => null });
    await processDirectorMessage(msg, noIr.d);
    expect(noIr.replies[0]!.body).toMatch(/planned before the Director could edit it/);
    const off = deps({ available: () => false });
    await processDirectorMessage(msg, off.d);
    expect(off.replies[0]!.body).toMatch(/not configured/);
    const boom = deps({ interpret: async () => { throw new Error("PROVIDER_ERROR: 529"); } });
    expect(await processDirectorMessage(msg, boom.d)).toBe("answered");
    expect(boom.replies[0]!.body).toMatch(/couldn't read that just now \(PROVIDER_ERROR: 529\)/);
  });

  it("a message another worker claimed is left alone", async () => {
    const t = deps({ claim: async () => false });
    expect(await processDirectorMessage(msg, t.d)).toBe("skipped");
    expect(t.replies).toEqual([]);
  });
});
