import { usePresence, useSettings } from '../store';

interface Props {
  onClose: () => void;
}

export function UserList({ onClose }: Props) {
  const users = usePresence((s) => s.users);
  const myId = useSettings((s) => s.userId);
  const sorted = [...users].sort((a, b) => a.pseudo.localeCompare(b.pseudo));

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>Connectés ({users.length})</h2>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {sorted.length === 0 && <p className="muted">Personne pour l'instant.</p>}
        <ul className="user-list">
          {sorted.map((u) => (
            <li key={u.id}>
              <div className="user-avatar">
                {u.avatar ? <img src={u.avatar} alt="" /> : <span>{u.pseudo[0]?.toUpperCase() ?? '?'}</span>}
              </div>
              <span className="user-pseudo">{u.pseudo}{u.id === myId ? ' (toi)' : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
