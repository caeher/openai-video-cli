# Workflows

Build first (`pnpm build`). Examples use `oaivideo` after installation; in a checkout replace it with `node dist/cli.js`. Every workflow may add `--json`. Existing outputs are protected. Paid commands require your own account/key and explicit cost authorization.

## Prepare local fixtures

```sh
pnpm exec tsx scripts/demo-assets.ts
```

Run this preparation script from the source checkout (it uses development dependencies and is not part of the installed NPM package). Requires FFmpeg. Creates geometric PNG/mask assets and two deterministic clips under `examples/assets`. These are local demonstration assets and are never labeled AI-generated. In an installed package, supply your own local assets at the example paths. Use your own authorized media for real production.

## 1. Text-to-video interface

```sh
oaivideo generate --prompt "A tropical island at sunset" --seconds 12 --output island.mp4 --json
```

Currently exits 1 with `NO_ACTIVE_VIDEO_API`, sends no request and creates no video. The interface is preserved for a future reviewed official provider. This is an unavailable-operation example, not a working Sora invocation.

## 2. Image-to-video interface and independent image generation

```sh
oaivideo animate --image examples/assets/landscape.png --prompt "Trees sway in a light wind" --output animated.mp4 --json
oaivideo image generate --prompt "A tropical island" --output island.png --dry-run --json
```

`animate` exits with an unavailable native capability; there is no silent text-only replacement. For an actual image request, remove `--dry-run`, set `OPENAI_API_KEY`, and add `--allow-unknown-cost --confirm-cost`. Generating an image does not generate a video.

## 3. Typed visual references

```sh
oaivideo references inspect --image examples/assets/landscape.png --kind image --json
oaivideo references inspect --image examples/assets/landscape.png --kind first_frame --json
oaivideo references inspect --image examples/assets/landscape.png --kind last_frame --json
```

Metadata inspection works locally. `generate --reference ...`, `--first-frame` and `--last-frame` cannot submit to an unavailable API. A character portrait is not a reusable provider character ID.

## 4–6. Native edit, extension and remix interfaces

```sh
oaivideo edit --input examples/assets/clip-a.mp4 --prompt "Make the scene snowy" --output winter.mp4 --json
oaivideo extend --input examples/assets/clip-a.mp4 --prompt "Continue moving toward the shore" --json
oaivideo remix --input examples/assets/clip-a.mp4 --prompt "Use a warmer visual palette" --json
```

All three currently exit 1 before any API request. Concatenating clips locally is a separate operation and never counts as generative extension. No historical remix endpoint is re-enabled.

## 7. Reusable native characters

```sh
oaivideo characters create --name Traveler --video examples/assets/clip-a.mp4 --json
oaivideo characters list --json
oaivideo characters inspect CHARACTER_ID --json
oaivideo characters delete CHARACTER_ID --json
```

Unavailable until an official provider documents support and input restrictions. These commands do not upload a reference clip or claim it meets native character requirements.

## 8. Descriptive camera control

```sh
oaivideo prompt build --template cinematic --subject "A forest stream" \
  --camera-movement "Slow forward dolly, no cuts" --framing "Wide shot" --json
```

## 9. Regional motion planning

```sh
oaivideo motion validate examples/motion.json --json
oaivideo motion inspect examples/motion.json --json
oaivideo motion create --file examples/motion.json --output examples/motion.saved.json --json
```

Stores masks, normalized polygons, control points and vectors locally. The textual approximation explicitly states that spatial compliance is not guaranteed and `nativeSupported` is false.

## 10. Scene prompt composition

```sh
oaivideo prompt inspect --file examples/prompt.json
oaivideo prompt validate --file examples/prompt.yaml --json
oaivideo prompt build --file examples/prompt.json --output output/island-prompt.txt
oaivideo prompt templates
```

## 11. Complete storyboard

```sh
oaivideo storyboard create --file examples/storyboard.json --output examples/storyboard.copy.json
oaivideo storyboard validate examples/storyboard.json --json
oaivideo storyboard render examples/storyboard.json --dry-run --json
oaivideo storyboard render examples/storyboard-local.json --local --concurrency 2 --json
oaivideo storyboard status examples/storyboard-local.json --json
```

