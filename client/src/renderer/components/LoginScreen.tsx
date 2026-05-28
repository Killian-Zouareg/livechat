import { useState } from 'react';
import { useSettings } from '../store';

export function LoginScreen() {
  const { pseudo: initialPseudo, roomCode: initialRoom, password: initialPwd, setProfile, setRoom } = useSettings();
  const [pseudo, setPseudo] = useState(initialPseudo);
  const [roomCode, setRoomCode] = useState(initialRoom);
  const [password, setPassword] = useState(initialPwd);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPseudo = pseudo.trim();
    const cleanRoom = roomCode.trim();
    const cleanPwd = password.trim();
    if (!cleanPseudo) return setError('Choisis un pseudo.');
    if (cleanPseudo.length > 32) return setError('Pseudo trop long (32 max).');
    if (!cleanRoom) return setError('Nom de room requis.');
    if (cleanRoom.length < 8) return setError('Nom de room : au moins 8 caractères.');
    if (!cleanPwd) return setError('Code secret requis.');
    if (cleanPwd.length < 8) return setError('Code secret : au moins 8 caractères.');
    setError(null);
    setRoom(cleanRoom, cleanPwd);
    setProfile(cleanPseudo);
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Livechat</h1>
        <p className="login-sub">
          Connexion P2P directe entre amis. Vous devez tous taper le <strong>même nom de room</strong> et le <strong>même code secret</strong>.
        </p>
        <label>
          <span>Pseudo</span>
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={32} autoFocus />
        </label>
        <label>
          <span>Nom de room</span>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="ex. meme-club-x7K2nP9qLwM4"
          />
        </label>
        <label>
          <span>Code secret</span>
          <div className="pwd-row">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="au moins 8 caractères, partagé entre amis"
              autoComplete="off"
            />
            <button type="button" className="pwd-toggle" onClick={() => setShowPwd((v) => !v)}>
              {showPwd ? '🙈' : '👁'}
            </button>
          </div>
        </label>
        <p className="login-hint">
          🔒 <strong>Nom de room</strong> = identifiant de découverte. <strong>Code secret</strong> = chiffre la signalisation (même si quelqu'un devine le nom, sans le code il ne peut pas se connecter). Partagez les deux uniquement via un canal sûr (Signal, en personne…).
        </p>
        {error && <p className="login-error">{error}</p>}
        <button type="submit">Rejoindre</button>
      </form>
    </div>
  );
}
