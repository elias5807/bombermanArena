import { App } from './App';
import { mountClient } from './mountClient';
import './style.css';

/**
 * Point d'entrée de l'application, chargé par `index.html` : monte le client sur la page,
 * avec la connexion que désigne la configuration (voir `App` et `config.ts`).
 *
 * L'assemblage lui-même est dans `mountClient.ts`, que les tests montent sur le vrai
 * `index.html` avec une fausse connexion.
 */
void mountClient(document, new App());
