import type {
  ChallengeAction,
  ChallengeBriefing,
  ChallengeView,
  ErrorCode,
  FacilitatorView,
  Role,
} from '@enigma/shared';

export interface ApplyResult<S> {
  state: S;
  /** Segundos que se restan al timer (por ejemplo, al pisar una mina). */
  penaltySeconds?: number;
  /**
   * La acción se rechaza, pero el cambio de estado y la penalidad se conservan
   * (por ejemplo, un intento fallido que suma al contador).
   */
  error?: { code: ErrorCode; message: string };
}

/**
 * `clockMs` es el tiempo restante de la partida en milisegundos (el reloj de juego, que se
 * detiene en las pausas). Los desafíos que miden duraciones lo usan en lugar de la hora real.
 */
/**
 * Un desafío es un módulo con esta interfaz. El motor de fases solo conoce esto,
 * así que sumar un desafío es agregar un archivo y registrarlo en index.ts.
 * Las reglas viven acá, en el servidor: el cliente solo manda intenciones.
 */
export interface ChallengeModule<S = unknown> {
  /** Posición en el juego, empezando en 1 y sin saltos. */
  id: number;
  name: string;
  /** Texto que se muestra antes de empezar, mientras el equipo elige roles. */
  briefing: ChallengeBriefing;
  /** Estado inicial; con la misma semilla devuelve siempre los mismos datos. */
  init(seed: number): S;
  /** Lo que ve un rol: nunca debe incluir datos de otros roles. */
  viewFor(state: S, role: Role, clockMs?: number, missionMs?: number): ChallengeView;
  /** Estado completo para el facilitador (spoiler). */
  facilitatorView(state: S): FacilitatorView;
  apply(state: S, role: Role, action: ChallengeAction, clockMs?: number, missionMs?: number): ApplyResult<S>;
  /**
   * Para desafíos en tiempo real (algo que avanza con el reloj): lleva el estado hasta `missionMs`, los milisegundos
   * que lleva jugándose el desafío (sin contar pausas ni penalidades). Debe devolver el mismo objeto si no pasó nada.
   */
  advance?(state: S, missionMs: number): S;
  /**
   * Para desafíos con vistas que cambian solas con el tiempo (por ejemplo, un escaneo que se apaga):
   * reloj de juego (ms restantes) en el que la vista deja de ser la misma, o null si no hay.
   */
  viewChangeAt?(state: S): number | null;
  isComplete(state: S): boolean;
}
