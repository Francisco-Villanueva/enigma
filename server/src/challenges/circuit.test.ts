import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_FREE_VERIFICATIONS,
  CIRCUIT_MAX_RESCANS,
  CIRCUIT_ORDER_PENALTY_SECONDS,
  CIRCUIT_RESCAN_PENALTY_SECONDS,
  CIRCUIT_SCAN_SECONDS,
  CIRCUIT_VERIFY_PENALTY_SECONDS,
  PIECE_IDS,
  PIECE_INFO,
  ROLES,
  TOTAL_SECONDS,
} from '@enigma/shared';
import type { CircuitAction, PieceId, Role } from '@enigma/shared';
import { RoomManager } from '../rooms.js';
import { circuitChallenge as circuit, countIdentityAssignments } from './circuit.js';
import type { CircuitState } from './circuit.js';
import { beginWithRoles, roleMap } from '../test-utils.js';
import { navigationChallenge } from './navigation.js';
import { powerCoreChallenge } from './power-core.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 11);
const FULL = TOTAL_SECONDS * 1000;

const act = (s: CircuitState, role: Role, action: CircuitAction, clock = FULL) =>
  circuit.apply(s, role, action, clock);

/** Arma el circuito correcto respetando el orden de fases. */
function assemble(initial: CircuitState): CircuitState {
  let s = initial;
  for (const phase of s.phases) {
    for (const id of PIECE_IDS.filter((p) => PIECE_INFO[p].phase === phase)) {
      const target = s.layout.find((l) => l.piece === id)!;
      let res = act(s, 'ingeniero', { kind: 'circuit:place', piece: id, cell: target.cell });
      expect(res.error).toBeUndefined();
      s = res.state;
      for (let guard = 0; s.pieces.find((p) => p.piece === id)!.rotation !== target.rotation && guard < 4; guard++) {
        res = act(s, 'ingeniero', { kind: 'circuit:rotate', piece: id, turn: 'cw' });
        s = res.state;
      }
    }
  }
  return s;
}

describe('generación', () => {
  it('es determinista por semilla y varía entre semillas', () => {
    expect(circuit.init(5)).toEqual(circuit.init(5));
    expect(new Set(SEEDS.map((s) => JSON.stringify(circuit.init(s).layout))).size).toBeGreaterThan(190);
  });

  it('6 piezas distintas en 6 casillas distintas, todas en la bandeja y mal rotadas', () => {
    for (const seed of SEEDS) {
      const s = circuit.init(seed);
      expect(s.layout.map((l) => l.piece).sort()).toEqual([...PIECE_IDS].sort());
      expect(new Set(s.layout.map((l) => l.cell)).size).toBe(6);
      for (const l of s.layout) expect(l.cell).toMatch(/^[A-D][1-4]$/);
      for (const p of s.pieces) {
        expect(p.cell).toBeNull();
        expect(p.rotation).not.toBe(s.layout.find((l) => l.piece === p.piece)!.rotation);
      }
      expect([...s.phases].sort()).toEqual(['cables', 'fusibles', 'nodos']);
    }
  });

  it('las pistas del Criptógrafo + las mitades del Estratega + las casillas del Analista tienen una única solución', () => {
    for (const seed of SEEDS) {
      const s = circuit.init(seed);
      expect(countIdentityAssignments(s)).toBe(1);
      expect(s.clues.length).toBeGreaterThan(0);
      expect(s.clues.length).toBeLessThanOrEqual(14);
      expect(new Set(s.clues).size).toBe(s.clues.length);
    }
  });

  it('sin las pistas, las casillas solas no alcanzan para saber qué pieza es cuál', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const s = circuit.init(seed);
      expect(countIdentityAssignments({ ...s, clues: [] })).toBeGreaterThan(1);
    }
  });

  it('las mitades coinciden con las filas reales y cubren las 6 piezas', () => {
    for (const seed of SEEDS) {
      const s = circuit.init(seed);
      expect([...s.halves.top, ...s.halves.bottom].sort()).toEqual([...PIECE_IDS].sort());
      for (const l of s.layout) {
        const row = Number(l.cell[1]);
        expect(row <= 2).toBe(s.halves.top.includes(l.piece));
      }
    }
  });
});

