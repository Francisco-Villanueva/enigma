import { describe, expect, it } from 'vitest';
import { ROLES } from '@enigma/shared';
import type { Role } from '@enigma/shared';
import { sandboxChallenge } from './challenges/sandbox.js';
import { GameError, RoomManager } from './rooms.js';
import { completeAssignment } from './roles.js';
import { assignRoles, beginWithRoles, joinSix, roleMap } from './test-utils.js';

const six = Array.from({ length: 6 }, (_, i) => ({ ...sandboxChallenge, id: i + 1, name: `Desafío ${i + 1}` }));

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) return err.code;
    throw err;
  }
  return undefined;
}

/** Sala en el briefing del desafío `target`, tras haber jugado los anteriores con roles rotados. */
function roomAtBriefing(target: number, registry = six) {
  const manager = new RoomManager(() => 1_000_000, registry);
  const { room, host, players } = joinSix(manager);
  manager.startGame(room.roomId, host.playerId);
  for (let round = 1; round < target; round++) {
    beginWithRoles(manager, room, players, round - 1);
    manager.command(room.roomId, host.playerId, { type: 'skip' });
    manager.command(room.roomId, host.playerId, { type: 'next' });
  }
  expect(room.status).toBe('briefing');
  expect(room.currentChallenge).toBe(target);
  return { manager, room, host, players };
}

describe('reparto de roles (emparejamiento)', () => {
  const all = [...ROLES];

  it('reparte cuando se puede y respeta lo ya elegido', () => {
    const seats = all.map((_, i) => ({ allowed: all, picked: i === 0 ? ('hacker' as Role) : null }));
    const result = completeAssignment(seats)!;
    expect(result[0]).toBe('hacker');
    expect(new Set(result).size).toBe(6);
  });

  it('devuelve null si a alguien no le queda ningún rol', () => {
    const seats = [
      { allowed: ['hacker'] as Role[], picked: null },
      { allowed: ['hacker'] as Role[], picked: null },
    ];
    expect(completeAssignment(seats)).toBeNull();
  });

  it('con azar, siempre produce asignaciones válidas', () => {
    const seats = all.map((_, i) => ({ allowed: [all[i], all[(i + 1) % 6]] as Role[], picked: null }));
    const seen = new Set<string>();
    for (let n = 0; n < 50; n++) {
      const result = completeAssignment(seats, Math.random)!;
      expect(new Set(result).size).toBe(6);
      result.forEach((role, i) => expect(seats[i].allowed).toContain(role));
      seen.add(result.join());
    }
    expect(seen.size).toBe(2); // las dos únicas formas de repartir en un ciclo
  });
});

