# Command reference

Generated from Commander definitions with `pnpm run docs`. All commands accept `--json` and `--non-interactive` inherited from the root.

JSON stdout uses a stable versioned envelope. Native video operations are disabled until an active API is officially verified. See PROVIDERS.md.

## oaivideo

OpenAI audiovisual CLI. Native video generation is unavailable after the 2026-09-24 retirement. Local planning and media processing remain available.

| Option | Description | Default |
| --- | --- | --- |
| `-V, --version` | output the version number | — |
| `--json` | Stable schemaVersion 1 JSON data on stdout | — |
| `--non-interactive` | Disable all prompts and interactive UI | — |

## oaivideo init

Initialize local project metadata without credentials

| Option | Description | Default |
| --- | --- | --- |
| `--directory <path>` | Project directory | `.` |
| `--interactive` | Configure default project model and orientation | — |

## oaivideo config

Persistent global JSON configuration; API keys are environment-only

## oaivideo config set

Set and validate a configuration value

Arguments: <key> — see command usage; <value> — see command usage

## oaivideo config get

Read a configuration value

Arguments: <key> — see command usage

## oaivideo config list

Read all non-secret configuration

## oaivideo models

Combine reviewed documentation with account model discovery

## oaivideo models list

List reviewed and discovered models

| Option | Description | Default |
| --- | --- | --- |
| `--refresh` | Authenticate and refresh availability using GET /models | — |

## oaivideo models inspect

Inspect status, restrictions, capabilities and sources

Arguments: <id> — see command usage

## oaivideo capabilities

Display documented capability matrix

| Option | Description | Default |
| --- | --- | --- |
| `--model <id>` | Inspect one model | — |

## oaivideo doctor

Check configuration, authentication and local dependencies without billed requests

| Option | Description | Default |
| --- | --- | --- |
| `--offline` | Skip all OpenAI requests | — |

## oaivideo cost

Current cost estimates and measured usage reports

## oaivideo cost estimate

Estimate using current evidence; unknown prices stay unknown

| Option | Description | Default |
| --- | --- | --- |
| `--model <id>` | Model ID | — |
| `--seconds <n>` | Duration | — |
| `--size <WxH>` | Resolution | — |
| `--quantity <n>` | Number of requests | `1` |
| `--regenerations <n>` | Additional generations per request | `0` |
| `--mode <name>` | native or local | `native` |
| `--prompt <text>` | Prompt for text optimization estimate | — |
| `--max-output-tokens <n>` | Maximum text output tokens | `1024` |

## oaivideo cost report

Summarize usage ledger; excludes unknown charges from known total

## oaivideo image

Independent native OpenAI image generation

## oaivideo image generate

Generate one PNG through the official Images API

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Text prompt | — |
| `--prompt-file <path>` | UTF-8 prompt | — |
| `--model <id>` | Verified image model | — |
| `--size <WxH>` | 1024x1024, 1536x1024 or 1024x1536 | `1024x1024` |
| `--quality <name>` | low, medium or high | `medium` |
| `--output <path>` | PNG output path | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo jobs

Persistent asynchronous job management

## oaivideo jobs list

List stored jobs without remote requests

## oaivideo jobs status

Refresh a job through documented provider status polling

Arguments: <id> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--local` | Read stored status only | — |

## oaivideo jobs watch

Watch and persist progress with a timeout

Arguments: <id> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--timeout <ms>` | Polling deadline | — |
| `--interval <ms>` | Polling interval | — |

## oaivideo jobs cancel

Stop local monitoring; --remote is an explicit separate operation

Arguments: <id> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--remote` | Request remote cancellation when the provider supports it | — |

## oaivideo jobs download

Refresh asset URL, verify and atomically download a completed job

Arguments: <id> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--output <path>` | Video output path | — |

## oaivideo media

Deterministic local FFmpeg processing; no AI generation

## oaivideo media info

Inspect decoded local image/audio/video metadata

Arguments: <input> — see command usage

