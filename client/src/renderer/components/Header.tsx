import { usePresence, useSettings } from '../store';

interface Props {
  connected: boolean;
  onToggleSettings: () => void;
  onToggleUsers: () => void;
  onToggleLibrary: () => void;
  libraryOpen: boolean;
}

export function Header({ connected, onToggleSettings, onToggleUsers, onToggleLibrary, libraryOpen }: Props) {
  const pseudo = useSettings((s) => s.pseudo);
  const users = usePresence((s) => s.users);

  return (
    <header className="app-header">
      <div className="brand">
        <span className={`status-dot ${connected ? 'on' : 'off'}`} />
        <strong>Livechat</strong>
        <span className="me">— {pseudo}</span>
      </div>
      <div className="header-actions">
        <button
          onClick={onToggleLibrary}
          title="Bibliothèque"
          className={libraryOpen ? 'active' : ''}
        >
          📚
        </button>
        <button onClick={onToggleUsers} title="Connectés">
          👥 {users.length}
        </button>
        <button onClick={onToggleSettings} title="Options">
          ⚙️
        </button>
      </div>
    </header>
  );
}