describe('briefing', () => {
  it('muestra la descripción del desafío y no hay desafío activo todavía', () => {
    const { manager, room, host } = roomAtBriefing(1);
    const view = manager.viewFor(room, host.playerId);
    expect(view.status).toBe('briefing');
    expect(view.challenge).toBeNull();
    expect(view.facilitatorView).toBeNull();
    expect(view.briefing).toMatchObject({ challengeId: 1, name: 'Desafío 1' });
    expect(view.briefing?.story.length).toBeGreaterThan(0);
    expect(view.briefing?.objective.length).toBeGreaterThan(0);
    expect(Object.keys(view.briefing?.roles ?? {}).sort()).toEqual([...ROLES].sort());
    expect(view.timer.running).toBe(false);
  });

  it('el desafío no empieza hasta que todos tienen rol, y solo lo empieza el facilitador', () => {
    const { manager, room, host, players } = roomAtBriefing(1);
    const begin = (id: string) => codeOf(() => manager.command(room.roomId, id, { type: 'begin' }));
    expect(begin(host.playerId)).toBe('not_ready');
    players.slice(0, 5).forEach((p, i) => manager.pickRole(room.roomId, p.playerId, ROLES[i]));
    expect(begin(host.playerId)).toBe('not_ready');
    manager.pickRole(room.roomId, players[5].playerId, ROLES[5]);
    expect(begin(players[1].playerId)).toBe('not_facilitator');
    expect(begin(host.playerId)).toBeUndefined();
    expect(room.status).toBe('playing');
    expect(manager.viewFor(room, host.playerId).timer.running).toBe(true);
    expect(manager.viewFor(room, host.playerId).you.usedRoles).toEqual(['navegador']);
  });

  it('un rol ya jugado no se puede volver a elegir; los roles se liberan entre desafíos', () => {
    const { manager, room, players } = roomAtBriefing(2);
    // En el desafío 1 el jugador i tuvo ROLES[i].
    expect(players.every((p) => p.role === null)).toBe(true);
    expect(codeOf(() => manager.pickRole(room.roomId, players[0].playerId, 'navegador'))).toBe('role_used');
    expect(codeOf(() => manager.pickRole(room.roomId, players[3].playerId, 'estratega'))).toBe('role_used');
    manager.pickRole(room.roomId, players[0].playerId, 'analista');
    expect(players[0].role).toBe('analista');
    expect(manager.viewFor(room, players[2].playerId).players[0].usedRoles).toEqual(['navegador']);
  });

  it('no deja elegir un rol que le quitaría la única opción a otra persona', () => {
    // Tras 4 desafíos, cada jugador i solo puede elegir ROLES[i+4] o ROLES[i+5].
    const { manager, room, players } = roomAtBriefing(5);
    manager.pickRole(room.roomId, players[0].playerId, ROLES[4]);
    expect(codeOf(() => manager.pickRole(room.roomId, players[1].playerId, ROLES[0]))).toBe('role_unavailable');
    expect(players[1].role).toBeNull();
    // La opción compatible sí se permite.
    manager.pickRole(room.roomId, players[1].playerId, ROLES[5]);
    expect(players[1].role).toBe('hacker');
  });

  it('soltar un rol siempre se puede', () => {
    const { manager, room, players } = roomAtBriefing(5);
    manager.pickRole(room.roomId, players[0].playerId, ROLES[4]);
    manager.pickRole(room.roomId, players[0].playerId, null);
    expect(players[0].role).toBeNull();
  });

  it('el facilitador puede repartir al azar lo que falta, respetando los roles usados', () => {
    const { manager, room, host, players } = roomAtBriefing(4);
    manager.pickRole(room.roomId, players[2].playerId, 'hacker');
    expect(codeOf(() => manager.command(room.roomId, players[1].playerId, { type: 'autoassign' }))).toBe('not_facilitator');
    manager.command(room.roomId, host.playerId, { type: 'autoassign' });
    const roles = players.map((p) => p.role as Role);
    expect(new Set(roles).size).toBe(6);
    expect(players[2].role).toBe('hacker');
    players.forEach((p) => expect(p.usedRoles).not.toContain(p.role));
    manager.command(room.roomId, host.playerId, { type: 'begin' });
    expect(room.status).toBe('playing');
  });

  it('los comandos de juego no valen durante el briefing, pero las pistas sí', () => {
    const { manager, room, host } = roomAtBriefing(1);
    const run = (command: Parameters<RoomManager['command']>[2]) =>
      codeOf(() => manager.command(room.roomId, host.playerId, command));
    expect(run({ type: 'pause' })).toBe('wrong_phase');
    expect(run({ type: 'skip' })).toBe('wrong_phase');
    expect(run({ type: 'next' })).toBe('wrong_phase');
    expect(run({ type: 'hint', text: 'Elijan con calma' })).toBeUndefined();
    expect(manager.viewFor(room, host.playerId).hint?.text).toBe('Elijan con calma');
  });

  it('tras completar un desafío vuelve el briefing del siguiente y todos pierden su rol anterior', () => {
    const { manager, room, host, players } = roomAtBriefing(1);
    beginWithRoles(manager, room, players, 0);
    manager.command(room.roomId, host.playerId, { type: 'skip' });
    expect(room.status).toBe('transition');
    expect(players.every((p) => p.role !== null)).toBe(true); // se conserva hasta el próximo briefing
    manager.command(room.roomId, host.playerId, { type: 'next' });
    expect(room.status).toBe('briefing');
    expect(players.every((p) => p.role === null)).toBe(true);
    expect(manager.viewFor(room, host.playerId).briefing?.challengeId).toBe(2);
  });

  it('exige que haya como máximo tantos desafíos como roles', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...sandboxChallenge, id: i + 1 }));
    expect(() => new RoomManager(Date.now, seven)).toThrow();
  });
});