## oaivideo media inspect

Inspect decoded local image/audio/video metadata

Arguments: <input> — see command usage

## oaivideo media resize

resize with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media trim

trim with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media concat

concat with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media extract-frame

extract-frame with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media thumbnail

thumbnail with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media transcode

transcode with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media audio

audio with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo media animate-image

animate-image with local FFmpeg

| Option | Description | Default |
| --- | --- | --- |
| `--input <path>` | Input file | — |
| `--inputs <paths...>` | Ordered clips for concat | — |
| `--output <path>` | Output path; existing files are protected | — |
| `--size <WxH>` | Output dimensions | `1280x720` |
| `--fps <n>` | Output frame rate | `30` |
| `--seconds <n>` | Duration for trim or image animation | `8` |
| `--start <n>` | Trim start in seconds | `0` |
| `--at <n>` | Frame extraction time in seconds | `0` |
| `--codec <name>` | h264, h265 or vp9 | `h264` |
| `--audio-mode <name>` | extract, remove or replace | `extract` |
| `--audio-input <path>` | Replacement audio | — |
| `--effect <name>` | zoom-in, zoom-out, pan-left, pan-right or ken-burns | `ken-burns` |
| `--transition <name>` | cut, fade, wipeleft or slideright | `cut` |
| `--transition-seconds <n>` | Transition duration | `0.5` |
| `--dry-run` | Plan without writing or running FFmpeg | — |

## oaivideo generate

Generate video from text when a documented active API exists

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Natural-language prompt | — |
| `--prompt-file <path>` | UTF-8 prompt file | — |
| `--model <id>` | Documented model ID | — |
| `--provider <id>` | Registered provider | — |
| `--size <WxH>` | Model-supported resolution | — |
| `--seconds <number>` | Model-supported duration | — |
| `--orientation <value>` | landscape, portrait or square | — |
| `--output <path>` | Output video path | — |
| `--image <path>` | Initial image (animate only) | — |
| `--input <path>` | Input video (edit/extend/remix) | — |
| `--first-frame <path>` | First frame when explicitly supported | — |
| `--last-frame <path>` | Last frame when explicitly supported | — |
| `--reference <paths...>` | Image references; native support required | — |
| `--character-reference <ids...>` | Provider character IDs; distinct from image references | — |
| `--parent-job <id>` | Related original job for extension/remix | — |
| `--wait` | Poll and download after completion | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo animate

Animate an image using native image-to-video

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Natural-language prompt | — |
| `--prompt-file <path>` | UTF-8 prompt file | — |
| `--model <id>` | Documented model ID | — |
| `--provider <id>` | Registered provider | — |
| `--size <WxH>` | Model-supported resolution | — |
| `--seconds <number>` | Model-supported duration | — |
| `--orientation <value>` | landscape, portrait or square | — |
| `--output <path>` | Output video path | — |
| `--image <path>` | Initial image (animate only) | — |
| `--input <path>` | Input video (edit/extend/remix) | — |
| `--first-frame <path>` | First frame when explicitly supported | — |
| `--last-frame <path>` | Last frame when explicitly supported | — |
| `--reference <paths...>` | Image references; native support required | — |
| `--character-reference <ids...>` | Provider character IDs; distinct from image references | — |
| `--parent-job <id>` | Related original job for extension/remix | — |
| `--wait` | Poll and download after completion | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo edit

Edit an existing video using a documented native operation

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Natural-language prompt | — |
| `--prompt-file <path>` | UTF-8 prompt file | — |
| `--model <id>` | Documented model ID | — |
| `--provider <id>` | Registered provider | — |
| `--size <WxH>` | Model-supported resolution | — |
| `--seconds <number>` | Model-supported duration | — |
| `--orientation <value>` | landscape, portrait or square | — |
| `--output <path>` | Output video path | — |
| `--image <path>` | Initial image (animate only) | — |
| `--input <path>` | Input video (edit/extend/remix) | — |
| `--first-frame <path>` | First frame when explicitly supported | — |
| `--last-frame <path>` | Last frame when explicitly supported | — |
| `--reference <paths...>` | Image references; native support required | — |
| `--character-reference <ids...>` | Provider character IDs; distinct from image references | — |
| `--parent-job <id>` | Related original job for extension/remix | — |
| `--wait` | Poll and download after completion | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo extend

