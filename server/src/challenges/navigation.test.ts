import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  HACK_LENGTH,
  NAV_FREE_PROBES,
  NAV_GRAVITY_PENALTY_SECONDS,
  NAV_HACK_PENALTY_SECONDS,
  NAV_MAX_CHARGE,
  NAV_MINE_PENALTY_SECONDS,
  NAV_PROBE_PENALTY_SECONDS,
  NAV_RECHARGE_AMOUNT,
  NAV_RECHARGE_PENALTY_SECONDS,
  ROLES,
  TOTAL_SECONDS,
} from '@enigma/shared';
import type { Direction, Role, Thruster } from '@enigma/shared';
import { RoomManager } from '../rooms.js';
import { mulberry32 } from '../rng.js';
import { describeMove, fromCell, mineClues, navigationChallenge as nav, solve, toCell } from './navigation.js';
import { beginWithRoles, roleMap } from '../test-utils.js';
import { powerCoreChallenge } from './power-core.js';
import type { NavigationState } from './navigation.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 104729 + 3);

const charge = (s: NavigationState, thruster: Thruster, amount = 1, role: Role = 'ingeniero') =>
  nav.apply(s, role, { kind: 'nav:charge', thruster, amount });
const move = (s: NavigationState, dir: Direction, role: Role = 'navegador') =>
  nav.apply(s, role, { kind: 'nav:move', dir });
const hack = (s: NavigationState, answer: number[], role: Role = 'hacker') =>
  nav.apply(s, role, { kind: 'nav:hack', answer });
const probe = (s: NavigationState, cell: string, role: Role = 'hacker') =>
  nav.apply(s, role, { kind: 'nav:probe', cell });

/** Carga lo justo para esa orden y la ejecuta; si aparece el escudo, lo desencripta. */
function step(s: NavigationState, input: Direction): NavigationState {
  const { thruster, cost } = describeMove(s, input);
  let cur = charge(s, thruster, cost).state;
  const res = move(cur, input);
  expect(res.error).toBeUndefined();
  cur = res.state;
  if (cur.shield) cur = hack(cur, cur.sequence).state;
  return cur;
}

const playSolution = (s: NavigationState) => s.solution.reduce(step, s);

/** Tablero simple y conocido: todo terreno libre, sin reglas ni minas, batería de sobra. */
function plain(overrides: Partial<NavigationState> = {}): NavigationState {
  return {
    ...nav.init(1),
    terrain: Array(GRID_SIZE * GRID_SIZE).fill('libre'),
    mines: [],
    checkpoints: ['F1', 'F5'],
    battery: 99,
    capacity: 99,
    probes: [],
    trail: [{ cell: 'A1', radar: 0 }],
    hits: [],
    flags: [],
    mineClues: [],
    ...overrides,
  };
}

describe('generación', () => {
  it('es determinista por semilla y varía entre semillas', () => {
    expect(nav.init(42)).toEqual(nav.init(42));
    const distinct = new Set(SEEDS.map((s) => JSON.stringify(nav.init(s).mines)));
    expect(distinct.size).toBeGreaterThan(150);
  });

  it('siempre hay solución, y seguirla de punta a punta gana sin errores y sin pasarse de batería', () => {
    for (const seed of SEEDS) {
      const s = nav.init(seed);
      expect(solve(s)).not.toBeNull();
      const done = playSolution(s);
      expect(nav.isComplete(done)).toBe(true);
      expect(done.mistakes).toBe(0);
      expect(toCell(done.pos)).toBe('F6');
      expect(s.capacity - done.battery).toBe(s.minEnergy); // se gastó exactamente la ruta más barata
      expect(done.battery).toBeGreaterThanOrEqual(0);
      expect(s.capacity).toBe(Math.ceil(s.minEnergy * 1.4) + 2);
    }
  });

  it('minas y checkpoints no están en el inicio, la meta ni se pisan entre sí', () => {
    for (const seed of SEEDS) {
      const s = nav.init(seed);
      const all = [...s.mines, ...s.checkpoints];
      expect(new Set(all).size).toBe(all.length);
      expect(s.mines).toHaveLength(7);
      expect(s.checkpoints).toHaveLength(2);
      expect(all).not.toContain('A1');
      expect(all).not.toContain('F6');
    }
  });

  it('el terreno mezcla los tres tipos de casilla', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const s = nav.init(seed);
      expect(s.terrain).toHaveLength(36);
      s.terrain.forEach((t) => seen.add(t));
    }
    expect([...seen].sort()).toEqual(['asteroides', 'libre', 'pozo']);
  });

  it('el resolvedor detecta tableros imposibles', () => {
    const base = { terrain: plain().terrain, checkpoints: ['C3', 'D4'] };
    // A2 y B1 son las únicas salidas de A1: bloqueadas.
    expect(solve({ ...base, mines: ['A2', 'B1'] })).toBeNull();
    expect(solve({ ...base, mines: [] })).not.toBeNull();
  });

  it('la ruta prefiere menos energía aunque sea más larga', () => {
    const terrain = plain().terrain.map((_, i) => (i === 1 ? 'pozo' : 'libre')) as NavigationState['terrain']; // B1 cuesta 3
    const withWell = solve({ terrain, mines: [], checkpoints: ['F1', 'F5'] })!;
    const flat = solve({ terrain: plain().terrain, mines: [], checkpoints: ['F1', 'F5'] })!;
    expect(withWell.cost).toBeGreaterThanOrEqual(flat.cost);
  });
});

