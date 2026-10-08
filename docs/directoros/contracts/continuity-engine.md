# Contract — Character Continuity Engine (W3; Part 2 §62)

Requirements: DOS-5, 32.1–32.2, 62.1–62.10.
Code: `packages/movie/src/world/continuity.ts`,
`apps/worker/src/canon/references.ts`, `apps/worker/src/processors/video.processor.ts`.

## 1. Purpose

Maintain canonical character state across the whole Film IR and stop a
generation from violating it (§62.3). Not responsible for judging generated
pixels (Visual Reviewer, W5) or for camera-axis continuity (W4).

## 2. Inputs (§62.4)

The Film IR (canon), a `GenerationRequest` — scene id, shot index, and
optionally what the generation asks for: subjects in frame, location, time of
day, and per character wardrobe, physical state, emotion, holdings, age, face,
hair, body, marks — and optionally a materialized `WorldTimeline`. The world
state version is the package's `canonVersion`. (`filmId` is the project; the
character state version is the same canon version — canon is versioned as one
document.)

## 3. Outputs (§62.6)

```ts
interface ContinuityResult {
  passed: boolean;                       // false iff any violation is blocking
  violations: ContinuityViolation[];     // code, severity, subject, expected, requested, message
  requiredReferences: AssetReference[];  // location; per framed character: identity + wardrobe; props in play
  correctedGenerationContext: GenerationContext; // what canon says the shot shows, incl. the canonical prompt
  severity: "none" | "warning" | "blocking";
  checked: string[];                     // the checks that ran
  worldStateVersion: string;
}
```

## 4. Dependencies

The World State Engine and the compiler's `shotPrompt`. Nothing else.

## 5. Forbidden behavior (§62.7)

Returning `passed: true` because the character exists. Every applicable check
runs and is listed in `checked`; a shot with a character in frame lists all of
identity, age, hair, accessories, body, wardrobe, injuries, emotion, location,
time, possessions, knowledge and presence.

## 6. Runtime behavior (§62.5)

For the shot's framed subjects against the scene's world state:

| Check | Blocking | Warning |
|---|---|---|
| presence | framed character not in the scene | — |
| identity / age / hair / body / accessories | requested face, hair, body or age ≠ canon; a canonical mark missing | — |
| wardrobe | requested ≠ scene canon; changed inside continuous action | — |
| injuries / body state | canonical injury missing from the request; injury vanished inside continuous action | different physical state; injury gone later the same day |
| emotion | — | requested ≠ scene canon |
| location / time | requested location or time of day ≠ scene | another location in frame (a view) |
| possessions | requested prop held by someone else; framed prop is with a character who is elsewhere | prop last seen elsewhere |
| knowledge | a framed speaker's line relies on a fact they do not know yet | — |

## 7. Persistence

None; the result is computed from canon on demand.

## 8. Failure behavior

At planning, framed-but-absent characters and props elsewhere are canon issues
(the plan is revised or fails). At render, the video processor runs the engine
for every Film IR shot: a blocking result fails the shot
(`CONTINUITY_VIOLATION: …`, terminal) — it is never generated against canon.

## 9. Observability

The shot's failure message names each blocking violation. Reference selection
is visible in the generation request (only framed characters' frames and LoRAs).

## 10. Acceptance tests

`packages/movie/src/world/world.test.ts` ("Character Continuity Engine"):
the full check list on a clean shot; a contradicting request blocked with the
corrected context (canonical wardrobe and prompt); injury missing; character
absent; prop elsewhere; same-day vanished injury as a warning; whole-film check.
`apps/worker/src/canon/references.test.ts`: references only for characters in
frame (none for an establishing shot); pre-W3 rows resolved by name; legacy
projects keep the inherited set; blocking result reported.

## 11. Integration test

§62.8–62.9 are proven in world-state.md's tests (the affected-shot footprint and
invalidation). Pending (W10): a GPU run showing the request carries only the
framed characters' references.

## 12. Production readiness

Reference packs per wardrobe entry (today references are per character; a
wardrobe change re-prompts but has no wardrobe reference image — W4/W6), and
the Visual Reviewer checking the generated frames against the same result (W5).
