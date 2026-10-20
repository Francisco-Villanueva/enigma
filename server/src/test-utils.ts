import { ROLES } from '@enigma/shared';
import type { Role } from '@enigma/shared';
import type { Room, RoomManager } from './rooms.js';

type Player = ReturnType<RoomManager['createRoom']>['player'];

/** Crea una sala con los 6 jugadores; el primero es el facilitador. */
export function joinSix(manager: RoomManager) {
  const { room, player: host } = manager.createRoom('Nico');
  const players: Player[] = [host];
  for (const name of ['Sofia', 'Mateo', 'Lucia', 'Fran', 'Valen']) {
    players.push(manager.joinRoom(room.roomId, name).player);
  }
  return { room, host, players };
}

/** Reparte los roles del briefing actual: el jugador i toma ROLES[(i + offset) % 6]. */
export function assignRoles(manager: RoomManager, room: Room, players: Player[], offset = 0) {
  players.forEach((p, i) => manager.pickRole(room.roomId, p.playerId, ROLES[(i + offset) % ROLES.length]));
}

/** Del briefing al desafío en juego, repartiendo los roles con el desplazamiento dado. */
export function beginWithRoles(manager: RoomManager, room: Room, players: Player[], offset = 0) {
  assignRoles(manager, room, players, offset);
  manager.command(room.roomId, players[0].playerId, { type: 'begin' });
}

/** Sala lista: 6 jugadores, briefing del desafío 1 resuelto y desafío 1 en juego. */
export function startedGame(manager: RoomManager) {
  const { room, host, players } = joinSix(manager);
  manager.startGame(room.roomId, host.playerId);
  beginWithRoles(manager, room, players, 0);
  return { room, host, players };
}

/** Quién tiene cada rol ahora mismo (ids de jugador). */
export function roleMap(room: Room): Record<Role, string> {
  const map = {} as Record<Role, string>;
  for (const p of room.players.values()) if (p.role) map[p.role] = p.playerId;
  return map;
}
