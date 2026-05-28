import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import {
  MEME_CAPTION_MAX,
  MEME_HARD_LIMIT_BYTES,
  MEME_MAX_DURATION_MS,
  MEME_MIN_DURATION_MS,
  type MediaKind,
  type MemeMessage,
} from '@shared/types';
import { useSettings, usePresence } from '../store';
import { broadcastMeme } from '../peer';
import { VideoTrimmer, type ClipRange } from './VideoTrimmer';
import { LibraryPanel, type LibrarySelection } from './LibraryPanel';
import { CaptionEditor, captionCssStyle } from './CaptionEditor';

interface SelectedFile {
  file: File;
  dataUrl: string;
  mediaType: MediaKind;
}

function detectKind(file: File): MediaKind {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'image/gif') return 'gif';
  return 'image';
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('Lecture impossible'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsDataURL(file);
  });
}

interface Props {
  libraryOpen: boolean;
  onCloseLibrary: () => void;
}

export function MemeComposer({ libraryOpen, onCloseLibrary }: Props) {
  const {
    userId,
    pseudo,
    lastDurationMs,
    setLastDurationMs,
    lastCaptionStyle,
    setLastCaptionStyle,
  } = useSettings();
  const [captionStyle, setCaptionStyle] = useState(lastCaptionStyle);
  const [styleOpen, setStyleOpen] = useState(false);
  const connected = usePresence((s) => s.connected);
  const peers = usePresence((s) => s.users.length);
  const activeMeme = usePresence((s) => s.activeMeme);
  const locked = activeMeme !== null;
  const lockedByMe = activeMeme?.userId === userId;
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [caption, setCaption] = useState('');
  const [durationMs, setDurationMs] = useState(lastDurationMs);
  const [clip, setClip] = useState<ClipRange | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleLibrarySelect(sel: LibrarySelection) {
    setSelected({ file: sel.file, dataUrl: sel.dataUrl, mediaType: sel.mediaType });
    setClip(null);
    setError(null);
  }

  async function fetchFromUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setError(null);
    if (!/^https?:\/\//i.test(url)) {
      setError('URL invalide (doit commencer par http:// ou https://)');
      return;
    }
    setFetchingUrl(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = (res.headers.get('content-type') || '').split(';')[0]!.trim() || 'application/octet-stream';
      if (!ct.startsWith('image/') && !ct.startsWith('video/')) {
        throw new Error(`Type non supporté : ${ct}`);
      }
      const blob = await res.blob();
      if (blob.size > MEME_HARD_LIMIT_BYTES) {
        throw new Error(`Fichier trop lourd (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
      }
      const name = url.split('/').pop()?.split('?')[0] || 'distant';
      const file = new File([blob], name, { type: ct });
      const dataUrl = await fileToDataUrl(file);
      setSelected({ file, dataUrl, mediaType: detectKind(file) });
      setClip(null);
      setUrlInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur fetch';
      setError(`Téléchargement impossible : ${msg} (CORS ou hotlink protection ?)`);
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const file = files[0];
    if (!file) return;
    if (file.size > MEME_HARD_LIMIT_BYTES) {
      setError(
        `Fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1)} MB > ${MEME_HARD_LIMIT_BYTES / 1024 / 1024} MB).`
      );
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setSelected({ file, dataUrl, mediaType: detectKind(file) });
      setClip(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lecture');
    }
  }

  function clearFile() {
    setSelected(null);
    setCaption('');
    setClip(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function send() {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      const meme: MemeMessage = {
        id: nanoid(),
        userId,
        pseudo,
        mediaType: selected.mediaType,
        mimeType: selected.file.type || 'application/octet-stream',
        data: selected.dataUrl,
        caption: caption.trim().slice(0, MEME_CAPTION_MAX) || undefined,
        captionStyle: caption.trim() ? captionStyle : undefined,
        durationMs,
        // Position/taille ignorées : chaque receiver applique sa propre zone.
        posX: 0,
        posY: 0,
        width: 0,
        height: 0,
        clipStart: selected.mediaType === 'video' && clip ? clip.start : undefined,
        clipEnd: selected.mediaType === 'video' && clip ? clip.end : undefined,
        ts: Date.now(),
      };
      setLastDurationMs(durationMs);
      setLastCaptionStyle(captionStyle);
      await broadcastMeme(meme);
      clearFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur envoi');
    } finally {
      setSending(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div className={`composer-page ${libraryOpen ? 'with-library' : ''}`}>
      <div className="composer-grid">
        {/* Colonne gauche : preview + file pick + caption */}
        <div className="composer-left" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {selected ? (
            <div className="meme-preview">
              {selected.mediaType === 'video' ? (
                <VideoTrimmer src={selected.dataUrl} value={clip} onChange={setClip} />
              ) : (
                <img src={selected.dataUrl} alt="" />
              )}
              <div className="meme-preview-actions">
                <span className="meme-filename">{selected.file.name}</span>
                <button type="button" onClick={clearFile}>Changer</button>
              </div>
            </div>
          ) : (
            <div className="meme-drop-zone" onClick={() => fileInputRef.current?.click()}>
              <div className="meme-drop-icon">📎</div>
              <p>Glisse une image ou vidéo ici</p>
              <p className="muted small">ou clique pour parcourir (max {MEME_HARD_LIMIT_BYTES / 1024 / 1024} MB)</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: 'none' }}
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <div className="url-import">
            <input
              type="url"
              placeholder="…ou colle un lien direct (mp4, jpg, gif, webm)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void fetchFromUrl();
                }
              }}
              disabled={fetchingUrl}
            />
            <button
              type="button"
              onClick={() => void fetchFromUrl()}
              disabled={!urlInput.trim() || fetchingUrl}
            >
              {fetchingUrl ? '…' : 'Importer'}
            </button>
          </div>
          <label className="composer-field">
            <span>Caption (optionnel)</span>
            <input
              value={caption}
              maxLength={MEME_CAPTION_MAX}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="texte affiché sous l'image"
            />
            <span className="muted small">{caption.length} / {MEME_CAPTION_MAX}</span>
          </label>

          {caption.trim() && (
            <div className="caption-editor-wrap">
              <button
                type="button"
                className="caption-editor-toggle"
                onClick={() => setStyleOpen((v) => !v)}
              >
                {styleOpen ? '▾' : '▸'} Style du texte
              </button>
              {styleOpen && (
                <>
                  <div className="caption-preview-box">
                    <span style={captionCssStyle(captionStyle)}>{caption}</span>
                  </div>
                  <CaptionEditor value={captionStyle} onChange={setCaptionStyle} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Colonne droite : durée + bouton */}
        <div className="composer-right">
          <div className="composer-section">
            <h3>Durée d'affichage</h3>
            <div className="duration-row">
              <input
                type="range"
                min={MEME_MIN_DURATION_MS}
                max={MEME_MAX_DURATION_MS}
                step={250}
                value={durationMs}
                onChange={(e) => setDurationMs(Number(e.target.value))}
              />
              <span className="duration-value">{(durationMs / 1000).toFixed(1)} s</span>
            </div>
          </div>

          {error && <div className="composer-error">{error}</div>}

          <button
            type="button"
            className="balancer-btn"
            disabled={!selected || sending || !connected || locked}
            onClick={() => void send()}
          >
            {sending
              ? 'Envoi…'
              : !connected
                ? 'Connexion…'
                : locked
                  ? lockedByMe
                    ? '⏳ Ton mème tourne…'
                    : `⏳ ${activeMeme!.pseudo} balance déjà…`
                  : `🚀 Balancer ! (${peers - 1} ami${peers - 1 > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
      {libraryOpen && (
        <LibraryPanel onClose={onCloseLibrary} onSelect={handleLibrarySelect} />
      )}
    </div>
  );
}
