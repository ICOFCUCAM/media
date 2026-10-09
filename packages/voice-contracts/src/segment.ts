/**
 * Long scripts (§165): never one giant request. Paragraphs → sentences →
 * segments no longer than the engine takes, each with a stable id and
 * sequence, synthesised separately and assembled on the timeline.
 */
export interface SpeechSegment {
  segmentId: string;
  sequence: number;
  text: string;
}

const SENTENCE = /[^.!?…]+(?:[.!?…]+["'”’)]*|$)/g;

function sentences(paragraph: string): string[] {
  return (paragraph.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Split one over-long sentence at commas / spaces. */
function hardSplit(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" "));
    const at = cut > max * 0.4 ? cut + 1 : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function segmentScript(text: string, maxChars = 400): SpeechSegment[] {
  const parts: string[] = [];
  for (const para of text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    let cur = "";
    for (const s of sentences(para).flatMap((x) => (x.length > maxChars ? hardSplit(x, maxChars) : [x]))) {
      if (cur && cur.length + 1 + s.length > maxChars) {
        parts.push(cur);
        cur = s;
      } else {
        cur = cur ? `${cur} ${s}` : s;
      }
    }
    if (cur) parts.push(cur); // paragraphs never share a segment (a natural pause)
  }
  return parts.map((t, i) => ({ segmentId: `seg_${String(i + 1).padStart(3, "0")}`, sequence: i + 1, text: t }));
}
