import type { ActionResult, Receipt } from '../protocol/schema';
import type { PresentationOrder } from '../protocol/presentation';
import type { ConnectionState } from '../integrations/anelf/schema';
import type { SettingsView, ConfigureConnection, ConnectionOverview } from './connection';
import type { Appearance, Skin } from '../skins/schema';
import type { UpdateState } from './update';

export interface Snapshot {
  connection: ConnectionState;
  receipts: Receipt[];
  reportableIds: string[];
  settings: SettingsView;
  settingsRevision: string;
  connectionUpdating: boolean;
  apiUrl: string;
  apiToken: string;
  secureStorage: boolean;
  appearance: Appearance;
  dataDirectory: string;
  update: UpdateState;
}
export type PanelView = 'history' | 'settings' | 'receipts' | 'appearance';
export interface CompanionState extends Pick<
  ConnectionState,
  'status' | 'detail' | 'draft' | 'busy'
> {
  active: boolean;
  appearance?: { skin: Skin; scale: number };
}
export interface DesktopBridge {
  snapshot(): Promise<Snapshot>;
  configure(config: ConfigureConnection): Promise<ConnectionOverview>;
  connect(): Promise<ConnectionOverview>;
  disconnect(): Promise<ConnectionOverview>;
  copyMcpConfiguration(): Promise<void>;
  send(text: string): Promise<void>;
  stop(): Promise<void>;
  report(id: string): Promise<void>;
  showPanel(view?: PanelView): void;
  hidePanel(): void;
  focusPet(focus: boolean): void;
  companion(): Promise<CompanionState>;
  onCompanion(callback: (state: CompanionState) => void): () => void;
  onView(callback: (view: PanelView) => void): () => void;
  setAppearance(preference: { skinId: string; scale: number }): Promise<void>;
  importSkin(): Promise<void>;
  removeSkin(id: string): Promise<void>;
  openLocation(location: 'data' | 'skins' | 'skin-guide'): Promise<void>;
  update(action: 'check' | 'download' | 'cancel' | 'install'): Promise<void>;
  position(point: { x: number; y: number }): void;
  capturePet(enabled: boolean): void;
  hitRegions(regions: { x: number; y: number; width: number; height: number }[]): void;
  onHover(callback: (hovered: boolean) => void): () => void;
  answer(id: string, result: ActionResult): void;
  ready(): void;
  onOrder(callback: (order: PresentationOrder) => void): () => void;
  onState(callback: (state: Snapshot) => void): () => void;
}
declare global {
  interface Window {
    embodied: DesktopBridge;
  }
}
