/**
 * Fetching an advertiser's public page for website intelligence (Ads Studio
 * A2; docs/47) without letting a URL reach anything that is not public.
 *
 *   - http and https only, on ports 80 and 443, no credentials in the URL;
 *   - the host is resolved and EVERY address must be public (no loopback,
 *     private, link-local, carrier-grade NAT, multicast, reserved or mapped
 *     ranges); the connection is pinned to the addresses that were checked,
 *     so a second DNS answer cannot swap in an internal one;
 *   - at most 3 redirects, each hop checked the same way;
 *   - text/html only, at most 1.5 MB (after decompression), 10 s in all.
 *
 * `htmlToText` then strips the page to what a visitor reads; that text is what
 * the model sees and what every quote is checked against (./site.ts).
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";

export const PAGE_MAX_BYTES = 1_500_000;
export const PAGE_TIMEOUT_MS = 10_000;
export const PAGE_MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

export type PageFetchErrorCode =
  | "INVALID_URL" | "BLOCKED_PORT" | "BLOCKED_ADDRESS" | "DNS_FAILED" | "TOO_MANY_REDIRECTS"
  | "HTTP_ERROR" | "NOT_HTML" | "TOO_LARGE" | "TIMEOUT" | "NETWORK";

export class PageFetchError extends Error {
  constructor(readonly code: PageFetchErrorCode, message: string) {
    super(message);
    this.name = "PageFetchError";
  }
}

// Every range that is not the public internet (IANA special-purpose registries).
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["::", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(net, bits, "ipv6");

/** Whether an address is on the public internet (an IPv4-mapped IPv6 address is judged as its IPv4). */
export function isPublicAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const kind = isIP(bare);
  if (kind === 4) return !BLOCKED.check(bare, "ipv4");
  if (kind !== 6) return false;
  const mapped = bare.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPublicAddress(mapped[1]!);
  if (/^::ffff:/i.test(bare)) return false; // mapped, hex-written: refuse rather than parse
  return !BLOCKED.check(bare, "ipv6");
}

/** The URL if it may be fetched at all (scheme, port, credentials) — before any DNS. */
export function checkPageUrl(raw: string, allowPort: (port: string) => boolean = (p) => ALLOWED_PORTS.has(p)): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new PageFetchError("INVALID_URL", "Enter a full http:// or https:// address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new PageFetchError("INVALID_URL", "Only http:// and https:// pages can be analysed.");
  if (u.username || u.password) throw new PageFetchError("INVALID_URL", "Addresses with a user name or password are not fetched.");
  if (!allowPort(u.port)) throw new PageFetchError("BLOCKED_PORT", "Only pages on the standard web ports (80, 443) are fetched.");
  if (!u.hostname) throw new PageFetchError("INVALID_URL", "The address has no host.");
  return u;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface PageFetchOptions {
  /** DNS (tests inject one). */
  resolve?: (host: string) => Promise<ResolvedAddress[]>;
  /** Address policy (tests may widen it to reach a local server). */
  allowAddress?: (ip: string) => boolean;
  /** Port policy ("" = the scheme's default); tests may add a local server's port. */
  allowPort?: (port: string) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface FetchedPage {
  /** The final URL after redirects. */
  url: string;
  status: number;
  contentType: string;
  html: string;
  bytes: number;
  redirects: string[];
}

const defaultResolve = async (host: string): Promise<ResolvedAddress[]> => dnsLookup(host, { all: true, verbatim: true });

/** Resolve a host and require every address to be allowed; returns them for the pinned connection. */
async function resolveChecked(host: string, opts: Required<Pick<PageFetchOptions, "resolve" | "allowAddress">>): Promise<ResolvedAddress[]> {
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (!opts.allowAddress(bare)) throw new PageFetchError("BLOCKED_ADDRESS", "That address is not a public website.");
    return [{ address: bare, family: isIP(bare) }];
  }
  let addrs: ResolvedAddress[];
  try {
    addrs = await opts.resolve(bare);
  } catch {
    throw new PageFetchError("DNS_FAILED", `Could not find ${bare}.`);
  }
  if (!addrs.length) throw new PageFetchError("DNS_FAILED", `Could not find ${bare}.`);
  const bad = addrs.find((a) => !opts.allowAddress(a.address));
  if (bad) throw new PageFetchError("BLOCKED_ADDRESS", `${bare} points at an address that is not a public website.`);
  return addrs;
}

/** A lookup that only ever answers with the addresses already checked. */
function pinnedLookup(addrs: ResolvedAddress[]): LookupFunction {
  return ((_host: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) => {
    if (options?.all) cb(null, addrs.map((a) => ({ address: a.address, family: a.family })));
    else cb(null, addrs[0]!.address, addrs[0]!.family);
  }) as unknown as LookupFunction;
}

const HTML = /^(text\/html|application\/xhtml\+xml)\b/i;

function decoded(res: IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(createGunzip());
  if (enc === "deflate") return res.pipe(createInflate());
  if (enc === "br") return res.pipe(createBrotliDecompress());
  return res;
}

/** The body's character set: the header's, else a <meta charset> near the top, else UTF-8. */
export function decodeHtml(bytes: Buffer, contentType: string): string {
  const fromHeader = contentType.match(/charset\s*=\s*"?([\w.:-]+)/i)?.[1];
  const head = bytes.subarray(0, 2048).toString("latin1");
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i)?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      /* unknown label: try the next */
    }
  }
  return bytes.toString("utf8");
}

