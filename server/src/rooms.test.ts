import { describe, expect, it } from 'vitest';
import { GameError, RoomManager } from './rooms.js';
import { assignRoles } from './test-utils.js';

function fullRoom(manager: RoomManager) {
  const { room, player: host } = manager.createRoom('Nico');
  const players = [host];
  for (const name of ['Sofia', 'Mateo', 'Lucia', 'Fran']) {
    players.push(manager.joinRoom(room.roomId, name).player);
  }
  players.push(manager.joinRoom(room.roomId, 'Valen').player);
  return { room, host, players };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) return err.code;
    throw err;
  }
  return undefined;
}

describe('RoomManager', () => {
  it('crea una sala con código de 4 caracteres y el creador como facilitador', () => {
    const manager = new RoomManager();
    const { room, player } = manager.createRoom('  Nico  ');
    expect(room.roomId).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(player.name).toBe('Nico');
    expect(player.isFacilitator).toBe(true);
    expect(room.status).toBe('lobby');
  });

  it('acepta el código en minúsculas o con prefijo ROOM-', () => {
    const manager = new RoomManager();
    const { room } = manager.createRoom('Nico');
    expect(manager.joinRoom(room.roomId.toLowerCase(), 'Sofia').room).toBe(room);
    expect(manager.joinRoom(`ROOM-${room.roomId}`, 'Mateo').room).toBe(room);
  });

  it('rechaza nombres vacíos, largos o repetidos', () => {
    const manager = new RoomManager();
    expect(codeOf(() => manager.createRoom('   '))).toBe('invalid_name');
    expect(codeOf(() => manager.createRoom('x'.repeat(21)))).toBe('invalid_name');
    const { room } = manager.createRoom('Nico');
    expect(codeOf(() => manager.joinRoom(room.roomId, 'nico'))).toBe('name_taken');
  });

  it('rechaza salas inexistentes y la séptima persona', () => {
    const manager = new RoomManager();
    expect(codeOf(() => manager.joinRoom('ZZZZ', 'Ana'))).toBe('room_not_found');
    const { room } = fullRoom(manager);
    expect(codeOf(() => manager.joinRoom(room.roomId, 'Extra'))).toBe('room_full');
  });

  it('no deja tomar un rol que ya tiene otra persona, pero sí liberarlo', () => {
    const manager = new RoomManager();
    const { room, players } = fullRoom(manager);
    manager.startGame(room.roomId, players[0].playerId);
    manager.pickRole(room.roomId, players[0].playerId, 'hacker');
    expect(codeOf(() => manager.pickRole(room.roomId, players[1].playerId, 'hacker'))).toBe('role_taken');
    manager.pickRole(room.roomId, players[0].playerId, null);
    manager.pickRole(room.roomId, players[1].playerId, 'hacker');
    expect(players[1].role).toBe('hacker');
  });

  it('rechaza roles inventados', () => {
    const manager = new RoomManager();
    const { room, players } = fullRoom(manager);
    manager.startGame(room.roomId, players[0].playerId);
    expect(codeOf(() => manager.pickRole(room.roomId, players[0].playerId, 'mago' as never))).toBe('invalid_role');
  });

  it('en la sala de espera todavía no se eligen roles', () => {
    const manager = new RoomManager();
    const { room, player } = manager.createRoom('Nico');
    expect(codeOf(() => manager.pickRole(room.roomId, player.playerId, 'hacker'))).toBe('wrong_phase');
  });

  it('solo el facilitador empieza (con cualquier cantidad de jugadores); empieza por el briefing del desafío 1', () => {
    const manager = new RoomManager();
    const { room: partial, player: lone } = manager.createRoom('Solo');
    expect(codeOf(() => manager.startGame(partial.roomId, lone.playerId))).toBeUndefined();
    expect(partial.status).toBe('briefing');

    const { room, players } = fullRoom(manager);
    expect(codeOf(() => manager.startGame(room.roomId, players[1].playerId))).toBe('not_facilitator');
    manager.startGame(room.roomId, players[0].playerId);
    expect(room.status).toBe('briefing');
    expect(room.currentChallenge).toBe(1);
    expect(room.timer.runningSince).toBeNull();
    expect(codeOf(() => manager.startGame(room.roomId, players[0].playerId))).toBe('game_started');
  });

  it('con la partida en curso no entra nadie ni se cambian roles', () => {
    const manager = new RoomManager();
    const { room, players } = fullRoom(manager);
    manager.startGame(room.roomId, players[0].playerId);
    assignRoles(manager, room, players);
    manager.command(room.roomId, players[0].playerId, { type: 'begin' });
    expect(room.status).toBe('playing');
    expect(codeOf(() => manager.joinRoom(room.roomId, 'Tarde'))).toBe('game_started');
    expect(codeOf(() => manager.pickRole(room.roomId, players[0].playerId, null))).toBe('wrong_phase');
  });

  it('rejoin devuelve al jugador y lo marca conectado', () => {
    const manager = new RoomManager();
    const { room, players } = fullRoom(manager);
    manager.setConnected(room.roomId, players[2].playerId, false);
    expect(players[2].connected).toBe(false);
    manager.rejoin(room.roomId, players[2].playerId);
    expect(players[2].connected).toBe(true);
    expect(codeOf(() => manager.rejoin(room.roomId, 'otro-id'))).toBe('unknown_player');
  });

  it('la vista de cada jugador incluye quién es él', () => {
    const manager = new RoomManager();
    const { room, players } = fullRoom(manager);
    manager.startGame(room.roomId, players[0].playerId);
    manager.pickRole(room.roomId, players[3].playerId, 'estratega');
    const view = manager.viewFor(room, players[3].playerId);
    expect(view.you).toEqual({
      playerId: players[3].playerId,
      role: 'estratega',
      roles: ['estratega'],
      isFacilitator: false,
      usedRoles: [],
    });
    expect(view.players).toHaveLength(6);
  });

  it('borra salas vacías pasado el tiempo y conserva las que tienen gente', () => {
    let now = 0;
    const manager = new RoomManager(() => now);
    const { room, player } = manager.createRoom('Nico');
    const other = manager.createRoom('Sofia');
    manager.setConnected(room.roomId, player.playerId, false);
    now = 10_000;
    expect(manager.sweep(5_000)).toBe(1);
    expect(manager.getRoom(room.roomId)).toBeUndefined();
    expect(manager.getRoom(other.room.roomId)).toBeDefined();
  });
});

