import { useUpdaterStatus } from '../useUpdaterStatus';

export function UpdateBanner() {
  const status = useUpdaterStatus();

  if (status.state === 'available') {
    return <div className="update-banner">⬇️ Nouvelle version {status.version} disponible — préparation du téléchargement…</div>;
  }

  if (status.state === 'downloading') {
    return (
      <div className="update-banner">
        <span>
          ⬇️ Téléchargement de la mise à jour{status.version ? ` ${status.version}` : ''}… {status.percent}%
        </span>
        <div className="update-progress">
          <div className="update-progress-bar" style={{ width: `${status.percent}%` }} />
        </div>
      </div>
    );
  }

  if (status.state === 'downloaded') {
    return (
      <div className="update-banner ready">
        <span>✅ Mise à jour {status.version} prête à installer.</span>
        <button onClick={() => void window.api?.quitAndInstall()}>Redémarrer &amp; installer</button>
      </div>
    );
  }

  return null;
}
