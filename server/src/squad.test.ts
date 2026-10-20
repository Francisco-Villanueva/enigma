import { describe, expect, it } from 'vitest';
import { ROLES, TOTAL_SECONDS } from '@enigma/shared';
import { GameError, RoomManager } from './rooms.js';
import { joinSix } from './test-utils.js';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) return err.code;
    throw err;
  }
  return undefined;
}

/** Sala con `n` jugadores (el primero es el facilitador), en el briefing del desafío 1. */
function squad(n: number) {
  const manager = new RoomManager(() => 1_000_000);
  const { room, player: host } = manager.createRoom('Nico');
  const players = [host];
  for (const name of ['Sofia', 'Mateo', 'Lucia', 'Fran'].slice(0, n - 1)) {
    players.push(manager.joinRoom(room.roomId, name).player);
  }
  manager.startGame(room.roomId, host.playerId);
  return { manager, room, host, players };
}

describe('menos de 6 jugadores', () => {
  it('se puede empezar con 3 jugadores y el reparto automático cubre los 6 roles', () => {
    const { manager, room, host, players } = squad(3);
    expect(codeOf(() => manager.command(room.roomId, host.playerId, { type: 'begin' }))).toBe('not_ready');

    manager.command(room.roomId, host.playerId, { type: 'autoassign' });
    expect(players.every((p) => p.roles.length === 2)).toBe(true);
    expect(new Set(players.flatMap((p) => p.roles)).size).toBe(ROLES.length);

    manager.command(room.roomId, host.playerId, { type: 'begin' });
    expect(room.status).toBe('playing');
  });

  it('cada uno puede sumar y soltar roles; un rol no puede tenerlo dos personas', () => {
    const { manager, room, players } = squad(2);
    const [a, b] = players;
    manager.pickRole(room.roomId, a.playerId, 'hacker');
    manager.pickRole(room.roomId, a.playerId, 'analista');
    expect(a.roles).toEqual(['hacker', 'analista']);
    expect(a.role).toBe('hacker');
    expect(codeOf(() => manager.pickRole(room.roomId, b.playerId, 'hacker'))).toBe('role_taken');

    manager.pickRole(room.roomId, a.playerId, 'hacker'); // lo suelta
    expect(a.roles).toEqual(['analista']);
    expect(a.role).toBe('analista');
    manager.pickRole(room.roomId, a.playerId, null);
    expect(a.roles).toEqual([]);
    expect(a.role).toBeNull();
  });

  it('no arranca si falta un rol o si alguien se queda sin ninguno', () => {
    const { manager, room, host, players } = squad(2);
    const [a, b] = players;
    for (const r of ROLES.slice(0, 5)) manager.pickRole(room.roomId, a.playerId, r);
    expect(codeOf(() => manager.command(room.roomId, host.playerId, { type: 'begin' }))).toBe('not_ready'); // b sin rol
    manager.pickRole(room.roomId, b.playerId, ROLES[5]);
    expect(codeOf(() => manager.command(room.roomId, host.playerId, { type: 'begin' }))).toBeUndefined();
  });

  it('con varios roles se elige con cuál jugar, y la vista cambia con él', () => {
    const { manager, room, host, players } = squad(1);
    manager.command(room.roomId, host.playerId, { type: 'autoassign' });
    expect(players[0].roles).toHaveLength(ROLES.length);
    manager.command(room.roomId, host.playerId, { type: 'begin' });

    const [first, second] = players[0].roles;
    expect(manager.viewFor(room, host.playerId).you.role).toBe(first);
    manager.switchRole(room.roomId, host.playerId, second);
    const view = manager.viewFor(room, host.playerId);
    expect(view.you).toMatchObject({ role: second });
    expect(view.challenge?.view).toMatchObject({ role: second });
    expect(view.you.roles).toHaveLength(ROLES.length);
  });

  it('no se puede cambiar a un rol que no se tiene, ni fuera de un desafío', () => {
    const { manager, room, host, players } = squad(2);
    expect(codeOf(() => manager.switchRole(room.roomId, host.playerId, 'hacker'))).toBe('wrong_phase');
    manager.command(room.roomId, host.playerId, { type: 'autoassign' });
    manager.command(room.roomId, host.playerId, { type: 'begin' });
    const other = players[1].roles[0];
    expect(codeOf(() => manager.switchRole(room.roomId, host.playerId, other))).toBe('invalid_role');
    expect(codeOf(() => manager.switchRole(room.roomId, host.playerId, 'mago'))).toBe('invalid_role');
  });

  it('el calentamiento reparte los 6 roles entre los presentes', () => {
    const { manager, room, host, players } = squad(4);
    manager.command(room.roomId, host.playerId, { type: 'lobby' });
    manager.command(room.roomId, host.playerId, { type: 'practice' });
    expect(room.status).toBe('practice');
    expect(players.every((p) => p.role !== null)).toBe(true);
    expect(new Set(players.flatMap((p) => p.roles)).size).toBe(ROLES.length);
  });

  it('con 6 jugadores elegir otro rol reemplaza al anterior (un rol por persona)', () => {
    const manager = new RoomManager();
    const { room, host, players } = joinSix(manager);
    manager.startGame(room.roomId, host.playerId);
    manager.pickRole(room.roomId, players[0].playerId, 'hacker');
    manager.pickRole(room.roomId, players[0].playerId, 'analista');
    expect(players[0].roles).toEqual(['analista']);
  });

  it('la votación de transmisión pide mayoría simple con menos jugadores', () => {
    const { manager, room, host, players } = squad(3);
    manager.command(room.roomId, host.playerId, { type: 'autoassign' });
    manager.command(room.roomId, host.playerId, { type: 'begin' });
    manager.proposeShare(room.roomId, host.playerId, players[1].playerId);
    expect(manager.viewFor(room, host.playerId).share.vote?.needed).toBe(2);
    manager.voteShare(room.roomId, players[2].playerId, 'yes');
    expect(manager.viewFor(room, host.playerId).share.broadcast).not.toBeNull();
  });
});

