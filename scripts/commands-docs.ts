import { writeFile } from 'node:fs/promises';
import { type Command } from 'commander';
import { createProgram } from '../src/cli/program.js';

const lines = [
  '# Command reference',
  '',
  'Generated from Commander definitions with `pnpm run docs`. All commands accept `--json` and `--non-interactive` inherited from the root.',
  '',
  'JSON stdout uses a stable versioned envelope. Native video operations are disabled until an active API is officially verified. See PROVIDERS.md.',
  '',
];
function visit(command: Command, path: string) {
  const full = `${path} ${command.name()}`.trim();
  lines.push(`## ${full}`, '', command.description(), '');
  if (command.registeredArguments.length)
    lines.push(
      'Arguments: ' +
        command.registeredArguments
          .map(
            (a) =>
              `${a.required ? '<' : '['}${a.name()}${a.required ? '>' : ']'} — ${a.description || 'see command usage'}`,
          )
          .join('; '),
      '',
    );
  if (command.options.length) {
    lines.push('| Option | Description | Default |', '| --- | --- | --- |');
    for (const option of command.options)
      lines.push(
        `| \`${option.flags}\` | ${option.description} | ${option.defaultValue === undefined ? '—' : `\`${String(option.defaultValue)}\``} |`,
      );
    lines.push('');
  }
  for (const child of command.commands) visit(child, full);
}
visit(createProgram(), '');
await writeFile('COMMANDS.md', lines.join('\n') + '\n');
