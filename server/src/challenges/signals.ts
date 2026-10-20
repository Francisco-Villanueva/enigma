import {
  CIPHER_INFO,
  CIPHER_METHODS,
  SIGNAL_BURSTS,
  SIGNAL_CHANNELS,
  SIGNAL_DECODE_PENALTY_SECONDS,
  SIGNAL_DEGREES_PER_CHANNEL,
  SIGNAL_FREE_DECODES,
  SIGNAL_SUBMIT_PENALTY_SECONDS,
  SIGNAL_TUNE_PENALTY_SECONDS,
} from '@enigma/shared';
import type { BurstId, ChallengeView, CipherMethod, FacilitatorView, Role } from '@enigma/shared';
import { mulberry32, shuffle } from '../rng.js';
import type { ApplyResult, ChallengeModule } from './types.js';

/**
 * Desafío 4: Signal Interception.
 *
 * Una transmisión enemiga llega en 4 ráfagas (Alfa, Beta, Gamma, Delta), cada una con una palabra cifrada.
 * Las palabras forman la clave de reinicio, pero hay que leerlas en un orden concreto. Nadie tiene todo:
 *   Navegador   → RUMBO en grados desde el que llega cada ráfaga
 *   Criptógrafo → tabla rumbo → canal de frecuencia y MÉTODO de cifrado de cada ráfaga
 *   Ingeniero   → único que sintoniza: sin el canal correcto, la ráfaga no se captura
 *   Analista    → DESFASE (cuántas letras corrió el cifrado) de cada ráfaga, medido en el espectro
 *   Hacker      → recibe el texto cifrado, lo descifra con su herramienta (método + desfase) y transmite
 *   Estratega   → ORDEN de lectura de las palabras
 *
 * El descifrador del Hacker enseña el resultado de cada prueba, pero solo la primera de cada ráfaga es gratis:
 * probar a ciegas cuesta tiempo, así que conviene preguntarle al equipo.
 */

/** Plain A–Z words: the cipher works on the 26 letters A–Z. */
const WORDS = [
  'ORBIT', 'SHIELD', 'SIGNAL', 'CIPHER', 'FUSION', 'PULSAR', 'ANTENNA', 'BEACON',
  'ENERGY', 'SYSTEM', 'ALARM', 'TOWER', 'VECTOR', 'MODULE', 'REACTOR', 'PLASMA',
];

const A = 'A'.charCodeAt(0);
const shiftLetters = (text: string, n: number) =>
  [...text].map((c) => String.fromCharCode(A + ((((c.charCodeAt(0) - A + n) % 26) + 26) % 26))).join('');
const mirror = (text: string) => [...text].map((c) => String.fromCharCode(A + 25 - (c.charCodeAt(0) - A))).join('');
const reverse = (text: string) => [...text].reverse().join('');

/** Cifra una palabra: lo que el Hacker recibe. */
export function encode(word: string, method: CipherMethod, shift: number): string {
  switch (method) {
    case 'adelante':
      return shiftLetters(word, shift);
    case 'atras':
      return shiftLetters(word, -shift);
    case 'espejo':
      return mirror(shiftLetters(word, shift));
    case 'inverso':
      return reverse(shiftLetters(word, shift));
  }
}

/** Descifra con los pasos del manual del Criptógrafo. */
export function decode(cipher: string, method: CipherMethod, shift: number): string {
  switch (method) {
    case 'adelante':
      return shiftLetters(cipher, -shift);
    case 'atras':
      return shiftLetters(cipher, shift);
    case 'espejo':
      return shiftLetters(mirror(cipher), -shift);
    case 'inverso':
      return shiftLetters(reverse(cipher), -shift);
  }
}

interface Burst {
  id: BurstId;
  word: string;
  channel: number;
  degrees: number;
  method: CipherMethod;
  shift: number;
  cipher: string;
}

export interface SignalState {
  seed: number;
  bursts: Burst[];
  /** Orden de lectura del mensaje. */
  order: BurstId[];
  tuned: BurstId[];
  decodes: Record<string, { count: number; last: { method: CipherMethod; shift: number; result: string } | null }>;
  attempts: number;
  lastCorrect: number | null;
  mistakes: number;
  finished: boolean;
}