describe('qué ve cada rol', () => {
  const s = circuit.init(99);
  const cells = s.layout.map((l) => l.cell).sort();

  it('el Analista ve solo casillas sin nombre ni rotación, y solo durante el escaneo', () => {
    for (const role of ROLES) expect(JSON.stringify(circuit.viewFor(s, role, FULL))).not.toContain('"layout"');
    const scanned = act(s, 'analista', { kind: 'circuit:scan' }).state;
    const view = circuit.viewFor(scanned, 'analista', FULL - 1000);
    if (view.kind !== 'circuit' || view.role !== 'analista' || !view.scan) throw new Error('vista inesperada');
    expect([...view.scan.cells].sort()).toEqual(cells);
    const raw = JSON.stringify(view);
    expect(raw).not.toContain('rotation');
    for (const id of PIECE_IDS) expect(raw).not.toContain(id);
    // Después del escaneo desaparece.
    expect(circuit.viewFor(scanned, 'analista', FULL - 9000)).toMatchObject({ scan: null });
  });

  it('el Navegador ve la brújula (rotaciones) pero no casillas de la solución', () => {
    const view = circuit.viewFor(s, 'navegador');
    if (view.kind !== 'circuit' || view.role !== 'navegador') throw new Error('vista inesperada');
    expect(view.compass).toEqual(s.layout.map((l) => ({ piece: l.piece, rotation: l.rotation })));
    const raw = JSON.stringify(view);
    for (const c of cells) expect(raw).not.toContain(`"${c}"`);
  });

  it('el Navegador ve ocupación del tablero y la casilla en foco', () => {
    const placed = act(s, 'ingeniero', {
      kind: 'circuit:place',
      piece: PIECE_IDS.find((p) => PIECE_INFO[p].phase === s.phases[0])!,
      cell: 'A1',
    }).state;
    expect(circuit.viewFor(placed, 'navegador')).toMatchObject({ role: 'navegador', occupied: ['A1'], focus: null });
    const focused = act(placed, 'navegador', { kind: 'circuit:focus', cell: 'B2' }).state;
    expect(circuit.viewFor(focused, 'navegador')).toMatchObject({ focus: 'B2' });
  });

  it('el Criptógrafo ve solo pistas, sin casillas ni rotaciones', () => {
    const view = circuit.viewFor(s, 'criptografo');
    if (view.kind !== 'circuit' || view.role !== 'criptografo') throw new Error('vista inesperada');
    expect(view.clues).toEqual(s.clues);
    const raw = JSON.stringify(view);
    for (const c of cells) expect(raw).not.toContain(`"${c}"`);
    expect(raw).not.toContain('rotation');
  });

  it('el Estratega ve las fases en el orden sorteado y las mitades del tablero', () => {
    const view = circuit.viewFor(s, 'estratega');
    if (view.kind !== 'circuit' || view.role !== 'estratega') throw new Error('vista inesperada');
    expect(view.phases.map((p) => p.phase)).toEqual(s.phases);
    expect(view.current).toBe(0);
    expect(view.halves).toEqual(s.halves);
  });

  it('el Ingeniero no recibe nada de la solución', () => {
    const raw = JSON.stringify(circuit.viewFor(s, 'ingeniero'));
    for (const c of cells) expect(raw).not.toContain(`"${c}"`);
    expect(raw).not.toContain('clues');
    expect(raw).not.toContain('halves');
    expect(raw).not.toContain('compass');
  });
});