describe('practice round and ready check', () => {
  function full() {
    const m = new RoomManager();
    const { room, player } = m.createRoom('Host');
    const ids = [player.playerId];
    for (const n of ['A', 'B', 'C', 'D', 'E']) ids.push(m.joinRoom(room.roomId, n).player.playerId);
    return { m, room, ids };
  }

  it('practice leaves no trace and then the mission starts', () => {
    const { m, room, ids } = full();
    m.command(room.roomId, ids[0]!, { type: 'practice' });
    expect(room.status).toBe('practice');
    expect(new Set([...room.players.values()].map((p) => p.role)).size).toBe(6);
    const code = (room.challengeState as { code: string }).code;
    const hacker = [...room.players.values()].find((p) => p.role === 'hacker')!;
    m.applyAction(room.roomId, hacker.playerId, { kind: 'sandbox:submit', code });
    expect(room.status).toBe('practice_done');
    expect([...room.players.values()].every((p) => p.usedRoles.length === 0 && p.role === null)).toBe(true);
    m.startGame(room.roomId, ids[0]!);
    expect(room.status).toBe('briefing');
  });

  it('ready only works during the briefing and resets each briefing', () => {
    const { m, room, ids } = full();
    expect(() => m.setReady(room.roomId, ids[1]!, true)).toThrow();
    m.startGame(room.roomId, ids[0]!);
    m.setReady(room.roomId, ids[1]!, true);
    expect(room.players.get(ids[1]!)!.ready).toBe(true);
  });
});
