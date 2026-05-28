export type MediaKind = 'image' | 'video' | 'gif';

export interface User {
  id: string;
  pseudo: string;
  avatar?: string;
}

export type CaptionPosition = 'top' | 'middle' | 'bottom';
export type CaptionAlign = 'left' | 'center' | 'right';

/** Liste de polices proposées dans le mini-éditeur (whitelist côté receiver). */
export const CAPTION_FONTS = [
  'system-ui',
  'Impact',
  'Comic Sans MS',
  'Arial Black',
  'Georgia',
  'Courier New',
  'Times New Roman',
  'Verdana',
] as const;
export type CaptionFont = (typeof CAPTION_FONTS)[number];

export const CAPTION_FONT_SIZE_MIN = 10;
export const CAPTION_FONT_SIZE_MAX = 72;

export interface CaptionStyle {
  /** Couleur du texte (CSS color hex #rrggbb). */
  color: string;
  /** Couleur de fond (hex #rrggbb). Combinée avec bgOpacity. */
  bgColor: string;
  /** Opacité du fond (0..1). 0 = pas de fond. */
  bgOpacity: number;
  fontFamily: CaptionFont;
  /** Taille en px (clamp 10..72). */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** Activer un trait de contour (text-shadow renforcé). */
  outline: boolean;
  position: CaptionPosition;
  align: CaptionAlign;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  color: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.7,
  fontFamily: 'system-ui',
  fontSize: 18,
  bold: true,
  italic: false,
  outline: true,
  position: 'bottom',
  align: 'center',
};

/**
 * Mème balancé sur l'écran d'un pair.
 * Position et taille sont en coordonnées relatives [0..1] pour gérer
 * les écrans de tailles différentes.
 */
export interface MemeMessage {
  id: string;
  userId: string;
  pseudo: string;
  mediaType: MediaKind;
  mimeType: string;
  /** data URL base64 (data:image/png;base64,...) */
  data: string;
  /** Texte optionnel affiché sous l'image (max 140 car.) */
  caption?: string;
  /** Durée d'affichage en ms (clamp 500..60000) */
  durationMs: number;
  /** Position du coin haut-gauche, relative au workArea (0..1) */
  posX: number;
  posY: number;
  /** Taille de l'overlay, relative au workArea (0..1) */
  width: number;
  height: number;
  /** Trim vidéo : début/fin du passage à lire, en secondes. Si absent, lecture complète en boucle. */
  clipStart?: number;
  clipEnd?: number;
  /** Style du caption (couleur, police, position, etc.). Optionnel — defaults appliqués si absent. */
  captionStyle?: CaptionStyle;
  ts: number;
}

/** État de l'auto-updater poussé du main process vers l'UI. */
export type UpdaterStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

/** Payload Trystero pour se présenter aux autres pairs. */
export interface PeerIntroduce {
  userId: string;
  pseudo: string;
  avatar?: string;
}

/** Taille max du media (binaire). 25 MB = ~33 MB en base64. */
export const MEME_HARD_LIMIT_BYTES = 25 * 1024 * 1024;

/** Durée min/max du mème en ms. */
export const MEME_MIN_DURATION_MS = 500;
export const MEME_MAX_DURATION_MS = 60_000;

/** Caption max length. */
export const MEME_CAPTION_MAX = 140;

/** Cap au nombre d'overlays simultanés (anti-DOS-by-friend). */
export const MAX_CONCURRENT_OVERLAYS = 5;