describe('escáner y re-escáner', () => {
  const s0 = circuit.init(3);

  it('el escáner inicial dura 8 s del reloj de juego y se usa una sola vez', () => {
    expect(act(s0, 'ingeniero', { kind: 'circuit:scan' }).error?.code).toBe('wrong_role');
    const scanned = act(s0, 'analista', { kind: 'circuit:scan' }, FULL).state;
    expect(circuit.viewChangeAt?.(scanned)).toBe(FULL - CIRCUIT_SCAN_SECONDS * 1000);

    const at = (elapsedMs: number) => circuit.viewFor(scanned, 'analista', FULL - elapsedMs);
    expect(at(0)).toMatchObject({ scan: { msLeft: 8000 } });
    expect(at(7999)).toMatchObject({ scan: { msLeft: 1 } });
    expect(at(8000)).toMatchObject({ scan: null, canScan: false });

    expect(act(scanned, 'analista', { kind: 'circuit:scan' }, FULL - 20_000).error?.code).toBe('invalid_action');
  });

  it('un reloj en pausa no gasta el escaneo (se mide con el reloj de juego)', () => {
    const scanned = act(s0, 'analista', { kind: 'circuit:scan' }, FULL).state;
    // El reloj de juego no avanza durante la pausa: mismo clockMs, misma vista.
    expect(circuit.viewFor(scanned, 'analista', FULL - 3000)).toEqual(circuit.viewFor(scanned, 'analista', FULL - 3000));
    expect(circuit.viewFor(scanned, 'analista', FULL - 3000)).toMatchObject({ scan: { msLeft: 5000 } });
  });

  it('el Hacker otorga un re-escáner de 4 s con penalidad, tras el inicial y no mientras se ve', () => {
    expect(act(s0, 'hacker', { kind: 'circuit:rescan' }).error?.code).toBe('invalid_action'); // sin escaneo inicial
    const scanned = act(s0, 'analista', { kind: 'circuit:scan' }, FULL).state;
    expect(act(scanned, 'hacker', { kind: 'circuit:rescan' }, FULL - 2000).error?.code).toBe('invalid_action'); // se está viendo
    expect(act(scanned, 'analista', { kind: 'circuit:rescan' }, FULL - 9000).error?.code).toBe('wrong_role');

    const clock = FULL - 30_000;
    const res = act(scanned, 'hacker', { kind: 'circuit:rescan' }, clock);
    expect(res.error).toBeUndefined();
    expect(res.penaltySeconds).toBe(CIRCUIT_RESCAN_PENALTY_SECONDS);
    // Después de que el motor descuente la penalidad, quedan exactamente 4 s.
    const after = clock - CIRCUIT_RESCAN_PENALTY_SECONDS * 1000;
    expect(circuit.viewFor(res.state, 'analista', after)).toMatchObject({ scan: { msLeft: 4000 } });
    expect(circuit.viewFor(res.state, 'analista', after - 4000)).toMatchObject({ scan: null });
  });

  it('hay un máximo de re-escáneres', () => {
    let s = act(s0, 'analista', { kind: 'circuit:scan' }, FULL).state;
    let clock = FULL - 10_000;
    for (let i = 0; i < CIRCUIT_MAX_RESCANS; i++) {
      s = act(s, 'hacker', { kind: 'circuit:rescan' }, clock).state;
      clock -= 60_000;
    }
    const last = act(s, 'hacker', { kind: 'circuit:rescan' }, clock);
    expect(last.error?.code).toBe('invalid_action');
    expect(circuit.viewFor(s, 'hacker', clock)).toMatchObject({ rescansLeft: 0, canRescan: false });
  });
});

