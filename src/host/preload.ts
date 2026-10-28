import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopBridge,
  RendererOrder,
  Snapshot,
  CompanionState,
  PanelView,
} from './contracts';

const bridge: DesktopBridge = {
  snapshot: () => ipcRenderer.invoke('app:snapshot'),
  configure: (config) => ipcRenderer.invoke('app:configure', config),
  connect: () => ipcRenderer.invoke('app:connect'),
  disconnect: () => ipcRenderer.invoke('app:disconnect'),
  send: (text) => ipcRenderer.invoke('app:send', text),
  stop: () => ipcRenderer.invoke('app:stop'),
  report: (id) => ipcRenderer.invoke('app:report', id),
  showPanel: (view = 'settings') => ipcRenderer.send('app:show', view),
  hidePanel: () => ipcRenderer.send('app:hide'),
  setAppearance: (preference) => ipcRenderer.invoke('app:appearance', preference),
  importSkin: () => ipcRenderer.invoke('app:import-skin'),
  removeSkin: (id) => ipcRenderer.invoke('app:remove-skin', id),
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
  onHover: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, hovered: boolean) => callback(hovered);
    ipcRenderer.on('pet:hover', handler);
    return () => ipcRenderer.removeListener('pet:hover', handler);
  },
  answer: (id, result) => ipcRenderer.send('pet:result', id, result),
  ready: () => ipcRenderer.send('pet:ready'),
  onOrder: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, order: RendererOrder) => callback(order);
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
