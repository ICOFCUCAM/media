/**
 * The Ads Studio's own writer (W32; docs/47 §8). From what the owner gives the
 * studio — a brief, the facts quoted from their page (optional), their logo
 * and product photos (optional), a creative direction, a length, a voice
 * choice — it writes:
 *
 *   1. a storyboard: the advert's beats (opening, problem, solution, how it
 *      works, outcome, call to action), each with its visual direction and the
 *      line the narrator says (or the on-screen message), editable on the page;
 *   2. from the (edited) storyboard, a complete Film IR package for the worker
 *      (projects.supplied_plan, docs/76): one five-second shot per scene, the
 *      product as `prop_product` wherever it is shown (so supplied product
 *      photos are the shots' references), narration timed to fit each scene.
 *
 * No model is called: every spoken line is the owner's own words or a fact
 * quoted from their page, so nothing is claimed that the advertiser did not
 * say. The package is held to the same validators as a Director plan.
 */
import type { FilmPackage } from "../ir/schema";
import { SPEECH_WPS, type ProductionConstraints } from "../ir/validate";
import type { PlanSourceFact } from "../intelligence/prompts";

export type AdBeat = "opening" | "problem" | "solution" | "how" | "outcome" | "cta";
export type AdAspect = "16:9" | "9:16" | "1:1";
export type AdVoice = "narrator" | "none";

/** Seconds per advert scene (KIND_PROFILES.advert.sceneSec): one shot each. */
export const AD_SCENE_SEC = 5;
/** Words the narrator can say in one scene with room to breathe (below SPEECH_WPS × AD_SCENE_SEC). */
export const AD_WORDS_PER_SCENE = Math.floor(SPEECH_WPS * AD_SCENE_SEC * 0.85);

export interface AdvertBrief {
  /** What the advert should achieve, in the owner's words (may be empty). */
  brief: string;
  seconds: number;
  /** Creative direction label (Cinematic premium, Corporate professional, …). */
  style: string;
  voice: AdVoice;
  url?: string | null;
  brand?: string | null;
  title?: string | null;
  facts?: PlanSourceFact[];
  productPhotos?: number;
  logo?: boolean;
}

export interface AdStoryScene {
  beat: AdBeat;
  title: string;
  /** Multiple of AD_SCENE_SEC. */
  seconds: number;
  /** What the scene shows: subject, setting, action. */
  visual: string;
  /** The narrator's line (or the on-screen message when there is no narration). */
  message: string;
  /** The product is in the picture (its photos guide the shot). */
  showProduct: boolean;
}

export const BEAT_LABEL: Record<AdBeat, string> = {
  opening: "Opening", problem: "The problem", solution: "The solution", how: "How it works", outcome: "The outcome", cta: "Call to action",
};

interface Look { palette: string; lighting: string; lens: string; texture: string; music: string; movement: "dolly" | "handheld" | "static" | "tracking" }
const LOOKS: Record<string, Look> = {
  cinematic: { palette: "rich contrast, warm highlights, deep shadows", lighting: "cinematic golden-hour light with soft haze", lens: "anamorphic 40mm", texture: "35mm film grain", music: "swelling cinematic strings with a confident pulse", movement: "dolly" },
  corporate: { palette: "clean neutrals with the brand's accent colour", lighting: "bright, even daylight", lens: "35mm", texture: "crisp, clean digital", music: "uplifting modern corporate piano and light percussion", movement: "tracking" },
  social: { palette: "vivid, saturated colour", lighting: "bright punchy light", lens: "24mm", texture: "sharp, high-energy", music: "upbeat electronic pop with a strong beat", movement: "handheld" },
  demo: { palette: "clean white and soft grey with the product's colours", lighting: "soft studio key light, gentle rim light", lens: "50mm macro", texture: "clean commercial", music: "light, curious electronic groove", movement: "static" },
  documentary: { palette: "natural, true-to-life colour", lighting: "natural available light", lens: "35mm", texture: "documentary, slightly textured", music: "warm acoustic guitar and soft piano", movement: "handheld" },
};
function lookOf(style: string): Look {
  const s = style.toLowerCase();
  if (s.includes("corporate")) return LOOKS.corporate!;
  if (s.includes("social") || s.includes("energ")) return LOOKS.social!;
  if (s.includes("demo") || s.includes("product")) return LOOKS.demo!;
  if (s.includes("document")) return LOOKS.documentary!;
  return LOOKS.cinematic!;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const nWords = (s: string) => words(s).length;
const sentence = (s: string) => { const t = s.trim().replace(/\s+/g, " "); return !t ? t : /[.!?…]$/.test(t) ? t : `${t}.`; };
const sentences = (s: string) => (s.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]?/g) ?? []).map((x) => x.trim()).filter(Boolean);
const hostOf = (url?: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, "") : null; } catch { return null; } };

