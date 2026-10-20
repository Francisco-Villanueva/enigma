import {
  CORE_CONFIRM_CODE_LENGTH,
  CORE_CONFIRM_PENALTY_SECONDS,
  CORE_CRITICAL_COUNT,
  CORE_FAULT_THRESHOLD,
  CORE_ORDER_PENALTY_SECONDS,
  CORE_OVERLOAD_PENALTY_SECONDS,
  CORE_VALUE_PENALTY_SECONDS,
  REACTOR_COUNT,
  REACTOR_SLIDER_STEP,
} from '@enigma/shared';
import type { ChallengeView, FacilitatorView, Role } from '@enigma/shared';
import { mulberry32, shuffle } from '../rng.js';
import type { ApplyResult, ChallengeModule } from './types.js';

/**
 * Desafío 1: Power Core Synchronization.
 *
 * 10 reactores; 4 están en estado crítico (deben quedar en 0%) y 6 están sanos.
 * Un reactor es crítico si su temperatura supera a su presión por más de CORE_FAULT_THRESHOLD
 * (hay que hacer la cuenta; no viene marcado). Cada sano necesita una potencia:
 *   potencia = BASE + POR_CONEXIÓN × conexiones con reactores SANOS + bono según su temperatura
 * y hay que calibrarlos en un orden obligatorio.
 *
 * Quién sabe qué (nadie puede resolverlo solo):
 *   Analista    → temperatura y presión de cada reactor y la regla de diagnóstico: de ahí salen los críticos y la temperatura
 *   Navegador   → el mapa completo de conexiones (sanos y críticos mezclados, sin saber cuál es cuál)
 *   Criptógrafo → la fórmula y la tabla de bonos por temperatura
 *   Estratega   → el orden de calibración de los 10 reactores (con los fallados intercalados, que él tacha)
 *   Ingeniero   → los sliders (único que mueve los reactores)
 *   Hacker      → confirma cada reactor fijado con el código de enlace que le dicta el Ingeniero, y el botón final
 *
 * Además: el Analista puede enviarle al Criptógrafo las lecturas de un reactor (`core:share`).
 */

const BASE_POWER = 10;
const POWER_PER_CONNECTION = 10;
/** Bono de potencia (%) según la temperatura del reactor. */
const TEMPERATURE_BANDS = [
  { from: 0, label: 'Under 350°C', bonus: 0 },
  { from: 350, label: '350°C to 599°C', bonus: 10 },
  { from: 600, label: '600°C or more', bonus: 20 },
];
const temperatureBonus = (temperature: number) =>
  [...TEMPERATURE_BANDS].reverse().find((band) => temperature >= band.from)!.bonus;

const REACTOR_IDS: readonly number[] = Array.from({ length: REACTOR_COUNT }, (_, i) => i + 1);
const LINK_COUNT_MIN = 12;
const LINK_COUNT_EXTRA = 3; // entre 12 y 14 conexiones
const MAX_DEGREE = 6;
const MAX_HEALTHY_CONNECTIONS = 5;
const MIN_LINKS_TO_CRITICAL = 3;
const MIN_AFFECTED_HEALTHY = 2;

/** Lugares del diagrama del Navegador: un óvalo, así ninguna conexión pasa por encima de otro reactor. */
const SLOTS = Array.from({ length: REACTOR_COUNT }, (_, i) => {
  const angle = (i / REACTOR_COUNT) * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.38 * Math.sin(angle) };
});

interface Reactor {
  id: number;
  critical: boolean;
  temperature: number;
  pressure: number;
  /** Potencia correcta (0 para los críticos). */
  target: number;
  level: number;
  locked: boolean;
  x: number;
  y: number;
}

export interface PowerCoreState {
  reactors: Reactor[];
  /** Todas las conexiones entre reactores (también con los críticos), con el id menor primero. */
  links: [number, number][];
  /** Orden de calibración de los reactores sanos. */
  sequence: number[];
  /** Lo mismo pero con los críticos intercalados: es lo que ve el Estratega. */
  fullSequence: number[];
  /** Reactores que el Estratega tachó como «no funciona». */
  marked: number[];
  /** Reactores cuyas lecturas el Analista le envió al Criptógrafo (el último, al final). */
  shared: number[];
  /** Código de enlace de cada reactor (por id): se lo dicta el Ingeniero al Hacker. */
  confirmCodes: Record<number, string>;
  /** Reactor fijado por el Ingeniero que espera la confirmación del Hacker. */
  pending: { reactor: number; value: number } | null;
  done: number;
  mistakes: number;
  confirmationCode: string;
  sealed: boolean;
}

