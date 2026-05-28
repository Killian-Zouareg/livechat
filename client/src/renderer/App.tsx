import { useEffect, useState } from 'react';
import { usePresence, useSettings } from './store';
import { joinPeerRoom, leavePeerRoom } from './peer';
import { LoginScreen } from './components/LoginScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { UserList } from './components/UserList';
import { Header } from './components/Header';
import { MemeComposer } from './components/MemeComposer';

export function App() {
  const { pseudo, roomCode, password, theme } = useSettings();
  const connected = usePresence((s) => s.connected);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Verrou "un mème à la fois" : on libère l'état quand l'overlay se ferme
  // (fin de timer ou dismiss explicite). clearActiveMemeIf ignore les events
  // qui ne correspondent pas à l'actif courant — utile si on a déjà swap
  // vers un nouveau mème suite à une race.
  useEffect(() => {
    const unsubscribe = window.api?.onOverlayClosed((id) => {
      usePresence.getState().clearActiveMemeIf(id);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!pseudo || !roomCode || !password) return undefined;
    void joinPeerRoom().catch((err) => {
      console.error('[peer] join failed', err);
    });
    return () => {
      void leavePeerRoom();
    };
  }, [pseudo, roomCode, password]);

  if (!pseudo || !roomCode || !password) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <Header
        connected={connected}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        onToggleUsers={() => setUsersOpen((v) => !v)}
        onToggleLibrary={() => setLibraryOpen((v) => !v)}
        libraryOpen={libraryOpen}
      />
      {!connected && (
        <div className="reconnect-banner">Recherche de pairs en cours…</div>
      )}
      <main className="app-main">
        <MemeComposer libraryOpen={libraryOpen} onCloseLibrary={() => setLibraryOpen(false)} />
      </main>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {usersOpen && <UserList onClose={() => setUsersOpen(false)} />}
    </div>
  );
}