/** The first candidate line that fits the word budget (whole sentences only; never cut mid-claim). */
function fit(budget: number, ...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!c?.trim()) continue;
    const whole = sentence(c);
    if (nWords(whole) <= budget) return whole;
    const first = sentences(c)[0];
    if (first && nWords(first) <= budget) return sentence(first);
  }
  return "";
}

/** How many scenes each beat gets, in order (pure). */
export function beatPlan(seconds: number): { beat: AdBeat; scenes: number }[] {
  const n = Math.max(1, Math.round(seconds / AD_SCENE_SEC));
  const order: AdBeat[] = n >= 6 ? ["opening", "problem", "solution", "how", "outcome", "cta"]
    : n === 5 ? ["opening", "problem", "solution", "outcome", "cta"]
    : n === 4 ? ["opening", "solution", "outcome", "cta"]
    : n === 3 ? ["opening", "solution", "cta"]
    : n === 2 ? ["solution", "cta"] : ["cta"];
  const counts = order.map(() => Math.floor(n / order.length));
  // The extra scenes go to the middle of the story (solution, how, outcome) first.
  const prefer: AdBeat[] = ["solution", "how", "outcome", "opening", "problem", "cta"];
  let left = n - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % prefer.length) {
    const at = order.indexOf(prefer[i]!);
    if (at >= 0) { counts[at]! += 1; left -= 1; }
  }
  return order.map((beat, i) => ({ beat, scenes: counts[i]! }));
}

/** The storyboard written from the brief, facts and files (pure). Every line is the owner's or the page's own words. */
export function advertStoryboard(b: AdvertBrief): AdStoryScene[] {
  const facts = b.facts ?? [];
  const brand = b.brand?.trim() || b.title?.split(/\s+[|·•–—:-]\s+/)[0]?.trim() || null;
  const name = brand ?? "the product";
  const product = facts.find((f) => f.kind === "product");
  const benefits = facts.filter((f) => f.kind === "benefit");
  const audience = facts.find((f) => f.kind === "audience");
  const cta = facts.find((f) => f.kind === "call_to_action");
  const briefLines = sentences(b.brief);
  const host = hostOf(b.url);
  const productInFrame = true;

  return beatPlan(b.seconds).map(({ beat, scenes }) => {
    const budget = AD_WORDS_PER_SCENE * scenes;
    const seconds = scenes * AD_SCENE_SEC;
    switch (beat) {
      case "opening":
        return {
          beat, seconds, title: "Make them look", showProduct: false,
          visual: `An arresting establishing shot of the world of ${name}${audience ? `: ${audience.quote}` : ""}. Atmosphere first, a reason to keep watching.`,
          message: fit(budget, briefLines[0], benefits[0]?.quote, brand ? `Meet ${brand}.` : null, "Look closer."),
        };
      case "problem":
        return {
          beat, seconds, title: "Show the need", showProduct: false,
          visual: `A relatable everyday moment: ${audience ? audience.quote : "a person"} facing the problem ${name} solves, shown with empathy.`,
          message: fit(budget, briefLines[1], audience?.quote, "There is a better way."),
        };
      case "solution":
        return {
          beat, seconds, title: "Reveal the product", showProduct: productInFrame,
          visual: `Hero reveal of ${name}${product ? `: ${product.quote}` : ""}. A memorable composition with the product clearly in frame.`,
          message: fit(budget, product?.quote, brand ? `This is ${brand}.` : null, briefLines[0]),
        };
      case "how":
        return {
          beat, seconds, title: "Make it tangible", showProduct: productInFrame,
          visual: `Close-up demonstration of ${name} in use${benefits[0] ? `: ${benefits[0].quote}` : ""}. Hands, details, the experience made concrete.`,
          message: fit(budget, benefits[0]?.quote, benefits[1]?.quote, "See how it works."),
        };
      case "outcome":
        return {
          beat, seconds, title: "Show the difference", showProduct: productInFrame,
          visual: `The result: ${audience ? audience.quote : "people"} enjoying what ${name} makes possible${benefits[1] ? ` — ${benefits[1].quote}` : ""}.`,
          message: fit(budget, benefits[1]?.quote, benefits[2]?.quote, benefits[0]?.quote, "A better way forward."),
        };
      case "cta":
        return {
          beat, seconds, title: "Make the next step clear", showProduct: productInFrame,
          visual: `Final product hero shot of ${name}, clean and confident, room for the brand lock-up${host ? ` and ${host}` : ""}.`,
          message: fit(budget, cta ? `${cta.quote}${host ? ` at ${host}` : ""}.` : null, cta?.quote, host ? `Visit ${host}.` : null, brand ? `${brand}. Find out more today.` : "Find out more today."),
        };
    }
  });
}

