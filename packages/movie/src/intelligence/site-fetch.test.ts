import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkPageUrl, decodeEntities, fetchPublicPage, htmlToText, isPublicAddress, PageFetchError } from "./site-fetch";

describe("which addresses a page may be fetched from (SSRF guard)", () => {
  it("allows the public internet only", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::6810:85e5"]) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1",
      "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::", "[::1]", "not-an-ip",
    ]) expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("refuses other schemes, ports and credentials before any lookup", () => {
    const code = (u: string) => { try { checkPageUrl(u); return "ok"; } catch (e) { return (e as PageFetchError).code; } };
    expect(code("https://example.com/page")).toBe("ok");
    expect(code("http://example.com:80/")).toBe("ok");
    expect(code("https://example.com:443/")).toBe("ok");
    expect(code("ftp://example.com/")).toBe("INVALID_URL");
    expect(code("file:///etc/passwd")).toBe("INVALID_URL");
    expect(code("http://example.com:8080/")).toBe("BLOCKED_PORT");
    expect(code("http://user:pw@example.com/")).toBe("INVALID_URL");
    expect(code("example.com")).toBe("INVALID_URL");
  });

  it("checks every resolved address, and literal addresses in any spelling", async () => {
    const resolve = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }];
    await expect(fetchPublicPage("https://mixed.example/", { resolve })).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    for (const u of ["http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://[::1]/", "http://[::ffff:169.254.169.254]/", "http://169.254.169.254/latest/meta-data"]) {
      await expect(fetchPublicPage(u), u).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    }
    await expect(fetchPublicPage("https://nowhere.example/", { resolve: async () => [] })).rejects.toMatchObject({ code: "DNS_FAILED" });
  });
});

describe("fetching a page (against a local server, address policy widened for the test)", () => {
  let server: Server;
  let base = "";
  const hits: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      const u = req.url ?? "/";
      if (u === "/page") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<html><head><title>Hi &amp; welcome</title></head><body><p>Fast vans.</p></body></html>"); return; }
      if (u === "/gz") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync("<p>Zipped page</p>")); return; }
      if (u === "/latin1") { res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" }); res.end(Buffer.from("<p>Caf\xe9</p>", "latin1")); return; }
      if (u.startsWith("/hop")) { const n = Number(u.slice(4)); res.writeHead(302, { location: n > 0 ? `/hop${n - 1}` : "/page" }); res.end(); return; }
      if (u === "/to-internal") { res.writeHead(301, { location: "http://169.254.169.254/latest/meta-data" }); res.end(); return; }
      if (u === "/to-port") { res.writeHead(301, { location: "http://localhost:6379/" }); res.end(); return; }
      if (u === "/json") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
      if (u === "/big") { res.writeHead(200, { "content-type": "text/html" }); res.end("<p>" + "x".repeat(4000) + "</p>"); return; }
      if (u === "/bomb") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync("y".repeat(50_000))); return; }
      if (u === "/slow") { res.writeHead(200, { "content-type": "text/html" }); res.write("<p>"); return; }
      if (u === "/missing") { res.writeHead(404, { "content-type": "text/html" }); res.end("no"); return; }
      res.writeHead(500); res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

  // The server is on loopback, on its own port: the test admits exactly that address and that port.
  const local = () => ({
    allowAddress: (ip: string) => ip === "127.0.0.1" || isPublicAddress(ip),
    allowPort: (p: string) => p === new URL(base).port || p === "" || p === "80" || p === "443",
  });
  const via = (path: string, extra: Record<string, unknown> = {}) => fetchPublicPage(`${base}${path}`, { ...local(), ...extra });

  it("the real rules refuse the local server outright (loopback address, non-web port)", async () => {
    await expect(fetchPublicPage(`${base}/page`)).rejects.toMatchObject({ code: "BLOCKED_PORT" });
    await expect(fetchPublicPage(`${base}/page`, { allowPort: () => true })).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });

  it("fetches an HTML page, decompresses it and honours its character set", async () => {
    const p = await via("/page");
    expect(p.status).toBe(200);
    expect(htmlToText(p.html).text).toBe("Hi & welcome\nFast vans.");
    expect((await via("/gz")).html).toBe("<p>Zipped page</p>");
    expect((await via("/latin1")).html).toBe("<p>Caf\u00e9</p>");
  });

  it("follows at most 3 redirects, re-checking every hop", async () => {
    const ok = await via("/hop2");
    expect(ok.redirects).toHaveLength(3);
    expect(ok.url).toBe(`${base}/page`);
    await expect(via("/hop3")).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    await expect(via("/to-internal")).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    await expect(via("/to-port")).rejects.toMatchObject({ code: "BLOCKED_PORT" });
  });

  it("takes text/html only, within the size cap (after decompression) and the time limit", async () => {
    await expect(via("/json")).rejects.toMatchObject({ code: "NOT_HTML" });
    await expect(via("/missing")).rejects.toMatchObject({ code: "HTTP_ERROR" });
    await expect(via("/big", { maxBytes: 1000 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(via("/bomb", { maxBytes: 10_000 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(via("/slow", { timeoutMs: 300 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("redirects to a private address through DNS", () => {
  it("refuses a host whose every answer is private", async () => {
    let calls = 0;
    const resolve = async () => { calls++; return [{ address: "10.0.0.1", family: 4 }]; };
    await expect(fetchPublicPage("http://shop.example/", { resolve })).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    expect(calls).toBe(1);
  });
});

describe("the page as a visitor reads it", () => {
  it("keeps the title, the description and the body text; drops scripts, styles and markup", () => {
    const html = `<!doctype html><html><head><title>Flyttgo &#8212; Drive</title>
      <meta content="Earn with your van." name="description"><style>p{color:red}</style>
      <script>window.secret = "ignore me"</script></head>
      <body><header><nav><a href="/">Home</a></nav></header><!-- hidden -->
      <h1>Drive.&nbsp;Deliver.&nbsp;Earn.</h1><p>Keep <b>85%</b> of every fare.</p>
      <noscript>Enable JS</noscript><ul><li>Oslo</li><li>Bergen</li></ul><svg><text>logo</text></svg></body></html>`;
    const t = htmlToText(html);
    expect(t.title).toBe("Flyttgo — Drive");
    expect(t.description).toBe("Earn with your van.");
    expect(t.text.split("\n")).toEqual(["Flyttgo — Drive", "Earn with your van.", "Home", "Drive. Deliver. Earn.", "Keep 85% of every fare.", "Oslo", "Bergen"]);
    expect(t.text).not.toMatch(/secret|color|hidden|Enable JS|logo/);
  });

  it("decodes entities", () => {
    expect(decodeEntities("Fish &amp; chips &#x27;n&#39; &rsquo;more&hellip; &bogus;")).toBe("Fish & chips 'n' ’more… &bogus;");
  });
});
