import { live2dLibrary } from '../components/live2d/library/provider';
import type { ModelSourceProvider } from '../model/source';

export const modelSources: readonly ModelSourceProvider[] = [live2dLibrary];
