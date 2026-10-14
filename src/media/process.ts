import { spawn } from 'node:child_process';
import { AppError, redact } from '../errors/index.js';

export async function runProcess(
  binary: string,
  args: string[],
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    maxOutput?: number;
    onLine?: (line: string) => void;
  } = {},
) {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 300000)])
    : AbortSignal.timeout(options.timeoutMs ?? 300000);
  signal.throwIfAborted();
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });
    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let limitError: AppError | undefined;
    const limit = options.maxOutput ?? 4 * 1024 * 1024;
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > limit) {
        limitError = new AppError('PROCESS_OUTPUT_LIMIT', 'Process output exceeded its limit.');
        child.kill();
      }
      if (options.onLine) {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) options.onLine(line);
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-limit);
    });
    child.once('error', (e) =>
      reject(
        'code' in e && e.code === 'ENOENT'
          ? new AppError(
              'DEPENDENCY_MISSING',
              `${binary} is not installed or not on PATH.`,
              'Install FFmpeg and FFprobe using your operating system package manager.',
            )
          : e,
      ),
    );
    child.once('close', (code) => {
      if (limitError) reject(limitError);
      else if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new AppError(
            'MEDIA_PROCESS_FAILED',
            `${binary} exited with code ${code}.`,
            'Check media formats and arguments.',
            { stderr: redact(stderr.slice(-4000)) },
          ),
        );
    });
  });
}
