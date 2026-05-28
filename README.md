# Livechat — Meme Injection

Application desktop pour balancer des **mèmes** (images, vidéos, GIFs) directement sur l'écran de tes amis, **par-dessus tout** — même par-dessus leur jeu en plein écran. L'image apparaît à l'endroit, la taille et la durée que **toi** tu choisis. Aucun moyen pour eux de fermer avant la fin du timer. 100% P2P, zéro serveur.

## Concept

Toi (sender) :
1. Choisis une image ou vidéo
2. Optionnel : ajoute une caption en dessous
3. Choisis position et taille sur un mini-écran 16:9
4. Choisis la durée (1-15 s)
5. Cliques **🚀 Balancer !**

Tes amis (receiver) — en train de gamer, regarder une vidéo, peu importe :
- Une fenêtre overlay pop **par-dessus tout** à l'endroit que tu as choisi
- L'image / la vidéo s'affiche pendant la durée définie
- Clics + clavier passent à travers vers leur jeu (ils peuvent continuer à jouer)
- Aucun moyen de fermer avant le timer
- Auto-close à la fin

## Architecture

- **Client** : Electron + React + Vite + TypeScript
- **Transport P2P** : [Trystero](https://github.com/dmotz/trystero) sur WebRTC (chiffré DTLS-SRTP), signalisation via relais Nostr publics avec **password** pour chiffrer la signalisation
- **Overlay window** : `BrowserWindow` transparent always-on-top niveau `screen-saver`, clicks pass-through
- **Aucun stockage** local persistant (les mèmes sont éphémères par design)

## Comment ça marche techniquement

1. Chaque ami lance l'app et tape le **même nom de room** + le **même code secret**.
2. Trystero utilise des relais Nostr publics pour la découverte. Le code secret chiffre la signalisation.
3. Les apps établissent des connexions WebRTC directes (P2P), chiffrées de bout en bout.
4. Quand tu balances un mème, le payload (image en base64 + caption + durée + position) part en P2P chez tous tes amis connectés.
5. Sur leur PC, le main process crée une overlay window aux coords + taille calculées (relatif à leur écran), affiche le mème pendant la durée, puis la close.

## Quickstart (dev)

```bash
cd client
npm install
npm run dev
```

L'app Electron s'ouvre. Tu peux aussi ouvrir un onglet `http://localhost:5173/` dans Chrome pour simuler un 2e utilisateur (mais le overlay n'apparaîtra qu'en Electron, pas dans Chrome — le navigateur ne peut pas ouvrir de fenêtre system-level).

Pour tester vraiment en multi-pair, voir [DEPLOY.md](DEPLOY.md) section "Test 2 instances locales".

## Structure

```
client/    → app Electron + React (le seul code)
  electron/
    main.ts         → bootstrap, IPC handlers
    preload.ts      → bridge sécurisé renderer ↔ main
    overlay.ts      → factory pour les overlay windows
  src/
    renderer/       → fenêtre principale (sender UI)
    overlay/        → fenêtre overlay (affichage du mème reçu)
shared/    → types partagés (MemeMessage, etc.)
```

## Sécurité & vie privée

- ✅ Messages et fichiers **chiffrés bout-en-bout** (DTLS-SRTP, comme Zoom/Meet)
- ✅ **Aucune donnée stockée chez un tiers** (zéro serveur, zéro Cloudinary)
- ✅ **Double secret** : nom de room (découverte) + code secret (chiffre la signalisation Nostr)
- ✅ Validations strictes sur tous les payloads reçus (schémas data URL, taille, coords clampées)
- ✅ Electron en mode `sandbox` (isolation renderer)
- ✅ Cap 5 overlays simultanés (anti-flood)
- ⚠️ Tes amis voient ton **IP publique** (inhérent au P2P direct)
- ⚠️ Quiconque connaît à la fois le nom de room ET le code secret peut rejoindre — partagez-les via Signal/en personne, pas sur Discord public
- ⚠️ ~10% des réseaux (CGNAT, pare-feu d'entreprise) bloquent WebRTC

## Limitations connues

- **Jeux en exclusive fullscreen** (anciens DX9/DX11, certains modes CS2) : l'overlay peut ne pas apparaître. La grande majorité des jeux modernes (LoL, Valorant, Fortnite, OW2, etc.) utilisent du *borderless windowed fullscreen* où l'overlay marche.
- **macOS** : non testé, le `transparent + ignoreMouseEvents` peut avoir des subtilités spécifiques.
- **CGNAT** (typiquement les box 4G/5G ou certains FAI fibre) : WebRTC peut échouer sans relai TURN.

## Build & distribution

Voir [DEPLOY.md](DEPLOY.md).
