# Contributing

Use Node 22.13+ or 24 LTS, pnpm 12.3.4, and FFmpeg/FFprobe 6+. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Generate command documentation with `pnpm run docs` after changing Commander definitions.

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit. The local Husky hook checks messages before they are recorded, and CI checks every commit in pull requests. The header limit is 100 characters. Examples:

```text
feat(prompt): add scene transition field
fix(media): reject invalid output paths
docs: explain local Ken Burns rendering
```

Supported types follow `@commitlint/config-conventional`, including `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. A scope is optional; use `!` before the colon to mark a breaking change.

Strict TypeScript and ESM are required. Keep domain modules independent from terminal rendering. Never infer capabilities from `/models`, activate retired endpoints, invent fields or hide local processing behind an AI generation label. Every provider capability needs official documentation, a verification date, restrictions and transport tests. Paid create calls cannot use unconditional retries.

The default test suite consumes no API credits. Multimedia tests use synthetic local fixtures and real FFmpeg. CI requires the binary suite; missing binaries are a failure when `OAIVIDEO_REQUIRE_FFMPEG=1`. Only the explicitly opted-in real-API test (`pnpm test:real`) authenticates over the network, and it is read-only. Mocks belong in `tests/fixtures` and must carry their mock identity.

Report security issues privately through the repository owner's appropriate channel. Include affected version, reproduction and impact; never include a real API key. Do not include sensitive media or signed URLs in issues.

Release: update semantic version in package.json and CLI, update CHANGELOG.md, verify current API evidence, run all checks and `pnpm pack`, then tag `vX.Y.Z`. The publish workflow checks tag/version agreement and uses NPM trusted publishing with provenance. Configure NPM's trusted publisher for the owning GitHub repository/workflow and an approved `npm` environment before enabling publication. Bootstrap ownership of a new package manually if NPM requires it. No credential is committed.
