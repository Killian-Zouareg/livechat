import { joinRoom } from 'trystero';
import type { Room } from 'trystero';
import type { MemeMessage, PeerIntroduce, User } from '@shared/types';
import { useSettings, usePresence } from './store';
import { validateMeme, sanitizeAvatar } from './validate';

const APP_ID = 'killi-livechat-v1';

// Relais Nostr épinglés pour la signalisation WebRTC. Par défaut Trystero pioche
// 5 relais dans une grosse liste publique souvent instable → découverte des pairs
// aléatoire (« on ne se voit pas »). En figeant une liste de relais fiables et
// largement utilisés, tous les pairs partagent les mêmes relais actifs.
const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://offchain.pub',
  'wss://relay.mostr.pub',
];

/**
 * Wrapper pour bypass la contrainte stricte DataPayload de Trystero
 * (JsonValue/Blob/ArrayBuffer). Au runtime, Trystero JSON-stringify nos
 * objets, donc tout ce qui est JSON-sérialisable marche.
 */
interface Action<T> {
  send: (data: T, options?: { target?: string | string[] }) => Promise<void>;
  onMessage: ((data: T, ctx: { peerId: string }) => void | Promise<void>) | null;
}
function action<T>(r: Room, namespace: string): Action<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (r.makeAction as any)(namespace) as Action<T>;
}

let room: Room | null = null;
let memeAction: Action<MemeMessage> | null = null;
let introAction: Action<PeerIntroduce> | null = null;

/** Cache local des pseudos par peerId Trystero (liste des connectés). */
const peerProfiles = new Map<string, User>();
/** Dernière fois (ms) qu'on a reçu une intro d'un pair, pour purger les fantômes. */
const peerLastSeen = new Map<string, number>();

// Heartbeat de présence : on re-broadcast notre intro régulièrement. Ça répare
// la visibilité à sens unique (intro perdue au moment du join) et permet de
// purger les pairs dont on n'a plus de nouvelles (crash sans onPeerLeave).
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_MS = 15000;
const PEER_STALE_MS = HEARTBEAT_MS * 3;

function clearHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// Relance auto de la connexion : la découverte de pairs via les relais Nostr
// échoue parfois au lancement (relais froid). Si aucun pair n'apparaît dans le
// délai imparti, on refait un join complet pour rafraîchir la signalisation.
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const RECONNECT_DELAY_MS = 6000;
const MAX_RECONNECT_ATTEMPTS = 6;

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnectIfAlone(): void {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Toujours seul après le délai → on rafraîchit la connexion.
    if (room && peerProfiles.size === 0 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      void connectToRoom().catch((err) => console.error('[peer] reconnect failed', err));
    }
  }, RECONNECT_DELAY_MS);
}

function rebuildPresence(myUser: User): void {
  const list: User[] = [myUser, ...peerProfiles.values()];
  usePresence.getState().setUsers(list);
}

/**
 * Comparateur déterministe pour résoudre une race entre 2 mèmes envoyés
 * quasi-simultanément. Le plus ancien (ts plus petit) gagne ; tiebreaker
 * lexico sur id. Tout le monde appliquant la même règle, l'état converge.
 */
function incomingWins(incoming: { ts: number; id: string }, current: { ts: number; id: string }): boolean {
  if (incoming.ts !== current.ts) return incoming.ts < current.ts;
  return incoming.id < current.id;
}

/** Réception d'un mème : on valide puis on demande au main d'ouvrir l'overlay. */
async function handleIncomingMeme(raw: unknown): Promise<void> {
  const meme = validateMeme(raw);
  if (!meme) return;
  // On lit le volume du receiver maintenant pour le passer à l'overlay.
  const { volume, userId, overlayPos, displayId } = useSettings.getState();
  // Ne pas afficher chez soi quand on s'envoie en boucle test
  // (on s'envoie quand même en broadcast, et Trystero ne renvoie pas à soi-même).
  if (meme.userId === userId) return;

  // Verrou "un mème à la fois" : si un overlay est déjà actif, on garde le
  // gagnant déterministe et on ferme/drop l'autre. Tout le monde converge.
  const presence = usePresence.getState();
  const current = presence.activeMeme;
  if (current) {
    if (!incomingWins(meme, current)) {
      // L'entrant perd → drop silencieux.
      return;
    }
    // L'entrant gagne → on ferme l'overlay actuel chez nous.
    await window.api?.dismissMeme(current.id);
  }

  presence.setActiveMeme({ id: meme.id, userId: meme.userId, pseudo: meme.pseudo, ts: meme.ts });
  // La position et l'écran de l'overlay sont choisis par le receiver, pas le sender.
  await window.api?.showMeme({ ...meme, ...overlayPos, volume, displayId });
}