describe('montaje del Ingeniero', () => {
  const s0 = circuit.init(8);
  const byPhase = (index: number) => PIECE_IDS.filter((p) => PIECE_INFO[p].phase === s0.phases[index]);

  it('respeta el orden de fases: una pieza de otra fase se rechaza con penalidad', () => {
    const wrong = byPhase(1)[0];
    const res = act(s0, 'ingeniero', { kind: 'circuit:place', piece: wrong, cell: 'A1' });
    expect(res.error?.code).toBe('sequence_error');
    expect(res.penaltySeconds).toBe(CIRCUIT_ORDER_PENALTY_SECONDS);
    expect(res.state.pieces.find((p) => p.piece === wrong)!.cell).toBeNull();
    expect(res.state.mistakes).toBe(1);
  });

  it('la fase siguiente se habilita al colocar las dos piezas de la anterior', () => {
    let s = s0;
    for (const [i, id] of byPhase(0).entries()) {
      s = act(s, 'ingeniero', { kind: 'circuit:place', piece: id, cell: i === 0 ? 'A1' : 'B1' }).state;
    }
    const view = circuit.viewFor(s, 'estratega');
    if (view.kind !== 'circuit' || view.role !== 'estratega') throw new Error('vista inesperada');
    expect(view.current).toBe(1);
    expect(act(s, 'ingeniero', { kind: 'circuit:place', piece: byPhase(1)[0], cell: 'C1' }).error).toBeUndefined();
  });

  it('no se coloca sobre una casilla ocupada; mover una pieza ya puesta sí se puede', () => {
    const [a, b] = byPhase(0);
    let s = act(s0, 'ingeniero', { kind: 'circuit:place', piece: a, cell: 'A1' }).state;
    expect(act(s, 'ingeniero', { kind: 'circuit:place', piece: b, cell: 'A1' }).error?.code).toBe('invalid_action');
    s = act(s, 'ingeniero', { kind: 'circuit:place', piece: b, cell: 'B1' }).state;
    s = act(s, 'ingeniero', { kind: 'circuit:place', piece: a, cell: 'D4' }).state; // mover
    expect(s.pieces.find((p) => p.piece === a)!.cell).toBe('D4');
  });

  it('quitar devuelve la pieza a la bandeja y rotar gira de a 90°', () => {
    const a = byPhase(0)[0];
    let s = act(s0, 'ingeniero', { kind: 'circuit:place', piece: a, cell: 'A1' }).state;
    const r0 = s.pieces.find((p) => p.piece === a)!.rotation;
    s = act(s, 'ingeniero', { kind: 'circuit:rotate', piece: a, turn: 'cw' }).state;
    expect(s.pieces.find((p) => p.piece === a)!.rotation).toBe((r0 + 1) % 4);
    s = act(s, 'ingeniero', { kind: 'circuit:rotate', piece: a, turn: 'ccw' }).state;
    s = act(s, 'ingeniero', { kind: 'circuit:rotate', piece: a, turn: 'ccw' }).state;
    expect(s.pieces.find((p) => p.piece === a)!.rotation).toBe((r0 + 3) % 4);
    s = act(s, 'ingeniero', { kind: 'circuit:remove', piece: a }).state;
    expect(s.pieces.find((p) => p.piece === a)!.cell).toBeNull();
    expect(act(s, 'ingeniero', { kind: 'circuit:remove', piece: a }).error?.code).toBe('invalid_action');
  });

  it('solo el Ingeniero arma y solo el Navegador marca el foco', () => {
    const a = byPhase(0)[0];
    for (const role of ROLES.filter((r) => r !== 'ingeniero')) {
      expect(act(s0, role, { kind: 'circuit:place', piece: a, cell: 'A1' }).error?.code).toBe('wrong_role');
      expect(act(s0, role, { kind: 'circuit:rotate', piece: a, turn: 'cw' }).error?.code).toBe('wrong_role');
      expect(act(s0, role, { kind: 'circuit:remove', piece: a }).error?.code).toBe('wrong_role');
    }
    for (const role of ROLES.filter((r) => r !== 'navegador')) {
      expect(act(s0, role, { kind: 'circuit:focus', cell: 'B2' }).error?.code).toBe('wrong_role');
    }
    const focused = act(s0, 'navegador', { kind: 'circuit:focus', cell: 'B2' }).state;
    expect(circuit.viewFor(focused, 'ingeniero')).toMatchObject({ focus: 'B2' });
    expect(act(s0, 'navegador', { kind: 'circuit:focus', cell: 'Z9' }).error?.code).toBe('invalid_action');
    expect(act(focused, 'navegador', { kind: 'circuit:focus', cell: null }).state.focus).toBeNull();
  });

  it('rechaza piezas y casillas inválidas sin penalizar', () => {
    for (const action of [
      { kind: 'circuit:place', piece: 'nada', cell: 'A1' },
      { kind: 'circuit:place', piece: byPhase(0)[0], cell: 'E5' },
      { kind: 'circuit:rotate', piece: 'nada', turn: 'cw' },
    ] as unknown as CircuitAction[]) {
      const res = act(s0, 'ingeniero', action);
      expect(res.error?.code).toBe('invalid_action');
      expect(res.penaltySeconds ?? 0).toBe(0);
    }
  });

  it('no modifica el estado recibido', () => {
    const snapshot = structuredClone(s0);
    act(s0, 'ingeniero', { kind: 'circuit:place', piece: byPhase(0)[0], cell: 'A1' });
    act(s0, 'ingeniero', { kind: 'circuit:place', piece: byPhase(1)[0], cell: 'A2' });
    act(s0, 'analista', { kind: 'circuit:scan' });
    expect(s0).toEqual(snapshot);
  });
});

