import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer } from "./health";

let close: (() => void) | null = null;
afterEach(() => close?.());

async function start(ping: () => Promise<unknown>) {
  const s = startHealthServer({ port: 0, ping, timeoutMs: 100 });
  await new Promise((r) => s.once("listening", r));
  close = () => s.close();
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
}

describe("worker health endpoint", () => {
  it("200 when the queue answers", async () => {
    const res = await fetch(await start(async () => "PONG"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "cineforge-worker" });
  });

  it("503 when Redis fails or hangs, so a bad REDIS_URL never gets promoted", async () => {
    expect((await fetch(await start(async () => { throw new Error("ECONNREFUSED"); }))).status).toBe(503);
    close?.();
    expect((await fetch(await start(() => new Promise(() => {})))).status).toBe(503);
  });

  it("only answers reads", async () => {
    expect((await fetch(await start(async () => "PONG"), { method: "POST" })).status).toBe(405);
  });
});