const pair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

/**
 * Conexiones entre los 10 reactores: un árbol (todo conectado) más enlaces extra, repetido hasta que
 * el mapa sirva para el juego: cada sano tiene al menos 1 y a lo sumo 5 conexiones con otros sanos, y
 * varios sanos están conectados a críticos (así, contar las conexiones sin saber quién falló da mal).
 */
function buildLinks(criticalIds: Set<number>, rng: () => number): [number, number][] {
  const healthy = REACTOR_IDS.filter((id) => !criticalIds.has(id));
  let last: [number, number][] = [];
  for (let attempt = 0; attempt < 2000; attempt++) {
    const order = shuffle(REACTOR_IDS, rng);
    const links: [number, number][] = [];
    const has = (p: [number, number]) => links.some(([a, b]) => a === p[0] && b === p[1]);
    for (let i = 1; i < order.length; i++) links.push(pair(order[i], order[Math.floor(rng() * i)]));
    const target = LINK_COUNT_MIN + Math.floor(rng() * LINK_COUNT_EXTRA);
    for (let guard = 0; links.length < target && guard < 200; guard++) {
      const p = pair(order[Math.floor(rng() * order.length)], order[Math.floor(rng() * order.length)]);
      if (p[0] !== p[1] && !has(p)) links.push(p);
    }
    links.sort((l1, l2) => l1[0] - l2[0] || l1[1] - l2[1]);
    last = links;

    const degree = (id: number) => links.filter(([a, b]) => a === id || b === id).length;
    const healthyDegree = (id: number) =>
      links.filter(([a, b]) => (a === id && !criticalIds.has(b)) || (b === id && !criticalIds.has(a))).length;
    const toCritical = links.filter(([a, b]) => criticalIds.has(a) !== criticalIds.has(b)).length;
    const affected = healthy.filter((id) => degree(id) !== healthyDegree(id)).length;
    if (
      REACTOR_IDS.every((id) => degree(id) <= MAX_DEGREE) &&
      healthy.every((id) => healthyDegree(id) >= 1 && healthyDegree(id) <= MAX_HEALTHY_CONNECTIONS) &&
      toCritical >= MIN_LINKS_TO_CRITICAL &&
      affected >= MIN_AFFECTED_HEALTHY
    ) {
      return links;
    }
  }
  return last;
}

function reject(
  state: PowerCoreState,
  code: 'overload' | 'sequence_error' | 'wrong_value' | 'invalid_action' | 'wrong_role',
  message: string,
  penaltySeconds = 0,
): ApplyResult<PowerCoreState> {
  const mistakes = penaltySeconds > 0 ? state.mistakes + 1 : state.mistakes;
  return { state: { ...state, mistakes }, penaltySeconds, error: { code, message } };
}

