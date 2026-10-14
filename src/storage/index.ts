import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { atomicWrite, safeId } from '../utils/files.js';

/** A single transaction holds an inter-process lock and commits by atomic rename. */
export class JsonStore<T> {
  readonly path: string;
  constructor(
    readonly root: string,
    name: string,
    readonly schema: z.ZodType<T>,
    readonly initial: () => T,
  ) {
    this.path = join(root, `${safeId(name)}.json`);
  }
  async read(): Promise<T> {
    try {
      return this.schema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return this.initial();
      throw e;
    }
  }
  async update<R>(mutate: (state: T) => R | Promise<R>): Promise<R> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(this.path, {
      realpath: false,
      stale: 30000,
      update: 5000,
      retries: { retries: 20, minTimeout: 25, maxTimeout: 500 },
    });
    try {
      const state = await this.read();
      const result = await mutate(state);
      this.schema.parse(state);
      await atomicWrite(this.path, `${JSON.stringify(state, null, 2)}\n`);
      return result;
    } finally {
      await release();
    }
  }
}