describe('saltar a un desafío', () => {
  it('arranca en el briefing del desafío elegido con los anteriores completados', () => {
    const { manager, room, host } = squad(5);
    manager.command(room.roomId, host.playerId, { type: 'lobby' });
    manager.command(room.roomId, host.playerId, { type: 'jump', challenge: 3, seconds: 20 * 60 });

    expect(room.status).toBe('briefing');
    expect(room.currentChallenge).toBe(3);
    const view = manager.viewFor(room, host.playerId);
    expect(view.fragments.map((f) => f.challengeId)).toEqual([1, 2]);
    expect(view.timer.remainingMs).toBe(20 * 60 * 1000);
    expect(view.timer.running).toBe(false);
  });

  it('sin tiempo indicado deja todo el reloj, y completar el 3 sigue con el 4', () => {
    const { manager, room, host } = squad(1);
    manager.command(room.roomId, host.playerId, { type: 'lobby' });
    manager.command(room.roomId, host.playerId, { type: 'jump', challenge: 3 });
    expect(manager.viewFor(room, host.playerId).timer.remainingMs).toBe(TOTAL_SECONDS * 1000);

    manager.command(room.roomId, host.playerId, { type: 'autoassign' });
    manager.command(room.roomId, host.playerId, { type: 'begin' });
    manager.command(room.roomId, host.playerId, { type: 'skip' });
    expect(room.status).toBe('transition');
    expect(manager.viewFor(room, host.playerId).fragments.map((f) => f.challengeId)).toEqual([1, 2, 3]);
    manager.command(room.roomId, host.playerId, { type: 'next' });
    expect(room.currentChallenge).toBe(4);
  });

  it('solo el facilitador, solo desde la sala de espera y con datos válidos', () => {
    const { manager, room, host, players } = squad(3);
    expect(codeOf(() => manager.command(room.roomId, host.playerId, { type: 'jump', challenge: 3 }))).toBe('wrong_phase');
    manager.command(room.roomId, host.playerId, { type: 'lobby' });
    const as = (id: string, challenge: number, seconds?: number) =>
      codeOf(() => manager.command(room.roomId, id, { type: 'jump', challenge, seconds }));
    expect(as(players[1].playerId, 3)).toBe('not_facilitator');
    for (const bad of [0, 7, 2.5, Number.NaN]) expect(as(host.playerId, bad)).toBe('invalid_command');
    for (const bad of [0, -5, TOTAL_SECONDS + 1, 1.5]) expect(as(host.playerId, 3, bad)).toBe('invalid_command');
    expect(as(host.playerId, 6)).toBeUndefined();
  });
});
