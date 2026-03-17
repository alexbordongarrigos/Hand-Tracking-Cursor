import { app as m, systemPreferences as d, ipcMain as l, BrowserWindow as g } from "electron";
import p from "path";
import { fileURLToPath as b } from "url";
import { spawn as r } from "child_process";
import u from "fs";
const w = b(import.meta.url), y = p.dirname(w);
let o = null, c = null;
const f = !m.isPackaged;
function S() {
  const e = f ? p.join(y, "../build/icon.png") : p.join(process.resourcesPath, "build/icon.png");
  o = new g({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0,
      preload: p.join(y, "preload.js")
    },
    title: "Neural Cursor",
    icon: u.existsSync(e) ? e : void 0,
    backgroundColor: "#000000"
  }), f ? (o.loadURL("http://localhost:3000"), o.webContents.openDevTools()) : o.loadFile(p.join(y, "../dist/index.html")), o.on("closed", () => {
    o = null, c && c.kill();
  });
}
async function k() {
  t("Checking Python dependencies...");
  try {
    return new Promise((e) => {
      const n = r("python3", ["-c", 'import pyautogui, pynput; print("OK")']);
      n.on("close", (i) => {
        t(`Dependency check exited with code ${i}`), e(i === 0);
      }), n.on("error", (i) => {
        t(`Dependency check error: ${i.message}`), e(!1);
      });
    });
  } catch (e) {
    return t(`Failed to ensure dependencies: ${e}`), !1;
  }
}
async function P() {
  return t("Installing missing Python dependencies..."), new Promise(async (e) => {
    var n, i;
    try {
      t("Updating pip..."), await new Promise((s) => {
        r("python3", ["-m", "pip", "install", "--upgrade", "pip"]).on("close", s);
      }), t("Installing pyobjc components..."), await new Promise((s) => {
        r("python3", ["-m", "pip", "install", "pyobjc-core", "pyobjc-framework-Quartz"]).on("close", s);
      });
      const a = r("python3", ["-m", "pip", "install", "pyautogui", "pynput"]);
      (n = a.stdout) == null || n.on("data", (s) => t(`[Pip-Stdout] ${s}`)), (i = a.stderr) == null || i.on("data", (s) => t(`[Pip-Stderr] ${s}`)), a.on("close", (s) => {
        t(`Installation finished with code ${s}`), e(s === 0);
      }), a.on("error", (s) => {
        t(`Installation error: ${s.message}`), e(!1);
      });
    } catch (a) {
      t(`Execution error during installation: ${a}`), e(!1);
    }
  });
}
const $ = "/tmp/neural_cursor.log";
function t(e) {
  const n = `[${(/* @__PURE__ */ new Date()).toISOString()}] [Main] ${e}
`;
  u.appendFileSync($, n), console.log(e);
}
function A() {
  var i, a;
  if (c) {
    t("Backend already running, skipping start.");
    return;
  }
  const e = f ? p.join(y, "mouse_controller.py") : p.join(process.resourcesPath, "electron/mouse_controller.py");
  if (t(`Attempting to start backend: ${e}`), !u.existsSync(e)) {
    t(`ERROR: Backend script not found at ${e}`);
    return;
  }
  const n = u.existsSync("/usr/bin/python3") ? "/usr/bin/python3" : u.existsSync("/usr/local/bin/python3") ? "/usr/local/bin/python3" : "python3";
  c = r(n, [e], {
    cwd: p.dirname(e),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      RESOURCES_PATH: process.resourcesPath
    }
  }), (i = c.stdout) == null || i.on("data", (s) => {
    t(`[Backend-Stdout] ${s.toString().trim()}`);
  }), (a = c.stderr) == null || a.on("data", (s) => {
    t(`[Backend-Stderr] ${s.toString().trim()}`);
  }), c.on("exit", (s) => {
    t(`Backend process exited with code ${s}`), c = null;
  }), c.on("error", (s) => {
    t(`ERROR: Failed to start backend process: ${s.message}`), c = null;
  });
}
function x() {
  c && (c.kill(), c = null);
}
m.whenReady().then(async () => {
  S();
  const e = {
    accessibility: d.isTrustedAccessibilityClient(!1),
    camera: d.getMediaAccessStatus("camera")
  };
  e.camera === "not-determined" && d.askForMediaAccess("camera"), e.accessibility || o == null || o.webContents.on("did-finish-load", () => {
    o == null || o.webContents.send("request-accessibility");
  });
});
m.on("window-all-closed", () => {
  process.platform !== "darwin" && m.quit();
});
l.handle("check-permissions", async () => {
  const e = d.isTrustedAccessibilityClient(!1), n = d.getMediaAccessStatus("camera"), i = await k();
  return t(`[Main] Status Check -> Accessibility: ${e}, Camera: ${n}, Deps: ${i}`), { accessibility: e, camera: n, dependencies: i };
});
l.handle("request-permissions", async () => {
  console.log("[Main] Requesting Camera access...");
  const e = await d.askForMediaAccess("camera"), n = d.isTrustedAccessibilityClient(!1);
  return console.log(`[Main] Accessibility Status: ${n ? "GRANTED" : "DENIED"}`), n || (console.log("[Main] Accessibility not granted, opening System Settings..."), r("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"])), { camera: e, accessibility: n };
});
l.handle("request-camera", async () => await d.askForMediaAccess("camera"));
l.handle("open-accessibility", () => {
  r("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"]);
});
l.handle("reset-accessibility-permissions", async () => (console.log("[Main] Resetting Accessibility permissions via tccutil..."), new Promise((e) => {
  const n = r("tccutil", ["reset", "Accessibility", "com.neuralcursor.app"]);
  n.on("exit", (i) => {
    console.log(`[Main] tccutil reset exited with code ${i}`), e(i === 0);
  }), n.on("error", (i) => {
    console.error("[Main] Failed to run tccutil:", i), e(!1);
  });
})));
l.handle("open-camera-settings", () => {
  r("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"]);
});
l.handle("start-installation", async () => (t("[Main] Starting automated dependency installation..."), await P()));
l.handle("toggle-system", async (e, n) => n ? (A(), !0) : (x(), !0));
l.on("sync-action", (e, n) => {
  c && c.stdin && c.stdin.write(JSON.stringify(n) + `
`);
});
