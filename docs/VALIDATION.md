# Validation performed

Verified in this workspace on 2026-10-14 using Node 24.20.0 and pnpm 12.3.4:

- `pnpm build`: successful ESM bundle, source maps, declarations and executable shebang.
- `pnpm typecheck`: successful strict TypeScript validation.
- `pnpm lint`: successful ESLint checks.
- `pnpm format:check`: successful formatting check.
- `pnpm test` with FFmpeg required: **50 passed, 1 skipped** across 9 test files. The skipped case is the explicitly gated real OpenAI authentication test.
- Actual FFmpeg/FFprobe **8.0.1** integration exercised resize, trim, concat with fade and missing-audio normalization, frame extraction, audio extraction, local image animation, storyboard assembly and checksum-based resume. FFmpeg was downloaded from Ubuntu packages and extracted under `/tmp` because system installation required sudo authentication.
- SDK requests were intercepted in tests. Image decoding/output, prompt optimization, request deduplication, uncertain acceptance and usage accounting were verified without API credit use.
- Download tests covered DNS/SSRF restrictions, complete and incomplete files, content types, checksums and redirect rejection.
- `pnpm pack`: successful distributable tarball with CLI/library/types/docs/examples. Installed into a separate temporary project and exercised its `oaivideo` bin and `npx` invocation.
- `pnpm audit --prod`: no known vulnerabilities reported by the registry at verification time.
- Synthetic demonstration asset script executed successfully, with `mode: local` and `aiGenerated: false`.

Linux was executed locally. The configured GitHub Actions matrix covers Linux, macOS and Windows with Node 22/24; those hosted runs have not been executed in this session. No paid live API generation, GitHub push or NPM publication was performed. Account-specific Images/Responses access remains unverified until an explicitly authorized live request.
