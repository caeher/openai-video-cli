# JSON output contract (schemaVersion 1)

All data commands support `--json` anywhere in the command path. Successful data is emitted as exactly one newline-delimited JSON object:

```json
{"schemaVersion":1,"ok":true,"data":{"mode":"plan","generated":false}}
```

Errors return exit 1 (interruption 130), with exactly one error envelope:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"NO_ACTIVE_VIDEO_API","message":"...","suggestion":"...","details":{"source":"https://developers.openai.com/api/docs/deprecations"}}}
```

`error.code` is the machine identifier. `message` and `suggestion` are human text and may evolve. Optional `details` contains structured validation/provider context. Diagnostic logs and progress use stderr. Help and version flags print their standard human output and exit 0; they are informational flags rather than data commands.

Payload contracts:

- Registry models include id, name, provider, status, capabilities, sizes, durations, formats, restrictions, price, verifiedAt, source, shutdownDate, availability and availabilityCheckedAt. Capability entries include status, source, verifiedAt, constraints and parameters.
- Jobs include id, provider, mock, state, remoteId, request, fingerprint, createdAt, updatedAt, submission, progress, error, output, sha256, parentJobId, localCancellation and remoteCancellation. States are lowercase pending/queued/processing/completed/failed/cancelled.
- Prompts include spec, text, syntax and warnings. Motion includes valid, spec, image, nativeSupported, warning and textualPrompt.
- Storyboard plans include mode=plan, generated=false, name, scenes, totalSeconds and warnings. Each scene has available and optional error. Local renders include mode=local, aiGenerated=false, scenes and export.
- Media mutations include mode=local, aiGenerated=false, operation, output, sha256, duration and info. Image generation includes mode=openai, model, output, format and sha256.
- Estimates include currency, amount (nullable), upperBound (nullable), basis, source and verifiedAt. Reports include knownTotal and unknownCharges; unknown costs never become zero.
- Batches include mode=local_queue/native/plan, a batch ID when persisted, per-operation state/result/error, failures and submission-vs-generation explanation. CSV cells are escaped and formula-like prefixes are neutralized.

Paths returned for generated files are absolute. Persisted records and schema version 1 are additive; incompatible changes require a new schema version and documented migration. Native adapter payloads must be normalized before entering these contracts.
