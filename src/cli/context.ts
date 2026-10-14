import { Configuration, stateHome, type Config } from '../config/index.js';
import { ModelRegistry, registryCache } from '../registry/index.js';
import { ProviderRegistry } from '../providers/index.js';
import { JobManager } from '../jobs/index.js';
import { CostLedger } from '../cost/index.js';
import { ApiOperations, OpenAIAssets, openAIClient } from '../api/index.js';

export interface Context {
  root: string;
  config: Config;
  configuration: Configuration;
  registry: ModelRegistry;
  providers: ProviderRegistry;
  jobs: JobManager;
  ledger: CostLedger;
  operations: ApiOperations;
  signal: AbortSignal;
  assets: () => OpenAIAssets;
}
export async function createContext(signal: AbortSignal, root = stateHome()): Promise<Context> {
  const configuration = new Configuration(root);
  const config = await configuration.load();
  const registry = new ModelRegistry(registryCache(root));
  await registry.load();
  const providers = new ProviderRegistry();
  const jobs = new JobManager(root, registry, providers, config.maxFileBytes);
  const ledger = new CostLedger(root);
  const operations = new ApiOperations(root, ledger);
  return {
    root,
    config,
    configuration,
    registry,
    providers,
    jobs,
    ledger,
    operations,
    signal,
    assets: () => new OpenAIAssets(openAIClient(config.timeoutMs), registry, operations),
  };
}
