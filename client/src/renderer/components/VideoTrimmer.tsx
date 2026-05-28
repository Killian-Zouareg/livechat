import { useEffect, useRef, useState } from 'react';

export interface ClipRange {
  start: number;
  end: number;
}

interface Props {
  src: string;
  value: ClipRange | null;
  onChange: (range: ClipRange) => void;
}

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return '0.0s';
  return `${s.toFixed(1)}s`;
}

const WAVEFORM_BUCKETS = 600;

/** Construit un tableau de pics [0..1] à partir d'un AudioBuffer. */
function buildPeaks(buf: AudioBuffer, buckets: number): Float32Array {
  const ch = buf.numberOfChannels > 0 ? buf.getChannelData(0) : new Float32Array();
  const peaks = new Float32Array(buckets);
  if (ch.length === 0) return peaks;
  const step = ch.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const from = Math.floor(i * step);
    const to = Math.min(ch.length, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = from; j < to; j++) {
      const v = Math.abs(ch[j] ?? 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

export function VideoTrimmer({ src, value, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const peaksRef = useRef<Float32Array | null>(null);

  const [duration, setDuration] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [progressTime, setProgressTime] = useState(0);

  // Reset quand on change de fichier.
  useEffect(() => {
    setDuration(0);
    setPlaying(false);
    setProgressTime(0);
    peaksRef.current = null;
    const ctx = waveCanvasRef.current?.getContext('2d');
    if (ctx && waveCanvasRef.current) ctx.clearRect(0, 0, waveCanvasRef.current.width, waveCanvasRef.current.height);
  }, [src]);

  // Décodage audio + construction des peaks (waveform statique).
  useEffect(() => {
    let cancelled = false;
    async function decode() {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        // OfflineAudioContext suffirait, mais on a déjà un AudioContext potentiel ;
        // un AudioContext temporaire évite de devoir attendre un gesture.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctor: typeof AudioContext = (window.AudioContext ?? (window as any).webkitAudioContext);
        if (!Ctor) return;
        const tmp = new Ctor();
        try {
          const audio = await tmp.decodeAudioData(buf.slice(0));
          if (cancelled) return;
          peaksRef.current = buildPeaks(audio, WAVEFORM_BUCKETS);
          drawWaveform();
        } finally {
          void tmp.close();
        }
      } catch {
        // Fichier sans audio ou format non décodable : la waveform affichera "pas d'audio".
      }
    }
    void decode();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Redessine la waveform quand la sélection bouge.
  useEffect(() => {
    drawWaveform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, progressTime]);

  function drawWaveform() {
    const canvas = waveCanvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 60;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!peaks || peaks.length === 0) {
      ctx.fillStyle = 'rgba(150,160,180,0.4)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('(pas d’audio)', cssW / 2, cssH / 2);
      return;
    }

    const mid = cssH / 2;
    const barW = cssW / peaks.length;
    const startPct = duration > 0 && value ? value.start / duration : 0;
    const endPct = duration > 0 && value ? value.end / duration : 1;
    const playPct = duration > 0 ? progressTime / duration : 0;

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const ratio = (i + 0.5) / peaks.length;
      const inSel = ratio >= startPct && ratio <= endPct;
      const played = ratio <= playPct && inSel;
      ctx.fillStyle = played
        ? '#6aa6ff'
        : inSel
          ? 'rgba(120,170,255,0.8)'
          : 'rgba(140,150,170,0.35)';
      const h = (peaks[i] ?? 0) * (cssH * 0.9);
      ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
    }

    // Trait de tête de lecture.
    if (playing && duration > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(playPct * cssW - 0.5, 0, 1, cssH);
    }
  }

  function onLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    setDuration(d);
    v.volume = volume;
    v.muted = muted;
    if (!value) onChange({ start: 0, end: d });
  }

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setProgressTime(v.currentTime);
    if (value && v.currentTime >= value.end) {
      v.currentTime = value.start;
    } else if (value && v.currentTime < value.start) {
      v.currentTime = value.start;
    }
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setVolume(val);
    const v = videoRef.current;
    if (v) v.volume = val;
  }

  function pointerToTime(clientX: number): number {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function onHandlePointerDown(e: React.PointerEvent, which: 'start' | 'end') {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = which;
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !value) return;
    const t = pointerToTime(e.clientX);
    const MIN_GAP = 0.1;
    if (dragRef.current === 'start') {
      const start = Math.min(t, value.end - MIN_GAP);
      onChange({ start: Math.max(0, start), end: value.end });
      if (videoRef.current) videoRef.current.currentTime = Math.max(0, start);
    } else {
      const end = Math.max(t, value.start + MIN_GAP);
      onChange({ start: value.start, end: Math.min(duration, end) });
      if (videoRef.current) videoRef.current.currentTime = Math.max(0, end - 0.05);
    }
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  const startPct = duration > 0 && value ? (value.start / duration) * 100 : 0;
  const endPct = duration > 0 && value ? (value.end / duration) * 100 : 100;

  return (
    <div className="video-trimmer">
      <video
        ref={videoRef}
        src={src}
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={togglePlay}
      />

      <div className="vt-controls">
        <button type="button" onClick={togglePlay} className="vt-play-btn">
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" onClick={toggleMute} className="vt-mute-btn">
          {muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={onVolumeChange}
          className="vt-volume"
        />
        <span className="muted small">{Math.round((muted ? 0 : volume) * 100)}%</span>
      </div>

      <div className="vt-waveform-wrap">
        <canvas ref={waveCanvasRef} className="vt-waveform" />
      </div>

      <div className="video-trimmer-timeline">
        <div className="video-trimmer-track" ref={trackRef}>
          <div
            className="video-trimmer-selection"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          <div
            className="video-trimmer-handle video-trimmer-handle-start"
            style={{ left: `${startPct}%` }}
            onPointerDown={(e) => onHandlePointerDown(e, 'start')}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
          />
          <div
            className="video-trimmer-handle video-trimmer-handle-end"
            style={{ left: `${endPct}%` }}
            onPointerDown={(e) => onHandlePointerDown(e, 'end')}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
          />
        </div>
        <div className="video-trimmer-info">
          <span>Début : {formatTime(value?.start ?? 0)}</span>
          <span>Fin : {formatTime(value?.end ?? duration)}</span>
          <span className="muted">
            Durée : {formatTime((value?.end ?? duration) - (value?.start ?? 0))}
          </span>
        </div>
      </div>
    </div>
  );
}