describe('rotación completa', () => {
  it('con 6 desafíos, todos pasan por los 6 roles (reparto al azar en cada briefing)', () => {
    const manager = new RoomManager(() => 1_000_000, six);
    const { room, host, players } = joinSix(manager);
    manager.startGame(room.roomId, host.playerId);
    for (let round = 1; round <= 6; round++) {
      manager.command(room.roomId, host.playerId, { type: 'autoassign' });
      expect(new Set(players.map((p) => p.role)).size).toBe(6);
      manager.command(room.roomId, host.playerId, { type: 'begin' });
      manager.command(room.roomId, host.playerId, { type: 'skip' });
      if (round < 6) manager.command(room.roomId, host.playerId, { type: 'next' });
    }
    expect(room.status).toBe('won');
    for (const p of players) expect([...p.usedRoles].sort()).toEqual([...ROLES].sort());
  });

  it('aunque cada persona elija a su gusto, nadie se queda sin rol nuevo (nunca se traba)', () => {
    for (let trial = 0; trial < 30; trial++) {
      const manager = new RoomManager(() => 1_000_000, six);
      const { room, host, players } = joinSix(manager);
      manager.startGame(room.roomId, host.playerId);
      for (let round = 1; round <= 6; round++) {
        // Cada uno prueba roles al azar; el servidor rechaza los que dejarían a alguien sin opción.
        let guard = 0;
        while (players.some((p) => p.role === null)) {
          const p = players.filter((x) => x.role === null)[Math.floor(Math.random() * players.filter((x) => x.role === null).length)];
          const role = ROLES[Math.floor(Math.random() * ROLES.length)];
          try {
            manager.pickRole(room.roomId, p.playerId, role);
          } catch (err) {
            if (!(err instanceof GameError)) throw err;
          }
          // Invariante: siempre se puede terminar de repartir.
          const seats = players.map((x) => ({
            allowed: ROLES.filter((r) => !x.usedRoles.includes(r)),
            picked: x.role,
          }));
          expect(completeAssignment(seats)).not.toBeNull();
          expect(++guard).toBeLessThan(2000);
        }
        manager.command(room.roomId, host.playerId, { type: 'begin' });
        manager.command(room.roomId, host.playerId, { type: 'skip' });
        if (round < 6) manager.command(room.roomId, host.playerId, { type: 'next' });
      }
      for (const p of players) expect(new Set(p.usedRoles).size).toBe(6);
    }
  });

  it('los helpers de prueba reparten como se espera', () => {
    const manager = new RoomManager(() => 1_000_000, six);
    const { room, host, players } = joinSix(manager);
    manager.startGame(room.roomId, host.playerId);
    assignRoles(manager, room, players, 2);
    expect(roleMap(room).criptografo).toBe(players[0].playerId);
  });
});

describe('volver a jugar', () => {
  const finished = (finalStatus: 'won' | 'lost') => {
    let now = 1_000_000;
    const manager = new RoomManager(() => now, six.slice(0, 2));
    const { room, host, players } = joinSix(manager);
    manager.startGame(room.roomId, host.playerId);
    beginWithRoles(manager, room, players, 0);
    manager.command(room.roomId, host.playerId, { type: 'skip' });
    manager.command(room.roomId, host.playerId, { type: 'next' });
    beginWithRoles(manager, room, players, 1);
    if (finalStatus === 'won') {
      manager.command(room.roomId, host.playerId, { type: 'skip' });
    } else {
      now += 4_000_000;
      manager.tick();
    }
    return { manager, room, host, players };
  };

  it.each(['won', 'lost'] as const)('tras %s, el facilitador reinicia: briefing 1, reloj entero, roles libres', (end) => {
    const { manager, room, host, players } = finished(end);
    expect(room.status).toBe(end);
    const oldSeed = room.seed;
    manager.command(room.roomId, host.playerId, { type: 'replay' });
    expect(room.status).toBe('briefing');
    expect(room.currentChallenge).toBe(1);
    expect(room.timer.remainingMs).toBe(3000 * 1000);
    expect(room.timer.runningSince).toBeNull();
    expect(room.seed).not.toBe(oldSeed);
    for (const p of room.players.values()) {
      expect(p.role).toBeNull();
      expect(p.usedRoles).toEqual([]);
    }
    // Vuelven a poder elegir cualquier rol, también los ya jugados.
    beginWithRoles(manager, room, players, 0);
    expect(room.status).toBe('playing');
  });

  it('solo el facilitador, y solo con la misión terminada', () => {
    const { manager, room, players } = finished('won');
    expect(codeOf(() => manager.command(room.roomId, players[1].playerId, { type: 'replay' }))).toBe('not_facilitator');
    manager.command(room.roomId, players[0].playerId, { type: 'replay' });
    expect(codeOf(() => manager.command(room.roomId, players[0].playerId, { type: 'replay' }))).toBe('wrong_phase');
  });
});
