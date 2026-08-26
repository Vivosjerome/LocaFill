# LocaFill

Application web responsive / PWA pour renseigner **une seule fois** un dossier locataire et remplir **n’importe quel formulaire de location**, y compris des champs aux noms, labels et structures inconnus.

Les données restent sur l’appareil (IndexedDB). Rien n’est envoyé vers un serveur.

## Fonctionnement

1. **Profil** (`#/profile`) — identité, coordonnées, adresse, emploi, revenus, foyer, banque. Plusieurs locataires / garant.
2. **Documents** (`#/documents`) — import PDF/images, OCR (Tesseract.js), classification, extraction, assemblage PDF.
3. **Analyse** (`#/analyzer`) — HTML collé, fichier, liste de questions, ou formulaire d’exemple.
4. **Prévisualisation** (`#/preview`) — champs détectés, valeur proposée, source, confiance, correction, puis **Remplir le formulaire**. Aucune soumission automatique.
5. **Réglages** (`#/settings`) — moteur sémantique, formats, bookmarklet, suppression des données.

## Mapping sémantique

Le moteur ne s’appuie pas sur une liste de sites immobiliers. Il score chaque champ à partir de :

- `label`, `placeholder`, `aria-*`, `autocomplete`
- `name` / `id` (découpés camelCase / snake_case)
- texte voisin, légende de fieldset, titres de section
- type HTML et valeurs d’un `<select>`
- langue détectée (FR / EN) et dictionnaire de synonymes
  (« Nom de famille », « Surname », « Family name » → nom, etc.)

Une interface `SemanticProvider` permet plus tard de brancher un LLM sans changer les pages.

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvrir l’URL Vite, créer un profil, et tester **Analyser → Exemple**.

## GitHub Pages

1. Pousser le dépôt sur GitHub.
2. Settings → Pages → Source : **GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` construit l’app avec `BASE_URL=/<nom-du-repo>/`.

L’app utilise un **HashRouter** (`#/profile`, `#/documents`…) pour fonctionner sans configuration serveur.

## PWA

Installable (manifest + service worker via `vite-plugin-pwa`). L’OCR charge les langues Tesseract depuis un CDN au premier usage.

## Pile technique

React 19, Vite, TypeScript, Dexie, Tesseract.js, pdf.js, pdf-lib, lucide-react.
