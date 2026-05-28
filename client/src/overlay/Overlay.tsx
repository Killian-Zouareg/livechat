import { useEffect, useRef, useState } from 'react';
import type { OverlayShowPayload } from '../../electron/preload';
import { DEFAULT_CAPTION_STYLE } from '../../../shared/types';
import { captionCssStyle } from '../renderer/components/CaptionEditor';

export function Overlay() {
  const [payload, setPayload] = useState<OverlayShowPayload | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!window.overlayApi) return;
    window.overlayApi.onPayload((p: OverlayShowPayload) => setPayload(p));
  }, []);

  useEffect(() => {
    if (videoRef.current && payload) {
      videoRef.current.volume = payload.volume;
      // Seek au début du clip si trim défini.
      if (payload.mediaType === 'video' && payload.clipStart !== undefined) {
        videoRef.current.currentTime = payload.clipStart;
      }
    }
  }, [payload?.id]);

  // Loop dans [clipStart..clipEnd] côté receiver.
  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v || !payload) return;
    const { clipStart, clipEnd } = payload;
    if (clipEnd !== undefined && v.currentTime >= clipEnd) {
      v.currentTime = clipStart ?? 0;
    }
  }

  if (!payload) return null;

  const captionStyle = payload.captionStyle ?? DEFAULT_CAPTION_STYLE;
  const captionCss = captionCssStyle(captionStyle);

  const captionNode = payload.caption ? (
    <div style={captionCss}>{payload.caption}</div>
  ) : null;

  const media =
    payload.mediaType === 'video' ? (
      <video
        ref={videoRef}
        src={payload.data}
        autoPlay
        loop
        playsInline
        onTimeUpdate={onTimeUpdate}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        }}
      />
    ) : (
      <img
        src={payload.data}
        alt=""
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        }}
      />
    );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6em',
        background: 'transparent',
        padding: '8px',
        boxSizing: 'border-box',
      }}
    >
      {captionNode && captionStyle.position === 'top' && captionNode}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {media}
        {captionNode && captionStyle.position === 'middle' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {captionNode}
          </div>
        )}
      </div>
      {captionNode && captionStyle.position === 'bottom' && captionNode}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          right: 8,
          color: 'rgba(255,255,255,0.6)',
          fontSize: '10px',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        de {payload.pseudo}
      </div>
    </div>
  );
}
