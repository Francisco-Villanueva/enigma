import {
  BOMB_COLORS,
  BOMB_CUTS,
  BOMB_MAX_STRIKES,
  BOMB_PIN_LENGTH,
  BOMB_SECONDS,
  BOMB_SYMBOLS,
  BOMB_WRONG_PIN_PENALTY_SECONDS,
} from '@enigma/shared';
import type { BombColor, ChallengeView, FacilitatorView, Role } from '@enigma/shared';
import { mulberry32, shuffle } from '../rng.js';
import type { ApplyResult, ChallengeModule } from './types.js';

/**
 * Desafío 5: La Bomba (tiempo real, 5:00).
 *
 * Seis cables de colores distintos; hay que cortar 4, en un orden concreto. Nadie tiene todo:
 *   Navegador   → de qué color es el cable de cada posición (1 a 6)
 *   Analista    → qué dos colores son trampa (esos no se cortan)
 *   Estratega   → la prioridad de los colores: los cables reales se cortan en ese orden
 *   Criptógrafo → el PIN del panel, en símbolos
 *   Hacker      → la tabla símbolo → dígito; teclea el PIN y desbloquea el panel
 *   Ingeniero   → corta cables por posición, pero solo con el panel desbloqueado (no ve los colores)
 * Un corte equivocado suma un error (el cable no se corta). Con 3 errores o al agotarse el reloj,
 * la bomba se reinicia con el mismo cableado.
 */

const BOMB_MS = BOMB_SECONDS * 1000;

export interface BombState {
  seed: number;
  /** Momento (reloj de la misión) en que empezó el intento actual. */
  startMs: number;
  attempt: number;
  strikes: number;
  unlocked: boolean;
  /** Posiciones ya cortadas, en orden. */
  cuts: number[];
  /** Color del cable de cada posición (índice 0 = posición 1). */
  layout: BombColor[];
  decoys: BombColor[];
  /** Colores de mayor a menor prioridad. */
  ranking: BombColor[];
  /** Cables que hay que cortar, en orden (posiciones). */
  solution: number[];
  symbolDigit: Record<string, number>;
  pinSymbols: string[];
  pin: string;
  mistakes: number;
  finished: boolean;
}

function create(seed: number): BombState {
  const rng = mulberry32(seed);
  const layout = shuffle(BOMB_COLORS, rng);
  const decoys = shuffle(BOMB_COLORS, rng).slice(0, BOMB_COLORS.length - BOMB_CUTS);
  const ranking = shuffle(BOMB_COLORS, rng);
  const solution = ranking
    .filter((c) => !decoys.includes(c))
    .map((c) => layout.indexOf(c) + 1);
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng).slice(0, BOMB_SYMBOLS.length);
  const symbolDigit: Record<string, number> = {};
  BOMB_SYMBOLS.forEach((sym, i) => (symbolDigit[sym] = digits[i]));
  const pinSymbols = shuffle(BOMB_SYMBOLS, rng).slice(0, BOMB_PIN_LENGTH);
  const pin = pinSymbols.map((s) => symbolDigit[s]).join('');
  return {
    seed,
    startMs: 0,
    attempt: 1,
    strikes: 0,
    unlocked: false,
    cuts: [],
    layout,
    decoys,
    ranking,
    solution,
    symbolDigit,
    pinSymbols,
    pin,
    mistakes: 0,
    finished: false,
  };
}

/** Mismo cableado, todo lo demás de cero. */
function restart(state: BombState, missionMs: number): BombState {
  return { ...create(state.seed), startMs: missionMs, attempt: state.attempt + 1, mistakes: state.mistakes };
}

function reject(
  state: BombState,
  code: 'invalid_action' | 'wrong_role' | 'wrong_value',
  message: string,
  penaltySeconds = 0,
  next: BombState = state,
): ApplyResult<BombState> {
  const mistakes = penaltySeconds > 0 ? next.mistakes + 1 : next.mistakes;
  return { state: { ...next, mistakes }, penaltySeconds, error: { code, message } };
}

