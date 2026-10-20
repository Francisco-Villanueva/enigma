import { describe, expect, it } from 'vitest';
import {
  CORE_FAULT_THRESHOLD,
  CORE_CONFIRM_PENALTY_SECONDS,
  CORE_ORDER_PENALTY_SECONDS,
  CORE_OVERLOAD_PENALTY_SECONDS,
  CORE_VALUE_PENALTY_SECONDS,
  ROLES,
  TOTAL_SECONDS,
} from '@enigma/shared';
import type { ChallengeAction, Role } from '@enigma/shared';
import { GameError, RoomManager } from '../rooms.js';
import { beginWithRoles } from '../test-utils.js';
import { powerCoreChallenge } from './power-core.js';
import type { PowerCoreState } from './power-core.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

function facilitator(state: PowerCoreState) {
  const view = powerCoreChallenge.facilitatorView(state);
  if (view.kind !== 'core') throw new Error('vista inesperada');
  return view;
}

const set = (state: PowerCoreState, reactor: number, value: number, role: Role = 'ingeniero') =>
  powerCoreChallenge.apply(state, role, { kind: 'core:set', reactor, value });

const confirm = (state: PowerCoreState, code: string, role: Role = 'hacker') =>
  powerCoreChallenge.apply(state, role, { kind: 'core:confirm', code });

const share = (state: PowerCoreState, reactor: number, role: Role = 'analista') =>
  powerCoreChallenge.apply(state, role, { kind: 'core:share', reactor });

/** El Ingeniero fija el reactor y el Hacker lo confirma con el código que el Ingeniero le dicta. */
function fixAndConfirm(state: PowerCoreState, id: number, value: number): PowerCoreState {
  const fixed = set(state, id, value);
  expect(fixed.error).toBeUndefined();
  const code = state.confirmCodes[id];
  const confirmed = confirm(fixed.state, code);
  expect(confirmed.error).toBeUndefined();
  return confirmed.state;
}

const seal = (state: PowerCoreState, role: Role = 'hacker') =>
  powerCoreChallenge.apply(state, role, { kind: 'core:seal' });

/** Calibra los 6 reactores sanos como lo haría un equipo que sabe todo. */
function solve(state: PowerCoreState): PowerCoreState {
  const view = facilitator(state);
  let current = state;
  for (const id of view.sequence) {
    const target = view.reactors.find((r) => r.id === id)?.target ?? -1;
    current = fixAndConfirm(current, id, target);
  }
  return current;
}