describe('qué ve cada rol', () => {
  const s = nav.init(77);
  const json = (role: Role) => JSON.stringify(nav.viewFor(s, role));

  it('nadie recibe las coordenadas de las minas', () => {
    for (const role of ROLES) {
      expect(json(role)).not.toContain('"mines"');
      for (const mine of s.mines) expect(json(role)).not.toContain(`"${mine}"`);
    }
  });

  it('el Analista recibe los conteos por fila, columna y cuadrante, que coinciden con las minas', () => {
    const view = nav.viewFor(s, 'analista');
    if (view.kind !== 'nav' || view.role !== 'analista') throw new Error('vista inesperada');
    expect(view.rows.reduce((a, b) => a + b, 0)).toBe(7);
    expect(view.cols.reduce((a, b) => a + b, 0)).toBe(7);
    expect(Object.values(view.quadrants).reduce((a, b) => a + b, 0)).toBe(7);
    for (let y = 0; y < GRID_SIZE; y++) {
      expect(view.rows[y]).toBe(s.mines.filter((m) => fromCell(m).y === y).length);
    }
    for (let x = 0; x < GRID_SIZE; x++) {
      expect(view.cols[x]).toBe(s.mines.filter((m) => fromCell(m).x === x).length);
    }
    expect(view.quadrants.no).toBe(s.mines.filter((m) => fromCell(m).x < 3 && fromCell(m).y < 3).length);
  });

  it('los conteos del Analista no alcanzan por sí solos para ubicar todas las minas', () => {
    // Hay varias disposiciones distintas con los mismos conteos: sin radar ni consultas hay que arriesgar.
    const view = nav.viewFor(s, 'analista');
    if (view.kind !== 'nav' || view.role !== 'analista') throw new Error('vista inesperada');
    const cells = Array.from({ length: 36 }, (_, i) => toCell({ x: i % 6, y: Math.floor(i / 6) }));
    const candidateCells = cells.filter((c) => view.rows[fromCell(c).y] > 0 && view.cols[fromCell(c).x] > 0);
    expect(candidateCells.length).toBeGreaterThan(7);
  });

  it('solo el Estratega conoce los checkpoints y el terreno', () => {
    for (const role of ROLES.filter((r) => r !== 'estratega')) {
      for (const cell of s.checkpoints) expect(json(role)).not.toContain(`"${cell}"`);
      expect(json(role)).not.toContain('terrain');
    }
    expect(json('estratega')).toContain(s.checkpoints[0]);
    const view = nav.viewFor(s, 'estratega');
    if (view.kind !== 'nav' || view.role !== 'estratega') throw new Error('vista inesperada');
    expect(view.terrain).toEqual(s.terrain);
    expect(view.position).toBe('A1');
    const moved = step(plain(), 'down');
    expect(nav.viewFor(moved, 'estratega')).toMatchObject({ position: 'A2' });
  });

  it('el Navegador ve posición, radar y recorrido, nada más', () => {
    const view = nav.viewFor(s, 'navegador');
    if (view.kind !== 'nav' || view.role !== 'navegador') throw new Error('vista inesperada');
    expect(view).toMatchObject({ position: 'A1', shield: false, moves: 0, hits: [] });
    const near = ['A2', 'B1', 'B2'].filter((c) => s.mines.includes(c)).length;
    expect(view.radar).toBe(near);
    expect(view.trail).toEqual([{ cell: 'A1', radar: near }]);
  });

  it('el Criptógrafo recibe los protocolos y las pistas de minas, y solo él', () => {
    const view = nav.viewFor(s, 'criptografo');
    if (view.kind !== 'nav' || view.role !== 'criptografo') throw new Error('vista inesperada');
    expect(view.rules.length).toBeGreaterThanOrEqual(4);
    expect(view.mineClues.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(view)).not.toContain('sector');
    for (const role of ROLES.filter((r) => r !== 'criptografo')) expect(json(role)).not.toContain('Gravedad:');
  });

  it('el Ingeniero ve batería y cargas; el Hacker, consultas y secuencia solo con escudo', () => {
    expect(nav.viewFor(s, 'ingeniero')).toMatchObject({
      charges: { linear: 0, lateral: 0 },
      battery: s.capacity,
      capacity: s.capacity,
      maxCharge: NAV_MAX_CHARGE,
    });
    expect(nav.viewFor(s, 'hacker')).toMatchObject({ shield: false, sequence: null, probes: [], freeProbesLeft: NAV_FREE_PROBES });
  });
});

