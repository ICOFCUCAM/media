/**
 * The API CineForge (and later other products) talks to — frozen now (§173):
 *
 *   POST   /v1/voices          enroll a voice (consent required)
 *   GET    /v1/voices/:id
 *   DELETE /v1/voices/:id
 *   POST   /v1/speech          one script → one job
 *   POST   /v1/speech/batch    many lines → one job
 *   GET    /v1/jobs/:id
 *
 * Requests return immediately with a job; the work is asynchronous (§159.3, §162.2).
 */
import { z } from "zod";

const lang = z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "language must look like en or en-GB");

export const ConsentSchema = z.object({
  confirmed: z.literal(true, { errorMap: () => ({ message: "consent must be confirmed" }) }),
  type: z.enum(["self", "authorised"]),
});

export const EnrollVoiceBody = z.object({
  name: z.string().trim().min(1).max(80),
  language: lang,
  /** Storage key of the uploaded recording; must be under the caller's own voices/<userId>/ prefix. */
  reference_audio_key: z.string().trim().min(1).max(512),
  consent: ConsentSchema,
});
export type EnrollVoiceBody = z.infer<typeof EnrollVoiceBody>;

export const StyleSchema = z.object({
  emotion: z.string().trim().max(40).optional(),
  energy: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  pitch: z.number().min(-12).max(12).optional(),
}).strict();

export const OutputSchema = z.object({
  format: z.literal("wav").default("wav"),
  sample_rate: z.literal(48000).default(48000),
  channels: z.literal(1).default(1),
}).default({});

export const SpeechBody = z.object({
  /** A voice the caller owns; omitted = the engine's stock narrator. */
  voice_id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(100_000),
  language: lang.default("en"),
  style: StyleSchema.optional(),
  output: OutputSchema,
});
export type SpeechBody = z.infer<typeof SpeechBody>;

export const BatchSpeechBody = z.object({
  voice_id: z.string().uuid().optional(),
  language: lang.default("en"),
  style: StyleSchema.optional(),
  items: z.array(z.object({ id: z.string().trim().min(1).max(64), text: z.string().trim().min(1).max(5000) })).min(1).max(500),
  output: OutputSchema,
});
export type BatchSpeechBody = z.infer<typeof BatchSpeechBody>;
