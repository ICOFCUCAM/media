/**
 * Website intelligence (Ads Studio A2; docs/47). One structured call reads an
 * advertiser's page — its readable text, fetched server-side by ./site-fetch.ts
 * — into source facts: the product, its benefits, the audience and the call
 * to action, each with a short passage quoted from the page. Every quote is
 * checked against the fetched text; a fact whose quote is not on the page is
 * dropped, never kept on the model's word.
 *
 * The Director then plans an advert from these facts (PROMPTS.directorMaster,
 * SOURCE FACTS), and `claimAdvisories` flags any narration or dialogue line that
 * states a number, a superlative or a guarantee no fact quote supports. That
 * check is deterministic and advisory: the line is recorded, not rewritten.
 */
import type { FilmPackage } from "../ir/schema";
import { PROMPTS, type PlanSourceFact } from "./prompts";
import type { IntelligenceRouter } from "./router";

export type SourceFact = PlanSourceFact;
export const FACT_KINDS = ["product", "benefit", "audience", "call_to_action"] as const;
/** Most facts kept per kind (the prompt asks for the same). */
export const FACT_LIMITS: Record<SourceFact["kind"], number> = { product: 1, benefit: 6, audience: 3, call_to_action: 1 };
/** Readable page text sent to the model (characters). */
export const SITE_TEXT_MAX = 40_000;
/** A quote longer than this is not "short"; it is dropped. */
export const QUOTE_MAX = 300;
/** The prop an advert's product is planned as when the advertiser supplied product photographs (A3). */
export const PRODUCT_PROP_ID = "prop_product";

/** What the advert project carries from the Ads Studio (projects.ad_source, migration 0060). */
export interface AdSource {
  url: string | null;
  title: string | null;
  brand: string | null;
  fetchedAt: string | null;
  facts: SourceFact[];
}

export const SITE_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: ["string", "null"], description: "the brand or company name as the page writes it" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...FACT_KINDS] },
          statement: { type: "string", description: "the fact in one short plain sentence" },
          quote: { type: "string", description: "a short passage copied exactly from the page text that supports it" },
        },
        required: ["kind", "statement", "quote"],
      },
    },
  },
  required: ["brand", "facts"],
};

/** The request text: the page as data (pure). */
export function renderSiteRequest(page: { url: string; title: string | null; text: string }): string {
  return JSON.stringify({ url: page.url, title: page.title, pageText: page.text.slice(0, SITE_TEXT_MAX) });
}

/**
 * One character in, one character out — so an index in the folded text is the
 * same index in the original and a match can be cut from the page verbatim.
 * Folds case, typographic quotes and dashes, and whitespace.
 */
function foldChar(c: string): string {
  if (/\s/.test(c)) return " ";
  if ("‘’‚‛′`".includes(c)) return "'";
  if ("“”„‟″".includes(c)) return "\"";
  if ("‐‑‒–—―−".includes(c)) return "-";
  const l = c.toLowerCase();
  return l.length === 1 ? l : c;
}
const fold = (s: string) => Array.from(s, foldChar).join("");

/**
 * Where a quote is on the page, as the page writes it — or null. Whitespace
 * runs in the quote are collapsed (the page text already is); case, curly
 * quotes and dashes may differ, the words may not.
 */
export function findQuote(pageText: string, quote: string): string | null {
  const q = quote.replace(/\s+/g, " ").trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (q.length < 3 || q.length > QUOTE_MAX) return null;
  // Array.from keeps astral characters whole; the page is folded the same way.
  const chars = Array.from(pageText);
  const folded = chars.map(foldChar).join("");
  const at = folded.indexOf(fold(q));
  if (at < 0) return null;
  // `at` counts UTF-16 units of the folded string; fold keeps each char's unit length except
  // astral ones, so walk the characters to cut the original at the same place.
  let units = 0;
  let start = -1;
  for (let i = 0; i < chars.length; i++) {
    if (units === at) { start = i; break; }
    units += foldChar(chars[i]!).length;
  }
  if (start < 0) return null;
  return chars.slice(start, start + Array.from(q).length).join("");
}

