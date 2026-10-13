/**
 * Website reading without a model (Ads Studio W32; docs/47 §5b). The page's
 * own structure — its title and description, its headings and list items,
 * its buttons and links — is read into the same source facts the model
 * produces (product, benefits, audience, call to action), each quoted from the
 * page text exactly as `verifyFacts` would accept it. Nothing is paraphrased
 * into a claim: a fact's statement is the page's own words.
 *
 * Used when no model is configured for site_analysis, or when the model call
 * fails (for example, the provider's credit is spent). The page's pictures
 * (its share image, icons and large images) come back too, so the storyboard
 * can show the advertiser's own visuals.
 */
import { decodeEntities, htmlAttr, htmlToText } from "./site-fetch";
import { FACT_LIMITS, findQuote, QUOTE_MAX, type SourceFact } from "./site";

export interface ExtractedSite {
  title: string | null;
  brand: string | null;
  facts: SourceFact[];
  /** The page's own pictures, absolute http(s) URLs, best first. */
  images: string[];
  /** A logo candidate: an icon or an image whose name or alt text says logo. */
  logo: string | null;
}

/** Words that mark site furniture, not product copy. */
const FURNITURE = /^(home|about( us)?|blog|news|contact( us)?|log ?in|sign ?in|login|careers|jobs|privacy( policy)?|terms( of (service|use))?|cookies?( policy| settings)?|faq|help|support|menu|search|english|language|skip to (main )?content|close|back|next|previous|read more|more|all rights reserved.*|©.*|copyright.*|follow us|share|subscribe to our newsletter)$/i;
const CTA = /\b(get started|start (now|free|today|your|a)|book( a)? (demo|call|now|today|consultation)|request (a )?(demo|quote)|try( it)?( for)? free|free trial|sign ?up|join( now| us| today)?|buy now|shop( now)?|order( now)?|get (a )?(quote|offer|app|the app|in touch)|download|contact sales|talk to (sales|us)|schedule|reserve|subscribe|register|apply( now)?|learn more|discover|explore)\b/i;
/** A short button or link that starts with an action verb ("Book a move", "Get the app"). */
const IMPERATIVE = /^(book|get|start|try|buy|shop|order|join|sign up|signup|download|contact|talk|schedule|reserve|subscribe|register|apply|request|claim|call|hire|find|create|build|plan|see|watch|discover|explore|learn|visit|chat|enquire|inquire)\b/i;
const isCta = (s: string) => CTA.test(s) || IMPERATIVE.test(s);
const AUDIENCE = /\b(for|designed for|built for|made for|ideal for|perfect for|trusted by|helps?|lets?|enables?)\s+(you|your|teams?|businesses|companies|brands|families|people|customers|clients|developers|creators|drivers|owners|professionals|students|parents|anyone|everyone|small|independent|local|growing|busy|modern|[a-z]+ (teams|businesses|owners|companies))\b/i;

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

/** Text of every element of the given tags, in page order (pure). */
function blocks(html: string, tags: string): { tag: string; text: string; raw: string }[] {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const re = new RegExp(`<(${tags})\\b([^>]*)>([\\s\\S]*?)<\\/\\1\\s*>`, "gi");
  const out: { tag: string; text: string; raw: string }[] = [];
  for (const m of body.matchAll(re)) {
    const text = clean(m[3] ?? "");
    if (text) out.push({ tag: m[1]!.toLowerCase(), text, raw: m[2] ?? "" });
  }
  return out;
}

