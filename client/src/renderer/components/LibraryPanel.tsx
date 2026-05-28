import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryEntry } from '../../../electron/preload';
import { filterEntries, useLibrary } from '../library';

export interface LibrarySelection {
  file: File;
  dataUrl: string;
  mediaType: 'image' | 'video' | 'gif';
}

interface Props {
  onClose: () => void;
  onSelect: (sel: LibrarySelection) => void;
}

/** Cache module-level pour éviter de relire les mêmes fichiers à chaque rendu. */
const thumbCache = new Map<string, string>();

/** Un seul IntersectionObserver partagé pour tous les items (vs un par item). */
const ioCallbacks = new WeakMap<Element, () => void>();
let sharedIO: IntersectionObserver | null = null;
function getSharedIO(): IntersectionObserver {
  if (sharedIO) return sharedIO;
  sharedIO = new IntersectionObserver(
    (entries) => {
      for (const it of entries) {
        if (!it.isIntersecting) continue;
        const cb = ioCallbacks.get(it.target);
        if (cb) {
          ioCallbacks.delete(it.target);
          sharedIO!.unobserve(it.target);
          cb();
        }
      }
    },
    { rootMargin: '200px' }
  );
  return sharedIO;
}
function observeOnce(el: Element, cb: () => void): () => void {
  ioCallbacks.set(el, cb);
  getSharedIO().observe(el);
  return () => {
    ioCallbacks.delete(el);
    sharedIO?.unobserve(el);
  };
}

/** File d'attente avec concurrence limitée : évite de charger 200 fichiers en parallèle. */
const MAX_CONCURRENT_LOADS = 4;
let activeLoads = 0;
const pendingLoads: Array<() => Promise<void>> = [];
function drainLoads(): void {
  while (activeLoads < MAX_CONCURRENT_LOADS && pendingLoads.length > 0) {
    const task = pendingLoads.shift()!;
    activeLoads++;
    void task().finally(() => {
      activeLoads--;
      drainLoads();
    });
  }
}
function enqueueLoad(task: () => Promise<void>): () => void {
  let cancelled = false;
  const wrapped = async () => {
    if (cancelled) return;
    await task();
  };
  pendingLoads.push(wrapped);
  drainLoads();
  return () => { cancelled = true; };
}

async function loadThumb(entry: LibraryEntry, folderPath: string): Promise<string | null> {
  try {
    const { mimeType, base64 } = await window.api.libraryReadFile(entry.absPath, folderPath);
    if (entry.kind === 'video') {
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      try {
        return await captureVideoFrame(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

function captureVideoFrame(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    let done = false;
    const finish = (val: string | null) => {
      if (done) return;
      done = true;
      video.removeAttribute('src');
      video.load();
      resolve(val);
    };
    const timeout = window.setTimeout(() => finish(null), 10_000);
    const draw = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return finish(null);
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.clearTimeout(timeout);
        finish(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        finish(null);
      }
    };
    video.addEventListener('loadeddata', () => {
      const target = Math.min(1, (video.duration || 2) * 0.1);
      if (Math.abs(video.currentTime - target) < 0.05) {
        draw();
      } else {
        video.addEventListener('seeked', draw, { once: true });
        try {
          video.currentTime = target;
        } catch {
          draw();
        }
      }
    }, { once: true });
    video.addEventListener('error', () => finish(null), { once: true });
    video.src = src;
  });
}

export function LibraryPanel({ onClose, onSelect }: Props) {
  const {
    folderPath,
    entries,
    scanning,
    scanError,
    tagsByPath,
    favorites,
    setFolder,
    setEntries,
    setScanning,
    setScanError,
    setTags,
    toggleFavorite,
  } = useLibrary();

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'video'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [tagsDraft, setTagsDraft] = useState('');
  const [loadingItem, setLoadingItem] = useState<string | null>(null);

  // Premier scan auto si dossier déjà configuré.
  useEffect(() => {
    if (folderPath && entries.length === 0 && !scanning) {
      void scan(folderPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath]);

  async function scan(root: string) {
    setScanning(true);
    setScanError(null);
    try {
      const list = await window.api.libraryScan(root);
      setEntries(list);
      if (list.length === 0) setScanError('Aucun fichier image/vidéo trouvé.');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Erreur scan');
    } finally {
      setScanning(false);
    }
  }

  async function pickFolder() {
    const picked = await window.api.libraryPickFolder();
    if (picked) {
      setFolder(picked);
      thumbCache.clear();
      await scan(picked);
    }
  }

  async function selectEntry(e: LibraryEntry) {
    if (!folderPath) return;
    setLoadingItem(e.relPath);
    try {
      const { mimeType, base64 } = await window.api.libraryReadFile(e.absPath, folderPath);
      const dataUrl = `data:${mimeType};base64,${base64}`;
      // Reconstruction d'un File pour rester compatible avec le composer.
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const file = new File([bin], e.name, { type: mimeType });
      onSelect({ file, dataUrl, mediaType: e.kind });
      onClose();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Lecture impossible');
    } finally {
      setLoadingItem(null);
    }
  }

  function startEditTags(relPath: string) {
    setEditingTags(relPath);
    setTagsDraft((tagsByPath[relPath] ?? []).join(', '));
  }

  function commitTags() {
    if (!editingTags) return;
    const tags = tagsDraft.split(',').map((t) => t.trim()).filter(Boolean);
    setTags(editingTags, tags);
    setEditingTags(null);
    setTagsDraft('');
  }

  const filtered = useMemo(
    () => filterEntries(entries, tagsByPath, favorites, query, kindFilter, favoritesOnly),
    [entries, tagsByPath, favorites, query, kindFilter, favoritesOnly]
  );

  return (
    <aside className="library-panel">
      <div className="library-header">
        <strong>📚 Bibliothèque</strong>
        <button onClick={onClose} title="Fermer">✕</button>
      </div>

      <div className="library-folder">
        {folderPath ? (
          <>
            <span className="library-folder-path" title={folderPath}>{folderPath}</span>
            <div className="library-folder-actions">
              <button onClick={() => void scan(folderPath)} disabled={scanning} title="Re-scanner">
                {scanning ? '…' : '↻'}
              </button>
              <button onClick={() => void pickFolder()} title="Changer de dossier">📁</button>
            </div>
          </>
        ) : (
          <button className="library-pick-btn" onClick={() => void pickFolder()}>
            📁 Choisir un dossier
          </button>
        )}
      </div>

      {folderPath && (
        <div className="library-filters">
          <input
            type="search"
            placeholder="Rechercher (nom, tag, mot-clé)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="library-filter-row">
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as 'all' | 'image' | 'video')}>
              <option value="all">Tout</option>
              <option value="image">Images</option>
              <option value="video">Vidéos</option>
            </select>
            <label className="library-fav-toggle">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
              />
              ⭐ Favoris
            </label>
            <span className="muted small">{filtered.length} / {entries.length}</span>
          </div>
        </div>
      )}

      {scanError && <div className="library-error">{scanError}</div>}

      <div className="library-grid">
        {filtered.map((e) => (
          <LibraryItem
            key={e.relPath}
            entry={e}
            folderPath={folderPath!}
            tags={tagsByPath[e.relPath] ?? []}
            isFavorite={favorites.includes(e.relPath)}
            loading={loadingItem === e.relPath}
            onPick={() => void selectEntry(e)}
            onToggleFav={() => toggleFavorite(e.relPath)}
            onEditTags={() => startEditTags(e.relPath)}
          />
        ))}
      </div>

      {editingTags && (
        <div className="library-tag-editor">
          <div className="library-tag-editor-title">Tags pour {editingTags.split('/').pop()}</div>
          <input
            autoFocus
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="drôle, chat, reaction (séparés par des virgules)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTags();
              if (e.key === 'Escape') { setEditingTags(null); setTagsDraft(''); }
            }}
          />
          <div className="library-tag-editor-actions">
            <button onClick={() => { setEditingTags(null); setTagsDraft(''); }}>Annuler</button>
            <button className="primary" onClick={commitTags}>OK</button>
          </div>
        </div>
      )}
    </aside>
  );
}

