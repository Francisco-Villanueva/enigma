import { BRIDGE_CATEGORY, BRIDGE_MAX_STRIKES, BRIDGE_ROWS, ROLES } from '@enigma/shared';
import type { BridgeSide, ChallengeView, FacilitatorView, Role } from '@enigma/shared';
import { mulberry32, shuffle } from '../rng.js';
import { RIDDLES } from './bridge-riddles.js';
import type { ApplyResult, ChallengeModule } from './types.js';

/**
 * Desafío 6: The Glass Bridge (acertijos, sin reloj).
 *
 * Un puente de 6 filas. Cada fila tiene un acertijo con dos respuestas posibles, y cada respuesta es una baldosa:
 * una es firme y la otra de cristal falso. Todo el equipo ve el acertijo y lo resuelve hablando; solo el
 * Estratega pisa. Cada rol es especialista de una categoría (números, palabras, lógica, espacio, mecánica,
 * razonamiento) y es el único que ve la pista de los acertijos de la suya, en cuanto le toca ese acertijo.
 * Una baldosa equivocada se rompe y suma un error. Con 2 errores el puente se reinicia con acertijos nuevos.
 */

interface Row {
  /** Categoría del acertijo = rol que tiene su pista. */
  category: Role;
  /** Posición del acertijo en el banco de esa categoría. */
  riddle: number;
  /** Lado en el que está la respuesta correcta. */
  safe: BridgeSide;
}

export interface BridgeState {
  seed: number;
  attempt: number;
  strikes: number;
  crossed: number;
  cracked: BridgeSide[];
  rows: Row[];
  solved: { row: number; answer: string; explanation: string } | null;
  mistakes: number;
  finished: boolean;
}

/** Cada intento usa otro acertijo de cada categoría (mientras el banco alcance) y otro orden de filas. */
function build(seed: number, attempt: number): Row[] {
  const base = mulberry32(seed);
  const offset = {} as Record<Role, number>;
  for (const role of ROLES) offset[role] = Math.floor(base() * RIDDLES[role].length);
  const rng = mulberry32((seed ^ Math.imul(attempt, 0x9e3779b1)) >>> 0);
  return shuffle([...ROLES], rng).map((category) => ({
    category,
    riddle: (offset[category] + attempt - 1) % RIDDLES[category].length,
    safe: (rng() < 0.5 ? 'L' : 'R') as BridgeSide,
  }));
}

function create(seed: number, attempt = 1, mistakes = 0): BridgeState {
  return { seed, attempt, strikes: 0, crossed: 0, cracked: [], rows: build(seed, attempt), solved: null, mistakes, finished: false };
}

const riddleOf = (row: Row) => RIDDLES[row.category][row.riddle];

function reject(state: BridgeState, code: 'invalid_action' | 'wrong_role', message: string, next: BridgeState = state): ApplyResult<BridgeState> {
  return { state: next, error: { code, message } };
}

export const bridgeChallenge: ChallengeModule<BridgeState> = {
  id: 6,
  name: 'The Glass Bridge',
  briefing: {
    story:
      'To reach the beacon’s last relay you must cross a six-row glass bridge. Each row poses a riddle with two possible answers, and each answer is a tile: one holds, the other shatters when stepped on.',
    objective: 'Solve all six riddles together and cross the bridge without stepping on two fake tiles.',
    roles: {
      navegador: 'Specialist in space riddles: directions, turns and shapes. Holds their hints.',
      analista: 'Specialist in number riddles. Holds their hints.',
      criptografo: 'Specialist in word and letter riddles. Holds their hints.',
      estratega: 'Specialist in reasoning and probability. The only one who steps on the tiles.',
      ingeniero: 'Specialist in mechanics riddles: gears, pulleys and balance. Holds their hints.',
      hacker: 'Specialist in logic riddles. Holds their hints.',
    },
  },

  init: (seed) => create(seed),

  viewFor(state, role: Role): ChallengeView {
    const row = state.finished ? null : state.rows[state.crossed];
    const riddle = row ? riddleOf(row) : null;
    return {
      kind: 'bridge',
      role,
      attempt: state.attempt,
      strikes: state.strikes,
      maxStrikes: BRIDGE_MAX_STRIKES,
      rows: BRIDGE_ROWS,
      crossed: state.crossed,
      cracked: state.cracked,
      riddle:
        row && riddle
          ? {
              row: state.crossed + 1,
              category: BRIDGE_CATEGORY[row.category],
              text: riddle.text,
              left: row.safe === 'L' ? riddle.answer : riddle.wrong,
              right: row.safe === 'R' ? riddle.answer : riddle.wrong,
            }
          : null,
      solved: state.solved,
      specialty: BRIDGE_CATEGORY[role],
      hint: row && riddle && row.category === role ? riddle.hint : null,
    };
  },

  facilitatorView(state): FacilitatorView {
    return {
      kind: 'bridge',
      attempt: state.attempt,
      strikes: state.strikes,
      crossed: state.crossed,
      rows: state.rows.map((row, i) => ({
        row: i + 1,
        category: BRIDGE_CATEGORY[row.category],
        role: row.category,
        text: riddleOf(row).text,
        answer: riddleOf(row).answer,
        hint: riddleOf(row).hint,
      })),
      mistakes: state.mistakes,
    };
  },

  apply(state, role, action): ApplyResult<BridgeState> {
    if (state.finished) return reject(state, 'invalid_action', 'The bridge is already crossed.');
    if (action.kind !== 'bridge:step') return reject(state, 'invalid_action', 'Unknown action.');
    if (role !== 'estratega') return reject(state, 'wrong_role', 'Only the Strategist can step on the tiles.');
    if (action.side !== 'L' && action.side !== 'R') return reject(state, 'invalid_action', 'That tile doesn’t exist.');
    const row = state.rows[state.crossed];
    if (action.side === row.safe) {
      const crossed = state.crossed + 1;
      const riddle = riddleOf(row);
      return {
        state: {
          ...state,
          crossed,
          cracked: [],
          solved: { row: crossed, answer: riddle.answer, explanation: riddle.explanation },
          finished: crossed === BRIDGE_ROWS,
        },
      };
    }
    const strikes = state.strikes + 1;
    // Al llegar al máximo de errores el puente se reinicia sin más: nada de mensajes de fracaso.
    if (strikes >= BRIDGE_MAX_STRIKES) return { state: create(state.seed, state.attempt + 1, state.mistakes) };
    return reject(state, 'invalid_action', `The glass shattered! Mistakes: ${strikes}/${BRIDGE_MAX_STRIKES}.`, {
      ...state,
      strikes,
      cracked: [...state.cracked, action.side],
    });
  },

  isComplete: (state) => state.finished,
};
