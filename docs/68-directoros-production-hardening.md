# DirectorOS W23 — production hardening from the first live films

The first complete films (the Tiny Chef short, the Flyttgo advert) ran the
whole pipeline on real providers and a real GPU. They worked, and they showed
five faults that only appear in production. W23 fixes each one.

## 1. The master was 96 kHz

`loudnorm` works at 192 kHz and outputs at that rate; the AAC encoder then
picked its highest supported rate, so masters were 96 kHz. The mix now
resamples to 48 kHz after `loudnorm` (`aresample=48000`) and the encoder is
pinned to `-ar 48000` (`audioMixArgs`).

## 2. The master was far too quiet (-30 LUFS for a -16 target)

One-pass `loudnorm` cannot lift a quiet mix with long pauses to its target.
The render now measures the mix (EBU R128) and, when it is more than 1 LU off,
applies a second pass: a fixed gain to the target under a limiter at the
true-peak ceiling (`loudnessCorrectionArgs`). Measured with real ffmpeg: a mix
at -37.7 LUFS comes out at -16.1 LUFS, -1.6 dBTP, 48 kHz.

## 3. Shots timed out while waiting for the GPU

Several shots share one GPU; a shot waiting behind three others used up its
15-minute timeout before it started. The GPU worker now reports `queued`
until a shot holds the GPU and `running` after. `RunpodClient` counts its
run budget (`timeoutMs`, 15 min) from the first `running` poll, and an
overall `queueTimeoutMs` (60 min) bounds the wait.

## 4. One bad image key stopped every still

An invalid `OPENAI_API_KEY` failed every seed, wardrobe, location and prop
still. The image engine now chains every configured provider (default
`IMAGE_PROVIDERS=openai,fal`): when OpenAI fails the same still is asked of
fal, and only when all fail is the still recorded as failed, with every
provider's reason.

## 5. A paused film could not be resumed from the web

The budget governor pauses a film whose GPU spend passes 1.25 × its estimate.
The project page now shows **Resume production** on a paused (or failed after
planning) film. It sets `projects.resume_requested_at` (migration 0055); the
worker claims the request, raises the estimate to *spent + pending shots ×
the average of the finished shots* (330 s per shot when none has finished),
sets the film GENERATING and re-enqueues it. Finished shots are kept and cost
nothing again. Without credits the film stays paused with the reason.

## Operations (not code)

- Replace the worker's `OPENAI_API_KEY` (it returns 401): moderation and the
  OpenAI stills need it.
- Set `FAL_KEY` on the worker so the image fallback has a second provider.
