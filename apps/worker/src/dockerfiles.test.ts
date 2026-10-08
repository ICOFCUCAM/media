/** The repository-root Dockerfile (DeployPro) must build the same image as apps/worker/Dockerfile (Render). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const instructions = (text: string) =>
  text.split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("#") && !/^EXPOSE\b/.test(l.trim()));

describe("worker Dockerfiles", () => {
  it("root and apps/worker build the same image", () => {
    expect(instructions(read("../../../Dockerfile"))).toEqual(instructions(read("../Dockerfile")));
  });
  it("the root one exposes the health-check port", () => {
    expect(read("../../../Dockerfile")).toMatch(/^EXPOSE 8080$/m);
  });
});
