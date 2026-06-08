# 14 — Storage System (S3-compatible)

All binary assets live in S3-compatible object storage (MinIO in dev; AWS
S3 / Cloudflare R2 / Backblaze B2 in prod). DB stores **keys**, never blobs.

## Bucket layout
```
cineforge-assets/
  projects/{projectId}/
    references/
      characters/{characterId}/{uuid}.png      # identity refs
      locations/{locationId}/{uuid}.png
    scenes/{sceneId}/
      shots/{shotId}.mp4                        # raw generated clips
      shots/{shotId}.jpg                        # thumbnails
      audio/voice/{lineId}.wav
      audio/music/{trackId}.mp3
      audio/sfx/{trackId}.wav
      scene.mp4                                 # per-scene render
    renders/{renderJobId}/work/...              # transient render workspace
    film/
      final.mp4
      poster.jpg
      subtitles.srt
      hls/master.m3u8 + stream_*.m3u8 + *.ts
```

## Access patterns
- **Uploads (user refs):** API issues **presigned PUT** URLs
  (`POST /characters/:id/reference` → `{ uploadUrl, key }`). Browser uploads
  directly to S3 — no proxying through the API.
- **GPU/worker writes:** workers use IAM/service creds scoped to the bucket.
- **Streaming reads:** HLS served via CDN in front of S3; playback URL is a
  short-lived signed `master.m3u8`.
- **Downloads:** short-lived **presigned GET** for `final.mp4`.

## Lifecycle / tiering
| Class | Data | Policy |
|-------|------|--------|
| Hot | final films, posters, HLS | CDN-cached, kept warm |
| Warm | scene renders, recent shots | standard |
| Cold | raw shots of completed projects | transition to IA/Glacier after 30d |
| Transient | render workspace | auto-delete after job (lifecycle rule, 1d) |

## Mapping to DB keys
- `Shot.videoKey`, `Shot.thumbnailKey`
- `AudioTrack.key`, `DialogueLine.audioKey`
- `Character.referenceUrls[]`, `Location.referenceUrls[]`
- `Film.mp4Key`, `Film.hlsKey`, `Film.posterKey`, `Film.subtitleKey`
- `RenderJob.outputKey`

## Storage service (`apps/api/src/storage`)
```ts
presignPut(key, contentType, ttl=900): { url, key }
presignGet(key, ttl=300): string
publicCdnUrl(key): string               // for HLS via CDN
deletePrefix(prefix): Promise<void>     // project deletion
```

## Security
- Bucket is **private**; all access via presigned URLs or CDN signed tokens.
- Per-project prefix isolation; validate `projectId` ownership before signing.
- Server-side encryption (SSE-S3/KMS). See [17-security.md](17-security.md).

## Cost
- Prefer **R2/B2** (no egress fees) for streaming-heavy workloads.
- CDN caching slashes origin reads.
- Cold-tier raw shots; only finished films stay hot.

## Implementation checklist
- [ ] S3 client + presign (PUT/GET) + CDN signing
- [ ] Ownership checks before signing
- [ ] Lifecycle rules (transient cleanup, cold tiering)
- [ ] Project-delete cascade (`deletePrefix`)
