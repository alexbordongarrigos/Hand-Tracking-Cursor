const { contextBridge: n, ipcRenderer: e } = require("electron");
n.exposeInMainWorld("electronAPI", {
  checkPermissions: () => e.invoke("check-permissions"),
  requestPermissions: () => e.invoke("request-permissions"),
  requestCamera: () => e.invoke("request-camera"),
  openAccessibility: () => e.invoke("open-accessibility"),
  resetAccessibilityPermissions: () => e.invoke("reset-accessibility-permissions"),
  openCameraSettings: () => e.invoke("open-camera-settings"),
  startInstallation: () => e.invoke("start-installation"),
  toggleSystem: (s) => e.invoke("toggle-system", s),
  syncAction: (s) => e.send("sync-action", s),
  onSetupStatus: (s) => {
    const i = (o, t) => s(t);
    return e.on("setup-status", i), () => e.removeListener("setup-status", i);
  },
  onRequestAccessibility: (s) => {
    const i = () => s();
    return e.on("request-accessibility", i), () => e.removeListener("request-accessibility", i);
  }
});
