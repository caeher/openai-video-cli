import { Command, CommanderError } from 'commander';
import { createContext, type Context } from './context.js';
import { failure, success } from './output.js';
import { commandOptionsSchema, type Options } from '../commands/helpers.js';
import { registerVideo, type Handler } from '../commands/video.js';
import { registerPlanning } from '../commands/planning.js';
import { registerManagement } from '../commands/management.js';
import { registerBatch } from '../commands/batch.js';
import { AppError } from '../errors/index.js';
import { logger } from '../logging/index.js';

export function createProgram(
  signal: AbortSignal = new AbortController().signal,
  contextFactory: () => Promise<Context> = () => createContext(signal),
) {
  const program = new Command()
    .name('oaivideo')
    .exitOverride()
    .description(
      'OpenAI audiovisual CLI. Native video generation is unavailable after the 2026-09-24 retirement. Local planning and media processing remain available.',
    )
    .version('1.0.0')
    .option('--json', 'Stable schemaVersion 1 JSON data on stdout')
    .option('--non-interactive', 'Disable all prompts and interactive UI')
    .showHelpAfterError()
    .showSuggestionAfterError();
  const handle: Handler = (command, fn) => {
    command.action(async (...values: unknown[]) => {
      const cmd = values.at(-1) as Command;
      const options = commandOptionsSchema.parse(cmd.optsWithGlobals()) as Options;
      const context = await contextFactory();
      const data = await fn(context, options, values.slice(0, -2));
      success(data, options);
    });
  };
  registerManagement(program, handle);
  registerVideo(program, handle);
  registerPlanning(program, handle);
  registerBatch(program, handle);
  handle(
    program
      .command('completion <shell>')
      .description('Print command completion for bash, zsh or fish'),
    async (_ctx, _opts, args) => {
      const names = program.commands.map((c) => c.name()).join(' ');
      const shell = String(args[0]);
      if (shell === 'bash') return `complete -W '${names}' oaivideo`;
      if (shell === 'zsh') return `#compdef oaivideo\n_arguments '1:command:(${names})'`;
      if (shell === 'fish')
        return program.commands
          .map((c) => `complete -c oaivideo -f -n '__fish_use_subcommand' -a '${c.name()}'`)
          .join('\n');
      throw new AppError('COMPLETION_SHELL', 'Supported completion shells: bash, zsh, fish.');
    },
  );
  return program;
}
export async function runCli(argv = process.argv) {
  const controller = new AbortController();
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    controller.abort(
      new AppError(
        'INTERRUPTED',
        'Operation interrupted.',
        'Local interruption does not cancel remote generation or billing.',
      ),
    );
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const program = createProgram(controller.signal).exitOverride();
  // Commander diagnostics go to stderr. JSON failures are emitted centrally exactly once.
  const json = argv.includes('--json');
  const configure = (command: Command) => {
    command
      .exitOverride()
      .showHelpAfterError(!json)
      .configureOutput({
        writeErr: (text) => {
          if (!json) process.stderr.write(text);
        },
      });
    for (const child of command.commands) configure(child);
  };
  configure(program);
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    if (
      error instanceof CommanderError &&
      ['commander.helpDisplayed', 'commander.version'].includes(error.code)
    )
      return 0;
    logger.debug(
      'CLI operation failed; diagnostics are emitted through the redacted error boundary.',
    );
    failure(
      interrupted
        ? new AppError(
            'INTERRUPTED',
            'Operation interrupted.',
            'Remote work and billing may continue. Inspect persisted jobs.',
          )
        : error instanceof CommanderError
          ? new AppError('ARGUMENT_ERROR', error.message, 'Run the command with --help.')
          : error,
      { json },
    );
    return interrupted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
