import { useRef } from 'react';
import type { MemePos } from '../store';

interface Props {
  value: MemePos;
  onChange: (pos: MemePos) => void;
}

/**
 * Mini-canvas représentant l'écran du destinataire (16:9).
 * L'utilisateur drag pour déplacer, et utilise la poignée
 * bas-droite pour redimensionner. Les coords sont en 0..1
 * (relatives au workArea), donc indépendantes de la résolution.
 */
export function PositionPicker({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
    origW: number;
    origH: number;
  } | null>(null);

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function onPointerDown(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origPosX: value.posX,
      origPosY: value.posY,
      origW: value.width,
      origH: value.height,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxRel = (e.clientX - drag.startX) / rect.width;
    const dyRel = (e.clientY - drag.startY) / rect.height;

    if (drag.mode === 'move') {
      const newPosX = clamp(drag.origPosX + dxRel, 0, 1 - value.width);
      const newPosY = clamp(drag.origPosY + dyRel, 0, 1 - value.height);
      onChange({ ...value, posX: newPosX, posY: newPosY });
    } else {
      const newW = clamp(drag.origW + dxRel, 0.05, 1 - value.posX);
      const newH = clamp(drag.origH + dyRel, 0.05, 1 - value.posY);
      onChange({ ...value, width: newW, height: newH });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  // Le canvas a une taille fixe en CSS (320x180 = 16:9). Les coords 0..1
  // sont multipliées par cette taille pour positionner le rectangle.
  return (
    <div className="position-picker">
      <div className="position-picker-canvas" ref={canvasRef}>
        <div
          className="position-picker-rect"
          style={{
            left: `${value.posX * 100}%`,
            top: `${value.posY * 100}%`,
            width: `${value.width * 100}%`,
            height: `${value.height * 100}%`,
          }}
          onPointerDown={(e) => onPointerDown(e, 'move')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="position-picker-label">Ton mème</span>
          <div
            className="position-picker-resize"
            onPointerDown={(e) => onPointerDown(e, 'resize')}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      </div>
      <div className="position-picker-info">
        <span>
          Pos : {Math.round(value.posX * 100)}%, {Math.round(value.posY * 100)}%
        </span>
        <span>
          Taille : {Math.round(value.width * 100)}% × {Math.round(value.height * 100)}%
        </span>
      </div>
    </div>
  );
}
