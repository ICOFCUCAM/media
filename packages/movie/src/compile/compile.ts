/**
 * Production Compiler (DirectorOS Part 2 §85–86, §96): Film IR → the rows the
 * production pipeline runs on. Deterministic and pure — no AI, no I/O — so the
 * same validated package always compiles to the same plan, and nothing the
 * model wrote reaches a renderer without passing through here (DOS-23.2).
 *
 * Canon is keyed by the IR's stable ids; the worker maps those keys to database
 * ids when it persists. Shot prompts are assembled from canon (identity,
 * wardrobe, location, visual style) rather than pasted prose: each shot's
 * canonical media request (prompt/canonical.ts) is compiled for the video
 * model the project uses (prompt/compilers.ts).
 */
import type { FilmCharacter, FilmLocation, FilmPackage, FilmScene, FilmShot } from "../ir/schema";
import { appearanceOf } from "./shot-prompt";
import { canonicalHash, compileGeneration } from "../prompt/canonical";
import { compileFor } from "../prompt/compilers";
import { materializeWorld } from "../world/state";

export { NEGATIVE_PROMPT, shotPrompt } from "./shot-prompt";

export interface CompiledCharacter {
  key: string;
  name: string;
  role: FilmCharacter["role"];
  age: number | null;
  gender: string | null;
  /** Canonical look as one line (the `characters.appearance` column). */
  appearance: string;
  personality: string;
  arc: string;
  voiceProfile: { description: string };
}

export interface CompiledLocation {
  key: string;
  name: string;
  kind: FilmLocation["kind"];
  description: string;
}

export interface CompiledProp {
  key: string;
  name: string;
  description: string;
  ownerKey: string | null;
}

export interface CompiledShot {
  index: number;
  durationSec: number;
  /** The video model's prompt, compiled from the canonical request (W4). */
  prompt: string;
  negativePrompt: string;
  /** What the model could not take (recorded, never silent). */
  promptDropped: string[];
  /** Hash of the model-independent canonical request. */
  canonicalHash: string;
  cameraPlan: {
    shotSize: FilmShot["size"];
    angle: FilmShot["angle"];
    movement: FilmShot["movement"];
    lens: string | null;
    transition: FilmShot["transition"];
    subjectKeys: string[];
  };
  cameraType: string;
  cameraMovement: string;
  rationale: string;
}

export interface CompiledScene {
  index: number;
  key: string;
  act: number;
  locationKey: string;
  heading: string;
  summary: string;
  timeOfDay: string;
  narration: string | null;
  /** "NAME: line" per line (the `scenes.dialogue` text column). */
  dialogueText: string | null;
  dialogue: { index: number; characterKey: string; text: string; emotion: string | null }[];
  mood: string;
  music: string | null;
  camera: string;
  characterKeys: string[];
  /** Name of the protagonist when present, else the first character (legacy `character_ref`). */
  characterRef: string | null;
  bridge: { whatJustHappened: string; whatChanged: string; whatCarriesForward: string; nextSceneRequirements: string };
  /** Continuity patch keyed by character NAME (the engine's current format), with the canon key as `key`. */
  statePatch: {
    characters: Record<string, Record<string, string>>;
    relationships: Record<string, string>;
    locations: Record<string, string>;
    world: Record<string, string>;
  };
  shots: CompiledShot[];
}

export interface CompiledFilm {
  screenplay: {
    logline: string;
    synopsis: string;
    genre: string;
    tone: string;
    acts: { act: number; purpose: string; scenes: number[] }[];
  };
  characters: CompiledCharacter[];
  locations: CompiledLocation[];
  props: CompiledProp[];
  scenes: CompiledScene[];
}

/** How the scene's characters stand with each other, after the scene's changes ("Maya → Ewan": "trust"). */
function relationshipsIn(pkg: FilmPackage, sceneAt: number): Record<string, string> {
  const sc = pkg.scenes[sceneAt]!;
  const here = new Set(sc.characters.map((c) => c.characterId));
  const name = (id: string) => pkg.cast.find((c) => c.id === id)?.name ?? id;
  const out: Record<string, string> = {};
  for (const r of pkg.relationships) {
    if (!here.has(r.a) || !here.has(r.b)) continue;
    let state = r.initial;
    for (let i = 0; i <= sceneAt; i++) {
      const ch = pkg.scenes[i]!.relationshipChanges.find((x) => x.relationshipId === r.id);
      if (ch) state = ch.becomes;
    }
    out[`${name(r.a)} → ${name(r.b)}`] = state;
  }
  return out;
}

/** Story time for the continuity preamble (rendered as "World story time: …"). */
function storyTimeLine(sc: FilmScene): Record<string, string> {
  const t = sc.storyTime;
  if (!t) return {};
  const tags = [t.flashback ? "flashback" : null, t.continuous ? "continuous with the previous scene" : null].filter(Boolean);
  return { "story time": `day ${t.day}, ${sc.timeOfDay}${tags.length ? ` (${tags.join(", ")})` : ""}` };
}