Generative rendering without `--dry-run` is unavailable. The explicit `--local` example builds an actual MP4 from existing fixtures, normalizes resolution/FPS/audio and applies a fade. Dependency ordering is enforced. All outputs stay inside the storyboard directory root. After an interrupted render, add `--resume` to reuse matching completed scenes after checksum verification. An existing final export is protected; choose a new export path if you need to assemble again.

## 12. Batches

```sh
oaivideo batch run examples/video-batch.jsonl --dry-run --json
oaivideo batch run examples/image-batch.yaml --dry-run --json
oaivideo batch run examples/image-batch.yaml --mode local --concurrency 2 \
  --requests-per-minute 30 --allow-unknown-cost --confirm-cost --report output/images.csv --json
oaivideo batch run examples/image-batch.yaml --mode local --resume \
  --allow-unknown-cost --confirm-cost --json
```

Video JSONL intentionally contains retired IDs to demonstrate per-operation errors; it is not a historical endpoint execution recipe. The paid image queue is local orchestration. `--mode native` is separately gated and unavailable for video. Failed uncertain creates are not automatically reissued; `--new-request` is an explicit regeneration authorization.

## 13–14. Persistent jobs and downloads

```sh
oaivideo jobs list --json
oaivideo jobs status JOB_ID --local --json
oaivideo jobs watch JOB_ID --timeout 120000 --interval 2000 --json
oaivideo jobs cancel JOB_ID --json
oaivideo jobs cancel JOB_ID --remote --json
oaivideo jobs download JOB_ID --output output/job.mp4 --json
```

`jobs list` works now and may be empty. Remaining examples need an actual previously persisted job from an active reviewed adapter. The current built-in OpenAI provider cannot create such a job. There are no fabricated job IDs/results. Local cancellation stops monitoring; remote work/billing can continue. Downloads require a documented active asset operation, refresh temporary URLs and verify output before recording completion.

## 15. Costs

```sh
oaivideo cost estimate --model auto --seconds 12 --size 1280x720 --quantity 2 --json
oaivideo cost estimate --model gpt-6-luna --prompt "A forest scene" --max-output-tokens 512 --json
oaivideo cost estimate --model auto --mode local --json
oaivideo cost report --json
oaivideo prompt optimize --prompt "A forest scene" --max-output-tokens 512 --max-cost 0.01 --confirm-cost --dry-run --json
```

Unknown video/image costs stay null, not zero. Remove the optimization dry-run only to make an explicit paid text request. Current token rates and measured usage do not revive historical per-second video prices.

## 16. Real deterministic local processing

```sh
oaivideo media info examples/assets/clip-a.mp4 --json
oaivideo media inspect examples/assets/landscape.png --json
oaivideo media resize --input examples/assets/clip-a.mp4 --size 1280x720 --output output/resized.mp4
oaivideo media trim --input examples/assets/clip-a.mp4 --start 0.25 --seconds 1 --output output/trimmed.mp4
oaivideo media concat --inputs examples/assets/clip-a.mp4 examples/assets/clip-b.mp4 --transition fade --transition-seconds 0.25 --output output/joined.mp4
oaivideo media extract-frame --input examples/assets/clip-a.mp4 --at 1 --output output/frame.png
oaivideo media thumbnail --input examples/assets/clip-a.mp4 --at 0.5 --size 640x360 --output output/thumbnail.png
oaivideo media transcode --input examples/assets/clip-a.mp4 --codec h264 --fps 24 --output output/transcoded.mp4
oaivideo media animate-image --input examples/assets/landscape.png --effect ken-burns --seconds 4 --output output/kenburns.mp4
oaivideo media audio --input output/joined.mp4 --audio-mode extract --output output/audio.wav
oaivideo media audio --input output/joined.mp4 --audio-mode remove --output output/silent.mp4
oaivideo media audio --input examples/assets/clip-a.mp4 --audio-mode replace --audio-input output/audio.wav --output output/replaced.mp4
```

The joined clip includes synthesized silence when input clips lack audio. Outputs declare local processing and `aiGenerated: false`. Files are never overwritten. WebM requires `--codec vp9`; media arguments and paths are passed directly to FFmpeg without a shell.
