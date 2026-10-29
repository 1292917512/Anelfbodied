import type { SkinManifest } from './schema';

export interface ModelReference {
  provider: string;
  path: string;
  entry: string;
}
export interface ModelCandidate {
  id: string;
  name: string;
  format: string;
  reference: ModelReference;
  detail?: string;
}
export interface ModelSource {
  manifest: SkinManifest;
  read(path: string): Buffer;
}
export interface ModelSourceProvider {
  id: string;
  name: string;
  extensions: string[];
  discover(): Promise<string[]>;
  scan(path: string): Promise<ModelCandidate[]>;
  open(reference: ModelReference): ModelSource;
}
export interface ModelLibrarySnapshot {
  configured: boolean;
  providers: { id: string; name: string }[];
  roots: { provider: string; path: string }[];
  models: ModelCandidate[];
  issues: string[];
}
