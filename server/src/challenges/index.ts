import { circuitChallenge } from './circuit.js';
import { bombChallenge } from './bomb.js';
import { bridgeChallenge } from './bridge.js';
import { navigationChallenge } from './navigation.js';
import { powerCoreChallenge } from './power-core.js';
import { signalChallenge } from './signals.js';
import type { ChallengeModule } from './types.js';

/** Cada módulo guarda su propio tipo de estado; el motor lo trata como opaco. */
export type AnyChallenge = ChallengeModule<any>;

/** El orden de esta lista es el orden de juego; los ids van de 1 a N sin saltos. */
export const CHALLENGES: AnyChallenge[] = [powerCoreChallenge, navigationChallenge, circuitChallenge, signalChallenge, bombChallenge, bridgeChallenge];