export interface CompileOptions {
  /** Registry id of the video model the shots are generated with (prompt syntax and limits). */
  modelId?: string;
}

export function compileFilm(pkg: FilmPackage, opts: CompileOptions = {}): CompiledFilm {
  const modelId = opts.modelId ?? "wan-2.1";
  const world = materializeWorld(pkg);
  const castByKey = new Map(pkg.cast.map((c) => [c.id, c]));
  const locByKey = new Map(pkg.locations.map((l) => [l.id, l]));
  const sceneIndex = new Map(pkg.scenes.map((s) => [s.id, s.index]));
  const protagonist = pkg.cast.find((c) => c.role === "protagonist") ?? pkg.cast[0]!;

  const scenes: CompiledScene[] = pkg.scenes.map((sc, i) => {
    const loc = locByKey.get(sc.locationId)!;
    const next = pkg.scenes[i + 1];
    const present = sc.characters.map((s) => s.characterId);
    const characters: Record<string, Record<string, string>> = {};
    for (const st of sc.characters) {
      const ch = castByKey.get(st.characterId)!;
      const attrs: Record<string, string> = {
        key: ch.id,
        wardrobe: ch.wardrobe.find((w) => w.id === st.wardrobeId)!.description,
        emotion: st.emotion,
      };
      if (st.physical) attrs.health = st.physical;
      if (st.holding.length) attrs.holding = st.holding.map((p) => pkg.props.find((x) => x.id === p)?.name ?? p).join(", ");
      characters[ch.name] = attrs;
    }
    const dialogue = sc.dialogue.map((d, j) => ({ index: j, characterKey: d.characterId, text: d.line, emotion: d.emotion }));
    return {
      index: sc.index,
      key: sc.id,
      act: sc.act,
      locationKey: sc.locationId,
      heading: sc.heading,
      summary: sc.summary,
      timeOfDay: sc.timeOfDay,
      narration: sc.narration,
      dialogueText: dialogue.length ? dialogue.map((d) => `${castByKey.get(d.characterKey)!.name.toUpperCase()}: ${d.text}`).join("\n") : null,
      dialogue,
      mood: `${sc.emotionalArc.start} → ${sc.emotionalArc.middle} → ${sc.emotionalArc.end}`,
      music: sc.audio.music,
      camera: sc.shots.map((s) => `${s.size}/${s.angle}/${s.movement}`).join(" · "),
      characterKeys: present,
      characterRef: present.includes(protagonist.id) ? protagonist.name : present[0] ? castByKey.get(present[0])!.name : null,
      bridge: {
        whatJustHappened: sc.bridge.whatJustHappened,
        whatChanged: sc.bridge.whatChanged,
        whatCarriesForward: sc.bridge.whatCarriesForward,
        // The next scene's purpose is this scene's hand-off requirement.
        nextSceneRequirements: next ? next.purpose : "",
      },
      statePatch: { characters, relationships: relationshipsIn(pkg, i), locations: { [loc.name]: sc.timeOfDay }, world: storyTimeLine(sc) },
      shots: sc.shots.map((sh) => ({
        index: sh.index,
        durationSec: sh.durationSec,
        ...(() => {
          const req = compileGeneration(pkg, sc.id, sh.index, world);
          const m = compileFor(modelId, req);
          return { prompt: m.prompt, negativePrompt: m.negativePrompt ?? "", promptDropped: m.dropped, canonicalHash: canonicalHash(req) };
        })(),
        cameraPlan: {
          shotSize: sh.size, angle: sh.angle, movement: sh.movement, lens: sh.lens, transition: sh.transition, subjectKeys: sh.subjectIds,
        },
        cameraType: sh.size,
        cameraMovement: sh.movement,
        rationale: sh.rationale,
      })),
    };
  });

  return {
    screenplay: {
      logline: pkg.film.logline,
      synopsis: pkg.film.synopsis,
      genre: pkg.film.genre,
      tone: pkg.film.tone,
      acts: pkg.acts.map((a) => ({ act: a.index, purpose: a.purpose, scenes: a.sceneIds.map((s) => sceneIndex.get(s)!) })),
    },
    characters: pkg.cast.map((c) => ({
      key: c.id, name: c.name, role: c.role, age: c.age, gender: c.gender, appearance: appearanceOf(c),
      personality: c.personality, arc: c.arc, voiceProfile: { description: c.voice.description },
    })),
    locations: pkg.locations.map((l) => ({ key: l.id, name: l.name, kind: l.kind, description: `${l.description} ${l.architecture}; ${l.era}.` })),
    props: pkg.props.map((p) => ({ key: p.id, name: p.name, description: p.description, ownerKey: p.ownerId })),
    scenes,
  };
}
