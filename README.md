# openai-video-cli

A capability-aware Node.js/TypeScript CLI for OpenAI audiovisual workflows. Executable: `oaivideo`.

**Verified 2026-10-14:** OpenAI retired Sora 2 and the Videos API on **2026-09-24**. No replacement was found in the official model catalog or changelog. Native video commands remain available as interfaces and fail clearly before sending any request. Images, explicit text prompt optimization, local planning and FFmpeg processing work independently.

Sources: [deprecations](https://developers.openai.com/api/docs/deprecations), [changelog](https://developers.openai.com/api/docs/changelog), [models](https://developers.openai.com/api/docs/models), [pricing](https://developers.openai.com/api/docs/pricing), [historical Sora prompting guide](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide). The shutdown notice takes precedence over old tutorials and historical pricing.

## Install and build

Node.js 22.13+ (22 or 24 LTS recommended), pnpm 12.3.4 and FFmpeg/FFprobe 6+ on PATH. The project does not bundle FFmpeg binaries. Install FFmpeg through your OS package manager: `apt install ffmpeg`, `brew install ffmpeg`, or an approved Windows distribution. `oaivideo doctor --offline` checks discovery.

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
pnpm dev -- prompt build --subject "A tropical island" --template cinematic
```

After publishing this package to NPM:

```sh
npm install --global openai-video-cli
npx openai-video-cli --help
oaivideo --help
```

To use the local build without publishing, run `pnpm pack` then `npm install --global /absolute/path/openai-video-cli-1.0.0.tgz`, or use `node dist/cli.js`. Package publication is configured; this repository does not imply that the package has already been published or that the name is available.

## Available functions

| Function | Implementation |
| --- | --- |
| Configuration, doctor, models, capabilities | Local JSON + optional authenticated model discovery |
| Text/image-to-video, editing, extension, remix, native characters | Disabled: official Videos API retired |
| Image generation | Official SDK, `/v1/images/generations`, GPT Image 2.5 Sunburst/Flare |
| Prompt optimization | Explicit paid `/v1/responses`, GPT-6 Luna |
| Prompt templates and JSON/YAML composition | Local natural language engine |
| Regional masks, polygons, vectors | Local planning metadata; no native video mask submission |
| Storyboards | Validation, dependency scheduling, planning, local assembly |
| Batch | Local image queue; native video batch disabled |
| Jobs | Persistent provider-independent state machine; no new native OpenAI video jobs |
| Resize, trim, concat, frames, thumbnail, transcode, audio, Ken Burns | Local FFmpeg/Sharp; `aiGenerated: false` |
| Costs | Current evidence only; unknown charges stay unknown |

## Quick start without API credits

```sh
node dist/cli.js init --directory ./my-project
node dist/cli.js capabilities --json
node dist/cli.js prompt create --template cinematic --subject "A forest stream" \
  --main-action "Gentle ripples in the water" --camera-movement "Slow forward dolly" \
  --output prompt.json
node dist/cli.js prompt build --file prompt.json --output prompt.txt
node dist/cli.js storyboard validate examples/storyboard.json --json
node dist/cli.js batch run examples/video-batch.jsonl --dry-run --json
node dist/cli.js media animate-image --input landscape.png --seconds 6 \
  --effect ken-burns --output landscape-local.mp4
```

The last command requires your own image and is deterministic local animation. It does not animate objects with AI.

## Explicit paid requests

Set `OPENAI_API_KEY` in your environment or secret manager. The CLI never stores a key in project files or configuration and does not load `.env` automatically.

```sh
export OPENAI_API_KEY='YOUR_KEY'
node dist/cli.js models list --refresh --json
node dist/cli.js image generate --prompt "A cinematic tropical island at sunset" \
  --output island.png --allow-unknown-cost --confirm-cost
node dist/cli.js prompt optimize --prompt "A slow camera move through a forest" \
  --model gpt-6-luna --max-output-tokens 512 --max-cost 0.01 --confirm-cost
```

Image request cost cannot be established precisely in advance from resolution alone. Numeric CLI budgets reject unknown costs. Use an account-side spending limit if you explicitly accept unknown costs. Text estimates are conservative planning bounds; actual measured usage is recorded separately and cannot guarantee an invoice amount. Capability documentation expires after 30 days and needs review through a package update or a reviewed library adapter.

## Verify

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Tests use an intercepted SDK transport and a test-only `MockVideoProvider`. No default test consumes API credits. Real multimedia tests require FFmpeg/FFprobe; they are explicitly skipped when unavailable. CI sets `OAIVIDEO_REQUIRE_FFMPEG=1` to require them. Opt-in read-only authentication: `pnpm test:real`. This does not generate assets. Paid API generation should be run explicitly through the guarded CLI.

See [COMMANDS.md](COMMANDS.md) for every option, [examples/README.md](examples/README.md) for complete workflows, [ARCHITECTURE.md](ARCHITECTURE.md), [PROVIDERS.md](PROVIDERS.md), [PROMPTING.md](PROMPTING.md), [CONFIGURATION.md](CONFIGURATION.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/API-VERIFICATION.md](docs/API-VERIFICATION.md).