Generatively extend a clip; does not concatenate locally

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Natural-language prompt | — |
| `--prompt-file <path>` | UTF-8 prompt file | — |
| `--model <id>` | Documented model ID | — |
| `--provider <id>` | Registered provider | — |
| `--size <WxH>` | Model-supported resolution | — |
| `--seconds <number>` | Model-supported duration | — |
| `--orientation <value>` | landscape, portrait or square | — |
| `--output <path>` | Output video path | — |
| `--image <path>` | Initial image (animate only) | — |
| `--input <path>` | Input video (edit/extend/remix) | — |
| `--first-frame <path>` | First frame when explicitly supported | — |
| `--last-frame <path>` | Last frame when explicitly supported | — |
| `--reference <paths...>` | Image references; native support required | — |
| `--character-reference <ids...>` | Provider character IDs; distinct from image references | — |
| `--parent-job <id>` | Related original job for extension/remix | — |
| `--wait` | Poll and download after completion | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo remix

Create a native variant of a prior video

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Natural-language prompt | — |
| `--prompt-file <path>` | UTF-8 prompt file | — |
| `--model <id>` | Documented model ID | — |
| `--provider <id>` | Registered provider | — |
| `--size <WxH>` | Model-supported resolution | — |
| `--seconds <number>` | Model-supported duration | — |
| `--orientation <value>` | landscape, portrait or square | — |
| `--output <path>` | Output video path | — |
| `--image <path>` | Initial image (animate only) | — |
| `--input <path>` | Input video (edit/extend/remix) | — |
| `--first-frame <path>` | First frame when explicitly supported | — |
| `--last-frame <path>` | Last frame when explicitly supported | — |
| `--reference <paths...>` | Image references; native support required | — |
| `--character-reference <ids...>` | Provider character IDs; distinct from image references | — |
| `--parent-job <id>` | Related original job for extension/remix | — |
| `--wait` | Poll and download after completion | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo characters

Native reusable video characters (currently unavailable)

## oaivideo characters create

Create a native character reference

| Option | Description | Default |
| --- | --- | --- |
| `--name <name>` | Character name | — |
| `--video <path>` | Reference video | — |
| `--model <id>` | Model ID | — |

## oaivideo characters list

List native character references

| Option | Description | Default |
| --- | --- | --- |
| `--model <id>` | Model ID | — |

## oaivideo characters inspect

Inspect native character reference

Arguments: <id> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--model <id>` | Model ID | — |

## oaivideo characters delete

Delete a native character reference

Arguments: <id> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--model <id>` | Model ID | — |

## oaivideo prompt

Build natural-language prompt planning artifacts

## oaivideo prompt templates

List available templates

## oaivideo prompt create

create a structured prompt

| Option | Description | Default |
| --- | --- | --- |
| `--file <path>` | JSON/YAML prompt specification | — |
| `--template <name>` | Template defaults | — |
| `--output <path>` | Write JSON specification (create) or UTF-8 text (build) | — |
| `--interactive` | Ask for template, subject, action and camera | — |
| `--subject <text>` | subject | — |
| `--scene <text>` | scene | — |
| `--environment <text>` | environment | — |
| `--main-action <text>` | mainAction | — |
| `--secondary-actions <text>` | secondaryActions | — |
| `--camera-movement <text>` | cameraMovement | — |
| `--framing <text>` | framing | — |
| `--lens <text>` | lens | — |
| `--lighting <text>` | lighting | — |
| `--color-palette <text>` | colorPalette | — |
| `--visual-style <text>` | visualStyle | — |
| `--temporal-sequence <text>` | temporalSequence | — |
| `--motion-physics <text>` | motionPhysics | — |
| `--character-continuity <text>` | characterContinuity | — |
| `--audio-description <text>` | audioDescription | — |
| `--dialogue <text>` | dialogue | — |
| `--avoidance <text>` | avoidance | — |
| `--reference-assets <text>` | referenceAssets | — |
| `--shot-transitions <text>` | shotTransitions | — |