/** The part of the nav/header/footer-free page that holds the copy. */
function content(html: string): string {
  return html.replace(/<(nav|footer)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

function meta(html: string, ...names: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const n = (htmlAttr(tag, "property") ?? htmlAttr(tag, "name") ?? "").toLowerCase();
    if (names.includes(n)) {
      const c = htmlAttr(tag, "content");
      if (c?.trim()) return clean(c);
    }
  }
  return null;
}

/** The first sentence of a passage, at most `max` characters (pure). */
function firstSentence(s: string, max = 220): string {
  const m = s.match(/^.{12,}?[.!?](?=\s|$)/);
  const one = (m ? m[0] : s).trim();
  return one.length <= max ? one : one.slice(0, max).replace(/\s+\S*$/, "");
}

function absolute(src: string | null, base: string): string | null {
  if (!src || /^data:/i.test(src)) return null;
  try {
    const u = new URL(decodeEntities(src.trim()), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The page's pictures: share image first, then large content images; and a logo candidate (pure). */
export function siteImages(html: string, baseUrl: string): { images: string[]; logo: string | null } {
  const images: string[] = [];
  const add = (u: string | null) => { if (u && !images.includes(u) && images.length < 12) images.push(u); };
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const n = (htmlAttr(tag, "property") ?? htmlAttr(tag, "name") ?? "").toLowerCase();
    if (n === "og:image" || n === "og:image:url" || n === "twitter:image") add(absolute(htmlAttr(tag, "content"), baseUrl));
  }
  let logo: string | null = null;
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = htmlAttr(tag, "src") ?? htmlAttr(tag, "data-src") ?? htmlAttr(tag, "srcset")?.split(/\s+/)[0] ?? null;
    const url = absolute(src, baseUrl);
    if (!url) continue;
    const alt = htmlAttr(tag, "alt") ?? "";
    const w = Number(htmlAttr(tag, "width") ?? 0);
    const h = Number(htmlAttr(tag, "height") ?? 0);
    if (/logo|brand|wordmark/i.test(`${alt} ${url}`)) { logo ??= url; continue; }
    // Tracking pixels, spacers and icons are not pictures of the product.
    if ((w && w < 120) || (h && h < 80) || /\.(svg|gif)(\?|$)|pixel|spacer|sprite|avatar|icon/i.test(url)) continue;
    add(url);
  }
  if (!logo) {
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const rel = (htmlAttr(tag, "rel") ?? "").toLowerCase();
      if (rel.includes("apple-touch-icon") || rel === "icon") { logo = absolute(htmlAttr(tag, "href"), baseUrl); if (logo) break; }
    }
  }
  return { images, logo };
}

/**
 * Source facts from the page's structure (pure). Every quote is found in the
 * page text by `findQuote`, as `verifyFacts` requires; anything not found is
 * left out.
 */
export function extractSite(html: string, baseUrl: string): ExtractedSite {
  const { title, description, text } = htmlToText(html);
  const facts: SourceFact[] = [];
  const seen = new Set<string>();
  const push = (kind: SourceFact["kind"], statement: string, quote: string) => {
    if (facts.filter((f) => f.kind === kind).length >= FACT_LIMITS[kind]) return;
    const q = findQuote(text, quote.slice(0, QUOTE_MAX));
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ kind, statement: statement.slice(0, 300), quote: q });
  };

  const main = content(html);
  const heads = blocks(main, "h1|h2|h3");
  const items = blocks(main, "li");
  const paras = blocks(main, "p");
  const actions = [...blocks(html, "button"), ...blocks(html, "a")];

  // The brand: the site's name, else the shortest part of the title that the page repeats.
  const siteName = meta(html, "og:site_name", "application-name");
  const titleParts = (title ?? "").split(/\s+[|·•–—:-]\s+/).map((s) => s.trim()).filter((s) => s && s.length <= 40);
  const brandRaw = siteName ?? [...titleParts].sort((a, b) => a.length - b.length)[0] ?? null;
  const brand = brandRaw ? findQuote(text, brandRaw) : null;

  // Product: what the page says it is (its description), else its main heading and the paragraph after it.
  const lead = description ?? meta(html, "og:description", "twitter:description");
  const h1 = heads.find((h) => h.tag === "h1")?.text ?? null;
  if (lead) push("product", sentence(firstSentence(lead)), firstSentence(lead));
  else if (h1) push("product", sentence(h1), h1);
  if (!facts.length) {
    const p = paras.find((x) => words(x.text) >= 6);
    if (p) push("product", sentence(firstSentence(p.text)), firstSentence(p.text));
  }

  // Benefits: short headings and list items that are copy, not navigation or calls to action.
  const benefitLike = (s: string) => {
    const n = words(s);
    return n >= 3 && n <= 18 && s.length <= 160 && !FURNITURE.test(s) && !(words(s) <= 6 && isCta(s)) && !/^https?:|@/.test(s);
  };
  for (const b of [...heads.filter((h) => h.tag !== "h1"), ...items]) {
    if (benefitLike(b.text)) push("benefit", sentence(b.text), b.text);
  }
  if (h1 && lead && benefitLike(h1)) push("benefit", sentence(h1), h1);

  // Audience: a sentence that says who it is for.
  for (const b of [...heads, ...paras, ...items]) {
    const m = b.text.match(/[^.!?]*\b(for|designed for|built for|made for|ideal for|perfect for|trusted by|helps?|lets?|enables?)\b[^.!?]*[.!?]?/i);
    const s = m?.[0]?.trim();
    if (s && AUDIENCE.test(s) && words(s) >= 3 && s.length <= 200) push("audience", sentence(s), s);
  }

  // Call to action: the first button or link whose words ask the visitor to act.
  // Buttons first: a link that asks to act is weaker evidence than a button.
  const cta = [...actions.filter((a) => a.tag === "button" || /\b(btn|button|cta)\b/i.test(a.raw)), ...actions]
    .find((a) => words(a.text) <= 6 && isCta(a.text) && !FURNITURE.test(a.text));
  if (cta) push("call_to_action", `The page invites visitors to "${cta.text}".`, cta.text);

  const pics = siteImages(html, baseUrl);
  return { title, brand, facts, images: pics.images, logo: pics.logo };
}
