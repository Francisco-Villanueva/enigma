import type { Role } from '@enigma/shared';

/** Un jugador al repartir roles: qué roles puede tomar y cuál tiene elegido ahora. */
export interface Seat {
  allowed: readonly Role[];
  picked: Role | null;
}

/**
 * Completa la asignación de roles: a cada jugador sin rol le busca uno libre que pueda tomar.
 * Devuelve el rol de cada jugador (en el mismo orden) o null si no hay forma de repartirlos.
 * Es un emparejamiento clásico entre jugadores y roles (caminos de aumento): sirve tanto para
 * validar una elección ("¿a alguien le quedaría un rol imposible?") como para repartir al azar.
 */
export function completeAssignment(seats: readonly Seat[], rng?: () => number): Role[] | null {
  const taken = new Set(seats.flatMap((s) => (s.picked ? [s.picked] : [])));
  const order = (items: number[]) => {
    if (!rng) return items;
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  /** Rol libre → jugador que lo tiene reservado en la asignación en curso. */
  const owner = new Map<Role, number>();

  function assign(seat: number, seen: Set<Role>): boolean {
    const options = seats[seat].allowed.filter((r) => !taken.has(r));
    const shuffled = order(options.map((_, i) => i)).map((i) => options[i]);
    for (const role of shuffled) {
      if (seen.has(role)) continue;
      seen.add(role);
      const current = owner.get(role);
      if (current === undefined || assign(current, seen)) {
        owner.set(role, seat);
        return true;
      }
    }
    return false;
  }

  const free = seats.flatMap((s, i) => (s.picked ? [] : [i]));
  for (const seat of order(free)) {
    if (!assign(seat, new Set())) return null;
  }

  const result = seats.map((s) => s.picked);
  for (const [role, seat] of owner) result[seat] = role;
  return result as Role[];
}