describe('propulsores, energía y movimiento', () => {
  it('sin carga no hay movimiento, y no cuesta tiempo', () => {
    const res = move(plain(), 'right');
    expect(res.error?.code).toBe('no_fuel');
    expect(res.penaltySeconds ?? 0).toBe(0);
    expect(res.state.pos).toEqual({ x: 0, y: 0 });
  });

  it('cada propulsor sirve a su eje', () => {
    const s = charge(plain(), 'linear').state;
    expect(move(s, 'right').error?.code).toBe('no_fuel');
    const res = move(s, 'down');
    expect(res.error).toBeUndefined();
    expect(toCell(res.state.pos)).toBe('A2');
  });

  it('la carga necesaria depende del terreno de la casilla destino', () => {
    const terrain = plain().terrain.slice();
    terrain[6] = 'asteroides'; // A2 (costo 2)
    const s = plain({ terrain });
    const one = charge(s, 'linear', 1).state;
    expect(move(one, 'down').error?.code).toBe('no_fuel'); // 1 no alcanza para asteroides
    const two = charge(one, 'linear', 1).state; // se acumula: 2
    expect(two.charges.linear).toBe(2);
    expect(toCell(move(two, 'down').state.pos)).toBe('A2');
  });

  it('el movimiento gasta toda la carga del propulsor: lo que sobra se pierde', () => {
    const s = charge(plain(), 'linear', 3).state;
    const res = move(s, 'down');
    expect(res.state.charges.linear).toBe(0);
    expect(res.state.battery).toBe(99 - 3);
  });

  it('cargar descuenta de la batería; no se admite más de 3 por propulsor ni cargas inválidas', () => {
    const s = charge(plain(), 'lateral', 2).state;
    expect(s.battery).toBe(97);
    expect(charge(s, 'lateral', 2).error?.code).toBe('invalid_action'); // 2 + 2 > 3
    for (const amount of [0, 4, 1.5, -1]) expect(charge(plain(), 'linear', amount).error?.code).toBe('invalid_action');
    expect(charge(plain(), 'diagonal' as Thruster).error?.code).toBe('invalid_action');
  });

  it('sin batería no se puede cargar; la recarga de emergencia suma energía y cuesta tiempo', () => {
    const empty = plain({ battery: 1 });
    const res = charge(empty, 'linear', 2);
    expect(res.error?.code).toBe('no_energy');
    expect(res.penaltySeconds ?? 0).toBe(0);
    const recharged = nav.apply(empty, 'ingeniero', { kind: 'nav:recharge' });
    expect(recharged.state.battery).toBe(1 + NAV_RECHARGE_AMOUNT);
    expect(recharged.penaltySeconds).toBe(NAV_RECHARGE_PENALTY_SECONDS);
    expect(nav.apply(empty, 'hacker', { kind: 'nav:recharge' }).error?.code).toBe('wrong_role');
  });

  it('no se sale de la grilla ni se gasta la carga', () => {
    const s = charge(plain(), 'lateral').state;
    const res = move(s, 'left');
    expect(res.error?.code).toBe('invalid_action');
    expect(res.state.charges.lateral).toBe(1);
  });

  it('solo el Ingeniero carga y solo el Navegador mueve', () => {
    for (const role of ROLES.filter((r) => r !== 'ingeniero')) {
      expect(charge(plain(), 'linear', 1, role).error?.code).toBe('wrong_role');
    }
    const loaded = charge(charge(plain(), 'linear').state, 'lateral').state;
    for (const role of ROLES.filter((r) => r !== 'navegador')) {
      expect(move(loaded, 'right', role).error?.code).toBe('wrong_role');
    }
  });

  it('el tercer movimiento seguido en la misma dirección se bloquea con penalidad', () => {
    let s = plain();
    s = step(s, 'down');
    s = step(s, 'down');
    s = charge(s, 'linear').state;
    const res = move(s, 'down');
    expect(res.error?.code).toBe('gravity_violation');
    expect(res.penaltySeconds).toBe(NAV_GRAVITY_PENALTY_SECONDS);
    expect(toCell(res.state.pos)).toBe('A3');
    expect(res.state.charges.linear).toBe(1); // no se perdió la carga
    expect(res.state.mistakes).toBe(1);
  });
});