export const bombChallenge: ChallengeModule<BombState> = {
  id: 5,
  name: 'The Overload Module',
  briefing: {
    story:
      'The beacon’s overloaded power module is about to blow, and it would take the signal with it. It has six colored wires, but only four must be cut, in a precise order. The others are decoys. The cutting panel is locked with a PIN.',
    objective:
      'Unlock the panel and cut the four correct wires, in order, before time runs out and without making three mistakes.',
    roles: {
      navegador: 'Sees the color of each wire, by position.',
      analista: 'Knows which two wires are decoys.',
      criptografo: 'Has the panel’s PIN, written in symbols.',
      estratega: 'Knows the color priority order and watches the clock.',
      ingeniero: 'The only one who can cut wires, but can’t see their colors.',
      hacker: 'Has the symbol table and types the PIN to unlock the panel.',
    },
  },

  init: (seed) => create(seed),

  viewFor(state, role: Role, _clockMs, missionMs = 0): ChallengeView {
    const base = {
      kind: 'bomb' as const,
      attempt: state.attempt,
      strikes: state.strikes,
      maxStrikes: BOMB_MAX_STRIKES,
      cutsDone: state.cuts.length,
      cutsNeeded: BOMB_CUTS,
      unlocked: state.unlocked,
      bombMs: BOMB_MS,
      leftMs: Math.max(0, BOMB_MS - Math.max(0, missionMs - state.startMs)),
    };
    switch (role) {
      case 'navegador':
        return { ...base, role, cables: state.layout.map((color, i) => ({ position: i + 1, color })) };
      case 'analista':
        return { ...base, role, decoys: state.decoys };
      case 'criptografo':
        return { ...base, role, pin: state.pinSymbols };
      case 'estratega':
        return { ...base, role, ranking: state.ranking };
      case 'ingeniero':
        return {
          ...base,
          role,
          cables: state.layout.map((_, i) => ({ position: i + 1, cut: state.cuts.includes(i + 1) })),
        };
      case 'hacker':
        return {
          ...base,
          role,
          table: BOMB_SYMBOLS.map((symbol) => ({ symbol, digit: state.symbolDigit[symbol] })),
          pinLength: BOMB_PIN_LENGTH,
        };
    }
  },

  facilitatorView(state): FacilitatorView {
    return {
      kind: 'bomb',
      attempt: state.attempt,
      strikes: state.strikes,
      cuts: state.cuts.length,
      layout: state.layout,
      decoys: state.decoys,
      ranking: state.ranking,
      solution: state.solution.map((position) => ({ position, color: state.layout[position - 1] })),
      pin: state.pin,
      pinSymbols: state.pinSymbols,
      mistakes: state.mistakes,
    };
  },

  advance(state, missionMs) {
    if (state.finished) return state;
    return missionMs - state.startMs >= BOMB_MS ? restart(state, missionMs) : state;
  },

  apply(state, role, action, _clockMs, missionMs = 0): ApplyResult<BombState> {
    if (state.finished) return reject(state, 'invalid_action', 'The module is already stabilized.');
    switch (action.kind) {
      case 'bomb:unlock': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can unlock the panel.');
        if (state.unlocked) return reject(state, 'invalid_action', 'The panel is already unlocked.');
        if (typeof action.pin !== 'string' || action.pin.trim() !== state.pin) {
          return reject(state, 'wrong_value', 'PIN incorrecto.', BOMB_WRONG_PIN_PENALTY_SECONDS);
        }
        return { state: { ...state, unlocked: true } };
      }
      case 'bomb:cut': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can cut the wires.');
        if (!state.unlocked) return reject(state, 'invalid_action', 'The panel is still locked.');
        const p = action.position;
        if (!Number.isInteger(p) || p < 1 || p > state.layout.length) {
          return reject(state, 'invalid_action', 'That position doesn’t exist.');
        }
        if (state.cuts.includes(p)) return reject(state, 'invalid_action', 'That wire is already cut.');
        if (p !== state.solution[state.cuts.length]) {
          const strikes = state.strikes + 1;
          // Al tercer error la bomba se reinicia sin más: nada de mensajes de fracaso.
          if (strikes >= BOMB_MAX_STRIKES) return { state: restart(state, missionMs) };
          return reject(state, 'invalid_action', `The module shudders! That wasn’t it. Mistakes: ${strikes}/${BOMB_MAX_STRIKES}.`, 0, {
            ...state,
            strikes,
          });
        }
        const cuts = [...state.cuts, p];
        return { state: { ...state, cuts, finished: cuts.length === state.solution.length } };
      }
      default:
        return reject(state, 'invalid_action', 'Unknown action.');
    }
  },

  isComplete: (state) => state.finished,
};
