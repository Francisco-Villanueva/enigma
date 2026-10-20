import { FRAGMENTS, ROLES } from '@enigma/shared';
import type { Reveal, Role } from '@enigma/shared';
import { mulberry32 } from '../rng.js';
import type { ChallengeModule } from './types.js';

interface FinalState {
  /** The fragments in a fixed shuffled order. */
  order: string[];
  slots: (string | null)[];
  attempts: number;
  solved: boolean;
}

/** Each role knows one rule; together they pin down where every fragment goes. */
const CLUES: Record<Role, string> = {
  navegador: 'A position is written latitude first, then longitude. Each one goes degrees, minutes, seconds.',
  analista: 'Latitude never goes past 90°, while longitude can reach 180°. So the degrees are the two biggest numbers: the smaller one is latitude.',
  criptografo: 'Seconds are the only fragments with a decimal point.',
  estratega: 'Minutes are whole numbers below 60.',
  ingeniero: 'The latitude minutes are a smaller number than the longitude minutes.',
  hacker: 'The latitude seconds are a smaller number than the longitude seconds.',
};

export const REVEAL: Reveal = {
  dms: '68°26′28.1″N 112°48′41.2″E',
  lat: 68 + 26 / 60 + 28.1 / 3600,
  lng: 112 + 48 / 60 + 41.2 / 3600,
  summary: [
    '22 June 2022. An Antonov An-30M (RA-30001) was flying cargo from Yakutsk to Olenyok, in Siberia, with 7 crew on board.',
    'Both engines failed, most likely from fuel exhaustion, and the crew made a forced landing in woodland about 70 km from Olenyok.',
    'All seven got out. Three had minor injuries. The aircraft was written off.',
  ],
};

export const finalChallenge: ChallengeModule<FinalState> = {
  id: 7,
  name: 'Final step: locate the aircraft',
  briefing: {
    story: 'You have the six fragments of the position.',
    objective: 'Put them in the right order to get the coordinates.',
    roles: Object.fromEntries(ROLES.map((r) => [r, CLUES[r]])) as Record<Role, string>,
  },

  init(seed) {
    const rng = mulberry32(seed);
    const order = [...FRAGMENTS] as string[];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j] as string, order[i] as string];
    }
    return { order, slots: FRAGMENTS.map(() => null), attempts: 0, solved: false };
  },

  viewFor(state, role) {
    return {
      kind: 'final',
      clue: CLUES[role],
      pool: state.order.filter((v) => !state.slots.includes(v)),
      slots: [...state.slots],
      attempts: state.attempts,
    };
  },

  facilitatorView(state) {
    return { kind: 'final', attempts: state.attempts };
  },

  apply(state, _role, action) {
    const bad = (message: string) => ({ state, error: { code: 'invalid_action' as const, message } });
    switch (action.kind) {
      case 'final:place': {
        if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= FRAGMENTS.length) {
          return bad('That slot does not exist.');
        }
        if (!state.order.includes(action.value)) return bad('Unknown fragment.');
        const slots = state.slots.map((v) => (v === action.value ? null : v));
        slots[action.slot] = action.value;
        return { state: { ...state, slots } };
      }
      case 'final:clear': {
        if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= FRAGMENTS.length) {
          return bad('That slot does not exist.');
        }
        const slots = [...state.slots];
        slots[action.slot] = null;
        return { state: { ...state, slots } };
      }
      case 'final:submit': {
        if (state.slots.some((v) => v === null)) return bad('Fill in all six slots first.');
        if (state.slots.every((v, i) => v === FRAGMENTS[i])) return { state: { ...state, solved: true } };
        return {
          state: { ...state, attempts: state.attempts + 1 },
          error: { code: 'wrong_code' as const, message: 'Not quite. Compare your clues with each other.' },
        };
      }
      default:
        return bad('Unknown action.');
    }
  },

  isComplete(state) {
    return state.solved;
  },
};
