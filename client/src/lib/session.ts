const KEY = 'enigma-core:session';

export interface StoredSession {
  roomId: string;
  playerId: string;
}

// El navegador puede bloquear el almacenamiento (modo privado): nunca debe romper el juego.
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.roomId === 'string' && typeof parsed.playerId === 'string') {
      return { roomId: parsed.roomId, playerId: parsed.playerId };
    }
  } catch {
    // se ignora: se trata como si no hubiera sesión guardada
  }
  return null;
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // sin almacenamiento, la reconexión tras recargar no estará disponible
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que limpiar
  }
}
