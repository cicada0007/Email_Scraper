"use strict";

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");

// ─── Start the dashboard server ─────────────────────────────────────────────
let serverPort;
try {
  const srv = require("../dashboard/server");
  serverPort = srv.PORT || 3847;
} catch (err) {
  dialog.showErrorBox("TouchMail — Server Error", `Failed to start dashboard server:\n\n${err.message}`);
  app.quit();
}

const DASHBOARD_URL = `http://localhost:${serverPort}`;

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let serverReady = false;

// ─── Wait for server to be accepting connections ──────────────────────────────
function waitForServer(retries = 30, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`${DASHBOARD_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(500, () => { req.destroy(); retry(); });

      function retry() {
        attempts++;
        if (attempts >= retries) return reject(new Error("Server did not start in time"));
        setTimeout(check, intervalMs);
      }
    };
    check();
  });
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "TouchMail Dashboard",
    icon: path.join(__dirname, "../icons/icon-128.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL(DASHBOARD_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Intercept external links — open them in the real browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (e) => {
    // Hide to tray instead of quitting
    e.preventDefault();
    mainWindow.hide();
    if (process.platform === "darwin") app.dock.hide();
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "../icons/icon-16.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip("TouchMail");

  const menu = Menu.buildFromTemplate([
    {
      label: "TouchMail",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
        if (process.platform === "darwin") app.dock.show();
      },
    },
    {
      label: "Open in Browser",
      click: () => shell.openExternal(DASHBOARD_URL),
    },
    { type: "separator" },
    {
      label: "Quit TouchMail",
      click: () => {
        mainWindow?.removeAllListeners("close");
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);

  tray.on("click", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
    if (process.platform === "darwin") app.dock.show();
  });

  tray.on("double-click", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createTray();

  try {
    await waitForServer();
    serverReady = true;
    createWindow();
  } catch {
    dialog.showErrorBox(
      "TouchMail — Server Timeout",
      `Dashboard server did not respond at ${DASHBOARD_URL}.\n\nTry quitting and reopening the app.`
    );
  }
});

// Keep app alive even when all windows are closed (lives in tray)
app.on("window-all-closed", (e) => {
  if (process.platform !== "darwin") {
    // Windows/Linux: just hide, keep tray alive
    e.preventDefault?.();
  }
});

app.on("activate", () => {
  // macOS dock click
  if (serverReady) {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
    app.dock?.show();
  }
});
