/**
 * Helpers de sanitisation pour TOUT ce qui vient d'un pair distant
 * (donc potentiellement malicieux).
 */

import type { CaptionStyle, MemeMessage } from '@shared/types';
import {
  CAPTION_FONTS,
  CAPTION_FONT_SIZE_MAX,
  CAPTION_FONT_SIZE_MIN,
  DEFAULT_CAPTION_STYLE,
  MEME_CAPTION_MAX,
  MEME_HARD_LIMIT_BYTES,
  MEME_MAX_DURATION_MS,
  MEME_MIN_DURATION_MS,
} from '@shared/types';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeHexColor(input: unknown, fallback: string): string {
  return typeof input === 'string' && HEX_COLOR_RE.test(input) ? input : fallback;
}

function sanitizeCaptionStyle(input: unknown): CaptionStyle | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const s = input as Record<string, unknown>;
  const fontFamily = (CAPTION_FONTS as readonly string[]).includes(s.fontFamily as string)
    ? (s.fontFamily as CaptionStyle['fontFamily'])
    : DEFAULT_CAPTION_STYLE.fontFamily;
  const position =
    s.position === 'top' || s.position === 'middle' || s.position === 'bottom'
      ? s.position
      : DEFAULT_CAPTION_STYLE.position;
  const align =
    s.align === 'left' || s.align === 'center' || s.align === 'right'
      ? s.align
      : DEFAULT_CAPTION_STYLE.align;
  const fontSizeRaw = typeof s.fontSize === 'number' && Number.isFinite(s.fontSize) ? s.fontSize : DEFAULT_CAPTION_STYLE.fontSize;
  const fontSize = Math.max(CAPTION_FONT_SIZE_MIN, Math.min(CAPTION_FONT_SIZE_MAX, fontSizeRaw));
  const bgOpacityRaw = typeof s.bgOpacity === 'number' && Number.isFinite(s.bgOpacity) ? s.bgOpacity : DEFAULT_CAPTION_STYLE.bgOpacity;
  const bgOpacity = Math.max(0, Math.min(1, bgOpacityRaw));
  return {
    color: sanitizeHexColor(s.color, DEFAULT_CAPTION_STYLE.color),
    bgColor: sanitizeHexColor(s.bgColor, DEFAULT_CAPTION_STYLE.bgColor),
    bgOpacity,
    fontFamily,
    fontSize,
    bold: Boolean(s.bold),
    italic: Boolean(s.italic),
    outline: Boolean(s.outline),
    position,
    align,
  };
}

const AVATAR_MAX_BYTES = 250_000;
const MAX_INLINE_BASE64 = Math.ceil(MEME_HARD_LIMIT_BYTES * 1.4);

/** Avatar reçu : doit être un data URL image. */
export function sanitizeAvatar(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'string') return undefined;
  if (input.length > AVATAR_MAX_BYTES) return undefined;
  if (!input.startsWith('data:image/')) return undefined;
  if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(input)) return undefined;
  return input;
}

/** Data URL image/video, base64. */
function sanitizeMediaData(input: unknown, maxBytes: number): string | null {
  if (typeof input !== 'string') return null;
  if (input.length > maxBytes) return null;
  if (!input.startsWith('data:')) return null;
  if (!/^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(input)) return null;
  return input;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/** Valide un mème reçu d'un pair. Renvoie null si malformé. */
export function validateMeme(raw: unknown): MemeMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 64) return null;
  if (typeof r.userId !== 'string' || r.userId.length < 1 || r.userId.length > 64) return null;
  if (typeof r.pseudo !== 'string' || r.pseudo.length < 1 || r.pseudo.length > 32) return null;
  if (typeof r.ts !== 'number' || r.ts <= 0 || r.ts > Date.now() + 60_000) return null;

  const mediaType =
    r.mediaType === 'video' || r.mediaType === 'gif' ? r.mediaType : 'image';
  const mimeType =
    typeof r.mimeType === 'string' ? r.mimeType.slice(0, 100) : 'application/octet-stream';
  const data = sanitizeMediaData(r.data, MAX_INLINE_BASE64);
  if (!data) return null;

  const caption =
    typeof r.caption === 'string' && r.caption.length > 0
      ? r.caption.slice(0, MEME_CAPTION_MAX)
      : undefined;

  const durationMs = clamp(r.durationMs, MEME_MIN_DURATION_MS, MEME_MAX_DURATION_MS, 5000);
  const posX = clamp(r.posX, 0, 1, 0.2);
  const posY = clamp(r.posY, 0, 1, 0.2);
  const width = clamp(r.width, 0.05, 1, 0.6);
  const height = clamp(r.height, 0.05, 1, 0.6);

  // Trim vidéo optionnel : bornes finies et cohérentes, sinon on les ignore.
  let clipStart: number | undefined;
  let clipEnd: number | undefined;
  if (typeof r.clipStart === 'number' && Number.isFinite(r.clipStart) && r.clipStart >= 0) {
    clipStart = r.clipStart;
  }
  if (typeof r.clipEnd === 'number' && Number.isFinite(r.clipEnd) && r.clipEnd > 0) {
    clipEnd = r.clipEnd;
  }
  if (clipStart !== undefined && clipEnd !== undefined && clipEnd <= clipStart) {
    clipStart = undefined;
    clipEnd = undefined;
  }

  const captionStyle = sanitizeCaptionStyle(r.captionStyle);

  return {
    id: r.id, userId: r.userId, pseudo: r.pseudo, mediaType, mimeType,
    data, caption, durationMs, posX, posY, width, height, clipStart, clipEnd, captionStyle, ts: r.ts,
  };
}
