# 🇬🇧 TaxTrack UK

PWA mobile pour préparer sa **Self Assessment** britannique (HMRC) quand on loue un
appartement en Angleterre et qu'on verse sur une **SIPP** (retraite personnelle).

## Fonctionnalités

- 📸 **Reçus** : photographie les reçus, **OCR** (Tesseract.js, en local sur l'appareil)
  qui extrait automatiquement le commerçant, le montant et la date. Photo conservée comme
  justificatif.
- 🏠 **Location** : suivi des revenus et de tous les frais déductibles d'un propriétaire
  britannique (council tax, charges, agence, réparations, mobilier, assurance, déplacements,
  intérêts d'emprunt traités en **crédit d'impôt à 20 %**, etc.), par **année fiscale UK**
  (6 avril → 5 avril).
- 💷 **SIPP** : suivi des versements, calcul du *gross-up* (le provider réclame 20 % de relief
  de base), du relief complémentaire selon ta tranche (base / supérieur / additionnel) et du
  **plafond annuel de £60,000** (brut).
- 📊 **Tableau de bord** + **export CSV / PDF** par année fiscale, prêt à transmettre à un
  comptable.
- 📱 **PWA installable** : fonctionne hors-ligne, toutes les données restent **sur l'appareil**
  (IndexedDB) — rien n'est envoyé sur un serveur.

## Lancer le projet

```bash
npm install
npm run dev      # serveur de dev
npm test         # tests unitaires (vitest)
npm run build    # build de production dans dist/
```

Pour tester sur téléphone : `npm run dev -- --host` puis ouvrir l'URL réseau affichée,
ou déployer le dossier `dist/` et l'**ajouter à l'écran d'accueil**.

## ⚠️ Avertissement

TaxTrack UK organise vos données et calcule des **estimations**. Ce n'est **pas un conseil
fiscal**. Les règles HMRC (intérêts d'emprunt, *replacement domestic items relief*, abattements,
plafond annuel avec report sur 3 ans, *tapered annual allowance*) doivent être vérifiées avec
un comptable ou sur [gov.uk](https://www.gov.uk) avant de soumettre votre déclaration.

Échéances Self Assessment : **31 octobre** (papier) / **31 janvier** (en ligne) pour l'année
fiscale précédente.