## oaivideo prompt build

build a structured prompt

| Option | Description | Default |
| --- | --- | --- |
| `--file <path>` | JSON/YAML prompt specification | — |
| `--template <name>` | Template defaults | — |
| `--output <path>` | Write JSON specification (create) or UTF-8 text (build) | — |
| `--interactive` | Ask for template, subject, action and camera | — |
| `--subject <text>` | subject | — |
| `--scene <text>` | scene | — |
| `--environment <text>` | environment | — |
| `--main-action <text>` | mainAction | — |
| `--secondary-actions <text>` | secondaryActions | — |
| `--camera-movement <text>` | cameraMovement | — |
| `--framing <text>` | framing | — |
| `--lens <text>` | lens | — |
| `--lighting <text>` | lighting | — |
| `--color-palette <text>` | colorPalette | — |
| `--visual-style <text>` | visualStyle | — |
| `--temporal-sequence <text>` | temporalSequence | — |
| `--motion-physics <text>` | motionPhysics | — |
| `--character-continuity <text>` | characterContinuity | — |
| `--audio-description <text>` | audioDescription | — |
| `--dialogue <text>` | dialogue | — |
| `--avoidance <text>` | avoidance | — |
| `--reference-assets <text>` | referenceAssets | — |
| `--shot-transitions <text>` | shotTransitions | — |

## oaivideo prompt inspect

inspect a structured prompt

| Option | Description | Default |
| --- | --- | --- |
| `--file <path>` | JSON/YAML prompt specification | — |
| `--template <name>` | Template defaults | — |
| `--output <path>` | Write JSON specification (create) or UTF-8 text (build) | — |
| `--interactive` | Ask for template, subject, action and camera | — |
| `--subject <text>` | subject | — |
| `--scene <text>` | scene | — |
| `--environment <text>` | environment | — |
| `--main-action <text>` | mainAction | — |
| `--secondary-actions <text>` | secondaryActions | — |
| `--camera-movement <text>` | cameraMovement | — |
| `--framing <text>` | framing | — |
| `--lens <text>` | lens | — |
| `--lighting <text>` | lighting | — |
| `--color-palette <text>` | colorPalette | — |
| `--visual-style <text>` | visualStyle | — |
| `--temporal-sequence <text>` | temporalSequence | — |
| `--motion-physics <text>` | motionPhysics | — |
| `--character-continuity <text>` | characterContinuity | — |
| `--audio-description <text>` | audioDescription | — |
| `--dialogue <text>` | dialogue | — |
| `--avoidance <text>` | avoidance | — |
| `--reference-assets <text>` | referenceAssets | — |
| `--shot-transitions <text>` | shotTransitions | — |

## oaivideo prompt validate

validate a structured prompt

| Option | Description | Default |
| --- | --- | --- |
| `--file <path>` | JSON/YAML prompt specification | — |
| `--template <name>` | Template defaults | — |
| `--output <path>` | Write JSON specification (create) or UTF-8 text (build) | — |
| `--interactive` | Ask for template, subject, action and camera | — |
| `--subject <text>` | subject | — |
| `--scene <text>` | scene | — |
| `--environment <text>` | environment | — |
| `--main-action <text>` | mainAction | — |
| `--secondary-actions <text>` | secondaryActions | — |
| `--camera-movement <text>` | cameraMovement | — |
| `--framing <text>` | framing | — |
| `--lens <text>` | lens | — |
| `--lighting <text>` | lighting | — |
| `--color-palette <text>` | colorPalette | — |
| `--visual-style <text>` | visualStyle | — |
| `--temporal-sequence <text>` | temporalSequence | — |
| `--motion-physics <text>` | motionPhysics | — |
| `--character-continuity <text>` | characterContinuity | — |
| `--audio-description <text>` | audioDescription | — |
| `--dialogue <text>` | dialogue | — |
| `--avoidance <text>` | avoidance | — |
| `--reference-assets <text>` | referenceAssets | — |
| `--shot-transitions <text>` | shotTransitions | — |

