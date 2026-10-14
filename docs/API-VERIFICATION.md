# Official API verification — 2026-10-14

The following official pages were opened and reviewed before implementation:

| Source | Result / use |
| --- | --- |
| [Deprecations](https://developers.openai.com/api/docs/deprecations) | Videos API and sora-2/sora-2-pro plus listed snapshots shut down 2026-09-24; no recommended replacement |
| [Changelog](https://developers.openai.com/api/docs/changelog) | Historical Sora expansion entries do not supersede shutdown; no successor video API located |
| [Models](https://developers.openai.com/api/docs/models) | No active replacement video generation model located |
| [Pricing](https://developers.openai.com/api/docs/pricing) | Current text/image token prices; no use of historical video prices |
| [Sora prompting guide](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide) | Historical cinematography guidance; endpoint examples are not current executable instructions |
| [Image generation](https://developers.openai.com/api/docs/guides/image-generation) | Images API remains independently available with GPT Image 2.5 models |
| [Create image](https://developers.openai.com/api/reference/resources/images/methods/generate) | model, prompt, n, size, quality, output_format and base64 response documented |
| [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) | Text/Responses support, output limits and standard token pricing |
| [List models](https://developers.openai.com/api/reference/resources/models/methods/list) | Account visibility; no capability inference |

The general Responses method reference returned an internal retrieval error during web review. The model page, official image guide's Responses examples and installed official SDK schemas provide the documented fields used by the text adapter. No video endpoint was probed as part of verification.

Snapshot policy: supported capabilities/prices must be reverified after 30 days. Runtime model refresh updates account availability only. This conservative gate avoids making an old supported catalog the sole source of truth. Unknown model IDs from discovery remain unknown until reviewed metadata and a real adapter are supplied.

## Current matrix

Native OpenAI video generation, image-to-video, edit, extension, remix, characters, first/last frame, multi-reference video, video audio and native video batches: **unavailable**. Native regional motion masks/points/vectors: **not verified** and not sent. Native independent image generation and explicit text optimization: **documented**, account access remains conditional. Local prompts, motion planning, storyboard validation, queues, media processing and project metadata: **available without a video API**.

This is an evidence-based absence finding, not a promise that no future video API will appear. New documentation requires a reviewed adapter and metadata update. Existing old Sora pages are treated as historical even if still indexed.
