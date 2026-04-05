const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyribolsa", {
  auth: {
    openSpotifyLogin: (spotifyAuthUrl) => ipcRenderer.invoke("auth:open-spotify-login", spotifyAuthUrl)
  },
  overlay: {
    createOrFocus: () => ipcRenderer.invoke("overlay:create-or-focus"),
    getPreferences: () => ipcRenderer.invoke("overlay:get-preferences"),
    updatePreferences: (partialPreferences) => ipcRenderer.invoke("overlay:update-preferences", partialPreferences),
    setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke("overlay:set-always-on-top", alwaysOnTop),
    setBounds: (bounds) => ipcRenderer.invoke("overlay:set-bounds", bounds),
    getBounds: () => ipcRenderer.invoke("overlay:get-bounds"),
    onPreferencesUpdated: (callback) => {
      const listener = (_event, preferences) => callback(preferences);
      ipcRenderer.on("overlay:preferences-updated", listener);
      return () => ipcRenderer.removeListener("overlay:preferences-updated", listener);
    }
  }
});
