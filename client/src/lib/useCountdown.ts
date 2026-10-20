import { useEffect, useMemo, useState } from 'react';
import type { TimerState } from '@enigma/shared';

/**
 * Cuenta regresiva en pantalla. El servidor manda el tiempo restante cada vez que
 * algo cambia; entre mensajes el cliente solo lo va descontando con su reloj local.
 */
export function useCountdown(timer: TimerState): number {
  // Momento (reloj local) en que llegó este valor del servidor.
  const arrivedAt = useMemo(() => performance.now(), [timer]);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [timer.running]);

  const elapsed = timer.running ? Math.max(0, now - arrivedAt) : 0;
  return Math.max(0, timer.remainingMs - elapsed);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
