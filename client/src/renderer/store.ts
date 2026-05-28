import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { CaptionStyle, User } from '@shared/types';
import { DEFAULT_CAPTION_STYLE } from '@shared/types';

export type Theme = 'light' | 'dark';

/** Position et taille d'un mème, en coordonnées relatives (0..1). */
export interface MemePos {
  posX: number;
  posY: number;
  width: number;
  height: number;
}

interface SettingsState {
  userId: string;
  pseudo: string;
  avatar?: string;
  roomCode: string;
  password: string;
  volume: number;
  theme: Theme;
  /** Zone d'écran où les mèmes reçus apparaissent chez moi. */
  overlayPos: MemePos;
  /** Écran cible pour les mèmes reçus (undefined = écran principal). */
  displayId?: number;
  /** Dernière durée choisie (ms) côté composer. */
  lastDurationMs: number;
  /** Dernier style de caption choisi. */
  lastCaptionStyle: CaptionStyle;
  setLastCaptionStyle: (style: CaptionStyle) => void;
  setProfile: (pseudo: string, avatar?: string) => void;
  setRoom: (roomCode: string, password: string) => void;
  setVolume: (volume: number) => void;
  setTheme: (theme: Theme) => void;
  setOverlayPos: (pos: MemePos) => void;
  setDisplayId: (id: number | undefined) => void;
  setLastDurationMs: (ms: number) => void;
  reset: () => void;
}

const DEFAULT_MEME_POS: MemePos = { posX: 0.2, posY: 0.2, width: 0.6, height: 0.6 };

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      userId: nanoid(12),
      pseudo: '',
      avatar: undefined,
      roomCode: '',
      password: '',
      volume: 0.7,
      theme: 'dark',
      overlayPos: DEFAULT_MEME_POS,
      displayId: undefined,
      lastDurationMs: 5000,
      lastCaptionStyle: DEFAULT_CAPTION_STYLE,
      setLastCaptionStyle: (style) => set({ lastCaptionStyle: style }),
      setProfile: (pseudo, avatar) => set({ pseudo, avatar }),
      setRoom: (roomCode, password) => set({ roomCode, password }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setTheme: (theme) => set({ theme }),
      setOverlayPos: (pos) => set({ overlayPos: pos }),
      setDisplayId: (id) => set({ displayId: id }),
      setLastDurationMs: (ms) => set({ lastDurationMs: ms }),
      reset: () => set({ pseudo: '', roomCode: '', password: '' }),
    }),
    { name: 'livechat-settings' }
  )
);

/** Mème actuellement affiché en overlay (verrou global "un mème à la fois"). */
export interface ActiveMeme {
  id: string;
  userId: string;
  pseudo: string;
  ts: number;
}

interface PresenceState {
  users: User[];
  connected: boolean;
  /** null = aucun overlay en cours, sinon mème en cours d'affichage. */
  activeMeme: ActiveMeme | null;
  setUsers: (users: User[]) => void;
  setConnected: (connected: boolean) => void;
  setActiveMeme: (meme: ActiveMeme | null) => void;
  /** Clear l'active uniquement si l'id matche (évite race après dismiss). */
  clearActiveMemeIf: (id: string) => void;
}

export const usePresence = create<PresenceState>((set) => ({
  users: [],
  connected: false,
  activeMeme: null,
  setUsers: (users) => set({ users }),
  setConnected: (connected) => set({ connected }),
  setActiveMeme: (meme) => set({ activeMeme: meme }),
  clearActiveMemeIf: (id) =>
    set((s) => (s.activeMeme?.id === id ? { activeMeme: null } : s)),
}));
