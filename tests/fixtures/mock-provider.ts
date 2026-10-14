import type { VideoProvider, GenerationRequest, RemoteJob } from '../../src/providers/types.js';
import { documentedModels, verifiedAt } from '../../src/registry/index.js';
import type { Model } from '../../src/registry/types.js';

/** Test-only metadata/jobs. No simulated result can use OpenAI's provider identity. */
export class MockVideoProvider implements VideoProvider {
  readonly id = 'mock';
  readonly kind = 'mock' as const;
  calls = 0;
  polls = 0;
  jobs = new Map<string, RemoteJob>();
  failCreate = false;
  async models() {
    return [mockModel()];
  }
  async create(request: GenerationRequest) {
    if (request.model !== 'mock-video') throw new Error('Only the explicit mock model is allowed.');
    this.calls++;
    if (this.failCreate) throw new Error('transport interrupted');
    const job: RemoteJob = { id: `mock-${this.calls}`, state: 'queued' };
    this.jobs.set(job.id, job);
    return job;
  }
  async status(id: string) {
    this.polls++;
    const job = this.jobs.get(id)!;
    job.state = this.polls > 1 ? 'completed' : 'processing';
    job.progress = this.polls > 1 ? 100 : 50;
    return job;
  }
  async cancel(id: string) {
    const job = this.jobs.get(id)!;
    job.state = 'cancelled';
    return job;
  }
}
export function mockModel(): Model {
  const model = structuredClone(documentedModels[0]!);
  model.id = 'mock-video';
  model.name = 'TEST ONLY Mock video';
  model.provider = 'mock';
  model.status = 'active';
  model.shutdownDate = null;
  model.verifiedAt = verifiedAt;
  model.durations = [4, 8];
  model.sizes = ['1280x720'];
  model.formats = ['mp4'];
  model.capabilities.text_to_video!.status = 'supported';
  model.capabilities.text_to_video!.constraints = ['Test metadata; no real AI generation.'];
  model.capabilities.text_to_video!.parameters = ['prompt', 'seconds', 'size', 'orientation'];
  return model;
}
