import pino from 'pino';
import { redact } from '../errors/index.js';

const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
const configuredLevel = process.env.OAIVIDEO_LOG_LEVEL ?? 'warn';
export const logger = pino(
  {
    level: levels.includes(configuredLevel) ? configuredLevel : 'warn',
    redact: {
      paths: ['apiKey', 'authorization', 'headers.authorization', 'config.apiKey'],
      censor: '[REDACTED]',
    },
    hooks: {
      logMethod(args, method) {
        method.apply(
          this,
          args.map((arg) => (typeof arg === 'string' ? redact(arg) : arg)) as Parameters<
            typeof method
          >,
        );
      },
    },
  },
  pino.destination(2),
);
