import chalk from 'chalk';
import ora from 'ora';
import cliProgress from 'cli-progress';
import { errorData, redact } from '../errors/index.js';

export interface OutputOptions {
  json?: boolean;
  nonInteractive?: boolean;
}
export function success(data: unknown, options: OutputOptions) {
  if (options.json)
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, data })}\n`);
  else if (typeof data === 'string') process.stdout.write(`${data}\n`);
  else process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
export function failure(error: unknown, options: OutputOptions) {
  const data = errorData(error);
  if (options.json)
    process.stdout.write(
      `${redact(JSON.stringify({ schemaVersion: 1, ok: false, error: data }))}\n`,
    );
  else
    process.stderr.write(
      `${chalk.red(data.code)}: ${data.message}\n${data.suggestion ? `${data.suggestion}\n` : ''}`,
    );
}
export async function activity<T>(
  message: string,
  options: OutputOptions,
  work: () => Promise<T>,
): Promise<T> {
  const spinner = ora({
    text: message,
    stream: process.stderr,
    isEnabled: !options.json && !options.nonInteractive && Boolean(process.stderr.isTTY),
  }).start();
  try {
    return await work();
  } finally {
    spinner.stop();
  }
}
export async function progress<T>(
  label: string,
  options: OutputOptions,
  work: (update: (value: number) => void) => Promise<T>,
): Promise<T> {
  const bar = new cliProgress.SingleBar({
    stream: process.stderr,
    noTTYOutput: false,
    format: `${label} [{bar}] {percentage}%`,
    hideCursor: true,
  });
  const enabled = !options.json && !options.nonInteractive && Boolean(process.stderr.isTTY);
  if (enabled) bar.start(100, 0);
  try {
    return await work((value) => {
      if (enabled) bar.update(value);
    });
  } finally {
    if (enabled) bar.stop();
  }
}