/** The advert's planning constraints: exactly the worker's (constraintsFor, kind advert, no cast) (pure). */
export function advertConstraints(targetSeconds: number): ProductionConstraints {
  const sceneCount = Math.max(1, Math.round(targetSeconds / AD_SCENE_SEC));
  return {
    sceneCount, sceneSec: Math.max(2, Math.round(targetSeconds / sceneCount)), sceneTolerance: 0.15,
    maxShotsPerScene: 1, maxShotSec: AD_SCENE_SEC, targetSeconds, filmTolerance: 0.15,
  };
}

/** Problems with an edited storyboard that would stop the advert being produced (pure). */
export function storyboardIssues(scenes: AdStoryScene[], seconds: number, voice: AdVoice): string[] {
  const out: string[] = [];
  const n = Math.max(1, Math.round(seconds / AD_SCENE_SEC));
  const total = scenes.reduce((a, s) => a + Math.max(1, Math.round(s.seconds / AD_SCENE_SEC)), 0);
  if (!scenes.length) out.push("The storyboard has no scenes.");
  if (total !== n) out.push(`The scenes add up to ${total * AD_SCENE_SEC} s; the ad is ${n * AD_SCENE_SEC} s long. Change a scene's length so they match.`);
  scenes.forEach((s, i) => {
    if (!s.visual.trim()) out.push(`Scene ${i + 1} ("${s.title}") needs a visual direction.`);
    const k = Math.max(1, Math.round(s.seconds / AD_SCENE_SEC));
    if (voice === "narrator" && nWords(s.message) > AD_WORDS_PER_SCENE * k) {
      out.push(`Scene ${i + 1} ("${s.title}"): the line has ${nWords(s.message)} words; at most ${AD_WORDS_PER_SCENE * k} fit in ${k * AD_SCENE_SEC} s.`);
    }
  });
  return out;
}

