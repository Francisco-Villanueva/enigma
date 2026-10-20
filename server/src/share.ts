import { MAX_PLAYERS, SHARE_INITIAL_CREDITS, SHARE_VOTES_NEEDED } from '@enigma/shared';

/**
 * Estado de la transmisión de pantalla simulada de una sala. Lógica pura y sin sockets:
 * el RoomManager la orquesta (cobros, fases, pausas) y se prueba con un reloj falso.
 */

/**
 * Cuenta regresiva que se puede congelar: las pausas del facilitador no deben consumir
 * tiempo de votación, de transmisión ni de espera.
 */
export interface ShareClock {
  /** Momento (reloj real, ms) en que vence; null mientras está congelada. */
  endsAt: number | null;
  /** Lo que queda cuando está congelada. */
  leftMs: number;
}

export function startClock(now: number, ms: number): ShareClock {
  return { endsAt: now + ms, leftMs: ms };
}

export function clockLeft(clock: ShareClock, now: number): number {
  return clock.endsAt === null ? clock.leftMs : Math.max(0, clock.endsAt - now);
}

/** true si la cuenta regresiva está corriendo y ya llegó a cero. */
export function clockExpired(clock: ShareClock, now: number): boolean {
  return clock.endsAt !== null && clock.endsAt <= now;
}

function freezeClock(clock: ShareClock, now: number): void {
  if (clock.endsAt === null) return;
  clock.leftMs = clockLeft(clock, now);
  clock.endsAt = null;
}

function thawClock(clock: ShareClock, now: number): void {
  if (clock.endsAt !== null) return;
  clock.endsAt = now + clock.leftMs;
}

export interface ShareVote {
  proposedBy: string;
  /** playerId de quien transmitiría. */
  target: string;
  /** Quien propone arranca con su «sí». */
  yes: string[];
  no: string[];
  clock: ShareClock;
}

/** Una transmisión no vence sola: dura hasta que termina el desafío o la corta el facilitador. */
export interface ShareBroadcast {
  /** Sube con cada transmisión de la sala. */
  id: number;
  /** playerId del emisor. */
  target: string;
  paidWith: 'credit' | 'time';
  /** Estado de pantalla que publica el emisor (ver SHARE_UI_MAX_CHARS). */
  ui: Record<string, unknown>;
}

export interface ShareState {
  credits: number;
  vote: ShareVote | null;
  broadcast: ShareBroadcast | null;
  /** Espera tras una votación rechazada o vencida. */
  cooldown: ShareClock | null;
  lastBroadcastId: number;
}

export function newShareState(): ShareState {
  return { credits: SHARE_INITIAL_CREDITS, vote: null, broadcast: null, cooldown: null, lastBroadcastId: 0 };
}

/** Cierra la votación y la transmisión en curso y borra la espera (fin de un desafío, por ejemplo). */
export function clearShareActivity(share: ShareState): void {
  share.vote = null;
  share.broadcast = null;
  share.cooldown = null;
}

export function freezeShare(share: ShareState, now: number): void {
  if (share.vote) freezeClock(share.vote.clock, now);
  if (share.cooldown) freezeClock(share.cooldown, now);
}

export function thawShare(share: ShareState, now: number): void {
  if (share.vote) thawClock(share.vote.clock, now);
  if (share.cooldown) thawClock(share.cooldown, now);
}

/** «Sí» necesarios: 4 con 6 jugadores; con menos, la mayoría simple. */
export function votesNeeded(players: number): number {
  return Math.max(1, Math.min(SHARE_VOTES_NEEDED, Math.floor(players / 2) + 1));
}

/**
 * Con 6 jugadores y 4 «sí» necesarios, la propuesta se cae con el tercer «no»
 * (los 3 restantes ya no alcanzan para llegar a 4).
 */
export function tallyVote(vote: ShareVote, players: number = MAX_PLAYERS): 'approved' | 'rejected' | 'pending' {
  const needed = votesNeeded(players);
  if (vote.yes.length >= needed) return 'approved';
  if (vote.no.length > players - needed) return 'rejected';
  return 'pending';
}
