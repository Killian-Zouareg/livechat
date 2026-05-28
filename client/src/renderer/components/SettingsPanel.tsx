import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store';
import { broadcastProfile, joinPeerRoom, leavePeerRoom } from '../peer';
import { PositionPicker } from './PositionPicker';
import { useUpdaterStatus } from '../useUpdaterStatus';

function updaterLabel(status: ReturnType<typeof useUpdaterStatus>): string {
  switch (status.state) {
    case 'checking':
      return 'Vérification en cours…';
    case 'available':
      return `Nouvelle version ${status.version} trouvée — téléchargement…`;
    case 'downloading':
      return `Téléchargement ${status.version ?? ''} : ${status.percent}%`;
    case 'downloaded':
      return `Version ${status.version} prête à installer.`;
    case 'not-available':
      return 'Tu es déjà à jour.';
    case 'error':
      return `Erreur de mise à jour : ${status.message}`;
    default:
      return '';
  }
}

interface DisplayInfo {
  id: number;
  label: string;
  isPrimary: boolean;
  width: number;
  height: number;
}

interface Props {
  onClose: () => void;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('lecture impossible'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('lecture impossible'));
    reader.readAsDataURL(file);
  });
}

export function SettingsPanel({ onClose }: Props) {
  const settings = useSettings();
  const [pseudo, setPseudo] = useState(settings.pseudo);
  const [avatar, setAvatar] = useState<string | undefined>(settings.avatar);
  const [endureMsg, setEndureMsg] = useState(false);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const updater = useUpdaterStatus();
  const [checking, setChecking] = useState(false);

  async function checkUpdates() {
    setChecking(true);
    try {
      await window.api?.checkForUpdates();
    } finally {
      setTimeout(() => setChecking(false), 1500);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void window.api?.displaysList().then((list) => {
      if (!cancelled) setDisplays(list);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!endureMsg) return;
    const t = setTimeout(() => setEndureMsg(false), 2500);
    return () => clearTimeout(t);
  }, [endureMsg]);

  function handleVolume(raw: number) {
    if (raw < 0.1) {
      settings.setVolume(0.1);
      setEndureMsg(true);
    } else {
      settings.setVolume(raw);
    }
  }

  function saveProfile() {
    const clean = pseudo.trim().slice(0, 32);
    if (!clean) return;
    settings.setProfile(clean, avatar);
    broadcastProfile({ id: settings.userId, pseudo: clean, avatar });
  }

  async function pickAvatar(file: File | null) {
    if (!file) return;
    if (file.size > 150_000) {
      alert('Avatar trop lourd (max 150 KB).');
      return;
    }
    const data = await fileToDataUrl(file);
    setAvatar(data);
    settings.setProfile(settings.pseudo, data);
    broadcastProfile({ id: settings.userId, pseudo: settings.pseudo, avatar: data });
  }

  function logout() {
    void leavePeerRoom();
    settings.reset();
    onClose();
  }

  function reconnect() {
    void leavePeerRoom().then(() => joinPeerRoom());
  }

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>Options</h2>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        <section>
          <h3>Profil</h3>
          <label>
            <span>Pseudo</span>
            <input value={pseudo} maxLength={32} onChange={(e) => setPseudo(e.target.value)} onBlur={saveProfile} />
          </label>
          <label>
            <span>Avatar</span>
            <div className="avatar-row">
              <div className="avatar-preview">
                {avatar ? <img src={avatar} alt="" /> : <span>{pseudo[0]?.toUpperCase() ?? '?'}</span>}
              </div>
              <button onClick={() => fileRef.current?.click()}>Choisir une image</button>
              {avatar && (
                <button
                  onClick={() => {
                    setAvatar(undefined);
                    settings.setProfile(settings.pseudo, undefined);
                    broadcastProfile({ id: settings.userId, pseudo: settings.pseudo, avatar: undefined });
                  }}
                >
                  Retirer
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => void pickAvatar(e.target.files?.[0] ?? null)}
              />
            </div>
          </label>
        </section>

        <section>
          <h3>Affichage</h3>
          <label>
            <span>Thème</span>
            <select value={settings.theme} onChange={(e) => settings.setTheme(e.target.value as 'light' | 'dark')}>
              <option value="dark">Sombre</option>
              <option value="light">Clair</option>
            </select>
          </label>
          <label>
            <span>Volume vidéo reçues ({Math.round(settings.volume * 100)}%)</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={settings.volume}
              onChange={(e) => handleVolume(Number(e.target.value))}
            />
            {endureMsg && <span className="endure-msg">Endure le livechat</span>}
          </label>
        </section>

        <section>
          <h3>Où les mèmes apparaissent sur mon écran</h3>
          <p className="muted small">
            Cette zone s'applique à tous les mèmes que tu reçois. Chacun configure la sienne.
          </p>
          {displays.length > 1 && (
            <label>
              <span>Écran cible</span>
              <select
                value={settings.displayId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  settings.setDisplayId(v === '' ? undefined : Number(v));
                }}
              >
                <option value="">Écran principal (auto)</option>
                {displays.map((d, idx) => (
                  <option key={d.id} value={d.id}>
                    {`Écran ${idx + 1} — ${d.width}×${d.height}${d.isPrimary ? ' (principal)' : ''}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <PositionPicker value={settings.overlayPos} onChange={settings.setOverlayPos} />
        </section>

        <section>
          <h3>Room</h3>
          <label>
            <span>Nom de room</span>
            <input
              value={settings.roomCode}
              onChange={(e) => settings.setRoom(e.target.value, settings.password)}
            />
          </label>
          <label>
            <span>Code secret</span>
            <input
              type="password"
              value={settings.password}
              onChange={(e) => settings.setRoom(settings.roomCode, e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="panel-actions">
            <button onClick={reconnect}>Rejoindre à nouveau</button>
            <button className="danger" onClick={logout}>Quitter la room</button>
          </div>
        </section>

        <section>
          <h3>Mises à jour</h3>
          <p className="muted small">Version installée : v{__APP_VERSION__}</p>
          {updaterLabel(updater) && <p className="muted small">{updaterLabel(updater)}</p>}
          <div className="panel-actions">
            <button onClick={() => void checkUpdates()} disabled={checking || updater.state === 'checking'}>
              {checking || updater.state === 'checking' ? 'Vérification…' : 'Vérifier les mises à jour'}
            </button>
            {updater.state === 'downloaded' && (
              <button onClick={() => void window.api?.quitAndInstall()}>Redémarrer &amp; installer</button>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