function healthyIds(state: PowerCoreState): number[] {
  return state.reactors.filter((r) => !r.critical).map((r) => r.id);
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

describe('generación con semilla', () => {
  it('la misma semilla da siempre los mismos datos', () => {
    expect(powerCoreChallenge.init(12345)).toEqual(powerCoreChallenge.init(12345));
  });

  it('semillas distintas dan partidas distintas', () => {
    const distinct = new Set(SEEDS.map((s) => JSON.stringify(powerCoreChallenge.init(s))));
    expect(distinct.size).toBeGreaterThan(150);
  });

  it('siempre hay 4 reactores críticos y 6 sanos', () => {
    for (const seed of SEEDS) {
      const state = powerCoreChallenge.init(seed);
      expect(state.reactors).toHaveLength(10);
      expect(state.reactors.filter((r) => r.critical)).toHaveLength(4);
      expect(healthyIds(state)).toHaveLength(6);
    }
  });

  it('el mapa tiene entre 12 y 14 conexiones, todo conectado, con varias hacia críticos', () => {
    for (const seed of SEEDS) {
      const state = powerCoreChallenge.init(seed);
      expect(state.links.length).toBeGreaterThanOrEqual(12);
      expect(state.links.length).toBeLessThanOrEqual(14);
      for (const [a, b] of state.links) expect(a).toBeLessThan(b);
      expect(new Set(state.links.map(([a, b]) => `${a}-${b}`)).size).toBe(state.links.length);
      const seen = new Set([1]);
      for (let i = 0; i < 10; i++) {
        for (const [a, b] of state.links) {
          if (seen.has(a)) seen.add(b);
          if (seen.has(b)) seen.add(a);
        }
      }
      expect(seen.size).toBe(10);
      const crit = new Set(state.reactors.filter((r) => r.critical).map((r) => r.id));
      expect(state.links.filter(([a, b]) => crit.has(a) !== crit.has(b)).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('un reactor es crítico exactamente cuando su temperatura supera a su presión por más de 40', () => {
    for (const seed of SEEDS) {
      const state = powerCoreChallenge.init(seed);
      for (const r of state.reactors) {
        expect(r.temperature - r.pressure > CORE_FAULT_THRESHOLD).toBe(r.critical);
        expect(r.temperature).toBeGreaterThanOrEqual(200);
        expect(r.temperature).toBeLessThanOrEqual(800);
        expect(r.pressure).toBeGreaterThan(0);
      }
    }
  });

  it('cada potencia sale de 10 + 10 × conexiones con sanos + bono por temperatura; los críticos van en 0', () => {
    const bonus = (t: number) => (t >= 600 ? 20 : t >= 350 ? 10 : 0);
    const seenTargets = new Set<number>();
    for (const seed of SEEDS) {
      const state = powerCoreChallenge.init(seed);
      const crit = new Set(state.reactors.filter((r) => r.critical).map((r) => r.id));
      for (const r of state.reactors) {
        if (r.critical) {
          expect(r.target).toBe(0);
          continue;
        }
        const connections = state.links.filter(
          ([a, b]) => (a === r.id && !crit.has(b)) || (b === r.id && !crit.has(a)),
        ).length;
        expect(connections).toBeGreaterThanOrEqual(1);
        expect(connections).toBeLessThanOrEqual(5);
        expect(r.target).toBe(10 + 10 * connections + bonus(r.temperature));
        expect(r.target).toBeLessThanOrEqual(100);
        expect(r.target % 10).toBe(0);
        seenTargets.add(r.target);
      }
    }
    expect(seenTargets.size).toBeGreaterThanOrEqual(5);
  });

  it('contar las conexiones sin saber quién falló da mal en varios sanos (el Analista hace falta)', () => {
    for (const seed of SEEDS) {
      const state = powerCoreChallenge.init(seed);
      const crit = new Set(state.reactors.filter((r) => r.critical).map((r) => r.id));
      const affected = state.reactors.filter(
        (r) => !r.critical && state.links.some(([a, b]) => (a === r.id && crit.has(b)) || (b === r.id && crit.has(a))),
      );
      expect(affected.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('la secuencia es una permutación de los sanos', () => {
    for (const seed of SEEDS) {
      const state = powerCoreChallenge.init(seed);
      expect([...state.sequence].sort((x, y) => x - y)).toEqual(healthyIds(state));
    }
  });

  it('los 10 reactores ocupan lugares distintos del diagrama', () => {
    for (const seed of SEEDS) {
      const view = powerCoreChallenge.viewFor(powerCoreChallenge.init(seed), 'navegador');
      if (view.kind !== 'core' || view.role !== 'navegador') throw new Error('vista inesperada');
      expect(new Set(view.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(10);
    }
  });
});

describe('qué ve cada rol', () => {
  const state = powerCoreChallenge.init(2024);
  const views = Object.fromEntries(ROLES.map((role) => [role, powerCoreChallenge.viewFor(state, role)])) as Record<
    Role,
    ReturnType<typeof powerCoreChallenge.viewFor>
  >;

  it('ningún rol recibe las potencias correctas', () => {
    for (const role of ROLES) expect(JSON.stringify(views[role])).not.toContain('target');
  });

  it('solo el Analista recibe temperatura y presión, y ni él recibe quién es crítico', () => {
    const view = views.analista;
    if (view.kind !== 'core' || view.role !== 'analista') throw new Error('vista inesperada');
    expect(view.reactors).toHaveLength(10);
    expect(view.threshold).toBe(CORE_FAULT_THRESHOLD);
    for (const role of ROLES) expect(JSON.stringify(views[role])).not.toContain('critical');
    for (const role of ROLES.filter((r) => r !== 'analista')) {
      expect(JSON.stringify(views[role])).not.toContain('temperature');
      expect(JSON.stringify(views[role])).not.toContain('pressure');
    }
  });

  it('con las lecturas y la regla, el Analista identifica exactamente a los críticos', () => {
    const view = views.analista;
    if (view.kind !== 'core' || view.role !== 'analista') throw new Error('vista inesperada');
    const deduced = view.reactors.filter((r) => r.temperature - r.pressure > view.threshold).map((r) => r.id);
    expect(deduced.sort((x, y) => x - y)).toEqual(
      state.reactors.filter((r) => r.critical).map((r) => r.id),
    );
  });

  it('el Navegador ve los 10 reactores y todas las conexiones, sin saber cuáles son críticos', () => {
    const view = views.navegador;
    if (view.kind !== 'core' || view.role !== 'navegador') throw new Error('vista inesperada');
    expect(view.nodes.map((n) => n.reactor).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(view.links).toEqual(state.links);
  });

  it('el Estratega ve la secuencia de los 10 reactores, con los críticos mezclados, y nadie más la ve', () => {
    const view = views.estratega;
    if (view.kind !== 'core' || view.role !== 'estratega') throw new Error('vista inesperada');
    expect([...view.sequence].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Sin los críticos queda exactamente el orden real de calibración.
    const critical = new Set(state.reactors.filter((r) => r.critical).map((r) => r.id));
    expect(view.sequence.filter((id) => !critical.has(id))).toEqual(state.sequence);
    expect(view.marked).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('critical');
    for (const role of ROLES.filter((r) => r !== 'estratega')) {
      expect(JSON.stringify(views[role])).not.toContain('sequence');
    }
  });

  it('el Criptógrafo recibe la fórmula, igual para todas las partidas', () => {
    const other = powerCoreChallenge.viewFor(powerCoreChallenge.init(99), 'criptografo');
    expect(views.criptografo).toEqual(other);
    if (views.criptografo.kind !== 'core' || views.criptografo.role !== 'criptografo') throw new Error('vista inesperada');
    expect(views.criptografo).toMatchObject({ base: 10, perConnection: 10 });
    expect(views.criptografo.bands.map((b) => b.bonus)).toEqual([0, 10, 20]);
  });

  it('el código de confirmación solo aparece para el Hacker, y solo con todo alineado', () => {
    const before = views.hacker;
    if (before.kind !== 'core' || before.role !== 'hacker') throw new Error('vista inesperada');
    expect(before).toMatchObject({ aligned: false, confirmationCode: null, done: 0, total: 6 });

    const solved = solve(state);
    const after = powerCoreChallenge.viewFor(solved, 'hacker');
    if (after.kind !== 'core' || after.role !== 'hacker') throw new Error('vista inesperada');
    expect(after.aligned).toBe(true);
    expect(after.confirmationCode).toBe(state.confirmationCode);
    for (const role of ROLES.filter((r) => r !== 'hacker')) {
      expect(JSON.stringify(powerCoreChallenge.viewFor(solved, role))).not.toContain(state.confirmationCode);
    }
  });
});

describe('reglas del Ingeniero', () => {
  it('calibrar en el orden y con la potencia correcta avanza sin penalidad', () => {
    let state = powerCoreChallenge.init(7);
    const view = facilitator(state);
    for (const [index, id] of view.sequence.entries()) {
      const target = view.reactors.find((r) => r.id === id)?.target ?? -1;
      const result = set(state, id, target);
      expect(result.error).toBeUndefined();
      expect(result.penaltySeconds ?? 0).toBe(0);
      // Fijado, pero todavía no calibrado: falta el Hacker.
      expect(result.state.pending).toEqual({ reactor: id, value: target });
      expect(result.state.done).toBe(index);
      state = confirm(result.state, state.confirmCodes[id]).state;
      expect(state.done).toBe(index + 1);
      expect(state.reactors.find((r) => r.id === id)).toMatchObject({ locked: true, level: target });
    }
    expect(state.mistakes).toBe(0);
  });

  it('un reactor fuera de turno cuesta tiempo y no avanza', () => {
    const state = powerCoreChallenge.init(7);
    const wrongOne = state.sequence[1];
    const target = state.reactors.find((r) => r.id === wrongOne)?.target ?? 0;
    const result = set(state, wrongOne, target);
    expect(result.error?.code).toBe('sequence_error');
    expect(result.penaltySeconds).toBe(CORE_ORDER_PENALTY_SECONDS);
    expect(result.state.done).toBe(0);
    expect(result.state.mistakes).toBe(1);
  });

  it('el reactor correcto con otra potencia cuesta tiempo y no se fija', () => {
    const state = powerCoreChallenge.init(7);
    const id = state.sequence[0];
    const target = state.reactors.find((r) => r.id === id)?.target ?? 0;
    const result = set(state, id, target === 100 ? 90 : target + 10);
    expect(result.error?.code).toBe('wrong_value');
    expect(result.penaltySeconds).toBe(CORE_VALUE_PENALTY_SECONDS);
    expect(result.state.reactors.find((r) => r.id === id)?.locked).toBe(false);
  });

  it('subir un reactor crítico es una sobrecarga; dejarlo en 0% no pasa nada', () => {
    const state = powerCoreChallenge.init(7);
    const critical = state.reactors.find((r) => r.critical);
    if (!critical) throw new Error('sin críticos');

    const safe = set(state, critical.id, 0);
    expect(safe.error).toBeUndefined();
    expect(safe.penaltySeconds ?? 0).toBe(0);
    expect(safe.state.mistakes).toBe(0);

    const overload = set(state, critical.id, 50);
    expect(overload.error?.code).toBe('overload');
    expect(overload.penaltySeconds).toBe(CORE_OVERLOAD_PENALTY_SECONDS);
    expect(overload.state.reactors.find((r) => r.id === critical.id)?.level).toBe(0);
  });

  it('rechaza datos inválidos sin penalizar', () => {
    const state = powerCoreChallenge.init(7);
    const id = state.sequence[0];
    for (const [reactor, value] of [
      [id, 5],
      [id, 110],
      [id, -10],
      [id, 2.5],
      [99, 40],
      [1.5, 40],
    ] as const) {
      const result = set(state, reactor, value);
      expect(result.error?.code).toBe('invalid_action');
      expect(result.penaltySeconds ?? 0).toBe(0);
    }
  });

  it('un reactor ya calibrado no se vuelve a tocar', () => {
    let state = powerCoreChallenge.init(7);
    const id = state.sequence[0];
    state = set(state, id, state.reactors.find((r) => r.id === id)?.target ?? 0).state;
    const again = set(state, id, 0);
    expect(again.error?.code).toBe('invalid_action');
    expect(again.penaltySeconds ?? 0).toBe(0);
  });

  it('solo el Ingeniero mueve reactores', () => {
    const state = powerCoreChallenge.init(7);
    const id = state.sequence[0];
    const target = state.reactors.find((r) => r.id === id)?.target ?? 0;
    for (const role of ROLES.filter((r) => r !== 'ingeniero')) {
      const result = set(state, id, target, role);
      expect(result.error?.code).toBe('wrong_role');
      expect(result.state.done).toBe(0);
    }
  });

  it('no modifica el estado que recibe', () => {
    const state = powerCoreChallenge.init(7);
    const snapshot = structuredClone(state);
    set(state, state.sequence[0], state.reactors.find((r) => r.id === state.sequence[0])?.target ?? 0);
    set(state, state.sequence[1], 40);
    expect(state).toEqual(snapshot);
  });
});

describe('inyección final del Hacker', () => {
  it('no se puede sellar hasta calibrar los 6 reactores', () => {
    const state = powerCoreChallenge.init(7);
    const early = seal(state);
    expect(early.error?.code).toBe('sequence_error');
    expect(powerCoreChallenge.isComplete(early.state)).toBe(false);

    const half = set(state, state.sequence[0], state.reactors.find((r) => r.id === state.sequence[0])?.target ?? 0).state;
    expect(seal(half).error?.code).toBe('sequence_error');
  });

  it('solo el Hacker puede sellar', () => {
    const solved = solve(powerCoreChallenge.init(7));
    for (const role of ROLES.filter((r) => r !== 'hacker')) {
      expect(seal(solved, role).error?.code).toBe('wrong_role');
    }
  });

  it('con todo alineado, el Hacker sella y el desafío se completa', () => {
    const solved = solve(powerCoreChallenge.init(7));
    expect(powerCoreChallenge.isComplete(solved)).toBe(false);
    const sealed = seal(solved);
    expect(sealed.error).toBeUndefined();
    expect(powerCoreChallenge.isComplete(sealed.state)).toBe(true);
  });

  it('las acciones de otro desafío se rechazan', () => {
    const state = powerCoreChallenge.init(7);
    const foreign = { kind: 'sandbox:submit', code: '123456' } as ChallengeAction;
    expect(powerCoreChallenge.apply(state, 'hacker', foreign).error?.code).toBe('invalid_action');
  });
});

describe('dentro del motor de juego', () => {
  function startedRoom(now: () => number) {
    const manager = new RoomManager(now, [powerCoreChallenge]);
    const { room, player: host } = manager.createRoom('Nico');
    const players = [host];
    for (const name of ['Sofia', 'Mateo', 'Lucia', 'Fran', 'Valen']) {
      players.push(manager.joinRoom(room.roomId, name).player);
    }
    manager.startGame(room.roomId, host.playerId);
    beginWithRoles(manager, room, players, 0);
    const byRole = Object.fromEntries(players.map((p, i) => [ROLES[i], p])) as Record<Role, (typeof players)[number]>;
    const solution = () => {
      const view = manager.viewFor(room, host.playerId).facilitatorView;
      if (!view || view.kind !== 'core') throw new Error('sin solución');
      return view;
    };
    return { manager, room, byRole, solution };
  }

  const remaining = (manager: RoomManager, room: ReturnType<typeof startedRoom>['room'], playerId: string) =>
    manager.viewFor(room, playerId).timer.remainingMs / 1000;

  it('un error del Ingeniero descuenta tiempo del timer de la sala', () => {
    const { manager, room, byRole, solution } = startedRoom(() => 1_000_000);
    const view = solution();
    const wrongOrder = view.sequence[1];
    const target = view.reactors.find((r) => r.id === wrongOrder)?.target ?? 0;

    const code = codeOf(() =>
      manager.applyAction(room.roomId, byRole.ingeniero.playerId, { kind: 'core:set', reactor: wrongOrder, value: target }),
    );
    expect(code).toBe('sequence_error');
    expect(remaining(manager, room, byRole.ingeniero.playerId)).toBe(TOTAL_SECONDS - CORE_ORDER_PENALTY_SECONDS);
    expect(solution().mistakes).toBe(1);
  });

  it('un equipo que acierta todo gana la partida', () => {
    const { manager, room, byRole, solution } = startedRoom(() => 1_000_000);
    for (const id of solution().sequence) {
      const target = solution().reactors.find((r) => r.id === id)?.target ?? 0;
      manager.applyAction(room.roomId, byRole.ingeniero.playerId, { kind: 'core:set', reactor: id, value: target });
      const pending = manager.viewFor(room, byRole.ingeniero.playerId).challenge?.view;
      if (pending?.kind !== 'core' || pending.role !== 'ingeniero' || !pending.pending) throw new Error('sin pendiente');
      manager.applyAction(room.roomId, byRole.hacker.playerId, { kind: 'core:confirm', code: pending.pending.code });
    }
    const hackerView = manager.viewFor(room, byRole.hacker.playerId).challenge?.view;
    expect(hackerView).toMatchObject({ role: 'hacker', aligned: true });
    expect(room.status).toBe('playing');

    manager.applyAction(room.roomId, byRole.hacker.playerId, { kind: 'core:seal' });
    expect(room.status).toBe('won');
    expect(remaining(manager, room, byRole.hacker.playerId)).toBe(TOTAL_SECONDS);
  });

  it('las penalidades pueden agotar el tiempo y perder la partida', () => {
    const { manager, room, byRole, solution } = startedRoom(() => 1_000_000);
    const critical = solution().reactors.find((r) => r.critical)?.id ?? 1;
    // 100 sobrecargas de 30 s superan los 3000 s de la partida.
    for (let i = 0; i < 100 && room.status === 'playing'; i++) {
      codeOf(() =>
        manager.applyAction(room.roomId, byRole.ingeniero.playerId, { kind: 'core:set', reactor: critical, value: 100 }),
      );
    }
    expect(room.status).toBe('lost');
  });
});

describe('el Estratega tacha reactores', () => {
  const state = powerCoreChallenge.init(31);
  const mark = (s: PowerCoreState, reactor: number, role: Role = 'estratega') =>
    powerCoreChallenge.apply(s, role, { kind: 'core:mark', reactor });
  const view = (s: PowerCoreState) => {
    const v = powerCoreChallenge.viewFor(s, 'estratega');
    if (v.kind !== 'core' || v.role !== 'estratega') throw new Error('vista inesperada');
    return v;
  };

  it('marca y desmarca, y la marca se ve en su vista sin costo de tiempo', () => {
    const r1 = mark(state, 4);
    expect(r1.error).toBeUndefined();
    expect(r1.penaltySeconds ?? 0).toBe(0);
    expect(view(r1.state).marked).toEqual([4]);
    expect(view(mark(r1.state, 4).state).marked).toEqual([]);
  });

  it('solo el Estratega puede marcar, y solo reactores que existen', () => {
    expect(mark(state, 4, 'analista').error?.code).toBe('wrong_role');
    expect(mark(state, 4, 'ingeniero').error?.code).toBe('wrong_role');
    expect(mark(state, 11).error?.code).toBe('invalid_action');
    expect(mark(state, 1.5).error?.code).toBe('invalid_action');
  });

  it('marcar no cambia el juego: sigue valiendo el orden real aunque marque mal', () => {
    let s = mark(state, state.sequence[0]).state; // tacha un sano por error
    expect(set(s, state.sequence[0], state.reactors.find((r) => r.id === state.sequence[0])!.target).error).toBeUndefined();
  });

  it('muestra qué reactores ya se calibraron', () => {
    const solved = solve(state);
    expect([...view(solved).calibrated].sort((a, b) => a - b)).toEqual(healthyIds(state));
  });
});

describe('el Analista le envía datos al Criptógrafo', () => {
  const state = powerCoreChallenge.init(55);
  const cripto = (s: PowerCoreState) => {
    const v = powerCoreChallenge.viewFor(s, 'criptografo');
    if (v.kind !== 'core' || v.role !== 'criptografo') throw new Error('vista inesperada');
    return v;
  };

  it('al principio el Criptógrafo no recibe ninguna lectura', () => {
    expect(cripto(state).received).toEqual([]);
    expect(JSON.stringify(cripto(state))).not.toContain('"temperature"');
  });

  it('lo enviado aparece en su panel, el más reciente primero, sin duplicados', () => {
    let s = share(state, 3).state;
    s = share(s, 7).state;
    s = share(s, 3).state; // reenviar lo mueve al principio
    const received = cripto(s).received;
    expect(received.map((r) => r.reactor)).toEqual([3, 7]);
    const r3 = state.reactors[2];
    expect(received[0]).toEqual({ reactor: 3, temperature: r3.temperature, pressure: r3.pressure });
  });

  it('el Analista ve qué ya envió; solo él puede enviar; reactor inválido se rechaza', () => {
    const s = share(state, 5).state;
    const v = powerCoreChallenge.viewFor(s, 'analista');
    if (v.kind !== 'core' || v.role !== 'analista') throw new Error('vista inesperada');
    expect(v.shared).toEqual([5]);
    expect(share(state, 5, 'criptografo').error?.code).toBe('wrong_role');
    expect(share(state, 99).error?.code).toBe('invalid_action');
    expect(share(state, 2.5).error?.code).toBe('invalid_action');
  });

  it('no se filtra el resto de la información: el Criptógrafo sigue sin saber quién es crítico', () => {
    const s = share(state, 1).state;
    expect(JSON.stringify(cripto(s))).not.toContain('critical');
    expect(JSON.stringify(cripto(s))).not.toContain('threshold');
  });
});

describe('el Hacker confirma cada reactor', () => {
  const state = powerCoreChallenge.init(77);
  const first = state.sequence[0];
  const target = state.reactors.find((r) => r.id === first)!.target;
  const fixed = set(state, first, target).state;
  const ing = () => {
    const v = powerCoreChallenge.viewFor(fixed, 'ingeniero');
    if (v.kind !== 'core' || v.role !== 'ingeniero') throw new Error('vista inesperada');
    return v;
  };
  const hack = (s: PowerCoreState) => {
    const v = powerCoreChallenge.viewFor(s, 'hacker');
    if (v.kind !== 'core' || v.role !== 'hacker') throw new Error('vista inesperada');
    return v;
  };

  it('el reactor fijado queda pendiente: el Ingeniero ve el código y el Hacker no', () => {
    expect(ing().pending).toEqual({ reactor: first, value: target, code: state.confirmCodes[first] });
    expect(hack(fixed).pending).toEqual({ reactor: first, value: target });
    for (const role of ROLES.filter((r) => r !== 'ingeniero')) {
      expect(JSON.stringify(powerCoreChallenge.viewFor(fixed, role))).not.toContain(state.confirmCodes[first]);
    }
    expect(fixed.reactors.find((r) => r.id === first)?.locked).toBe(false);
    expect(fixed.done).toBe(0);
  });

  it('con el código correcto se calibra el reactor', () => {
    const res = confirm(fixed, state.confirmCodes[first]);
    expect(res.error).toBeUndefined();
    expect(res.state.pending).toBeNull();
    expect(res.state.done).toBe(1);
    expect(res.state.reactors.find((r) => r.id === first)).toMatchObject({ locked: true, level: target });
  });

  it('un código equivocado cuesta tiempo y deja el reactor pendiente', () => {
    const wrong = state.confirmCodes[first] === '0000' ? '1111' : '0000';
    const res = confirm(fixed, wrong);
    expect(res.error?.code).toBe('wrong_value');
    expect(res.penaltySeconds).toBe(CORE_CONFIRM_PENALTY_SECONDS);
    expect(res.state.pending).not.toBeNull();
    expect(res.state.done).toBe(0);
  });

  it('solo el Hacker confirma, y solo si hay algo pendiente', () => {
    expect(confirm(fixed, state.confirmCodes[first], 'ingeniero').error?.code).toBe('wrong_role');
    expect(confirm(state, '1234').error?.code).toBe('invalid_action');
    expect(confirm(state, '1234').penaltySeconds ?? 0).toBe(0);
  });

  it('mientras algo espera confirmación, el Ingeniero no puede fijar otro reactor', () => {
    const next = state.sequence[1];
    const res = set(fixed, next, state.reactors.find((r) => r.id === next)!.target);
    expect(res.error?.code).toBe('invalid_action');
    expect(res.penaltySeconds ?? 0).toBe(0);
  });

  it('no se puede sellar con un reactor pendiente de confirmar', () => {
    let s = state;
    for (const id of state.sequence.slice(0, -1)) s = fixAndConfirm(s, id, state.reactors.find((r) => r.id === id)!.target);
    const last = state.sequence[state.sequence.length - 1];
    s = set(s, last, state.reactors.find((r) => r.id === last)!.target).state;
    expect(seal(s).error?.code).toBe('sequence_error');
    s = confirm(s, state.confirmCodes[last]).state;
    expect(seal(s).error).toBeUndefined();
  });
});
