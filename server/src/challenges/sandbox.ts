import { ROLES } from '@enigma/shared';
import { mulberry32 } from '../rng.js';
import type { ChallengeModule } from './types.js';

interface SandboxState {
  code: string;
  attempts: number;
  solved: boolean;
}

/**
 * Desafío de práctica (provisorio hasta la etapa 2).
 * Cada rol ve un dígito del código; el Hacker conoce el orden y lo ingresa.
 * Sirve para probar el motor y para que el equipo practique describir lo que ve.
 */
export const sandboxChallenge: ChallengeModule<SandboxState> = {
  id: 1,
  name: 'Link test',
  briefing: {
    story: 'Warm-up round. Nothing here counts: no clock, no penalties. It just lets the team try the game before the real mission.',
    objective: 'Build a 6-digit code together by saying your digit out loud.',
    roles: {
      navegador: 'Sees one digit of the code.',
      analista: 'Sees one digit of the code.',
      criptografo: 'Sees one digit of the code.',
      estratega: 'Sees one digit of the code.',
      ingeniero: 'Sees one digit of the code.',
      hacker: 'Sees one digit and enters the full code.',
    },
  },

  init(seed) {
    const rng = mulberry32(seed);
    const code = ROLES.map(() => String(Math.floor(rng() * 10))).join('');
    return { code, attempts: 0, solved: false };
  },

  viewFor(state, role) {
    const index = ROLES.indexOf(role);
    return {
      kind: 'sandbox',
      digit: state.code[index] ?? '?',
      canSubmit: role === 'hacker',
      order: role === 'hacker' ? [...ROLES] : null,
      attempts: state.attempts,
    };
  },

  facilitatorView(state) {
    return { kind: 'sandbox', code: state.code, attempts: state.attempts };
  },

  apply(state, role, action) {
    if (action.kind !== 'sandbox:submit') {
      return { state, error: { code: 'invalid_action', message: 'Unknown action.' } };
    }
    if (role !== 'hacker') {
      return { state, error: { code: 'wrong_role', message: 'Only the Hacker can enter the code.' } };
    }
    const typed = typeof action.code === 'string' ? action.code.replace(/\D/g, '') : '';
    if (typed.length !== ROLES.length) {
      return {
        state,
        error: { code: 'invalid_action', message: `The code has ${ROLES.length} digits.` },
      };
    }
    if (typed === state.code) {
      return { state: { ...state, solved: true } };
    }
    return {
      state: { ...state, attempts: state.attempts + 1 },
      error: { code: 'wrong_code', message: 'Wrong code. Check the order with your team.' },
    };
  },

  isComplete(state) {
    return state.solved;
  },
};
