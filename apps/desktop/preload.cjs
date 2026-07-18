const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", Object.freeze({
  platform: process.platform,
  version: "0.1.0"
}));