interface ItemProps {
  entry: LibraryEntry;
  folderPath: string;
  tags: string[];
  isFavorite: boolean;
  loading: boolean;
  onPick: () => void;
  onToggleFav: () => void;
  onEditTags: () => void;
}

function LibraryItem({ entry, folderPath, tags, isFavorite, loading, onPick, onToggleFav, onEditTags }: ItemProps) {
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(entry.relPath) ?? null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Lazy-load la thumb quand l'item entre dans le viewport.
  // Images < 5 MB : data URL directe. Vidéos < 40 MB : capture d'une frame via <video> + canvas.
  useEffect(() => {
    if (thumb) return;
    if (!ref.current) return;
    if (entry.kind === 'image' && entry.size > 5 * 1024 * 1024) return;
    if (entry.kind === 'gif' && entry.size > 5 * 1024 * 1024) return;
    if (entry.kind === 'video' && entry.size > 40 * 1024 * 1024) return;
    let cancelled = false;
    let cancelLoad: (() => void) | null = null;
    const unobserve = observeOnce(ref.current, () => {
      cancelLoad = enqueueLoad(async () => {
        if (cancelled) return;
        const url = await loadThumb(entry, folderPath);
        if (cancelled || !url) return;
        thumbCache.set(entry.relPath, url);
        setThumb(url);
      });
    });
    return () => {
      cancelled = true;
      unobserve();
      cancelLoad?.();
    };
  }, [entry, folderPath, thumb]);

  return (
    <div className="library-item" ref={ref}>
      <div className="library-item-thumb" onClick={onPick} title={entry.relPath}>
        {loading ? (
          <div className="library-thumb-placeholder">…</div>
        ) : thumb ? (
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <div className="library-thumb-placeholder">
            {entry.kind === 'video' ? '🎬' : '🖼️'}
          </div>
        )}
        {entry.kind === 'video' && <span className="library-kind-badge">▶</span>}
      </div>
      <div className="library-item-meta">
        <div className="library-item-name" title={entry.name}>{entry.name}</div>
        <div className="library-item-tags" onClick={onEditTags} title="Modifier les tags">
          {tags.length > 0 ? tags.map((t) => <span key={t} className="library-tag">{t}</span>) : <span className="muted small">+ tags</span>}
        </div>
      </div>
      <button
        className={`library-fav ${isFavorite ? 'on' : ''}`}
        onClick={onToggleFav}
        title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        {isFavorite ? '⭐' : '☆'}
      </button>
    </div>
  );
}
