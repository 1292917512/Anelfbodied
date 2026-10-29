import { dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SkinCatalog } from '../skins/catalog';
import type { ModelLibrary } from '../skins/library';
import type { ModelSourceProvider } from '../model/source';
import type { ControlService } from '../runtime/ports';
import type { BehaviorPreferences } from '../skins/behavior-settings';

/** Connects local appearance controls to the catalog and the shared command service. */
export function registerAppearance(
  handle: (name: string, action: (input: unknown) => unknown) => unknown,
  context: {
    panel: BrowserWindow;
    skins: SkinCatalog;
    behaviors: BehaviorPreferences;
    bindingsChanged(bindings: Record<string, string>): void;
    library: ModelLibrary;
    sources: readonly ModelSourceProvider[];
    control: ControlService;
    activate(): void;
    publish(): void;
    scale(value: number): void;
  },
): void {
  const { panel, skins, library, sources, control, activate, publish, scale } = context;
  handle('app:behaviors', (input) => {
    const skin = skins.current().skin;
    context.behaviors.update(skin, input);
    context.bindingsChanged(context.behaviors.resolve(skin).bindings);
    publish();
  });
  const select = (skinId: string) => {
    skins.select({ skinId, scale: skins.current().scale });
    activate();
    publish();
  };
  handle('app:appearance', (input) => {
    const previous = skins.current().skin.id;
    skins.select(input);
    if (previous !== skins.current().skin.id) activate();
    scale(skins.current().scale);
    publish();
  });
  handle('app:import-skin', async () => {
    const picked = await dialog.showOpenDialog(panel, {
      title: '选择皮肤或原生 Live2D 文件夹',
      properties: ['openDirectory'],
    });
    if (!picked.canceled && picked.filePaths[0]) select(skins.import(picked.filePaths[0]));
  });
  handle('app:reload-model', activate);
  handle('app:preview-action', async (input) => {
    const name = z.string().parse(input),
      model = control.capabilities().model;
    const action = model?.actions.find((item) => item.name === name);
    if (!model || !action) throw new Error('动作不存在');
    const id = randomUUID();
    control.submit('external', {
      protocol: 'desktop-pet/1',
      id,
      session: `preview-${id}`,
      expiresAt: Date.now() + action.durationMs + 5000,
      commands: [
        { action: 'perform', name, revision: model.revision, durationMs: action.durationMs },
      ],
    });
    const receipt = await control.wait('external', id);
    if (receipt.status === 'failed' || receipt.status === 'unknown')
      throw new Error(receipt.detail ?? '动作未完成');
  });
  handle('app:remove-skin', (input) => {
    const previous = skins.current().skin.id;
    const id = z.string().parse(input);
    skins.remove(id);
    context.behaviors.remove(id);
    if (previous !== skins.current().skin.id) activate();
    publish();
  });
  handle('app:model-library', async (input) => {
    const request = z
      .object({
        action: z.enum(['list', 'refresh', 'discover', 'add-folder', 'add-file', 'remove', 'use']),
        provider: z.string().optional(),
        path: z.string().optional(),
        id: z.string().optional(),
      })
      .strict()
      .parse(input);
    if (request.action === 'list') return library.snapshot();
    if (request.action === 'discover' || request.action === 'refresh')
      return library.refresh(request.action === 'discover');
    if (request.action === 'remove')
      return library.remove({ provider: request.provider, path: request.path });
    if (request.action === 'use') {
      select(skins.link(library.reference(z.string().parse(request.id))));
      return library.snapshot();
    }
    const provider = sources.find((item) => item.id === request.provider);
    if (!provider) throw new Error('请选择模型来源');
    const picked = await dialog.showOpenDialog(panel, {
      title: `添加 ${provider.name} 模型来源`,
      properties: [request.action === 'add-folder' ? 'openDirectory' : 'openFile'],
      ...(request.action === 'add-file'
        ? { filters: [{ name: provider.name, extensions: provider.extensions }] }
        : {}),
    });
    return !picked.canceled && picked.filePaths[0]
      ? library.add({ provider: provider.id, path: picked.filePaths[0] })
      : library.snapshot();
  });
}
