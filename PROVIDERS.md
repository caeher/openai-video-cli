# Providers and capability contract

The built-in provider is `openai`. The CLI never calls a retired `/v1/videos` endpoint. `LegacySoraProvider` retains the historical endpoint string and shutdown date, with no creation, status, cancel or download method. There is no opt-in switch to re-enable Sora.

`VideoProvider` defines optional create, status, cancel, asset, batch and characters methods. `create` receives a normalized `GenerationRequest` and an abort signal/request ID. Requests include a capability operation so the adapter can map edit, extension or remix only to documented operations. A method's existence does not grant a capability; both reviewed model metadata and the provider method are necessary.

Each model includes status (`active`, `deprecated`, `retired`, `unknown`), per-capability status (`supported`, `unsupported`, `unknown`), documentation source, verification date, restrictions, compatible parameters, resolution/duration/format metadata, shutdown date and separately checked account availability. Capability parameter names describe the public normalized library request, not invented provider wire fields. Adapters translate them only into documented API fields.

| Capability | Current OpenAI video state |
| --- | --- |
| text_to_video | Unavailable: Videos API retired |
| image_to_video | Unavailable |
| video_edit | Unavailable |
| video_extension | Unavailable |
| video_remix | Unavailable |
| character_reference | Unavailable |
| multi_reference | Unavailable for video |
| first_frame / last_frame | Unavailable for video |
| regional_motion | No native video support verified |
| audio_generation | Unavailable through video generation; no silent audio substitute |
| batch_generation | Unavailable for video |
| image_generation | Supported independently by the Images adapter |
| text_optimization | Supported independently by Responses |

The independent Images adapter intentionally exposes one PNG generation per call with three standard dimensions and low/medium/high quality. The official image API has further capabilities; this video-oriented CLI does not advertise an Images edit command or claim full Images API coverage. The registry only declares exposed documented capabilities. Video character references never become image references automatically.

## Adding a future official API

1. Review the official API schema, changelog, model documentation, shutdown notices, prices and account requirements.
2. Implement `VideoProvider` methods in `src/providers`; support abort signals and normalize provider states.
3. Register model evidence and the adapter through `ModelRegistry.register()` and `ProviderRegistry.register()`.
4. Declare exact accepted normalized parameters and per-model resolutions/durations; do not copy capabilities from another model.
5. Add adapter tests using intercepted transport, including undocumented parameter rejection, status mapping and billing-safe recovery.
6. Wire the reviewed adapter into the CLI context. The existing public commands can remain unchanged.

Programmatic consumers can construct registries and `JobManager` with their adapters. The CLI does not load arbitrary JSON claiming a new HTTP endpoint or execute untrusted adapter plugins.

`MockVideoProvider` lives exclusively in `tests/fixtures`. It uses provider `mock`, model `mock-video`, remote IDs prefixed `mock-` and jobs with `mock: true`. It does not create an AI video file and is not selectable from the shipped CLI. The fixture can be used for controlled development demonstrations of state management, never as a real OpenAI result.

See [API verification](docs/API-VERIFICATION.md) for sources and historical distinctions.
