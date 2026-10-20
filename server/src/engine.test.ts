import { describe, expect, it } from 'vitest';
import { ROLES, TOTAL_SECONDS } from '@enigma/shared';
import type { ChallengeAction, FacilitatorCommand, Role } from '@enigma/shared';
import { sandboxChallenge } from './challenges/sandbox.js';
import type { ChallengeModule } from './challenges/types.js';
import { GameError, RoomManager } from './rooms.js';
import { assignRoles, beginWithRoles, joinSix } from './test-utils.js';
import type { Room } from './rooms.js';

/** Reloj manual para probar el timer sin esperar. */
function clock() {
  const c = { t: 1_000_000 };
  return { c, now: () => c.t, advance: (seconds: number) => (c.t += seconds * 1000) };
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

/** Sala con los 6 jugadores y roles en orden; el jugador 0 (navegador) es el facilitador. */
function startedRoom(manager: RoomManager) {
  const { room, host, players } = joinSix(manager);
  manager.startGame(room.roomId, host.playerId);
  beginWithRoles(manager, room, players, 0);
  const byRole = Object.fromEntries(players.map((p, i) => [ROLES[i], p])) as Record<Role, (typeof players)[number]>;
  return { room, host, players, byRole };
}

function remainingSeconds(manager: RoomManager, room: Room): number {
  return manager.viewFor(room, [...room.players.keys()][0]).timer.remainingMs / 1000;
}

function submit(code: string): ChallengeAction {
  return { kind: 'sandbox:submit', code };
}

function digitsOf(manager: RoomManager, room: Room): string {
  return [...room.players.values()]
    .sort((a, b) => ROLES.indexOf(a.role as Role) - ROLES.indexOf(b.role as Role))
    .map((p) => {
      const view = manager.viewFor(room, p.playerId).challenge?.view;
      if (!view || view.kind !== 'sandbox') throw new Error('sin vista');
      return view.digit;
    })
    .join('');
}

describe('inicio de la partida', () => {
  it('arranca el desafío 1 con el timer completo corriendo', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host } = startedRoom(manager);
    const view = manager.viewFor(room, host.playerId);
    expect(view.status).toBe('playing');
    expect(view.currentChallenge).toBe(1);
    expect(view.totalChallenges).toBe(1);
    expect(view.timer).toEqual({ remainingMs: TOTAL_SECONDS * 1000, running: true });
  });
});

describe('proyección por rol', () => {
  it('cada rol ve solo su dígito y nunca el código completo', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, players } = startedRoom(manager);
    const code = digitsOf(manager, room);
    expect(code).toMatch(/^\d{6}$/);

    for (const p of players) {
      const state = manager.viewFor(room, p.playerId);
      expect(state.challenge?.view.kind).toBe('sandbox');
      expect(JSON.stringify(state.challenge)).not.toContain(code);
    }
  });

  it('solo el facilitador recibe la solución, y solo el Hacker el orden', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host, byRole } = startedRoom(manager);
    const code = digitsOf(manager, room);

    const hostView = manager.viewFor(room, host.playerId);
    expect(hostView.facilitatorView).toEqual({ kind: 'sandbox', code, attempts: 0 });

    for (const p of Object.values(byRole)) {
      if (p.isFacilitator) continue;
      expect(manager.viewFor(room, p.playerId).facilitatorView).toBeNull();
    }

    const hacker = manager.viewFor(room, byRole.hacker.playerId).challenge?.view;
    const analista = manager.viewFor(room, byRole.analista.playerId).challenge?.view;
    expect(hacker && hacker.kind === 'sandbox' && hacker.order).toEqual([...ROLES]);
    expect(analista && analista.kind === 'sandbox' && analista.order).toBeNull();
  });

  it('los datos salen de la semilla: reiniciar el desafío mantiene el mismo código', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host } = startedRoom(manager);
    const before = digitsOf(manager, room);
    manager.command(room.roomId, host.playerId, { type: 'restart' });
    expect(digitsOf(manager, room)).toBe(before);
  });
});