const burstOf = (state: SignalState, id: BurstId) => state.bursts.find((b) => b.id === id)!;
const isBurst = (v: unknown): v is BurstId => SIGNAL_BURSTS.includes(v as BurstId);
const solutionWords = (state: SignalState) => state.order.map((id) => burstOf(state, id).word);

function reject(
  state: SignalState,
  code: 'invalid_action' | 'wrong_role' | 'wrong_value',
  message: string,
  penaltySeconds = 0,
  next: SignalState = state,
): ApplyResult<SignalState> {
  const mistakes = penaltySeconds > 0 ? next.mistakes + 1 : next.mistakes;
  return { state: { ...next, mistakes }, penaltySeconds, error: { code, message } };
}

export const signalChallenge: ChallengeModule<SignalState> = {
  id: 4,
  name: 'Signal Interception',
  briefing: {
    story:
      'The beacon is emitting an encrypted transmission in four bursts. It contains the reboot key, but each burst arrives from a different bearing with its own cipher method, and the words must be read in a specific order.',
    objective:
      'Capture the four bursts, decrypt each word and transmit the full key in the right order.',
    roles: {
      navegador: 'Sees the bearing (in degrees) each burst arrives from.',
      analista: 'Measures on the spectrum how many letters each burst’s cipher was shifted.',
      criptografo: 'Has the table that converts bearings into channels and the cipher method of each burst.',
      estratega: 'Knows the order in which the message is read.',
      ingeniero: 'The only one who can tune a burst on its frequency channel.',
      hacker: 'Receives the ciphertext, decrypts it with their tool and transmits the key.',
    },
  },

  init(seed) {
    const rng = mulberry32(seed);
    const words = shuffle(WORDS, rng).slice(0, SIGNAL_BURSTS.length);
    const channels = shuffle(Array.from({ length: SIGNAL_CHANNELS }, (_, i) => i + 1), rng);
    const bursts: Burst[] = SIGNAL_BURSTS.map((id, i) => {
      const channel = channels[i];
      const degrees = Math.floor((channel - 1) * SIGNAL_DEGREES_PER_CHANNEL + rng() * SIGNAL_DEGREES_PER_CHANNEL);
      const method = CIPHER_METHODS[Math.floor(rng() * CIPHER_METHODS.length)];
      // Sin el 13: con ese desfase "adelante" y "atrás" darían el mismo resultado.
      let shift = 1 + Math.floor(rng() * 24);
      if (shift >= 13) shift++;
      return { id, word: words[i], channel, degrees, method, shift, cipher: encode(words[i], method, shift) };
    });
    return {
      seed,
      bursts,
      order: shuffle([...SIGNAL_BURSTS], rng),
      tuned: [],
      decodes: {},
      attempts: 0,
      lastCorrect: null,
      mistakes: 0,
      finished: false,
    };
  },

  viewFor(state, role: Role): ChallengeView {
    switch (role) {
      case 'navegador':
        return { kind: 'signal', role, bearings: state.bursts.map((b) => ({ burst: b.id, degrees: b.degrees })) };
      case 'analista':
        return { kind: 'signal', role, shifts: state.bursts.map((b) => ({ burst: b.id, shift: b.shift })) };
      case 'criptografo':
        return {
          kind: 'signal',
          role,
          bands: Array.from({ length: SIGNAL_CHANNELS }, (_, i) => ({
            channel: i + 1,
            from: Math.round(i * SIGNAL_DEGREES_PER_CHANNEL),
            to: Math.round((i + 1) * SIGNAL_DEGREES_PER_CHANNEL) - 1,
          })),
          methods: state.bursts.map((b) => ({
            burst: b.id,
            method: b.method,
            label: CIPHER_INFO[b.method].label,
            steps: CIPHER_INFO[b.method].steps,
          })),
        };
      case 'estratega':
        return { kind: 'signal', role, order: state.order, tuned: state.tuned };
      case 'ingeniero':
        return {
          kind: 'signal',
          role,
          channels: SIGNAL_CHANNELS,
          bursts: state.bursts.map((b) => {
            const tuned = state.tuned.includes(b.id);
            return { burst: b.id, tuned, channel: tuned ? b.channel : null };
          }),
        };
      case 'hacker':
        return {
          kind: 'signal',
          role,
          bursts: state.bursts.map((b) => {
            const captured = state.tuned.includes(b.id);
            const d = state.decodes[b.id];
            return {
              burst: b.id,
              captured,
              cipher: captured ? b.cipher : null,
              decodes: d?.count ?? 0,
              last: d?.last ?? null,
            };
          }),
          freeDecodes: SIGNAL_FREE_DECODES,
          attempts: state.attempts,
          lastCorrect: state.lastCorrect,
          total: SIGNAL_BURSTS.length,
        };
    }
  },

  facilitatorView(state): FacilitatorView {
    return {
      kind: 'signal',
      bursts: state.bursts.map((b) => ({
        burst: b.id,
        word: b.word,
        channel: b.channel,
        degrees: b.degrees,
        method: b.method,
        shift: b.shift,
        cipher: b.cipher,
      })),
      words: solutionWords(state),
      order: state.order,
      tuned: state.tuned.length,
      attempts: state.attempts,
      mistakes: state.mistakes,
    };
  },

  apply(state, role, action): ApplyResult<SignalState> {
    if (state.finished) return reject(state, 'invalid_action', 'The transmission is already complete.');
    switch (action.kind) {
      case 'sig:tune': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can tune the bursts.');
        if (!isBurst(action.burst)) return reject(state, 'invalid_action', 'Unknown burst.');
        const channel = action.channel;
        if (!Number.isInteger(channel) || channel < 1 || channel > SIGNAL_CHANNELS) {
          return reject(state, 'invalid_action', `Channels go from 1 to ${SIGNAL_CHANNELS}.`);
        }
        if (state.tuned.includes(action.burst)) {
          return reject(state, 'invalid_action', 'That burst is already tuned.');
        }
        if (burstOf(state, action.burst).channel !== channel) {
          return reject(
            state,
            'wrong_value',
            `Only static on channel ${channel}. You lost ${SIGNAL_TUNE_PENALTY_SECONDS} s.`,
            SIGNAL_TUNE_PENALTY_SECONDS,
          );
        }
        return { state: { ...state, tuned: [...state.tuned, action.burst] } };
      }

      case 'sig:decode': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can decrypt the bursts.');
        if (!isBurst(action.burst)) return reject(state, 'invalid_action', 'Unknown burst.');
        if (!state.tuned.includes(action.burst)) {
          return reject(state, 'invalid_action', 'That burst hasn’t been captured yet: the Engineer must tune it.');
        }
        const { method, shift } = action;
        if (!CIPHER_METHODS.includes(method) || !Number.isInteger(shift) || shift < 0 || shift > 25) {
          return reject(state, 'invalid_action', 'Invalid method or shift (the shift goes from 0 to 25).');
        }
        const prev = state.decodes[action.burst] ?? { count: 0, last: null };
        const result = decode(burstOf(state, action.burst).cipher, method, shift);
        const next: SignalState = {
          ...state,
          decodes: { ...state.decodes, [action.burst]: { count: prev.count + 1, last: { method, shift, result } } },
        };
        // La primera prueba de cada ráfaga es gratis: después, probar a ciegas cuesta tiempo.
        return prev.count >= SIGNAL_FREE_DECODES
          ? { state: next, penaltySeconds: SIGNAL_DECODE_PENALTY_SECONDS }
          : { state: next };
      }

      case 'sig:submit': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can transmit the key.');
        const words = Array.isArray(action.words)
          ? action.words.map((w) => (typeof w === 'string' ? w.trim().toUpperCase() : ''))
          : [];
        if (words.length !== SIGNAL_BURSTS.length || words.some((w) => !/^[A-Z]+$/.test(w))) {
          return reject(state, 'invalid_action', `You must transmit ${SIGNAL_BURSTS.length} words, letters only.`);
        }
        const solution = solutionWords(state);
        const correct = words.filter((w, i) => w === solution[i]).length;
        const attempts = state.attempts + 1;
        if (correct === solution.length) {
          return { state: { ...state, attempts, lastCorrect: correct, finished: true } };
        }
        return reject(
          state,
          'wrong_value',
          `Transmission rejected: ${correct} of ${solution.length} words in place. You lost ${SIGNAL_SUBMIT_PENALTY_SECONDS} s.`,
          SIGNAL_SUBMIT_PENALTY_SECONDS,
          { ...state, attempts, lastCorrect: correct },
        );
      }

      default:
        return reject(state, 'invalid_action', 'Unknown action.');
    }
  },

  isComplete(state) {
    return state.finished;
  },
};