export interface DroppedFact {
  kind: string;
  statement: string;
  quote: string;
  reason: "quote_not_on_page" | "empty" | "over_limit" | "unknown_kind";
}

/** Keep only facts whose quote is on the page, as the page writes it, within the per-kind limits (pure). */
export function verifyFacts(raw: unknown, pageText: string): { facts: SourceFact[]; dropped: DroppedFact[] } {
  const list = Array.isArray((raw as { facts?: unknown } | null)?.facts) ? (raw as { facts: unknown[] }).facts : [];
  const facts: SourceFact[] = [];
  const dropped: DroppedFact[] = [];
  const count: Record<string, number> = {};
  const seen = new Set<string>();
  for (const item of list) {
    const f = (item ?? {}) as { kind?: unknown; statement?: unknown; quote?: unknown };
    const kind = String(f.kind ?? "");
    const statement = String(f.statement ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const quote = String(f.quote ?? "");
    const drop = (reason: DroppedFact["reason"]) => dropped.push({ kind, statement, quote: quote.slice(0, QUOTE_MAX), reason });
    if (!(FACT_KINDS as readonly string[]).includes(kind)) { drop("unknown_kind"); continue; }
    if (!statement || !quote.trim()) { drop("empty"); continue; }
    const onPage = findQuote(pageText, quote);
    if (!onPage) { drop("quote_not_on_page"); continue; }
    const k = kind as SourceFact["kind"];
    if ((count[k] ?? 0) >= FACT_LIMITS[k]) { drop("over_limit"); continue; }
    const key = `${k}|${onPage.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    count[k] = (count[k] ?? 0) + 1;
    facts.push({ kind: k, statement, quote: onPage });
  }
  return { facts, dropped };
}

export interface SiteAnalysis {
  brand: string | null;
  facts: SourceFact[];
  dropped: DroppedFact[];
  provider: string;
  model: string;
}

/** Read one page into verified source facts (one call, task site_analysis). */
export async function analyseSite(
  router: IntelligenceRouter,
  page: { url: string; title: string | null; text: string },
  ctx: { projectId?: string | null } = {},
): Promise<SiteAnalysis> {
  const p = PROMPTS.siteAnalysis;
  const res = await router.call({
    task: "site_analysis", promptId: p.id, promptVersion: p.version, system: p.system,
    user: renderSiteRequest(page),
    schema: SITE_SCHEMA, schemaName: "SiteFacts", maxTokens: 3000, effort: "low",
    summarize: (o) => {
      const n = Array.isArray((o as { facts?: unknown[] } | null)?.facts) ? (o as { facts: unknown[] }).facts.length : 0;
      return `Read ${page.url}: ${n} fact(s) proposed with source quotes.`;
    },
  }, ctx);
  // The model only proposes: the page decides which facts stay.
  const text = page.text.slice(0, SITE_TEXT_MAX);
  const { facts, dropped } = verifyFacts(res.output, text);
  const brandRaw = (res.output as { brand?: unknown } | null)?.brand;
  const brand = typeof brandRaw === "string" && brandRaw.trim() ? findQuote(text, brandRaw.trim()) : null;
  return { brand, facts, dropped, provider: res.provider, model: res.model };
}

/** The project's ad source from its stored JSON — anything malformed is left out, not guessed (pure). */
export function adSourceOf(json: unknown): AdSource | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const facts: SourceFact[] = (Array.isArray(j.facts) ? j.facts : []).flatMap((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const kind = String(x.kind ?? "");
    const statement = str(x.statement, 300);
    const quote = str(x.quote, QUOTE_MAX);
    return (FACT_KINDS as readonly string[]).includes(kind) && statement && quote ? [{ kind: kind as SourceFact["kind"], statement, quote }] : [];
  }).slice(0, 12);
  return { url: str(j.url, 2048), title: str(j.title, 300), brand: str(j.brand, 120), fetchedAt: str(j.fetchedAt, 40), facts };
}

// ── Claim checks (deterministic, advisory) ───────────────────────────────

const SUPERLATIVES = [
  "best", "fastest", "quickest", "cheapest", "lowest", "highest", "greatest", "biggest", "largest", "smartest",
  "easiest", "safest", "strongest", "healthiest", "most", "least", "leading", "top-rated", "award-winning",
  "unbeatable", "unmatched", "unrivalled", "unrivaled", "ultimate", "number one", "no. 1", "#1", "world's first", "first-ever",
];
const GUARANTEES = [
  "guarantee", "guarantees", "guaranteed", "warranty", "risk-free", "risk free", "money-back", "money back",
  "refund", "refunds", "proven", "clinically", "certified", "promise", "promises", "promised",
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A term as a whole word (or the symbol itself), case-insensitive. */
const termRe = (t: string) => new RegExp(`(^|[^a-z0-9])${escapeRe(t)}(?=$|[^a-z0-9])`, "i");
const NUMBER = /\d+(?:[.,]\d+)*/g;
const CURRENCY = /[$€£¥₹]/;

export interface ClaimAdvisory {
  sceneId: string;
  sceneIndex: number;
  /** narration, or the dialogue line's index in the scene. */
  source: "narration" | { dialogue: number };
  sentence: string;
  /** What the sentence claims that no fact quote supports. */
  unsupported: string[];
}

/** The claim-bearing terms of one sentence: numbers (with currency), superlatives, guarantees (pure). */
export function claimTerms(sentence: string): string[] {
  const out: string[] = [];
  for (const n of sentence.match(NUMBER) ?? []) out.push(n);
  if (CURRENCY.test(sentence) && !out.length) out.push(sentence.match(CURRENCY)![0]);
  if (/\d\s*%|\bper ?cent\b/i.test(sentence)) out.push("%");
  for (const t of [...SUPERLATIVES, ...GUARANTEES]) if (termRe(t).test(sentence)) out.push(t);
  return [...new Set(out)];
}

/** A term is supported when a fact quote states it (a number as a number, a word as a word). */
function supported(term: string, quotes: string): boolean {
  if (/^\d/.test(term)) return new RegExp(`(^|[^0-9.,])${escapeRe(term)}(?![0-9])`).test(quotes);
  if (term === "%") return /%|\bper ?cent\b/i.test(quotes);
  if (CURRENCY.test(term)) return quotes.includes(term);
  return termRe(term).test(quotes);
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/**
 * Advert lines that claim more than the source facts support (pure): every
 * narration or dialogue sentence stating a number, a superlative or a
 * guarantee that no fact quote states. With no facts at all, every such
 * sentence is unsupported.
 */
export function claimAdvisories(pkg: Pick<FilmPackage, "scenes">, facts: SourceFact[]): ClaimAdvisory[] {
  const quotes = facts.map((f) => f.quote).join("\n");
  const out: ClaimAdvisory[] = [];
  for (const sc of pkg.scenes) {
    const lines: { source: ClaimAdvisory["source"]; text: string }[] = [
      ...(sc.narration ? [{ source: "narration" as const, text: sc.narration }] : []),
      ...sc.dialogue.map((d, i) => ({ source: { dialogue: i }, text: d.line })),
    ];
    for (const l of lines) {
      for (const s of sentences(l.text)) {
        const unsupported = claimTerms(s).filter((t) => !supported(t, quotes));
        if (unsupported.length) out.push({ sceneId: sc.id, sceneIndex: sc.index, source: l.source, sentence: s.slice(0, 300), unsupported });
      }
    }
  }
  return out;
}

/** Whether the plan shows the product as the photographed prop anywhere (A3). */
export function productShots(pkg: Pick<FilmPackage, "scenes">): { sceneIndex: number; shotIndex: number }[] {
  return pkg.scenes.flatMap((sc) => sc.shots.filter((sh) => sh.subjectIds.includes(PRODUCT_PROP_ID)).map((sh) => ({ sceneIndex: sc.index, shotIndex: sh.index })));
}