## oaivideo prompt optimize

Explicit paid prompt optimization using Responses API

| Option | Description | Default |
| --- | --- | --- |
| `--prompt <text>` | Description to optimize | — |
| `--prompt-file <path>` | UTF-8 description | — |
| `--model <id>` | Verified text model | — |
| `--max-output-tokens <n>` | Output token ceiling | `1024` |
| `--output <path>` | Write optimized text | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo motion

Local motion specifications; no native mask submission

## oaivideo motion create

Store regional motion metadata locally

| Option | Description | Default |
| --- | --- | --- |
| `--file <path>` | Complete JSON/YAML specification | — |
| `--image <path>` | Source image | — |
| `--mask <path>` | PNG mask matching image dimensions | — |
| `--prompt <text>` | Motion description | — |
| `--stationary <elements...>` | Elements that should remain still | — |
| `--output <path>` | Specification JSON output | — |

## oaivideo motion inspect

inspect motion specification and mask geometry

Arguments: <file> — see command usage

## oaivideo motion validate

validate motion specification and mask geometry

Arguments: <file> — see command usage

## oaivideo references

Inspect typed local visual references

## oaivideo references inspect

Inspect image metadata and distinguish reference roles

| Option | Description | Default |
| --- | --- | --- |
| `--image <path>` | Local image | — |
| `--kind <role>` | image, first_frame, last_frame or character | `image` |
| `--model <id>` | Model for compatibility assessment | — |

## oaivideo storyboard

Plan scenes or explicitly assemble existing clips locally

## oaivideo storyboard create

Create a validated multi-scene project

| Option | Description | Default |
| --- | --- | --- |
| `--file <path>` | Existing JSON/YAML storyboard | — |
| `--name <name>` | Project name | `Untitled project` |
| `--prompt <text>` | Single-scene starter prompt | `Describe the subject, scene and main action.` |
| `--output <path>` | Storyboard JSON path | — |

## oaivideo storyboard validate

Validate schema, dependency graph, paths and generation plan

Arguments: <file> — see command usage

## oaivideo storyboard render

Render native scenes or mount existing clips with --local

Arguments: <file> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--local` | Use only pre-existing scene inputs; deterministic assembly | — |
| `--resume` | Reuse completed matching scenes after checksum verification; export output must be new | — |
| `--concurrency <n>` | Maximum concurrent independent scenes | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo storyboard status

Read persisted scene statuses without making API requests

Arguments: <file> — see command usage

## oaivideo batch

Native batching or a distinct local request queue

## oaivideo batch run

Execute JSON, JSONL or YAML requests

Arguments: <file> — see command usage

| Option | Description | Default |
| --- | --- | --- |
| `--mode <name>` | local queue or native provider batch | `local` |
| `--concurrency <n>` | Concurrent local requests | — |
| `--requests-per-minute <n>` | Local submission rate ceiling | `60` |
| `--resume` | Skip persisted completed items; failed creates are never automatically duplicated | — |
| `--report <path>` | JSON or CSV report output | — |
| `--max-cost <usd>` | Maximum total estimated cost; rejects unknown cost | — |
| `--confirm-cost` | Explicitly authorize reviewed API cost | — |
| `--allow-unknown-cost` | Explicitly accept an unknown API charge | — |
| `--dry-run` | Validate and plan without requests or output writes | — |
| `--new-request` | Explicitly allow a new paid request instead of duplicate reuse | — |

## oaivideo completion

Print command completion for bash, zsh or fish

Arguments: <shell> — see command usage