export const powerCoreChallenge: ChallengeModule<PowerCoreState> = {
  id: 1,
  name: 'Power Core Synchronization',
  briefing: {
    story:
      'The aircraft’s emergency beacon runs on a core of 10 reactors, and a chain overload has knocked it out. Recalibrate them before the backup power dies and the signal is lost for good.',
    objective:
      'Calibrate the 6 healthy reactors to their exact power, in the right order, without touching the 4 critical ones, then seal the phase with the final charge.',
    roles: {
      navegador: 'Has the map with every connection, but doesn’t know which reactors are failing.',
      analista: 'Using the temperature and pressure readings and a diagnostic rule, finds which 4 reactors are critical and the temperature of each.',
      criptografo: 'Has the power formula: connections to healthy reactors plus a bonus based on temperature.',
      estratega: 'Has the sequence of all 10 reactors, with the failing ones mixed in; crosses out the broken ones to learn the final order.',
      ingeniero: 'Moves the sliders and locks each reactor, in the order the team dictates. Critical reactors must stay at 0%.',
      hacker: 'Confirms each reactor the Engineer locks (using the link code the Engineer reads out) and, at the end, seals the core with the final charge.',
    },
  },

  init(seed) {
    const rng = mulberry32(seed);

    const criticalIds = new Set(shuffle(REACTOR_IDS, rng).slice(0, CORE_CRITICAL_COUNT));
    const healthy = REACTOR_IDS.filter((id) => !criticalIds.has(id));

    const links = buildLinks(criticalIds, rng);

    const slots = shuffle(SLOTS, rng);
    const reactors: Reactor[] = REACTOR_IDS.map((id, index) => {
      const critical = criticalIds.has(id);
      const connections = links.filter(([a, b]) => (a === id && !criticalIds.has(b)) || (b === id && !criticalIds.has(a))).length;
      const temperature = 200 + 10 * Math.floor(rng() * 61); // 200 a 800
      // Sanos: la temperatura supera a la presión por poco (o no la supera). Críticos: por bastante más.
      const gap = critical ? 50 + 10 * Math.floor(rng() * 9) : -60 + 10 * Math.floor(rng() * 10); // 50..130 vs -60..30
      return {
        id,
        critical,
        temperature,
        pressure: temperature - gap,
        target: critical ? 0 : BASE_POWER + POWER_PER_CONNECTION * connections + temperatureBonus(temperature),
        level: 0,
        locked: false,
        x: slots[index].x,
        y: slots[index].y,
      };
    });

    const sequence = shuffle(healthy, rng);
    const fullSequence = [...sequence];
    for (const id of shuffle([...criticalIds], rng)) fullSequence.splice(Math.floor(rng() * (fullSequence.length + 1)), 0, id);

    const confirmationCode = Array.from({ length: 4 }, () => Math.floor(rng() * 10)).join('');
    return {
      reactors,
      links,
      sequence,
      fullSequence,
      marked: [],
      shared: [],
      confirmCodes: Object.fromEntries(
        REACTOR_IDS.map((id) => [id, Array.from({ length: CORE_CONFIRM_CODE_LENGTH }, () => Math.floor(rng() * 10)).join('')]),
      ),
      pending: null,
      done: 0,
      mistakes: 0,
      confirmationCode,
      sealed: false,
    };
  },

  viewFor(state, role: Role): ChallengeView {
    const aligned = state.done === state.sequence.length;
    switch (role) {
      case 'navegador':
        return {
          kind: 'core',
          role,
          nodes: state.reactors.map((r) => ({ reactor: r.id, x: r.x, y: r.y })),
          links: state.links,
        };
      case 'analista':
        return {
          kind: 'core',
          role,
          reactors: state.reactors.map((r) => ({ id: r.id, temperature: r.temperature, pressure: r.pressure })),
          threshold: CORE_FAULT_THRESHOLD,
          shared: state.shared,
        };
      case 'criptografo':
        return {
          kind: 'core',
          role,
          base: BASE_POWER,
          perConnection: POWER_PER_CONNECTION,
          bands: TEMPERATURE_BANDS.map(({ label, bonus }) => ({ label, bonus })),
          received: [...state.shared].reverse().map((id) => {
            const r = state.reactors[id - 1];
            return { reactor: id, temperature: r.temperature, pressure: r.pressure };
          }),
        };
      case 'estratega':
        return {
          kind: 'core',
          role,
          sequence: state.fullSequence,
          marked: state.marked,
          calibrated: state.reactors.filter((r) => r.locked).map((r) => r.id),
        };
      case 'ingeniero':
        return {
          kind: 'core',
          role,
          reactors: state.reactors.map((r) => ({ id: r.id, level: r.level, locked: r.locked })),
          step: REACTOR_SLIDER_STEP,
          pending: state.pending ? { ...state.pending, code: state.confirmCodes[state.pending.reactor] } : null,
        };
      case 'hacker':
        return {
          kind: 'core',
          role,
          aligned,
          pending: state.pending,
          confirmationCode: aligned ? state.confirmationCode : null,
          done: state.done,
          total: state.sequence.length,
        };
    }
  },

  facilitatorView(state): FacilitatorView {
    return {
      kind: 'core',
      reactors: state.reactors.map((r) => ({
        id: r.id,
        critical: r.critical,
        temperature: r.temperature,
        pressure: r.pressure,
        connections: state.links.filter(
          ([a, b]) =>
            (a === r.id && !state.reactors[b - 1].critical) || (b === r.id && !state.reactors[a - 1].critical),
        ).length,
        target: r.target,
        level: r.level,
        locked: r.locked,
      })),
      fullSequence: state.fullSequence,
      sequence: state.sequence,
      done: state.done,
      mistakes: state.mistakes,
      confirmationCode: state.confirmationCode,
    };
  },

  apply(state, role, action) {
    if (state.sealed) return { state };

    if (action.kind === 'core:seal') {
      if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can inject the final charge.');
      if (state.done < state.sequence.length) {
        return reject(state, 'sequence_error', 'Some reactors still need calibrating.');
      }
      return { state: { ...state, sealed: true } };
    }

    if (action.kind === 'core:mark') {
      if (role !== 'estratega') return reject(state, 'wrong_role', 'Only the Strategist can mark reactors in the sequence.');
      if (!Number.isInteger(action.reactor) || !state.fullSequence.includes(action.reactor)) {
        return reject(state, 'invalid_action', 'Invalid reactor.');
      }
      const marked = state.marked.includes(action.reactor)
        ? state.marked.filter((id) => id !== action.reactor)
        : [...state.marked, action.reactor];
      return { state: { ...state, marked } };
    }

    if (action.kind === 'core:share') {
      if (role !== 'analista') return reject(state, 'wrong_role', 'Only the Analyst can send readings to the Cryptographer.');
      if (!Number.isInteger(action.reactor) || !state.fullSequence.includes(action.reactor)) {
        return reject(state, 'invalid_action', 'Invalid reactor.');
      }
      const shared = [...state.shared.filter((id) => id !== action.reactor), action.reactor];
      return { state: { ...state, shared } };
    }

    if (action.kind === 'core:confirm') {
      if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can confirm locked reactors.');
      if (!state.pending) return reject(state, 'invalid_action', 'No reactor is waiting for confirmation.');
      const { reactor: id, value } = state.pending;
      if (typeof action.code !== 'string' || action.code.trim() !== state.confirmCodes[id]) {
        return reject(
          state,
          'wrong_value',
          `That is not the link code for R${id}. You lost ${CORE_CONFIRM_PENALTY_SECONDS} s.`,
          CORE_CONFIRM_PENALTY_SECONDS,
        );
      }
      return {
        state: {
          ...state,
          pending: null,
          done: state.done + 1,
          reactors: state.reactors.map((r) => (r.id === id ? { ...r, level: value, locked: true } : r)),
        },
      };
    }

    if (action.kind !== 'core:set') {
      return reject(state, 'invalid_action', 'Unknown action.');
    }
    if (role !== 'ingeniero') {
      return reject(state, 'wrong_role', 'Only the Engineer can move the reactors.');
    }

    const { reactor: id, value } = action;
    const reactor = state.reactors.find((r) => r.id === id);
    if (
      !Number.isInteger(id) ||
      !reactor ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100 ||
      value % REACTOR_SLIDER_STEP !== 0
    ) {
      return reject(state, 'invalid_action', 'Invalid reactor or power.');
    }
    if (reactor.locked) {
      return reject(state, 'invalid_action', `Reactor R${id} is already calibrated.`);
    }

    if (reactor.critical) {
      if (value === 0) return { state }; // dejarlo en 0% es lo correcto
      return reject(
        state,
        'overload',
        `R${id} is critical! It must stay at 0%. You lost ${CORE_OVERLOAD_PENALTY_SECONDS} s.`,
        CORE_OVERLOAD_PENALTY_SECONDS,
      );
    }

    if (state.pending) {
      return reject(
        state,
        'invalid_action',
        `R${state.pending.reactor} is waiting for the Hacker’s confirmation: read out the link code.`,
      );
    }

    if (id !== state.sequence[state.done]) {
      return reject(
        state,
        'sequence_error',
        `R${id} is not next in the sequence. You lost ${CORE_ORDER_PENALTY_SECONDS} s.`,
        CORE_ORDER_PENALTY_SECONDS,
      );
    }
    if (value !== reactor.target) {
      return reject(
        state,
        'wrong_value',
        `R${id}'s power is not correct. You lost ${CORE_VALUE_PENALTY_SECONDS} s.`,
        CORE_VALUE_PENALTY_SECONDS,
      );
    }

    // Valores correctos: queda pendiente hasta que el Hacker lo confirme con el código de enlace.
    return { state: { ...state, pending: { reactor: id, value } } };
  },

  isComplete(state) {
    return state.sealed;
  },
};