describe('los controles son siempre normales', () => {
  it('la orden se ejecuta tal cual en cualquier parte del mapa, sin inversiones ni sentidos prohibidos', () => {
    for (const [pos, dir, expected] of [
      [{ x: 0, y: 2 }, 'up', 'A2'],
      [{ x: 1, y: 0 }, 'right', 'C1'],
      [{ x: 3, y: 3 }, 'left', 'C4'],
      [{ x: 5, y: 2 }, 'down', 'F4'],
    ] as const) {
      const s = plain({ pos });
      expect(describeMove(s, dir).dir).toBe(dir);
      const res = move(charge(s, describeMove(s, dir).thruster).state, dir);
      expect(res.error).toBeUndefined();
      expect(toCell(res.state.pos)).toBe(expected);
    }
  });
});

describe('minas, radar y consultas', () => {
  it('pisar una mina devuelve al inicio, resta 60 s, gasta la carga y queda anotada', () => {
    const s = plain({ mines: ['B1'] });
    const res = move(charge(s, 'lateral').state, 'right');
    expect(res.error?.code).toBe('mine_hit');
    expect(res.penaltySeconds).toBe(NAV_MINE_PENALTY_SECONDS);
    expect(toCell(res.state.pos)).toBe('A1');
    expect(res.state.charges.lateral).toBe(0);
    expect(res.state.lastDir).toBeNull();
    expect(res.state.hits).toEqual(['B1']);
    expect(nav.viewFor(res.state, 'navegador')).toMatchObject({ hits: ['B1'] });
  });

  it('el radar cuenta las minas de las 8 casillas vecinas y el recorrido guarda cada lectura', () => {
    const s = plain({ mines: ['C2', 'B3', 'D4'] });
    let cur = step(s, 'down'); // A2: vecinas B3 → 1
    expect(nav.viewFor(cur, 'navegador')).toMatchObject({ position: 'A2', radar: 1 });
    cur = step(cur, 'right'); // B2: vecinas C2 y B3 → 2
    const view = nav.viewFor(cur, 'navegador');
    if (view.kind !== 'nav' || view.role !== 'navegador') throw new Error('vista inesperada');
    expect(view.radar).toBe(2);
    expect(view.trail).toEqual([
      { cell: 'A1', radar: 0 },
      { cell: 'A2', radar: 1 },
      { cell: 'B2', radar: 2 },
    ]);
  });

  it('el Hacker consulta casillas: 3 gratis, después cuesta; no se repite ni se consulta fuera de la grilla', () => {
    let s = plain({ mines: ['C3'] });
    const cells = ['A2', 'C3', 'D1', 'E2', 'F3'];
    for (const cell of cells) {
      const res = probe(s, cell);
      expect(res.error).toBeUndefined();
      expect(res.penaltySeconds ?? 0).toBe(0);
      s = res.state;
    }
    expect(s.probes).toEqual([
      { cell: 'A2', mine: false },
      { cell: 'C3', mine: true },
      { cell: 'D1', mine: false },
      { cell: 'E2', mine: false },
      { cell: 'F3', mine: false },
    ]);
    expect(NAV_FREE_PROBES).toBe(5);
    const sixth = probe(s, 'E5');
    expect(sixth.penaltySeconds).toBe(NAV_PROBE_PENALTY_SECONDS);
    expect(probe(s, 'A2').error?.code).toBe('invalid_action');
    expect(probe(s, 'Z9').error?.code).toBe('invalid_action');
    expect(probe(s, 'G1').error?.code).toBe('invalid_action');
    expect(probe(s, 'B2', 'analista').error?.code).toBe('wrong_role');
    expect(nav.viewFor(s, 'hacker')).toMatchObject({ freeProbesLeft: 0 });
  });
});

