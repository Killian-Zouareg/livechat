# Build & distribution

Architecture 100% P2P : **rien à déployer côté serveur**. Tu builds l'installeur une fois, tu l'envoies à tes amis, c'est tout.

---

## 1. Build l'installeur Windows

```powershell
cd client
npm install
npm run build
```

L'installeur final apparaît dans `client/release/Livechat-0.1.0-setup.exe` (~80 MB).

## 2. Distribution

### Option A — GitHub Releases (recommandé)
```powershell
cd "C:\Users\killi\Desktop\Projet Livechat"
git init
git add .
git commit -m "v0.1.0"
gh repo create livechat --private --source=. --remote=origin --push
gh release create v0.1.0 client/release/Livechat-0.1.0-setup.exe `
  --notes "v0.1.0 — meme injection desktop"
```
Tes amis téléchargent depuis l'URL du release.

### Option B — Partage direct
WeTransfer, Google Drive, Discord, peu importe. ~80 MB le `.exe`.

---

## 3. Premier lancement chez tes amis

1. Double-clic `Livechat-0.1.0-setup.exe`.
2. **Windows SmartScreen** affiche un avertissement (l'app n'est pas signée) → "Informations complémentaires" → "Exécuter quand même". Une seule fois.
3. L'app s'ouvre. Ils entrent :
   - **Pseudo**
   - **Nom de room** (que tu leur as donné)
   - **Code secret** (que tu leur as donné)
4. Connexion P2P automatique aux autres amis présents dans la même room.

⚠️ **Choisis un nom de room ET un code secret longs et inhabituels.** Partage-les via Signal / en personne / canal privé — jamais publiquement.

Exemples :
- Nom de room : `meme-club-x7K2nP9qLwM4`
- Code secret : `Banane!Tortue2026Lampadaire`

---

## 4. Test 2 instances locales (avant distribution)

Le `npm run dev` ne peut lancer qu'une seule fenêtre Electron à la fois (port 5173 occupé). Pour tester en multi-pair sur ta machine :

### Méthode A — Build unpacké
```powershell
cd client
npm run build:unpack

# Terminal 1
& ".\release\win-unpacked\Livechat.exe" --user-data-dir="$env:TEMP\u1"

# Terminal 2
& ".\release\win-unpacked\Livechat.exe" --user-data-dir="$env:TEMP\u2"
```

Les deux instances entrent le **même** `roomCode` + `password`, avec des pseudos différents. Une fois connectées (5-15s), pick une image dans l'instance 1, position center 60×60 %, durée 5s, "Balancer !". L'overlay doit pop sur l'instance 2 par-dessus tout.

### Méthode B — Test plein écran
Sur l'instance 2 : lance une vidéo YouTube en fullscreen (touche F), ou `mpv --fs <video>`. Envoie un mème depuis l'instance 1. L'overlay doit apparaître **par-dessus** la vidéo fullscreen.

---

## 5. Build pour macOS

`electron-builder` ne peut produire un `.dmg` que **depuis un Mac**. Si tu n'as qu'un Windows, focus sur le `.exe`. Si un ami sur Mac veut le `.dmg` :

```bash
cd client
npm install
npm run build -- --mac
```

À l'install (sans signature Apple) :
```bash
xattr -cr /Applications/Livechat.app
```

⚠️ Le mode `transparent + ignoreMouseEvents` sur macOS n'a pas été testé. Comportement non garanti.

---

## 6. Mises à jour

Bump la version dans `client/package.json` (`0.1.0` → `0.2.0`), rebuild, redistribue. Pas d'auto-update (Electron en propose un, mais il faudrait un serveur — contraire à l'esprit P2P).

---

## 7. Coût total

**0 €.** Pas de serveur, pas de service tiers payant. Trystero utilise des relais Nostr publics gratuits.

Seul coût optionnel : ~300 €/an pour un certificat de code-signing Windows si tu veux éviter le SmartScreen. Inutile pour un usage privé.
