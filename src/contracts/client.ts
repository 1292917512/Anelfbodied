import type { ActionResult, Receipt } from '../protocol/schema';
import type { HitRegion } from '../shared/hit-region';
import type { PresentationOrder } from '../protocol/presentation';
import type { ConnectionState } from './channel';
import type {
  SettingsView,
  ConfigureConnection,
  ConnectionOverview,
} from '../integrations/anelf/contracts';
import type { Appearance, Skin } from '../model/schema';
import type { UpdateState } from './update';
import type { ModelCapabilities } from '../protocol/model';
import type { ModelLibrarySnapshot } from '../model/source';
import type { Size } from '../shared/geometry';
import type { BehaviorSettings, BindingPatch } from '../behavior/settings';

export interface ModelLibraryRequest {
  action: 'list' | 'refresh' | 'discover' | 'add-folder' | 'add-file' | 'remove' | 'use';
  provider?: string;
  path?: string;
  id?: string;
}

export interface Snapshot {
  connection: ConnectionState;
  receipts: Receipt[];
  settings: SettingsView;
  settingsRevision: string;
  connectionUpdating: boolean;
  apiUrl: string;
  apiToken: string;
  secureStorage: boolean;
  appearance: Appearance;
  behaviors: BehaviorSettings;
  petViewport: Size;
  model?: ModelCapabilities;
  dataDirectory: string;
  update: UpdateState;
}
export type PanelView = 'history' | 'settings' | 'receipts' | 'appearance';
export interface CompanionState extends Pick<
  ConnectionState,
  'status' | 'detail' | 'draft' | 'busy'
> {
  active: boolean;
  appearance?: { skin: Skin; scale: number; revision: string };
}
export interface DesktopBridge {
  snapshot(): Promise<Snapshot>;
  configure(config: ConfigureConnection): Promise<ConnectionOverview>;
  connect(): Promise<ConnectionOverview>;
  disconnect(): Promise<ConnectionOverview>;
  copyMcpConfiguration(): Promise<void>;
  send(text: string): Promise<void>;
  sendGuide(): Promise<void>;
  stop(): Promise<void>;
  showPanel(view?: PanelView): void;
  hidePanel(): void;
  focusPet(focus: boolean): void;
  companion(): Promise<CompanionState>;
  onCompanion(callback: (state: CompanionState) => void): () => void;
  onView(callback: (view: PanelView) => void): () => void;
  setAppearance(preference: { skinId: string; scale: number }): Promise<void>;
  setBehaviors(patch: BindingPatch): Promise<void>;
  importSkin(): Promise<void>;
  modelLibrary(request: ModelLibraryRequest): Promise<ModelLibrarySnapshot>;
  previewAction(name: string): Promise<void>;
  reloadModel(): Promise<void>;
  removeSkin(id: string): Promise<void>;
  openLocation(location: 'data' | 'skins' | 'skin-guide'): Promise<void>;
  update(action: 'check' | 'download' | 'cancel' | 'install'): Promise<void>;
  position(point: { x: number; y: number }): void;
  capturePet(enabled: boolean): void;
  hitRegions(regions: HitRegion[]): void;
  answer(id: string, result: ActionResult): void;
  ready(): void;
  modelStatus(status: Pick<ModelCapabilities, 'revision' | 'status' | 'detail'>): void;
  onOrder(callback: (order: PresentationOrder) => void): () => void;
  onState(callback: (state: Snapshot) => void): () => void;
}
declare global {
  interface Window {
    embodied: DesktopBridge;
  }
}