describe('verificar voltaje', () => {
  it('cuenta las piezas bien puestas (casilla y rotación)', () => {
    const s0 = circuit.init(21);
    expect(act(s0, 'hacker', { kind: 'circuit:verify' }).state.last).toMatchObject({ correct: 0, total: 6 });

    const full = assemble(s0);
    // Una pieza con la rotación equivocada no cuenta.
    const spoiled: CircuitState = {
      ...full,
      pieces: full.pieces.map((p, i) => (i === 0 ? { ...p, rotation: (p.rotation + 1) % 4 } : p)),
    };
    const res = act(spoiled, 'hacker', { kind: 'circuit:verify' });
    expect(res.state.last).toMatchObject({ correct: 5, total: 6 });
    expect(circuit.isComplete(res.state)).toBe(false);
    // El Hacker ve cuál de las piezas está mal.
    expect(res.state.last?.pieces.filter((p) => !p.ok).map((p) => p.piece)).toEqual([spoiled.pieces[0].piece]);
    const view = circuit.viewFor(res.state, 'hacker');
    if (view.kind !== 'circuit' || view.role !== 'hacker') throw new Error('vista inesperada');
    expect(view.last?.pieces).toHaveLength(6);
  });

  it('las primeras 3 verificaciones son gratis; después cada una cuesta tiempo', () => {
    let s = circuit.init(21);
    for (let i = 1; i <= CIRCUIT_FREE_VERIFICATIONS + 2; i++) {
      const res = act(s, 'hacker', { kind: 'circuit:verify' });
      s = res.state;
      expect(res.penaltySeconds ?? 0).toBe(i > CIRCUIT_FREE_VERIFICATIONS ? CIRCUIT_VERIFY_PENALTY_SECONDS : 0);
    }
    expect(circuit.viewFor(s, 'hacker')).toMatchObject({ verifications: 5, freeLeft: 0 });
  });

  it('solo el Hacker verifica, y con las 6 piezas bien el circuito se completa', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const full = assemble(circuit.init(seed));
      for (const role of ROLES.filter((r) => r !== 'hacker')) {
        expect(act(full, role, { kind: 'circuit:verify' }).error?.code).toBe('wrong_role');
      }
      expect(circuit.isComplete(full)).toBe(false); // armarlo no alcanza: falta verificar
      const done = act(full, 'hacker', { kind: 'circuit:verify' }).state;
      expect(circuit.isComplete(done)).toBe(true);
      expect(done.last).toMatchObject({ correct: 6, total: 6 });
      expect(done.mistakes).toBe(0);
    }
  });
});

