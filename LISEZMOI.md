# Défilé Studio pour ChatGPT

Cette app ajoute Défilé Studio à ChatGPT. Vous demandez une vidéo, par exemple « Top 10 des YouTubeurs les plus abonnés de 2015 à 2024, format TikTok ». ChatGPT prépare les données et ouvre l’éditeur Défilé directement dans la conversation. Vous réglez ensuite le style, ajoutez vos photos et exportez la vidéo.

## Contenu

- `server.js` : le serveur MCP (aucune dépendance, Node 18 ou plus).
- `widget.html` : l’éditeur Défilé affiché dans ChatGPT.
- `render.yaml`, `Dockerfile`, `package.json` : pour la mise en ligne.

Deux outils sont proposés à ChatGPT :
- `defile_create` crée un projet avec les données : courses, versus, championnat, défilement, roue, comparaison de taille…
- `defile_open` ouvre l’éditeur sans nouvelles données.

## Étape 1 : mettre le serveur en ligne

ChatGPT a besoin d’une adresse publique en HTTPS. Deux possibilités.

### A. Render (gratuit, rien à installer)
1. Créez un compte sur github.com et un dépôt (par exemple `defile-studio`), puis déposez-y tous les fichiers de ce dossier (« Add file », puis « Upload files »).
2. Créez un compte sur render.com, cliquez « New + », puis « Blueprint », et choisissez votre dépôt. Render lit `render.yaml` et lance le serveur.
3. Votre adresse ressemble à `https://defile-studio-mcp.onrender.com`. Ouvrez-la : la page doit afficher « Serveur MCP Défilé Studio actif ».
   L’offre gratuite met le serveur en veille après un moment sans utilisation ; la première demande peut alors prendre une minute.

### B. Sur votre ordinateur (pour tester)
1. Installez Node.js (nodejs.org), ouvrez un terminal dans ce dossier et lancez `node server.js`.
2. Rendez-le accessible en HTTPS avec un tunnel, par exemple `npx cloudflared tunnel --url http://localhost:3000`, et notez l’adresse `https://…trycloudflare.com` affichée.
   Le serveur et le tunnel doivent rester ouverts pendant l’utilisation.

## Étape 2 : l’ajouter dans ChatGPT

1. Allez sur chatgpt.com/plugins (selon votre version : Paramètres, puis Apps ou Connecteurs).
2. Cliquez « + », puis « Add custom MCP server ».
3. Nom : `Défilé Studio`. Adresse : votre adresse suivie de `/mcp`, par exemple `https://defile-studio-mcp.onrender.com/mcp`. Authentification : aucune.
4. Acceptez l’avertissement, puis « Create as a plugin ».
5. Dans une nouvelle conversation, tapez `@Défilé Studio` puis votre demande.

Selon votre abonnement, ChatGPT peut demander d’activer le mode développeur pour ajouter un serveur personnalisé.

## Bon à savoir

- Les projets, photos et vidéos restent dans le navigateur, comme dans la version Claude.
- ChatGPT peut bloquer le téléchargement direct d’un fichier dans la fenêtre intégrée. Dans ce cas, ouvrez l’onglet Exports, faites un clic droit sur la vidéo, puis « Enregistrer la vidéo sous ».
- Le bouton « Plein écran » agrandit l’éditeur dans ChatGPT.
- L’onglet Assistant de l’éditeur envoie votre demande dans la conversation ChatGPT.
- L’adresse `/preview` de votre serveur ouvre l’éditeur seul dans un navigateur.