describe('marcas del Analista y pistas del Criptógrafo', () => {
  it('el Analista marca y desmarca minas; el Navegador las ve y nadie más puede marcar', () => {
    const s = plain();
    const a = nav.apply(s, 'analista', { kind: 'nav:flag', cell: 'c3' }).state;
    expect(a.flags).toEqual(['C3']);
    expect(nav.viewFor(a, 'navegador')).toMatchObject({ flags: ['C3'] });
    expect(nav.viewFor(a, 'analista')).toMatchObject({ flags: ['C3'] });
    expect(nav.apply(a, 'analista', { kind: 'nav:flag', cell: 'C3' }).state.flags).toEqual([]);
    expect(nav.apply(s, 'navegador', { kind: 'nav:flag', cell: 'C3' }).error?.code).toBe('wrong_role');
    expect(nav.apply(s, 'analista', { kind: 'nav:flag', cell: 'Z9' }).error?.code).toBe('invalid_action');
  });

  it('las pistas del Criptógrafo son siempre verdaderas y solo él las recibe', () => {
    for (const seed of SEEDS) {
      const s = nav.init(seed);
      const clues = mineClues(s.mines, mulberry32(seed));
      expect(clues.length).toBeGreaterThanOrEqual(4);
      for (const c of clues) expect(c.check(s.mines)).toBe(true);
      expect(s.mineClues.length).toBe(clues.length);
    }
    const s = nav.init(5);
    const view = nav.viewFor(s, 'criptografo');
    if (view.kind !== 'nav' || view.role !== 'criptografo') throw new Error('vista inesperada');
    expect(view.mineClues).toEqual(s.mineClues);
    for (const role of ROLES.filter((r) => r !== 'criptografo')) expect(JSON.stringify(nav.viewFor(s, role))).not.toContain(s.mineClues[0]);
  });
});

describe('checkpoints y escudo', () => {
  it('al llegar a un checkpoint se activa el escudo y bloquea el avance', () => {
    const s = plain({ checkpoints: ['A2', 'F5'] });
    const cur = move(charge(s, 'linear').state, 'down').state;
    expect(cur.shield).toBe(true);
    expect(cur.pos).toEqual(fromCell('A2'));
    expect(cur.reached).toBe(1);
    expect(cur.sequence).toHaveLength(HACK_LENGTH);
    expect(nav.viewFor(cur, 'hacker')).toMatchObject({ shield: true, sequence: cur.sequence });

    const blocked = move(charge(cur, 'lateral').state, 'right');
    expect(blocked.error?.code).toBe('shield_active');
    expect(blocked.penaltySeconds ?? 0).toBe(0);
  });

  it('el Hacker desactiva el escudo; un error cuesta tiempo y cambia la secuencia', () => {
    const cur = move(charge(plain({ checkpoints: ['A2', 'F5'] }), 'linear').state, 'down').state;
    expect(hack(cur, cur.sequence, 'ingeniero').error?.code).toBe('wrong_role');

    const wrong = cur.sequence.map((n) => (n + 1) % 4);
    const bad = hack(cur, wrong);
    expect(bad.error?.code).toBe('wrong_value');
    expect(bad.penaltySeconds).toBe(NAV_HACK_PENALTY_SECONDS);
    expect(bad.state.shield).toBe(true);
    expect(bad.state.sequence).not.toEqual(cur.sequence);

    expect(hack(bad.state, [9, 9, 9, 9, 9]).error?.code).toBe('invalid_action');
    const ok = hack(bad.state, bad.state.sequence);
    expect(ok.error).toBeUndefined();
    expect(ok.state.shield).toBe(false);
  });

  it('sin escudo no hay nada que hackear', () => {
    expect(hack(plain(), [0, 0, 0, 0, 0]).error?.code).toBe('invalid_action');
  });

  it('después de un checkpoint la mina devuelve a ese checkpoint', () => {
    let cur = step(plain({ checkpoints: ['A2', 'F5'], mines: ['B2'] }), 'down');
    const res = move(charge(cur, 'lateral').state, 'right');
    expect(res.error?.code).toBe('mine_hit');
    expect(toCell(res.state.pos)).toBe('A2');
    cur = res.state;
    expect(cur.reached).toBe(1);
  });

  it('llegar a la meta sin los checkpoints no gana', () => {
    const s = plain({ pos: { x: 4, y: 5 }, lastDir: null, run: 0, reached: 0 });
    const res = move(charge(s, 'lateral').state, 'right');
    expect(res.error).toBeUndefined();
    expect(toCell(res.state.pos)).toBe('F6');
    expect(nav.isComplete(res.state)).toBe(false);
  });

  it('no modifica el estado recibido', () => {
    const s = nav.init(9);
    const snapshot = structuredClone(s);
    move(s, 'right');
    charge(s, 'linear');
    hack(s, [0, 0, 0, 0, 0]);
    probe(s, 'B2');
    nav.apply(s, 'ingeniero', { kind: 'nav:recharge' });
    expect(s).toEqual(snapshot);
  });
});

