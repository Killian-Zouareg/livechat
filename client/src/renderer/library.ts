import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryEntry } from '../../electron/preload';

interface LibraryState {
  /** Dossier racine choisi par l'utilisateur (null = pas encore configuré). */
  folderPath: string | null;
  /** Tags indexés par relPath (POSIX). Persisté. */
  tagsByPath: Record<string, string[]>;
  /** Favoris (set de relPath). Persisté. */
  favorites: string[];
  /** Cache du dernier scan, non persisté. */
  entries: LibraryEntry[];
  /** Statut du scan en cours. */
  scanning: boolean;
  scanError: string | null;

  setFolder: (path: string | null) => void;
  setEntries: (entries: LibraryEntry[]) => void;
  setScanning: (v: boolean) => void;
  setScanError: (e: string | null) => void;
  setTags: (relPath: string, tags: string[]) => void;
  toggleFavorite: (relPath: string) => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      folderPath: null,
      tagsByPath: {},
      favorites: [],
      entries: [],
      scanning: false,
      scanError: null,
      setFolder: (folderPath) => set({ folderPath, entries: [], scanError: null }),
      setEntries: (entries) => set({ entries }),
      setScanning: (scanning) => set({ scanning }),
      setScanError: (scanError) => set({ scanError }),
      setTags: (relPath, tags) =>
        set((s) => {
          const next = { ...s.tagsByPath };
          const cleaned = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
          if (cleaned.length === 0) delete next[relPath];
          else next[relPath] = Array.from(new Set(cleaned));
          return { tagsByPath: next };
        }),
      toggleFavorite: (relPath) =>
        set((s) => {
          const has = s.favorites.includes(relPath);
          return {
            favorites: has ? s.favorites.filter((p) => p !== relPath) : [...s.favorites, relPath],
          };
        }),
    }),
    {
      name: 'livechat-library',
      partialize: (s) => ({
        folderPath: s.folderPath,
        tagsByPath: s.tagsByPath,
        favorites: s.favorites,
      }),
    }
  )
);

/** Recherche fuzzy minimale : matche dans nom, chemin et tags. */
export function filterEntries(
  entries: LibraryEntry[],
  tagsByPath: Record<string, string[]>,
  favorites: string[],
  query: string,
  kindFilter: 'all' | 'image' | 'video',
  favoritesOnly: boolean
): LibraryEntry[] {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (kindFilter !== 'all') {
      if (kindFilter === 'image' && e.kind === 'video') return false;
      if (kindFilter === 'video' && e.kind !== 'video') return false;
    }
    if (favoritesOnly && !favorites.includes(e.relPath)) return false;
    if (tokens.length === 0) return true;
    const hay = (
      e.name.toLowerCase() +
      ' ' +
      e.relPath.toLowerCase() +
      ' ' +
      (tagsByPath[e.relPath]?.join(' ') ?? '')
    );
    return tokens.every((t) => hay.includes(t));
  });
}
