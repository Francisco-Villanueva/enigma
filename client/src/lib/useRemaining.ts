import { useMemo } from 'react';
import type { TimerState } from '@enigma/shared';
import { useCountdown } from './useCountdown';

/**
 * Cuenta regresiva de un tiempo que manda el servidor (votación, transmisión, espera).
 * `version` es cualquier objeto que cambie con cada estado nuevo del servidor: así la cuenta
 * se vuelve a anclar en cada mensaje y, entre mensajes, solo descuenta con el reloj local.
 */
export function useRemaining(ms: number, running: boolean, version: unknown): number {
  const timer = useMemo<TimerState>(() => ({ remainingMs: ms, running }), [ms, running, version]);
  return useCountdown(timer);
}

export function wholeSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
