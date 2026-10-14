import { readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = `refs/tags/v${pkg.version}`;
if (process.env.GITHUB_REF !== expected) throw new Error(`Release tag must be ${expected}`);
console.log(`Validated release ${pkg.version}`);
