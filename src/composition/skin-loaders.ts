import type { SkinLoader } from '../model/loader';
import { pngLoader } from '../components/png/loader';
import { live2dLoader } from '../components/live2d/loader';
export const skinLoaders: readonly SkinLoader[] = [pngLoader, live2dLoader];
