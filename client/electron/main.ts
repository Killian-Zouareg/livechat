import { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOverlayWindow, destroyAllOverlays, destroyOverlay, setOverlayClosedHandler } from './overlay.js';
import type { OverlayShowPayload } from './preload.js';
import type { UpdaterStatus } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '..');

// electron-updater est CommonJS : on récupère autoUpdater via le default import (compat ESM).
const { autoUpdater } = electronUpdater;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let mainWindow: BrowserWindow | null = null;

// Dernier état connu de l'updater, renvoyé au renderer au montage (les events
// peuvent arriver avant que l'UI ne soit prête à écouter).
let updaterStatus: UpdaterStatus = { state: 'idle' };
let pendingUpdateVersion: string | undefined;

function sendUpdaterStatus(status: UpdaterStatus): void {
  updaterStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status);
  }
}

function setupAutoUpdater(): void {
  // Logs fichier : permet de diagnostiquer un échec de mise à jour chez un ami
  // (« rien ne se passe »). Chemin loggé au démarrage pour qu'on sache où regarder.
  const logPath = path.join(app.getPath('logs'), 'updater.log');
  const ulog = (level: string, ...args: unknown[]): void => {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const line = `[${new Date().toISOString()}] ${level} ${msg}\n`;
    void fs.appendFile(logPath, line).catch(() => {});
    console.log('[updater]', level, msg);
  };
  autoUpdater.logger = {
    info: (...a: unknown[]) => ulog('INFO', ...a),
    warn: (...a: unknown[]) => ulog('WARN', ...a),
    error: (...a: unknown[]) => ulog('ERROR', ...a),
    debug: (...a: unknown[]) => ulog('DEBUG', ...a),
  };
  ulog('INFO', `updater démarré, version ${app.getVersion()}, log: ${logPath}`);

  autoUpdater.on('checking-for-update', () => sendUpdaterStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    pendingUpdateVersion = info.version;
    sendUpdaterStatus({ state: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => sendUpdaterStatus({ state: 'not-available' }));
  autoUpdater.on('download-progress', (p) =>
    sendUpdaterStatus({ state: 'downloading', percent: Math.round(p.percent), version: pendingUpdateVersion }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    sendUpdaterStatus({ state: 'downloaded', version: info.version }),
  );
  autoUpdater.on('error', (err) =>
    sendUpdaterStatus({ state: 'error', message: err?.message ?? String(err) }),
  );

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[updater] check failed', err);
    sendUpdaterStatus({ state: 'error', message: err?.message ?? String(err) });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Les overlays sont des BrowserWindows séparées qui retarderaient
  // l'événement 'window-all-closed'. On les ferme dès que la main window
  // se ferme pour garantir un app.quit() propre.
  mainWindow.on('close', () => {
    destroyAllOverlays();
  });

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

ipcMain.handle('app:isFocused', () => mainWindow?.isFocused() ?? false);

ipcMain.handle('updater:getStatus', () => updaterStatus);
ipcMain.handle('updater:check', () => {
  if (VITE_DEV_SERVER_URL) return;
  void autoUpdater.checkForUpdates().catch((err) => {
    sendUpdaterStatus({ state: 'error', message: err?.message ?? String(err) });
  });
});
ipcMain.handle('updater:quitAndInstall', () => {
  destroyAllOverlays();
  autoUpdater.quitAndInstall();
});

ipcMain.handle('app:notify', (_event, payload: { title: string; body: string }) => {
  if (!Notification.isSupported()) return;
  if (mainWindow?.isFocused()) return;
  new Notification({ title: payload.title, body: payload.body, silent: false }).show();
});

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.ogv']);
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.m4v': 'video/mp4', '.ogv': 'video/ogg',
};
const MAX_SCAN_FILES = 5000;
const MAX_SCAN_DEPTH = 6;

export interface LibraryEntry {
  /** Path relatif au root, séparateurs POSIX (stable cross-OS dans la map de tags). */
  relPath: string;
  /** Path absolu pour lire le fichier. */
  absPath: string;
  name: string;
  ext: string;
  mimeType: string;
  kind: 'image' | 'video' | 'gif';
  size: number;
  mtime: number;
}

async function scanFolder(root: string): Promise<LibraryEntry[]> {
  const results: LibraryEntry[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || results.length >= MAX_SCAN_FILES) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_SCAN_FILES) return;
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const isImage = IMAGE_EXTS.has(ext);
        const isVideo = VIDEO_EXTS.has(ext);
        if (!isImage && !isVideo) continue;
        try {
          const stat = await fs.stat(abs);
          const rel = path.relative(root, abs).split(path.sep).join('/');
          results.push({
            relPath: rel,
            absPath: abs,
            name: entry.name,
            ext,
            mimeType: MIME_BY_EXT[ext] ?? (isVideo ? 'video/mp4' : 'image/png'),
            kind: ext === '.gif' ? 'gif' : isVideo ? 'video' : 'image',
            size: stat.size,
            mtime: stat.mtimeMs,
          });
        } catch {
          // unreadable, skip
        }
      }
    }
  }
  await walk(root, 0);
  return results;
}

ipcMain.handle('library:pickFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choisir un dossier de médias',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('library:scan', async (_event, root: string) => {
  if (typeof root !== 'string' || !root) return [];
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }
  return scanFolder(root);
});

ipcMain.handle('library:readFile', async (_event, absPath: string, rootGuard: string) => {
  if (typeof absPath !== 'string' || typeof rootGuard !== 'string') {
    throw new Error('invalid args');
  }
  // Sécurité : confine la lecture au dossier choisi par l'utilisateur.
  const resolvedRoot = path.resolve(rootGuard);
  const resolvedAbs = path.resolve(absPath);
  if (!resolvedAbs.startsWith(resolvedRoot + path.sep) && resolvedAbs !== resolvedRoot) {
    throw new Error('path escapes library root');
  }
  const buf = await fs.readFile(resolvedAbs);
  const ext = path.extname(resolvedAbs).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  return { mimeType: mime, base64: buf.toString('base64'), size: buf.length };
});

ipcMain.handle('displays:list', () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, idx) => ({
    id: d.id,
    label: d.label && d.label.trim().length > 0 ? d.label : `Écran ${idx + 1}`,
    isPrimary: d.id === primaryId,
    width: d.size.width,
    height: d.size.height,
  }));
});

ipcMain.handle('overlay:show', (_event, payload: OverlayShowPayload) => {
  if (!payload || typeof payload !== 'object') return;
  createOverlayWindow(payload, {
    mainDist: MAIN_DIST,
    rendererDist: RENDERER_DIST,
    viteDevUrl: VITE_DEV_SERVER_URL,
  });
});

ipcMain.handle('overlay:dismiss', (_event, id: string) => {
  if (typeof id !== 'string' || !id) return;
  destroyOverlay(id);
});

setOverlayClosedHandler((id) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay:closed', id);
  }
});

app.whenReady().then(() => {
  createWindow();
  // Pas de check de mise à jour en dev (pas d'app packagée à comparer).
  if (!VITE_DEV_SERVER_URL) {
    setupAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  destroyAllOverlays();
  if (process.platform !== 'darwin') app.quit();
  mainWindow = null;
});

app.on('before-quit', () => {
  destroyAllOverlays();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