describe('acciones del desafío', () => {
  it('solo el Hacker puede enviar el código', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, byRole } = startedRoom(manager);
    const code = digitsOf(manager, room);
    expect(codeOf(() => manager.applyAction(room.roomId, byRole.analista.playerId, submit(code)))).toBe('wrong_role');
    expect(room.status).toBe('playing');
  });

  it('un código incorrecto suma un intento; el correcto gana la partida', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host, byRole } = startedRoom(manager);
    const code = digitsOf(manager, room);
    const wrong = code === '000000' ? '111111' : '000000';

    expect(codeOf(() => manager.applyAction(room.roomId, byRole.hacker.playerId, submit(wrong)))).toBe('wrong_code');
    expect(manager.viewFor(room, host.playerId).facilitatorView).toMatchObject({ attempts: 1 });
    expect(codeOf(() => manager.applyAction(room.roomId, byRole.hacker.playerId, submit('12')))).toBe('invalid_action');
    expect(manager.viewFor(room, host.playerId).facilitatorView).toMatchObject({ attempts: 1 });

    manager.applyAction(room.roomId, byRole.hacker.playerId, submit(code));
    const view = manager.viewFor(room, host.playerId);
    expect(view.status).toBe('won');
    expect(view.timer.running).toBe(false);
    expect(view.challenge).toBeNull();
  });

  it('no se actúa en pausa ni con datos inválidos', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host, byRole } = startedRoom(manager);
    const code = digitsOf(manager, room);
    manager.command(room.roomId, host.playerId, { type: 'pause' });
    expect(codeOf(() => manager.applyAction(room.roomId, byRole.hacker.playerId, submit(code)))).toBe('wrong_phase');
    manager.command(room.roomId, host.playerId, { type: 'resume' });
    expect(codeOf(() => manager.applyAction(room.roomId, byRole.hacker.playerId, null as never))).toBe('invalid_action');
  });
});

describe('timer', () => {
  it('descuenta con el reloj del servidor y se frena en pausa', () => {
    const { now, advance } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host } = startedRoom(manager);

    advance(100);
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 100);

    manager.command(room.roomId, host.playerId, { type: 'pause' });
    advance(500);
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 100);
    expect(manager.viewFor(room, host.playerId).timer.running).toBe(false);

    manager.command(room.roomId, host.playerId, { type: 'resume' });
    advance(50);
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 150);
  });

  it('cuando llega a cero, el tick pierde la partida', () => {
    const { now, advance } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room } = startedRoom(manager);

    advance(TOTAL_SECONDS - 1);
    expect(manager.tick()).toHaveLength(0);
    advance(2);
    expect(manager.tick()).toEqual([room]);
    expect(room.status).toBe('lost');
    expect(manager.tick()).toHaveLength(0);
  });

  it('el facilitador suma y resta tiempo dentro de los límites', () => {
    const { now, advance } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host } = startedRoom(manager);
    advance(10);

    manager.command(room.roomId, host.playerId, { type: 'time', seconds: 60 });
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 10 + 60);
    manager.command(room.roomId, host.playerId, { type: 'time', seconds: -30 });
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 10 + 30);

    const bad = (seconds: number) =>
      codeOf(() => manager.command(room.roomId, host.playerId, { type: 'time', seconds }));
    expect(bad(0)).toBe('invalid_command');
    expect(bad(601)).toBe('invalid_command');
    expect(bad(1.5)).toBe('invalid_command');
  });

  it('un desafío puede restar tiempo como penalidad', () => {
    const { now } = clock();
    const penalty: ChallengeModule<{ n: number }> = {
      id: 1,
      name: 'Penalidad',
      briefing: sandboxChallenge.briefing,
      init: () => ({ n: 0 }),
      viewFor: () => ({ kind: 'sandbox', digit: '0', canSubmit: true, order: null, attempts: 0 }),
      facilitatorView: () => ({ kind: 'sandbox', code: '000000', attempts: 0 }),
      apply: (state) => ({ state, penaltySeconds: 60 }),
      isComplete: () => false,
    };
    const manager = new RoomManager(now, [penalty]);
    const { room, byRole } = startedRoom(manager);
    manager.applyAction(room.roomId, byRole.hacker.playerId, submit('000000'));
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 60);
  });
});

