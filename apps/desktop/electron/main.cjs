const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;

const store = new Store({
  name: "preferences",
  defaults: {
    overlayPreferences: {
      opacity: 0.75,
      fontSize: 28,
      alwaysOnTop: true
    },
    overlayBounds: {
      width: 720,
      height: 300
    }
  }
});

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;
let overlayWindow = null;

function getOverlayPreferences() {
  return store.get("overlayPreferences");
}

function setOverlayPreferences(partial) {
  const current = store.get("overlayPreferences");
  const next = { ...current, ...partial };
  store.set("overlayPreferences", next);
  return next;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(`${devServerUrl}/main.html`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "main.html"));
  }
}

function createOrFocusOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const bounds = store.get("overlayBounds");
  const prefs = getOverlayPreferences();

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: prefs.alwaysOnTop,
    resizable: true,
    movable: true,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.on("close", () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }
    store.set("overlayBounds", overlayWindow.getBounds());
  });

  if (isDev) {
    overlayWindow.loadURL(`${devServerUrl}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, "..", "dist", "overlay.html"));
  }
}

app.whenReady().then(() => {
  createMainWindow();
  createOrFocusOverlayWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("overlay:create-or-focus", () => {
  createOrFocusOverlayWindow();
  return { ok: true };
});

ipcMain.handle("overlay:get-preferences", () => {
  return getOverlayPreferences();
});

ipcMain.handle("overlay:update-preferences", (_event, partialPreferences) => {
  const next = setOverlayPreferences(partialPreferences || {});
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setAlwaysOnTop(Boolean(next.alwaysOnTop));
    overlayWindow.webContents.send("overlay:preferences-updated", next);
  }
  return next;
});

ipcMain.handle("overlay:set-always-on-top", (_event, value) => {
  const next = setOverlayPreferences({ alwaysOnTop: Boolean(value) });
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setAlwaysOnTop(Boolean(next.alwaysOnTop));
    overlayWindow.webContents.send("overlay:preferences-updated", next);
  }
  return next;
});

ipcMain.handle("overlay:set-bounds", (_event, bounds) => {
  if (overlayWindow && !overlayWindow.isDestroyed() && bounds) {
    overlayWindow.setBounds(bounds);
    store.set("overlayBounds", overlayWindow.getBounds());
  }
  return store.get("overlayBounds");
});

ipcMain.handle("overlay:get-bounds", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow.getBounds();
  }
  return store.get("overlayBounds");
});

ipcMain.handle("auth:open-spotify-login", async (_event, spotifyAuthUrl) => {
  if (!spotifyAuthUrl) {
    return { ok: false, error: "Missing spotifyAuthUrl" };
  }
  await shell.openExternal(spotifyAuthUrl);
  return { ok: true };
});
