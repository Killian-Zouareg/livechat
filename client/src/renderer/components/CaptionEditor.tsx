import type { CSSProperties } from 'react';
import {
  CAPTION_FONTS,
  CAPTION_FONT_SIZE_MAX,
  CAPTION_FONT_SIZE_MIN,
  type CaptionAlign,
  type CaptionPosition,
  type CaptionStyle,
} from '@shared/types';

interface Props {
  value: CaptionStyle;
  onChange: (next: CaptionStyle) => void;
}

const POSITIONS: { key: CaptionPosition; label: string }[] = [
  { key: 'top', label: 'Haut' },
  { key: 'middle', label: 'Milieu' },
  { key: 'bottom', label: 'Bas' },
];

const ALIGNS: { key: CaptionAlign; label: string }[] = [
  { key: 'left', label: '⟸' },
  { key: 'center', label: '≡' },
  { key: 'right', label: '⟹' },
];

export function CaptionEditor({ value, onChange }: Props) {
  const set = <K extends keyof CaptionStyle>(k: K, v: CaptionStyle[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="caption-editor">
      <div className="caption-editor-row">
        <label className="caption-editor-field">
          <span>Texte</span>
          <input
            type="color"
            value={value.color}
            onChange={(e) => set('color', e.target.value)}
          />
        </label>
        <label className="caption-editor-field">
          <span>Fond</span>
          <input
            type="color"
            value={value.bgColor}
            onChange={(e) => set('bgColor', e.target.value)}
          />
        </label>
        <label className="caption-editor-field caption-editor-field-grow">
          <span>Opacité fond</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.bgOpacity}
            onChange={(e) => set('bgOpacity', Number(e.target.value))}
          />
        </label>
      </div>

      <div className="caption-editor-row">
        <label className="caption-editor-field caption-editor-field-grow">
          <span>Police</span>
          <select
            value={value.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value as CaptionStyle['fontFamily'])}
          >
            {CAPTION_FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="caption-editor-field">
          <span>Taille</span>
          <input
            type="number"
            min={CAPTION_FONT_SIZE_MIN}
            max={CAPTION_FONT_SIZE_MAX}
            value={value.fontSize}
            onChange={(e) =>
              set(
                'fontSize',
                Math.max(
                  CAPTION_FONT_SIZE_MIN,
                  Math.min(CAPTION_FONT_SIZE_MAX, Number(e.target.value) || CAPTION_FONT_SIZE_MIN)
                )
              )
            }
          />
        </label>
      </div>

      <div className="caption-editor-row">
        <div className="caption-editor-toggles">
          <button
            type="button"
            className={`caption-toggle ${value.bold ? 'active' : ''}`}
            onClick={() => set('bold', !value.bold)}
            title="Gras"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`caption-toggle ${value.italic ? 'active' : ''}`}
            onClick={() => set('italic', !value.italic)}
            title="Italique"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`caption-toggle ${value.outline ? 'active' : ''}`}
            onClick={() => set('outline', !value.outline)}
            title="Contour"
          >
            O
          </button>
        </div>

        <div className="caption-editor-segmented" role="radiogroup" aria-label="Alignement texte">
          {ALIGNS.map((a) => (
            <button
              key={a.key}
              type="button"
              className={value.align === a.key ? 'active' : ''}
              onClick={() => set('align', a.key)}
              title={`Aligner ${a.key}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="caption-editor-segmented" role="radiogroup" aria-label="Position verticale">
          {POSITIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={value.position === p.key ? 'active' : ''}
              onClick={() => set('position', p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Génère les styles CSS à appliquer au caption (utilisable côté preview et overlay). */
export function captionCssStyle(style: CaptionStyle): CSSProperties {
  const hex = style.bgColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const bg = `rgba(${r}, ${g}, ${b}, ${style.bgOpacity})`;
  const outline = style.outline
    ? '0 0 3px #000, 0 0 3px #000, 0 1px 2px rgba(0,0,0,0.9)'
    : '0 1px 2px rgba(0,0,0,0.5)';
  return {
    color: style.color,
    background: style.bgOpacity > 0 ? bg : 'transparent',
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.align,
    textShadow: outline,
    padding: style.bgOpacity > 0 ? '6px 14px' : '2px 0',
    borderRadius: '20px',
    maxWidth: '90%',
    wordBreak: 'break-word',
  };
}
