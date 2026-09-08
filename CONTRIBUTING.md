# Règles concernant le dépôt

## Convention de style

> [!IMPORTANT]
> Respecter la convention de style permet d'éviter les problèmes liés aux corrections d'indentation ou de nommage lors de la fusion de branches.

Le code adopté pour ce dépôt est basé sur celui de **Placeholder**, disponible via ce lien :

[Example](https://example.com)

## Commits

Pour faciliter le travail des mainteneurs du projet, il est nécessaire de préfixer le titre de ses commits du type de la modification effectuée.

Exemple :
  - fix : Réparation d'un bug
  - feat : Ajout d'une nouvelle fonctionnalité
  - chore : Nettoyage du code (suppression de variables inutilisées, renommage de variables)
  - refactor : Amélioration de l'architecture du code sans altérer son fonctionnement
  - ci : commit relatif à la continuité d'intégration (devops)
  - docs : Modification de la documentation (README.md, ...)
  - test : Ajout de tests

Il est **interdit** de commit sur la branche principale ou la branche de développement directement.

Voir [Pull Requests](#pull-requests) pour plus d'informations.

## Nommage des branches

Chaque nom de branche doit être composé du type de la modification/ajout.

**Exemple :**
- feature/mafeature
- ci/sonarqube
- test/testconnexion

## Pull Requests

Lorsque l'on souhaite merger sa branche de travail vers la branche de développement, il est nécessaire d'ouvrir une **Pull Request**.

Cette Pull Request doit être **validée** par deux personnes (dont au moins une devops).

Après avoir été validée, cette pull request pourra être mergée sur la branche de développement.

Lorsque l'équipe aura jugé que la branche de développement est dans un état stable et est prête pour une release, celle-ci sera mergée sur la branche principale après approbation de l'équipe.

Il est également nécessaire de créer un tag pour chaque version sur la branche principale afin de pouvoir facilement trouver une version spécifique via celui-ci.
