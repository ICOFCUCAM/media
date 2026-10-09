/**
 * The voice benchmark (DirectorOS Part 4 §136.2–136.3): the same scripts,
 * through every engine CineForge may use, in the owner's own voice, measured
 * the same way.
 *
 *   scripts   30-second, 2-minute and 10-minute narration; an emotional, a
 *             documentary and a conversational script; Norwegian, English
 *             and French.
 *   measures  pronunciation (the speech transcribed back and compared to the
 *             script: word error rate), generation speed (real-time factor),
 *             long-form consistency (loudness and pace across the segments of
 *             one script), licensing (the licence registry).
 *             Voice similarity, naturalness and VRAM are reported as NOT
 *             MEASURED until something can measure them honestly: similarity
 *             needs a speaker-embedding model (self-hosted, Phase 1),
 *             naturalness needs listeners, VRAM needs a self-hosted engine.
 *
 * The texts are original, written for this benchmark.
 */

export type BenchScriptKind = "narration_30s" | "narration_2m" | "narration_10m" | "emotional" | "documentary" | "conversational";

export interface BenchScript {
  id: string;
  kind: BenchScriptKind;
  language: "en" | "no" | "fr";
  text: string;
}

const LONG_PASSAGES = [
  "The lighthouse keeper's log begins in a careful hand. Wind from the south-west, rising. Two fishing boats returned before dark; a third did not. He writes the names of the men aboard and then, beneath them, the time the lamp was lit. Every entry ends the same way, with the hour and the words all clear, as if the sea could be persuaded by repetition. Nobody reads the log now. It sits in a museum drawer, and the light it describes was switched off by a computer forty years ago.",
  "Cities keep their own kind of time. A bakery opens at four, a night bus finishes its last loop at five, and for one hour the streets belong to street sweepers and foxes. Then the trams begin, the cafés unfold their chairs, and a million private alarms go off within minutes of each other. Planners call this the morning peak. People who live through it call it Tuesday. Either way, the city wakes in the same order every day, like an orchestra tuning before anyone has asked it to play.",
  "Rivers do not run straight for long. Give a channel enough time and it bends, because the outside of every curve is cut faster than the inside is filled. The bends grow until two of them meet, and the river takes the shortcut, leaving a quiet lake shaped like a horseshoe. Farmers, surveyors and mapmakers have argued for centuries about where the old riverbed really was. The river has never once taken part in the argument. It simply moves on, a little further every flood season.",
  "The first recorded weather forecast in a newspaper was printed with a warning that it might be wrong. Readers complained anyway. The forecaster, a former ship's captain, had lost men to storms that nobody saw coming, and he believed that a cautious guess was better than silence. Today forecasts are built from millions of measurements and run on machines that fill entire buildings, but the principle has not changed: tell people what is likely, tell them how sure you are, and let them decide whether to take the umbrella.",
  "Most of the light in a forest never reaches the ground. The tallest trees take the sunlight first, the middle layer takes what slips past, and the floor survives on scraps. Seedlings there can wait for decades, barely growing, until a storm brings down an old giant and opens a window in the canopy. Then the race begins. Whichever young tree reaches the gap first will hold it for a century. Foresters call it patience. The seedlings, if they could speak, might call it waiting for an accident.",
];

