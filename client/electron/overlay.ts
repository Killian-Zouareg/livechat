import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { OverlayShowPayload } from './preload';
import { MAX_CONCURRENT_OVERLAYS, MEME_MAX_DURATION_MS, MEME_MIN_DURATION_MS } from '../../shared/types';

interface ActiveOverlay {
  win: BrowserWindow;
  timer: NodeJS.Timeout;
}

const active = new Map<string, ActiveOverlay>();

let closedHandler: ((id: string) => void) | null = null;

/** Enregistre un callback appelé quand un overlay se ferme (timer, dismiss, ou close). */
export function setOverlayClosedHandler(handler: (id: string) => void): void {
  closedHandler = handler;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function destroy(id: string): void {
  const entry = active.get(id);
  if (!entry) return;
  active.delete(id);
  clearTimeout(entry.timer);
  if (!entry.win.isDestroyed()) {
    entry.win.close();
  }
}

/** Ferme un overlay précis sur demande (utilisé pour résoudre une race de lock). */
export function destroyOverlay(id: string): void {
  destroy(id);
}

export function createOverlayWindow(
  payload: OverlayShowPayload,
  paths: { mainDist: string; rendererDist: string; viteDevUrl?: string }
): void {
  if (active.size >= MAX_CONCURRENT_OVERLAYS) {
    // Cap : on jette le plus vieux pour faire de la place.
    const oldest = active.keys().next().value;
    if (oldest) destroy(oldest);
  }

  // Cible l'écran demandé par le receiver ; fallback = écran principal
  // (si l'écran a été débranché depuis la sauvegarde du réglage).
  const target =
    (payload.displayId != null
      ? screen.getAllDisplays().find((d) => d.id === payload.displayId)
      : undefined) ?? screen.getPrimaryDisplay();
  const { workArea } = target;
  const posX = clamp(payload.posX, 0, 1);
  const posY = clamp(payload.posY, 0, 1);
  const width = clamp(payload.width, 0.05, 1);
  const height = clamp(payload.height, 0.05, 1);

  const bounds = {
    x: workArea.x + Math.round(posX * workArea.width),
    y: workArea.y + Math.round(posY * workArea.height),
    width: Math.max(80, Math.round(width * workArea.width)),
    height: Math.max(60, Math.round(height * workArea.height)),
  };

  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(paths.mainDist, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Always-on-top niveau max + visible même sur jeux fullscreen.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Clics + scroll passent à travers vers l'app derrière (jeu, etc.).
  win.setIgnoreMouseEvents(true, { forward: true });

  // Envoyer le payload une fois la page chargée.
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('overlay:payload', payload);
    win.showInactive(); // show sans voler le focus
  });

  // Charger overlay.html (Vite dev URL ou fichier prod).
  if (paths.viteDevUrl) {
    void win.loadURL(`${paths.viteDevUrl.replace(/\/$/, '')}/overlay.html`);
  } else {
    void win.loadFile(path.join(paths.rendererDist, 'overlay.html'));
  }

  // Timer dans le main process (insensible à un freeze du renderer).
  const durationMs = clamp(payload.durationMs, MEME_MIN_DURATION_MS, MEME_MAX_DURATION_MS);
  const timer = setTimeout(() => destroy(payload.id), durationMs);

  active.set(payload.id, { win, timer });

  win.on('closed', () => {
    const entry = active.get(payload.id);
    if (entry) {
      clearTimeout(entry.timer);
      active.delete(payload.id);
    }
    closedHandler?.(payload.id);
  });
}

export function destroyAllOverlays(): void {
  for (const id of Array.from(active.keys())) {
    destroy(id);
  }
}