/** Entrée publique : (re)connexion demandée par l'app. Remet à zéro le compteur de relance. */
export async function joinPeerRoom(): Promise<void> {
  reconnectAttempts = 0;
  await connectToRoom();
}

async function connectToRoom(): Promise<void> {
  await leavePeerRoom();
  const { roomCode, password, pseudo, avatar, userId } = useSettings.getState();
  if (!roomCode.trim() || !pseudo.trim()) {
    throw new Error('pseudo et roomCode requis');
  }
  if (!password.trim() || password.length < 8) {
    throw new Error('code secret requis (8 caractères minimum)');
  }

  const me: User = { id: userId, pseudo, avatar };
  rebuildPresence(me);

  // Le password chiffre la couche de signalisation Nostr.
  const r = joinRoom({ appId: APP_ID, password, relayConfig: { urls: RELAY_URLS } }, roomCode.trim());
  room = r;

  memeAction = action<MemeMessage>(r, 'meme');
  memeAction.onMessage = (data) => void handleIncomingMeme(data);

  introAction = action<PeerIntroduce>(r, 'intro');
  introAction.onMessage = (payload, ctx) => {
    if (!payload || typeof payload !== 'object') return;
    if (typeof payload.userId !== 'string' || payload.userId.length < 1 || payload.userId.length > 64) return;
    if (typeof payload.pseudo !== 'string' || payload.pseudo.length < 1 || payload.pseudo.length > 32) return;
    const cleanAvatar = sanitizeAvatar(payload.avatar);
    peerProfiles.set(ctx.peerId, { id: payload.userId, pseudo: payload.pseudo, avatar: cleanAvatar });
    peerLastSeen.set(ctx.peerId, Date.now());
    rebuildPresence(me);
  };

  r.onPeerJoin = (peerId) => {
    // Un pair est arrivé : la connexion est établie, on arrête de relancer.
    reconnectAttempts = 0;
    clearReconnectTimer();
    void introAction?.send({ userId: me.id, pseudo: me.pseudo, avatar: me.avatar }, { target: peerId });
  };

  r.onPeerLeave = (peerId) => {
    peerProfiles.delete(peerId);
    peerLastSeen.delete(peerId);
    rebuildPresence(me);
  };

  // Présentation initiale en broadcast pour les pairs déjà présents.
  void introAction.send({ userId: me.id, pseudo: me.pseudo, avatar: me.avatar });

  usePresence.getState().setConnected(true);

  // Si personne ne répond, on rafraîchira la connexion automatiquement.
  scheduleReconnectIfAlone();

  // Heartbeat : re-broadcast périodique de notre présence + purge des fantômes.
  clearHeartbeat();
  heartbeatTimer = setInterval(() => {
    void introAction?.send({ userId: me.id, pseudo: me.pseudo, avatar: me.avatar });
    const cutoff = Date.now() - PEER_STALE_MS;
    let removed = false;
    for (const [peerId, seen] of peerLastSeen) {
      if (seen < cutoff) {
        peerProfiles.delete(peerId);
        peerLastSeen.delete(peerId);
        removed = true;
      }
    }
    if (removed) rebuildPresence(me);
  }, HEARTBEAT_MS);
}

export async function leavePeerRoom(): Promise<void> {
  clearReconnectTimer();
  clearHeartbeat();
  if (room) {
    try {
      await room.leave();
    } catch {
      // ignore
    }
    room = null;
  }
  memeAction = introAction = null;
  peerProfiles.clear();
  peerLastSeen.clear();
  usePresence.getState().setConnected(false);
  usePresence.getState().setUsers([]);
  usePresence.getState().setActiveMeme(null);
}

/** Broadcast un mème à tous les pairs ET déclenche l'overlay localement (pour preview). */
export async function broadcastMeme(meme: MemeMessage): Promise<void> {
  // Affichage local immédiat (preview de ce qu'on envoie) — utilise
  // la zone d'overlay configurée par l'utilisateur courant.
  const { volume, overlayPos, displayId } = useSettings.getState();
  // Pose le verrou local AVANT d'afficher : si un mème adverse plus ancien
  // arrive juste après, handleIncomingMeme verra l'actif et arbitrera.
  usePresence.getState().setActiveMeme({
    id: meme.id,
    userId: meme.userId,
    pseudo: meme.pseudo,
    ts: meme.ts,
  });
  await window.api?.showMeme({ ...meme, ...overlayPos, volume, displayId });
  // Broadcast P2P.
  await memeAction?.send(meme);
}

export function broadcastProfile(user: User): void {
  void introAction?.send({ userId: user.id, pseudo: user.pseudo, avatar: user.avatar });
}

export function isConnected(): boolean {
  return room !== null;
}