interface Hop {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer | null;
}

function fetchOnce(u: URL, addrs: ResolvedAddress[], deadline: number, maxBytes: number): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new PageFetchError("TIMEOUT", "The page took too long to answer."));
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(u, {
      method: "GET",
      lookup: pinnedLookup(addrs),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CineForgeAdsStudio/1.0; website analysis requested by the page's owner)",
        accept: "text/html,application/xhtml+xml;q=0.9",
        "accept-encoding": "gzip, deflate, br",
      },
    });
    const timer = setTimeout(() => req.destroy(new PageFetchError("TIMEOUT", "The page took too long to answer.")), left);
    const fail = (e: unknown) => {
      clearTimeout(timer);
      reject(e instanceof PageFetchError ? e : new PageFetchError("NETWORK", `Could not fetch the page (${e instanceof Error ? e.message : String(e)}).`));
    };
    req.on("error", fail);
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      const contentType = String(res.headers["content-type"] ?? "");
      if (status >= 300 && status < 400 && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        req.destroy();
        return resolve({ status, location: String(res.headers.location), contentType, body: null });
      }
      if (status < 200 || status >= 300) {
        req.destroy();
        return fail(new PageFetchError("HTTP_ERROR", `The page answered ${status}.`));
      }
      if (!HTML.test(contentType)) {
        req.destroy();
        return fail(new PageFetchError("NOT_HTML", `That address is not a web page (${contentType.split(";")[0] || "no content type"}).`));
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > maxBytes && !res.headers["content-encoding"]) {
        req.destroy();
        return fail(new PageFetchError("TOO_LARGE", "The page is larger than 1.5 MB."));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      const body = decoded(res);
      body.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          body.destroy();
          fail(new PageFetchError("TOO_LARGE", "The page is larger than 1.5 MB."));
          return;
        }
        chunks.push(c);
      });
      body.on("error", fail);
      body.on("end", () => {
        clearTimeout(timer);
        if (size <= maxBytes) resolve({ status, location: null, contentType, body: Buffer.concat(chunks) });
      });
    });
    req.end();
  });
}

/** Fetch one public HTML page under the rules above. */
export async function fetchPublicPage(raw: string, opts: PageFetchOptions = {}): Promise<FetchedPage> {
  const policy = { resolve: opts.resolve ?? defaultResolve, allowAddress: opts.allowAddress ?? isPublicAddress };
  const maxBytes = opts.maxBytes ?? PAGE_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? PAGE_MAX_REDIRECTS;
  const deadline = Date.now() + (opts.timeoutMs ?? PAGE_TIMEOUT_MS);
  const allowPort = opts.allowPort ?? ((p: string) => ALLOWED_PORTS.has(p));
  let url = checkPageUrl(raw, allowPort);
  const redirects: string[] = [];
  for (;;) {
    const addrs = await resolveChecked(url.hostname, policy);
    const hop = await fetchOnce(url, addrs, deadline, maxBytes);
    if (hop.body) {
      return { url: url.toString(), status: hop.status, contentType: hop.contentType, html: decodeHtml(hop.body, hop.contentType), bytes: hop.body.length, redirects };
    }
    if (redirects.length >= maxRedirects) throw new PageFetchError("TOO_MANY_REDIRECTS", `The page redirected more than ${maxRedirects} times.`);
    let next: URL;
    try {
      next = new URL(hop.location!, url);
    } catch {
      throw new PageFetchError("INVALID_URL", "The page redirected to an invalid address.");
    }
    // Each hop is checked like the first: scheme, port, credentials, then every address.
    url = checkPageUrl(next.toString(), allowPort);
    redirects.push(url.toString());
  }
}

// ── HTML → readable text ──────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", trade: "™",
  euro: "€", pound: "£", yen: "¥", cent: "¢", bull: "•", middot: "·", deg: "°",
  times: "×", eacute: "é", egrave: "è", aacute: "á", agrave: "à", oacute: "ó",
  uuml: "ü", ouml: "ö", auml: "ä", aring: "å", oslash: "ø", aelig: "æ", szlig: "ß",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

const BLOCK = /<\/?(p|div|li|ul|ol|dl|dt|dd|h[1-6]|section|article|header|footer|nav|main|aside|blockquote|figure|figcaption|table|thead|tbody|tr|td|th|form|fieldset|br|hr|pre|address|details|summary|button|label|option)\b[^>]*>/gi;

/** What a visitor reads on the page: its title, its description and the body text, one block per line (pure). */
export function htmlToText(html: string): { title: string | null; description: string | null; text: string } {
  const clean = (s: string) => decodeEntities(s).replace(/[ \t\f\v\r\u00A0]+/g, " ").trim();
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let description: string | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (htmlAttr(tag, "name") ?? htmlAttr(tag, "property") ?? "").toLowerCase();
    if (name === "description" || name === "og:description") {
      const c = htmlAttr(tag, "content");
      if (c?.trim()) { description = clean(c); break; }
    }
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|object|canvas|head|select)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(BLOCK, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = decodeEntities(body).split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const t = title ? clean(title.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ") : null;
  const text = [t, description, ...lines].filter((x): x is string => !!x).join("\n");
  return { title: t || null, description, text };
}