/** Split a line into `k` parts of whole words, each within the per-scene budget (pure). */
function spread(line: string, k: number): string[] {
  const w = words(line);
  if (k <= 1 || w.length <= AD_WORDS_PER_SCENE) return [w.join(" "), ...Array(Math.max(0, k - 1)).fill("")];
  // Break at sentence ends where possible, else evenly.
  const parts: string[] = [];
  let cur: string[] = [];
  for (const word of w) {
    cur.push(word);
    if (cur.length >= AD_WORDS_PER_SCENE || (/[.!?…]$/.test(word) && cur.length >= Math.ceil(w.length / k))) { parts.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) parts.push(cur.join(" "));
  while (parts.length < k) parts.push("");
  return parts.slice(0, k);
}

const SHOT_OF: Record<AdBeat, { size: "EWS" | "WS" | "MS" | "MCU" | "CU" | "ECU" | "INSERT"; angle: "eye" | "low" | "high"; emotion: string }[]> = {
  opening: [{ size: "EWS", angle: "high", emotion: "curious" }, { size: "WS", angle: "eye", emotion: "intrigued" }, { size: "MS", angle: "eye", emotion: "drawn in" }],
  problem: [{ size: "MS", angle: "eye", emotion: "frustrated" }, { size: "MCU", angle: "eye", emotion: "weary" }, { size: "CU", angle: "eye", emotion: "longing" }],
  solution: [{ size: "MS", angle: "low", emotion: "impressed" }, { size: "CU", angle: "eye", emotion: "delighted" }, { size: "WS", angle: "low", emotion: "confident" }],
  how: [{ size: "CU", angle: "high", emotion: "engaged" }, { size: "INSERT", angle: "high", emotion: "focused" }, { size: "MCU", angle: "eye", emotion: "satisfied" }],
  outcome: [{ size: "MS", angle: "eye", emotion: "relieved" }, { size: "MCU", angle: "eye", emotion: "happy" }, { size: "WS", angle: "eye", emotion: "content" }],
  cta: [{ size: "MS", angle: "low", emotion: "confident" }, { size: "CU", angle: "eye", emotion: "assured" }, { size: "WS", angle: "eye", emotion: "inviting" }],
};

/**
 * The Film IR package for the worker, from the brief and the (edited)
 * storyboard (pure). Each storyboard scene becomes as many five-second scenes
 * as its length needs, each with one shot; the person appears where the story
 * is about them, the product where it is shown.
 */
export function advertPackage(b: AdvertBrief, board: AdStoryScene[]): FilmPackage {
  const look = lookOf(b.style);
  const brand = b.brand?.trim() || null;
  const name = brand ?? "the product";
  const facts = b.facts ?? [];
  const product = facts.find((f) => f.kind === "product");
  const audience = facts.find((f) => f.kind === "audience");
  const title = (brand ? `${brand} — advert` : (b.title?.trim() || "Advert")).slice(0, 120);
  // The customer is in the story beats; a short advert with none of them shows them with the product.
  const people = true;
  const storyBeats = board.some((s) => s.beat === "problem" || s.beat === "how" || s.beat === "outcome");
  const isDemo = look === LOOKS.demo;

  type Scene = FilmPackage["scenes"][number];
  const scenes: Scene[] = [];
  for (const s of board) {
    const k = Math.max(1, Math.round(s.seconds / AD_SCENE_SEC));
    const lines = b.voice === "narrator" ? spread(s.message, k) : Array(k).fill("");
    for (let j = 0; j < k; j++) {
      const i = scenes.length;
      const withPerson = people && (s.beat === "problem" || s.beat === "outcome" || (s.beat === "how" && j % 2 === 0) || (s.beat === "opening" && j > 0)
        || (!storyBeats && s.beat === "solution" && j === 0) || (!storyBeats && board.length === 1 && j === 0));
      const withProduct = s.showProduct;
      const studio = s.beat === "solution" || s.beat === "cta" || (s.beat === "how" && isDemo);
      const shotKind = SHOT_OF[s.beat][j % 3]!;
      const subjectIds = [
        ...(withPerson ? ["char_person"] : []),
        ...(withProduct ? ["prop_product"] : []),
      ];
      const continuing = j > 0 ? " The moment continues from the previous shot." : "";
      scenes.push({
        id: `scene_${String(i + 1).padStart(2, "0")}`,
        index: i,
        act: s.beat === "opening" || s.beat === "problem" ? 1 : s.beat === "cta" ? 3 : 2,
        heading: `${studio ? "INT. BRAND STUDIO" : "EXT. THE WORLD OF " + name.toUpperCase()} - DAY`.slice(0, 120),
        locationId: studio ? "loc_studio" : "loc_world",
        timeOfDay: "day",
        storyTime: { day: 1, continuous: j > 0, flashback: false },
        reveals: [],
        relationshipChanges: [],
        goalChanges: withPerson ? [{ goalId: "goal_main", status: "advanced" }] : [],
        devices: [],
        deaths: [],
        purpose: `${BEAT_LABEL[s.beat]}: ${s.title}`.slice(0, 300),
        summary: s.visual.slice(0, 600),
        emotionalArc: { start: shotKind.emotion, middle: shotKind.emotion, end: shotKind.emotion },
        beats: [s.title.slice(0, 200)],
        characters: withPerson ? [{ characterId: "char_person", wardrobeId: "wardrobe_person", emotion: shotKind.emotion, physical: null, holding: [] }] : [],
        dialogue: [],
        narration: lines[j]?.trim() ? sentence(lines[j]!) : null,
        bridge: {
          whatJustHappened: i === 0 ? "the advert opens" : scenes[i - 1]!.summary.slice(0, 200),
          whatChanged: s.title.slice(0, 200),
          whatCarriesForward: s.beat === "cta" ? "the call to action" : name,
        },
        audio: { music: look.music, ambience: studio ? "quiet studio room tone" : "gentle everyday ambience", sfx: [] },
        shots: [{
          index: 0,
          durationSec: AD_SCENE_SEC,
          size: shotKind.size,
          angle: shotKind.angle,
          movement: s.beat === "how" || isDemo ? "static" : look.movement,
          lens: look.lens,
          subjectIds: subjectIds.length ? subjectIds : [studio ? "loc_studio" : "loc_world"],
          action: `${s.visual}${continuing}`.slice(0, 600),
          emotion: shotKind.emotion,
          lighting: look.lighting,
          transition: i === 0 ? "fade_in" : s.beat === "cta" && j === k - 1 ? "fade_out" : "cut",
          side: "neutral",
          screenDirection: null,
          rationale: `${BEAT_LABEL[s.beat]} beat of the advert.`,
        }],
        rationale: `${BEAT_LABEL[s.beat]}: ${s.title}.`,
      } as Scene);
    }
  }

  // The customer's goal is reached once: in the last scene they appear in.
  const lastWithGoal = [...scenes].reverse().find((s) => s.goalChanges.length);
  if (lastWithGoal) lastWithGoal.goalChanges = [{ goalId: "goal_main", status: "achieved" }];
  const sceneIds = scenes.map((s) => s.id);
  const actIds = (a: number) => scenes.filter((s) => s.act === a).map((s) => s.id);
  const acts = [1, 2, 3].filter((a) => actIds(a).length).map((a, i) => ({
    index: i + 1, purpose: a === 1 ? "hook the audience" : a === 2 ? "show the product and its value" : "the call to action", sceneIds: actIds(a),
  }));
  // Acts are numbered in order; scenes carry the act they belong to.
  const actOf = new Map<number, number>([1, 2, 3].filter((a) => actIds(a).length).map((a, i) => [a, i + 1]));
  for (const s of scenes) s.act = actOf.get(s.act)!;

  return {
    irVersion: 1,
    film: {
      title,
      logline: (product?.quote ?? (b.brief.trim() || `An advert for ${name}.`)).slice(0, 300),
      synopsis: board.map((s) => `${BEAT_LABEL[s.beat]}: ${s.title}.`).join(" ").slice(0, 2000),
      genre: "advertising",
      tone: b.style.slice(0, 120) || "confident, warm",
      themes: ["the product's value", "a better everyday"],
      visualStyle: { palette: look.palette, lighting: look.lighting, lensLanguage: `${look.lens}, ${look.movement} camera`, texture: look.texture },
      audioStyle: { score: look.music, ambience: "clean, uncluttered" },
      rationale: "Written by the Ads Studio from the owner's brief and quoted page facts; every spoken line is the owner's or the page's own words.",
    },
    cast: people ? [{
      id: "char_person", name: "The customer", role: "protagonist", age: null, gender: null,
      identity: { face: "friendly, expressive face", hair: "natural, neat hair", body: "average build", marks: [] },
      wardrobe: [{ id: "wardrobe_person", description: "smart casual everyday clothes in muted colours" }],
      personality: "warm, relatable",
      voice: { description: "natural" },
      design: null,
      arc: "from a frustrating need to an easy solution",
      rationale: audience ? `Stands for the audience the page names: ${audience.quote}`.slice(0, 300) : "Stands for the audience of the advert.",
    }] : [],
    locations: [
      { id: "loc_world", name: `The world of ${name}`.slice(0, 120), kind: "EXTERIOR", description: `the everyday setting where ${audience ? audience.quote : "the audience"} meets ${name}`.slice(0, 600), architecture: "contemporary", era: "present day", lighting: look.lighting, rationale: "Where the audience lives the problem and the result." },
      { id: "loc_studio", name: "Brand studio", kind: "INTERIOR", description: `a clean set built to show ${name} at its best`.slice(0, 600), architecture: "seamless studio set", era: "present day", lighting: look.lighting, rationale: "Where the product is shown clearly." },
    ],
    props: [{ id: "prop_product", name: name.slice(0, 120), description: (product?.quote ?? `${name}, as the advertiser presents it`).slice(0, 600), ownerId: null }],
    relationships: [],
    goals: people ? [{ id: "goal_main", characterId: "char_person", want: (b.brief.trim() || `to get what ${name} offers`).slice(0, 300), stakes: "the problem stays unsolved" }] : [],
    facts: [],
    acts,
    threads: [{ id: "thread_main", kind: "plot", description: `the audience discovers ${name}`.slice(0, 300), sceneIds, answerFactId: null }],
    setups: [],
    scenes,
  } as unknown as FilmPackage;
}
