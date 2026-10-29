import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, Snapshot, CompanionState, PanelView } from '../contracts/client';
import type { PresentationOrder } from '../protocol/presentation';

const bridge: DesktopBridge = {
  snapshot: () => ipcRenderer.invoke('app:snapshot'),
  configure: (config) => ipcRenderer.invoke('app:configure', config),
  connect: () => ipcRenderer.invoke('app:connect'),
  disconnect: () => ipcRenderer.invoke('app:disconnect'),
  copyMcpConfiguration: () => ipcRenderer.invoke('app:copy-mcp'),
  send: (text) => ipcRenderer.invoke('app:send', text),
  sendGuide: () => ipcRenderer.invoke('app:send-guide'),
  stop: () => ipcRenderer.invoke('app:stop'),
  showPanel: (view = 'settings') => ipcRenderer.send('app:show', view),
  hidePanel: () => ipcRenderer.send('app:hide'),
  setAppearance: (preference) => ipcRenderer.invoke('app:appearance', preference),
  setBehaviors: (patch) => ipcRenderer.invoke('app:behaviors', patch),
  importSkin: () => ipcRenderer.invoke('app:import-skin'),
  modelLibrary: (request) => ipcRenderer.invoke('app:model-library', request),
  previewAction: (name) => ipcRenderer.invoke('app:preview-action', name),
  reloadModel: () => ipcRenderer.invoke('app:reload-model'),
  removeSkin: (id) => ipcRenderer.invoke('app:remove-skin', id),
  openLocation: (location) => ipcRenderer.invoke('app:open-location', location),
  update: (action) => ipcRenderer.invoke('app:update', action),
  focusPet: (focus) => ipcRenderer.send('pet:focus', focus),
  companion: () => ipcRenderer.invoke('pet:snapshot'),
  onCompanion: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: CompanionState) => callback(state);
    ipcRenderer.on('pet:state', handler);
    return () => ipcRenderer.removeListener('pet:state', handler);
  },
  onView: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, view: PanelView) => callback(view);
    ipcRenderer.on('app:view', handler);
    return () => ipcRenderer.removeListener('app:view', handler);
  },
  position: (point) => ipcRenderer.send('pet:position', point),
  capturePet: (enabled) => ipcRenderer.send('pet:capture', enabled),
  hitRegions: (regions) => ipcRenderer.send('pet:regions', regions),
  answer: (id, result) => ipcRenderer.send('pet:result', id, result),
  ready: () => ipcRenderer.send('pet:ready'),
  modelStatus: (status) => ipcRenderer.send('pet:model-status', status),
  onOrder: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, order: PresentationOrder) =>
      callback(order);
    ipcRenderer.on('pet:order', handler);
    return () => ipcRenderer.removeListener('pet:order', handler);
  },
  onState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Snapshot) => callback(state);
    ipcRenderer.on('app:state', handler);
    return () => ipcRenderer.removeListener('app:state', handler);
  },
};
contextBridge.exposeInMainWorld('embodied', bridge);
