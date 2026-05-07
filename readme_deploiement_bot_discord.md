# 🤖 Déploiement et mise à jour du bot Discord

## 📁 Structure du projet

```txt
bot-discord/
├── .env
├── docker-compose.yml
├── index.js
├── levels.db
├── package.json
├── package-lock.json
└── node_modules/
```

---

# 🚀 Première installation sur le serveur

## 1. Se connecter au serveur

Depuis Windows PowerShell :

```powershell
ssh basile@IP_DU_SERVEUR
```

Exemple :

```powershell
ssh basile@192.168.1.50
```

---

## 2. Aller dans le dossier des projets

```bash
cd ~/opt/homelab/
```

---

## 3. Cloner le repo GitHub

```bash
git clone https://github.com/eugene6677/pipo.git
```

---

## 4. Entrer dans le dossier du bot

```bash
cd pipo
```

---

## 5. Créer le fichier `.env`

```bash
nano .env
```

Contenu :

```env
DISCORD_TOKEN=TON_TOKEN_ICI
```

Sauvegarder :

- CTRL + O
- Entrée
- CTRL + X

---

## 6. Lancer le bot

```bash
docker compose up -d
```

---

## 7. Voir les logs

```bash
docker logs -f discord-bot
```

Quitter les logs :

```txt
CTRL + C
```

---

# 🔄 Mettre à jour le bot

## 1. Modifier le code sur le PC

Modifier les fichiers :

- `index.js`
- `package.json`
- etc.

---

## 2. Ajouter les modifications Git

Dans PowerShell :

```powershell
git add .
```

---

## 3. Faire un commit

```powershell
git commit -m "description des changements"
```

Exemple :

```powershell
git commit -m "Ajout système anti AFK"
```

---

## 4. Envoyer sur GitHub

```powershell
git push
```

---

# 🖥️ Mise à jour sur le serveur

## 1. Se connecter au serveur

```powershell
ssh basile@IP_DU_SERVEUR
```

---

## 2. Aller dans le dossier du bot

```bash
cd ../../opt/homelab/mr-bob-bot/
```

---

## 3. Télécharger les dernières modifications

```bash
git pull
```

---

## 4. Redémarrer le conteneur Docker

```bash
docker compose down
```

Puis :

```bash
docker compose up -d
```

---

## 5. Vérifier les logs

```bash
docker logs -f discord-bot
```

---

# 🛠️ Commandes utiles

## Voir les conteneurs actifs

```bash
docker ps
```

---

## Redémarrer uniquement le bot

```bash
docker restart discord-bot
```

---

## Stopper le bot

```bash
docker compose down
```

---

## Relancer le bot

```bash
docker compose up -d
```

---

## Voir les logs en direct

```bash
docker logs -f discord-bot
```

---

# 🔐 Important

Ne jamais mettre le token Discord dans :

- `index.js`
- GitHub
- un commit Git

Le token doit toujours rester dans le fichier `.env`.