export const BENCH_SCRIPTS: BenchScript[] = [
  {
    id: "en-narration-30s", kind: "narration_30s", language: "en",
    text: "Every morning at six, the ferry leaves the harbour with the same three passengers: a nurse finishing her night shift, a boy with a cello case, and an old man who never says where he is going. Today the boy is missing. The nurse notices first. The old man notices second, and for the first time in eleven years, he speaks.",
  },
  {
    id: "en-narration-2m", kind: "narration_2m", language: "en",
    text: [LONG_PASSAGES[0], LONG_PASSAGES[1], LONG_PASSAGES[2]].join(" "),
  },
  {
    id: "en-narration-10m", kind: "narration_10m", language: "en",
    text: [...LONG_PASSAGES, ...LONG_PASSAGES, ...LONG_PASSAGES].join(" "),
  },
  {
    id: "en-emotional", kind: "emotional", language: "en",
    text: "I kept the letter for twenty years. I never opened it. I told myself I was waiting for the right moment, but the truth is I was afraid of what it would say, and more afraid of what it wouldn't. Tonight I finally read it. Three lines. She wasn't angry. She never had been. She just wanted me to come home. And I didn't. I didn't.",
  },
  {
    id: "en-documentary", kind: "documentary", language: "en",
    text: "In the high valleys of the Andes, farmers have grown potatoes for more than seven thousand years. Over that time they have bred thousands of varieties, each suited to a particular slope, soil and altitude. Some survive frost; some resist drought; some are freeze-dried in the open air to last through winter. Scientists now travel to these valleys to study what the farmers have always known: that diversity, not uniformity, is the best defence against a changing climate.",
  },
  {
    id: "en-conversational", kind: "conversational", language: "en",
    text: "Okay, so here's the thing. I thought the meeting was at three. It was at two. I walk in, everyone's already packing up, and my manager just looks at me and says, nice of you to drop by. And I'm standing there holding two coffees, one of which was for him, by the way. So I hand it over. He takes it. Doesn't say a word. Best meeting I've ever been to, honestly.",
  },
  {
    id: "no-narration-30s", kind: "narration_30s", language: "no",
    text: "Hver morgen klokka seks forlater ferja havna med de samme tre passasjerene: en sykepleier som er ferdig med nattevakta, en gutt med en cellokasse og en gammel mann som aldri sier hvor han skal. I dag mangler gutten. Sykepleieren merker det først. Den gamle mannen merker det etterpå, og for første gang på elleve år sier han noe.",
  },
  {
    id: "fr-narration-30s", kind: "narration_30s", language: "fr",
    text: "Chaque matin à six heures, le ferry quitte le port avec les trois mêmes passagers : une infirmière qui termine sa garde de nuit, un garçon avec un étui de violoncelle, et un vieil homme qui ne dit jamais où il va. Aujourd'hui, le garçon n'est pas là. L'infirmière le remarque la première. Le vieil homme le remarque ensuite et, pour la première fois depuis onze ans, il parle.",
  },
];

/** Words for comparing a transcript with its script: lower case, no punctuation. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate: (substitutions + deletions + insertions) / words in the script. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const r = normalizeWords(reference);
  const h = normalizeWords(hypothesis);
  if (!r.length) return h.length ? 1 : 0;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[h.length]! / r.length;
}

export interface SegmentMeasure {
  words: number;
  durationSec: number;
  integratedLufs: number | null;
}

/**
 * Long-form consistency across one script's segments (§136.3): how far the
 * loudness wanders (max − min LUFS) and how much the pace varies (coefficient
 * of variation of words per second). Fewer than two segments: not measurable.
 */
export function consistency(segments: SegmentMeasure[]): { loudnessSpreadLu: number | null; paceCv: number | null } {
  if (segments.length < 2) return { loudnessSpreadLu: null, paceCv: null };
  const lufs = segments.map((s) => s.integratedLufs).filter((x): x is number => x !== null && Number.isFinite(x));
  const pace = segments.filter((s) => s.durationSec > 0).map((s) => s.words / s.durationSec);
  const mean = pace.reduce((a, b) => a + b, 0) / (pace.length || 1);
  const sd = Math.sqrt(pace.reduce((a, b) => a + (b - mean) ** 2, 0) / (pace.length || 1));
  return {
    loudnessSpreadLu: lufs.length >= 2 ? Math.max(...lufs) - Math.min(...lufs) : null,
    paceCv: pace.length >= 2 && mean > 0 ? sd / mean : null,
  };
}

export interface BenchCaseResult {
  engine: string;
  script: string;
  language: string;
  kind: BenchScriptKind;
  ok: boolean;
  error?: string;
  /** Seconds of speech produced. */
  audioSec?: number;
  /** Generation wall time / audio length (lower is faster). */
  realTimeFactor?: number;
  /** Null: no transcriber configured. */
  wer?: number | null;
  loudnessSpreadLu?: number | null;
  paceCv?: number | null;
}

export const NOT_MEASURED = {
  voiceSimilarity: "not measured — needs a speaker-embedding model (self-hosted, waits on Phase 1)",
  naturalness: "not measured — needs listener ratings",
  vram: "not applicable to cloud engines; reported by a self-hosted engine once one runs",
} as const;

/** One engine's summary over every script (medians, so one bad case does not hide the rest). */
export function summarizeEngine(results: BenchCaseResult[]): Record<string, number | null> {
  const ok = results.filter((r) => r.ok);
  const median = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) / 2)]! : null;
  };
  return {
    cases: results.length,
    succeeded: ok.length,
    medianWer: median(ok.map((r) => r.wer)),
    medianRealTimeFactor: median(ok.map((r) => r.realTimeFactor)),
    medianLoudnessSpreadLu: median(ok.map((r) => r.loudnessSpreadLu)),
    medianPaceCv: median(ok.map((r) => r.paceCv)),
  };
}
