import { contextBridge, ipcRenderer } from 'electron';
import type { MemeMessage } from '../../shared/types';

export interface OverlayShowPayload extends MemeMessage {
  /** Volume capturé côté receiver au moment de l'arrivée du mème. */
  volume: number;
  /** ID de l'écran cible (optionnel, fallback = écran principal). */
  displayId?: number;
}

export interface DisplayInfo {
  id: number;
  label: string;
  isPrimary: boolean;
  width: number;
  height: number;
}

export interface LibraryEntry {
  relPath: string;
  absPath: string;
  name: string;
  ext: string;
  mimeType: string;
  kind: 'image' | 'video' | 'gif';
  size: number;
  mtime: number;
}

export interface LibraryFileData {
  mimeType: string;
  base64: string;
  size: number;
}

/** API exposée sur window.api — pour la fenêtre principale (sender). */
const api = {
  isFocused: (): Promise<boolean> => ipcRenderer.invoke('app:isFocused'),
  notify: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('app:notify', { title, body }),
  /** Demande au main d'ouvrir une overlay window pour afficher un mème. */
  showMeme: (payload: OverlayShowPayload): Promise<void> =>
    ipcRenderer.invoke('overlay:show', payload),
  /** Ferme un overlay précis (utilisé pour résoudre une race du verrou meme). */
  dismissMeme: (id: string): Promise<void> =>
    ipcRenderer.invoke('overlay:dismiss', id),
  /** S'abonne aux fermetures d'overlay (timer, dismiss, ou close manuelle). */
  onOverlayClosed: (handler: (id: string) => void): (() => void) => {
    const listener = (_e: unknown, id: string): void => handler(id);
    ipcRenderer.on('overlay:closed', listener);
    return () => ipcRenderer.removeListener('overlay:closed', listener);
  },
  /** Ouvre un dialog pour choisir un dossier média. Renvoie null si annulé. */
  libraryPickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('library:pickFolder'),
  /** Scanne le dossier (images + vidéos, récursif). */
  libraryScan: (root: string): Promise<LibraryEntry[]> =>
    ipcRenderer.invoke('library:scan', root),
  /** Lit un fichier de la bibliothèque (confiné au root choisi). */
  libraryReadFile: (absPath: string, root: string): Promise<LibraryFileData> =>
    ipcRenderer.invoke('library:readFile', absPath, root),
  /** Liste les écrans disponibles pour choisir où s'affichent les mèmes reçus. */
  displaysList: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('displays:list'),
};

/** API exposée sur window.overlayApi — pour les fenêtres overlay (receiver). */
const overlayApi = {
  onPayload: (handler: (payload: OverlayShowPayload) => void): void => {
    ipcRenderer.on('overlay:payload', (_event, payload: OverlayShowPayload) => {
      handler(payload);
    });
  },
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('overlayApi', overlayApi);

export type BridgeApi = typeof api;
export type OverlayBridgeApi = typeof overlayApi;