describe('comandos del facilitador', () => {
  it('solo el facilitador los puede usar', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, byRole } = startedRoom(manager);
    const cmd: FacilitatorCommand = { type: 'pause' };
    expect(codeOf(() => manager.command(room.roomId, byRole.hacker.playerId, cmd))).toBe('not_facilitator');
    expect(room.status).toBe('playing');
  });

  it('respeta las fases: no se reanuda sin pausa ni se libera sin transición', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host } = startedRoom(manager);
    const run = (command: FacilitatorCommand) => codeOf(() => manager.command(room.roomId, host.playerId, command));
    expect(run({ type: 'resume' })).toBe('wrong_phase');
    expect(run({ type: 'next' })).toBe('wrong_phase');
    expect(run({ type: 'nada' } as never)).toBe('invalid_command');
  });

  it('las pistas llegan a la sala con un id creciente y validan el largo', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host, byRole } = startedRoom(manager);
    manager.command(room.roomId, host.playerId, { type: 'hint', text: '  Hablen más despacio  ' });
    manager.command(room.roomId, host.playerId, { type: 'hint', text: 'Revisen el orden' });
    expect(manager.viewFor(room, byRole.hacker.playerId).hint).toEqual({ id: 2, text: 'Revisen el orden' });
    const bad = (text: string) => codeOf(() => manager.command(room.roomId, host.playerId, { type: 'hint', text }));
    expect(bad('   ')).toBe('invalid_command');
    expect(bad('x'.repeat(201))).toBe('invalid_command');
  });

  it('saltar un desafío lo completa y deja la partida ganada si era el último', () => {
    const { now } = clock();
    const manager = new RoomManager(now, [sandboxChallenge]);
    const { room, host } = startedRoom(manager);
    manager.command(room.roomId, host.playerId, { type: 'skip' });
    expect(room.status).toBe('won');
    expect(room.completed).toEqual([1]);
  });
});

describe('transición entre desafíos', () => {
  const two = [sandboxChallenge, { ...sandboxChallenge, id: 2, name: 'Segundo' }];

  it('al completar uno el timer se frena hasta que el facilitador libera el siguiente', () => {
    const { now, advance } = clock();
    const manager = new RoomManager(now, two);
    const { room, host, byRole } = startedRoom(manager);
    advance(100);
    manager.applyAction(room.roomId, byRole.hacker.playerId, submit(digitsOf(manager, room)));

    let view = manager.viewFor(room, host.playerId);
    expect(view.status).toBe('transition');
    expect(view.challenge).toBeNull();
    expect(view.timer).toEqual({ remainingMs: (TOTAL_SECONDS - 100) * 1000, running: false });

    advance(300);
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 100);

    // Después de la transición viene el briefing del desafío 2, con el timer todavía frenado.
    manager.command(room.roomId, host.playerId, { type: 'next' });
    view = manager.viewFor(room, host.playerId);
    expect(view.status).toBe('briefing');
    expect(view.currentChallenge).toBe(2);
    expect(view.briefing?.name).toBe('Segundo');
    expect(view.timer).toEqual({ remainingMs: (TOTAL_SECONDS - 100) * 1000, running: false });
    advance(60);
    expect(remainingSeconds(manager, room)).toBe(TOTAL_SECONDS - 100);

    beginWithRoles(manager, room, [...room.players.values()], 1);
    view = manager.viewFor(room, host.playerId);
    expect(view.status).toBe('playing');
    expect(view.challenge?.name).toBe('Segundo');
    expect(view.timer.running).toBe(true);
  });

  it('cada desafío arranca con datos propios y al terminar el último se gana', () => {
    const { now } = clock();
    const manager = new RoomManager(now, two);
    const { room, host, byRole } = startedRoom(manager);
    const first = digitsOf(manager, room);
    manager.applyAction(room.roomId, byRole.hacker.playerId, submit(first));
    manager.command(room.roomId, host.playerId, { type: 'next' });
    beginWithRoles(manager, room, [...room.players.values()], 1);
    const second = digitsOf(manager, room);
    expect(second).toMatch(/^\d{6}$/);
    const hackerNow = [...room.players.values()].find((p) => p.role === 'hacker')!;
    manager.applyAction(room.roomId, hackerNow.playerId, submit(second));
    expect(room.status).toBe('won');
  });

  it('exige que los desafíos estén numerados en orden', () => {
    expect(() => new RoomManager(Date.now, [{ ...sandboxChallenge, id: 2 }])).toThrow();
  });
});
