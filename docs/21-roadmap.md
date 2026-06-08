# 21 — Future Roadmap

## Phase 0 — Foundation (this repo)
Monorepo scaffold, schema, API/queue/model-adapter contracts, docs, local dev,
GPU-mocked pipeline.

## Phase 1 — MVP (single short films, 1–5 min)
- Director AI (multi-pass) end-to-end.
- Wan 2.1 GPU worker on RunPod (real generation).
- **Auto GPU Lifecycle Manager** ([23](23-gpu-lifecycle-manager.md)):
  start-on-demand + reference-counted auto-shutdown (70–95% GPU savings). Ship
  this from day one.
- Continuity Engine v1 (snapshots + wardrobe windows + identity refs).
- Character/World Bible CRUD + reference uploads.
- Scene pipeline + QC (blackdetect, identity, ffprobe).
- Voice (XTTS) + simple music (MusicGen) + library SFX.
- FFmpeg render → MP4 + HLS; streaming + download.
- Auth, projects, billing (Free/Creator), basic admin.

## Phase 2 — Long films & quality
- 15–120 min films via flow batching + preview-first.
- Hunyuan premium model; per-tier model gating.
- Continuity v2: rule validation endpoint, embedding-based QC regeneration.
- Scene-aware music score plan; AudioGen SFX; dialogue ducking.
- Studio tier, character LoRA training, API access.

## Phase 3 — Scale & polish
- Multi-region, partitioning, KEDA autoscaling, multi-provider GPU.
- Lip-sync (e.g. LatentSync-style) for dialogue.
- Editing UI: timeline, regenerate-in-place, reorder scenes, swap shots.
- Style presets / cinematographer LUTs; aspect-ratio variants.
- Subtitle translation / multi-language dubbing.

## Phase 4 — Platform & ecosystem
- New models plug-and-play: Kling, Veo, CogVideoX (adapters only).
- Marketplace: shareable Character/World Bibles, style packs.
- Collaboration (teams, roles, comments).
- 4K upscaling pipeline; HDR.
- Public API + SDKs; webhook events for partners.
- Enterprise: dedicated GPU pools, SSO/SAML, audit, SLA.

## Model abstraction guarantees
New providers require **only**: a new `VideoModelAdapter` in
`packages/model-adapters`, registration in the registry, and (if self-hosted) a
GPU worker image. **No frontend or API contract changes** — `modelId` is a
string the UI lists from `/models`.

## Research bets
- On-the-fly LoRA per lead character for long-film fidelity.
- Cross-scene latent anchoring for stronger continuity.
- Cheaper distilled/quantized models to cut GPU-seconds.
- Real-time preview (low-res) while full render runs.