describe('dentro del motor de juego', () => {
  function startedOnChallenge3() {
    let t = 1_000_000;
    const manager = new RoomManager(() => t, [powerCoreChallenge, navigationChallenge, circuit]);
    const { room, player: host } = manager.createRoom('Nico');
    const players = [host];
    for (const n of ['Sofia', 'Mateo', 'Lucia', 'Fran', 'Valen']) players.push(manager.joinRoom(room.roomId, n).player);
    manager.startGame(room.roomId, host.playerId);
    beginWithRoles(manager, room, players, 0);
    for (let i = 1; i <= 2; i++) {
      manager.command(room.roomId, host.playerId, { type: 'skip' });
      manager.command(room.roomId, host.playerId, { type: 'next' });
      beginWithRoles(manager, room, players, i); // en cada desafío todos rotan de rol
    }
    expect(room.currentChallenge).toBe(3);
    const byRole = roleMap(room);
    return { manager, room, byRole, host: host.playerId, advance: (ms: number) => (t += ms) };
  }

  const analystScan = (m: RoomManager, room: ReturnType<typeof startedOnChallenge3>['room'], id: string) => {
    const view = m.viewFor(room, id).challenge?.view;
    if (!view || view.kind !== 'circuit' || view.role !== 'analista') throw new Error('vista inesperada');
    return view.scan;
  };

  it('el escaneo se apaga solo a los 8 s y el tick avisa una única vez', () => {
    const { manager, room, byRole, advance } = startedOnChallenge3();
    manager.applyAction(room.roomId, byRole.analista, { kind: 'circuit:scan' });
    expect(analystScan(manager, room, byRole.analista)).not.toBeNull();

    advance(7000);
    expect(manager.tick()).toEqual([]);
    expect(analystScan(manager, room, byRole.analista)).not.toBeNull();

    advance(1500);
    expect(manager.tick()).toEqual([room]);
    expect(analystScan(manager, room, byRole.analista)).toBeNull();
    expect(manager.tick()).toEqual([]);
  });

  it('la pausa congela el escaneo', () => {
    const { manager, room, byRole, host, advance } = startedOnChallenge3();
    manager.applyAction(room.roomId, byRole.analista, { kind: 'circuit:scan' });
    advance(3000);
    manager.command(room.roomId, host, { type: 'pause' });
    advance(60_000);
    expect(analystScan(manager, room, byRole.analista)).toMatchObject({ msLeft: 5000 });
    manager.command(room.roomId, host, { type: 'resume' });
    advance(4000);
    expect(analystScan(manager, room, byRole.analista)).not.toBeNull();
    advance(1500);
    expect(analystScan(manager, room, byRole.analista)).toBeNull();
  });

  it('el re-escáner resta 20 s del reloj y deja 4 s de vista', () => {
    const { manager, room, byRole, advance } = startedOnChallenge3();
    manager.applyAction(room.roomId, byRole.analista, { kind: 'circuit:scan' });
    advance(10_000);
    manager.tick();
    const before = manager.viewFor(room, byRole.hacker).timer.remainingMs;
    manager.applyAction(room.roomId, byRole.hacker, { kind: 'circuit:rescan' });
    const after = manager.viewFor(room, byRole.hacker).timer.remainingMs;
    expect(before - after).toBe(CIRCUIT_RESCAN_PENALTY_SECONDS * 1000);
    expect(analystScan(manager, room, byRole.analista)).toMatchObject({ msLeft: 4000 });
  });

  it('armar el circuito y verificarlo gana la partida', () => {
    const { manager, room, byRole } = startedOnChallenge3();
    const state = room.challengeState as CircuitState;
    for (const phase of state.phases) {
      for (const id of PIECE_IDS.filter((p) => PIECE_INFO[p].phase === phase)) {
        const target = state.layout.find((l) => l.piece === id)!;
        manager.applyAction(room.roomId, byRole.ingeniero, { kind: 'circuit:place', piece: id, cell: target.cell });
        const cur = (room.challengeState as CircuitState).pieces.find((p) => p.piece === id)!;
        for (let i = 0; i < (target.rotation - cur.rotation + 4) % 4; i++) {
          manager.applyAction(room.roomId, byRole.ingeniero, { kind: 'circuit:rotate', piece: id, turn: 'cw' });
        }
      }
    }
    expect(room.status).toBe('playing');
    manager.applyAction(room.roomId, byRole.hacker, { kind: 'circuit:verify' });
    expect(room.status).toBe('won');
  });
});
