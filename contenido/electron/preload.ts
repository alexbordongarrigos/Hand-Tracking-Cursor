const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  requestPermissions: () => ipcRenderer.invoke('request-permissions'),
  requestCamera: () => ipcRenderer.invoke('request-camera'),
  openAccessibility: () => ipcRenderer.invoke('open-accessibility'),
  resetAccessibilityPermissions: () => ipcRenderer.invoke('reset-accessibility-permissions'),
  openCameraSettings: () => ipcRenderer.invoke('open-camera-settings'),
  startInstallation: () => ipcRenderer.invoke('start-installation'),
  toggleSystem: (enabled: boolean) => ipcRenderer.invoke('toggle-system', enabled),
  syncAction: (data: any) => ipcRenderer.send('sync-action', data),
  onSetupStatus: (callback: (status: string) => void) => {
    const listener = (_event: any, value: string) => callback(value);
    ipcRenderer.on('setup-status', listener);
    return () => ipcRenderer.removeListener('setup-status', listener);
  },
  onRequestAccessibility: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('request-accessibility', listener);
    return () => ipcRenderer.removeListener('request-accessibility', listener);
  }
});