describe('dentro del motor de juego', () => {
  /** Sala con los dos desafíos, ya jugando el 2 con un tablero elegido. */
  function startedOnChallenge2(state: NavigationState) {
    const manager = new RoomManager(() => 1_000_000, [powerCoreChallenge, nav]);
    const { room, player: host } = manager.createRoom('Nico');
    const players = [host];
    for (const n of ['Sofia', 'Mateo', 'Lucia', 'Fran', 'Valen']) {
      players.push(manager.joinRoom(room.roomId, n).player);
    }
    manager.startGame(room.roomId, host.playerId);
    beginWithRoles(manager, room, players, 0);
    manager.command(room.roomId, host.playerId, { type: 'skip' });
    manager.command(room.roomId, host.playerId, { type: 'next' });
    beginWithRoles(manager, room, players, 1); // en el desafío 2 todos rotan de rol
    expect(room.currentChallenge).toBe(2);
    room.challengeState = state;
    const byRole = roleMap(room);
    return { manager, room, byRole };
  }

  it('una mina descuenta 60 s del reloj de la sala', () => {
    const { manager, room, byRole } = startedOnChallenge2(plain({ mines: ['B1'] }));
    manager.applyAction(room.roomId, byRole.ingeniero, { kind: 'nav:charge', thruster: 'lateral', amount: 1 });
    expect(() => manager.applyAction(room.roomId, byRole.navegador, { kind: 'nav:move', dir: 'right' })).toThrow();
    const view = manager.viewFor(room, byRole.navegador);
    expect(view.timer.remainingMs / 1000).toBe(TOTAL_SECONDS - NAV_MINE_PENALTY_SECONDS);
    expect(view.challenge?.view).toMatchObject({ role: 'navegador', position: 'A1' });
  });

  it('la recarga de emergencia y las consultas pasadas del cupo descuentan tiempo', () => {
    const { manager, room, byRole } = startedOnChallenge2(plain());
    manager.applyAction(room.roomId, byRole.ingeniero, { kind: 'nav:recharge' });
    for (const cell of ['A2', 'A3', 'A4', 'A5', 'B2', 'B3']) {
      manager.applyAction(room.roomId, byRole.hacker, { kind: 'nav:probe', cell });
    }
    const view = manager.viewFor(room, byRole.hacker);
    expect(view.timer.remainingMs / 1000).toBe(
      TOTAL_SECONDS - NAV_RECHARGE_PENALTY_SECONDS - NAV_PROBE_PENALTY_SECONDS,
    );
  });

  it('seguir la solución gana la partida', () => {
    const state = nav.init(21);
    const { manager, room, byRole } = startedOnChallenge2(state);
    for (const d of state.solution) {
      const cur = room.challengeState as NavigationState;
      const { thruster, cost } = describeMove(cur, d);
      manager.applyAction(room.roomId, byRole.ingeniero, { kind: 'nav:charge', thruster, amount: cost });
      manager.applyAction(room.roomId, byRole.navegador, { kind: 'nav:move', dir: d });
      const after = room.challengeState as NavigationState | null;
      if (after?.shield) manager.applyAction(room.roomId, byRole.hacker, { kind: 'nav:hack', answer: after.sequence });
    }
    expect(room.status).toBe('won');
  });
});
