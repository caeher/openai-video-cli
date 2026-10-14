# Configuration and state

`OPENAI_API_KEY` is read only from the environment. No configuration key for credentials exists. SDK requests use the fixed `https://api.openai.com/v1` origin; an inherited `OPENAI_BASE_URL` cannot redirect your key. `.env.example` is documentation; `.env` files are not loaded automatically.

Configuration and persistent job/API/cost/model state live in `OAIVIDEO_HOME` or `~/.config/oaivideo`. Set `OAIVIDEO_HOME` for an isolated profile. Config JSON is validated at every load; malformed values fail before an API call. `init` creates `oaivideo.project.json` with descriptive project metadata only. It does not override global configuration implicitly; storyboard files carry scene-specific options.

```sh
oaivideo config list --json
oaivideo config set model auto
oaivideo config set orientation portrait
oaivideo config set size 720x1280
oaivideo config set seconds 8
oaivideo config set concurrency 2
oaivideo config set budget 1
oaivideo config set budget null
oaivideo config get output
```

| Key | Default | Validation / effect |
| --- | --- | --- |
| provider | openai | Only shipped CLI provider |
| model | auto | Select an active documented video model, otherwise fail |
| imageModel | gpt-image-2.5-sunburst | Must have reviewed image support at invocation |
| textModel | gpt-6-luna | Must have reviewed optimization support |
| size | 1280x720 | WIDTHxHEIGHT; further model-specific validation |
| orientation | landscape | landscape / portrait / square |
| seconds | 8 | Positive, at most 600; further model duration validation |
| output | output | Video download directory when --wait has no --output |
| concurrency | 2 | Integer 1–16 |
| budget | null | Optional per-command USD estimate limit; rejects unknown costs |
| confirmThreshold | 1 | USD threshold requiring explicit confirmation |
| timeoutMs | 120000 | SDK/polling deadline, 1000–3600000 ms |
| pollIntervalMs | 2000 | 100–60000 ms |
| maxFileBytes | 536870912 | File limit, 1024–2147483648 bytes |

`--model`, `--size`, `--seconds`, `--orientation`, `--output`, `--concurrency` and `--max-cost` override relevant defaults. A budget must be set to `null` before accepting unknown costs. No numeric estimate can enforce an unknown request cost. Provider-side spending controls remain necessary for hard billing limits.

Data stores use inter-process locks and atomic JSON replacement. Job IDs and provenance survive terminal restarts. Temporary signed URLs and image base64 responses are not stored. Prompts and reference paths are project content and can be sensitive; protect the state directory. `OAIVIDEO_LOG_LEVEL` controls structured Pino diagnostics on stderr. JSON stdout stays separate from logs and terminal progress.

`doctor` checks configuration and FFmpeg/FFprobe versions. With a key, it authenticates via GET /models; it never probes retired video endpoints or creates billed images/text to test access. `--offline` skips all API traffic. `healthy: false` means some check failed; unsupported video and unverified paid access are explicitly reported. Inspect this field in automation even when doctor itself returns a successfully produced report.
