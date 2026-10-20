import {
  CIRCUIT_FREE_VERIFICATIONS,
  CIRCUIT_MAX_RESCANS,
  CIRCUIT_ORDER_PENALTY_SECONDS,
  CIRCUIT_RESCAN_PENALTY_SECONDS,
  CIRCUIT_RESCAN_SECONDS,
  CIRCUIT_SCAN_SECONDS,
  CIRCUIT_SIZE,
  CIRCUIT_VERIFY_PENALTY_SECONDS,
  PIECE_IDS,
  PIECE_INFO,
  TOTAL_SECONDS,
} from '@enigma/shared';
import type { Cell, ChallengeView, FacilitatorView, PieceId, PiecePhase, PieceState, PlacedPiece, Role } from '@enigma/shared';
import { mulberry32, shuffle } from '../rng.js';
import type { ApplyResult, ChallengeModule } from './types.js';

/**
 * Desafío 3: Master Circuit Reassembly.
 *
 * Un tablero de 4×4 con 6 piezas distintas, cada una con su casilla y su rotación.
 *
 * Nadie tiene la solución completa; hay que cruzar datos (casilla + nombre + rotación):
 *   Analista    → DÓNDE: ve 6 casillas ocupadas, sin nombre de pieza, solo durante un escaneo de 8 s
 *   Criptógrafo → QUÉ PIEZA va en cada casilla: pistas de identidad (filas, columnas, esquinas, vecinas…)
 *   Navegador   → CÓMO: brújula con la rotación de cada pieza; además marca la casilla "en foco"
 *   Estratega   → orden de montaje por fases + qué piezas van en la mitad superior/inferior del tablero
 *   Ingeniero   → único que coloca, quita y rota piezas (no sabe nada de la solución)
 *   Hacker      → "Verificar voltaje" pieza por pieza y re-escáner de 4 s para el Analista
 *
 * Las pistas del Criptógrafo, junto con las mitades del Estratega y las 6 casillas del Analista,
 * determinan una única asignación pieza → casilla (se verifica al generar).
 *
 * El circuito se completa cuando el Hacker verifica con las 6 piezas bien (casilla y rotación).
 */

const PHASES: PiecePhase[] = ['fusibles', 'nodos', 'cables'];

export interface CircuitState {
  /** Circuito correcto. */
  layout: PlacedPiece[];
  clues: string[];
  /** Mitades del tablero (filas 1-2 / filas 3-4) para el Estratega. */
  halves: { top: PieceId[]; bottom: PieceId[] };
  /** Orden de las fases de montaje. */
  phases: PiecePhase[];
  /** Estado actual de cada pieza. */
  pieces: PieceState[];
  focus: Cell | null;
  scanUsed: boolean;
  /** Reloj de juego (ms restantes) en que se apaga el escaneo en curso; null si nunca hubo. */
  scanEndsAt: number | null;
  rescansUsed: number;
  verifications: number;
  last: { correct: number; total: number; pieces: { piece: PieceId; ok: boolean }[] } | null;
  mistakes: number;
  finished: boolean;
}

const toCell = (x: number, y: number): Cell => `${String.fromCharCode(65 + x)}${y + 1}`;

function parseCell(cell: unknown): { x: number; y: number } | null {
  if (typeof cell !== 'string' || !/^[A-Z][0-9]$/.test(cell)) return null;
  const x = cell.charCodeAt(0) - 65;
  const y = Number(cell.slice(1)) - 1;
  return x < CIRCUIT_SIZE && y >= 0 && y < CIRCUIT_SIZE ? { x, y } : null;
}

const label = (piece: PieceId) => PIECE_INFO[piece].label;

type Pos = { x: number; y: number };
/** Una pista es verdadera para el circuito real; `test` dice si una asignación hipotética la cumple. */
interface Clue {
  text: string;
  test: (at: (piece: PieceId) => Pos) => boolean;
}

const isCorner = (p: Pos) => (p.x === 0 || p.x === CIRCUIT_SIZE - 1) && (p.y === 0 || p.y === CIRCUIT_SIZE - 1);
const isEdge = (p: Pos) =>
  !isCorner(p) && (p.x === 0 || p.x === CIRCUIT_SIZE - 1 || p.y === 0 || p.y === CIRCUIT_SIZE - 1);
const isCenter = (p: Pos) => !isCorner(p) && !isEdge(p);
const isTop = (p: Pos) => p.y < CIRCUIT_SIZE / 2;

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

function candidateClues(at: Map<PieceId, Pos>): Clue[] {
  const out: Clue[] = [];
  const truth = (c: Clue) => c.test((piece) => at.get(piece)!);
  for (const a of PIECE_IDS) {
    const pa = at.get(a)!;
    if (isCorner(pa)) out.push({ text: `The ${label(a)} is in a corner of the board.`, test: (g) => isCorner(g(a)) });
    else if (isEdge(pa)) out.push({ text: `The ${label(a)} is on an edge, but not in a corner.`, test: (g) => isEdge(g(a)) });
    else out.push({ text: `The ${label(a)} is in the center of the board (it touches no edge).`, test: (g) => isCenter(g(a)) });
    for (const b of PIECE_IDS) {
      if (a === b) continue;
      const pb = at.get(b)!;
      if (pa.y < pb.y) out.push({ text: `The ${label(a)} is in a row above the ${label(b)}.`, test: (g) => g(a).y < g(b).y });
      if (pa.x < pb.x) out.push({ text: `The ${label(a)} is in a column to the left of the ${label(b)}.`, test: (g) => g(a).x < g(b).x });
      if (a < b) {
        if (pa.y === pb.y) out.push({ text: `The ${label(a)} and the ${label(b)} are in the same row.`, test: (g) => g(a).y === g(b).y });
        if (pa.x === pb.x) out.push({ text: `The ${label(a)} and the ${label(b)} are in the same column.`, test: (g) => g(a).x === g(b).x });
        const d = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
        if (d === 1) out.push({ text: `The ${label(a)} and the ${label(b)} are in adjacent cells (above, below or beside).`, test: (g) => Math.abs(g(a).x - g(b).x) + Math.abs(g(a).y - g(b).y) === 1 });
        else out.push({ text: `The ${label(a)} and the ${label(b)} are NOT in adjacent cells.`, test: (g) => Math.abs(g(a).x - g(b).x) + Math.abs(g(a).y - g(b).y) !== 1 });
      }
    }
  }
  return out.filter(truth);
}

/**
 * Elige pistas de identidad hasta que, conociendo las 6 casillas ocupadas y las mitades del tablero,
 * exista una sola forma de repartir las piezas. En cada paso toma, entre unas pocas candidatas al azar,
 * la que más descarta, para que el manual no quede ni vacío ni larguísimo.
 */
function buildClues(layout: PlacedPiece[], rng: () => number): string[] {
  const at = new Map(layout.map((p) => [p.piece, parseCell(p.cell)!]));
  const cellPos = layout.map((p) => parseCell(p.cell)!);
  const halfOf = new Map(PIECE_IDS.map((id) => [id, isTop(at.get(id)!)]));
  // Todas las asignaciones pieza → casilla que respetan las mitades que conoce el Estratega.
  let alive = permutations(cellPos).filter((perm) => PIECE_IDS.every((id, i) => isTop(perm[i]) === halfOf.get(id)));
  const guess = (perm: Pos[]) => (piece: PieceId) => perm[PIECE_IDS.indexOf(piece)];

  const pool = shuffle(candidateClues(at), rng);
  const chosen: Clue[] = [];
  while (alive.length > 1 && pool.length > 0) {
    const sample = pool.splice(0, 6);
    let best = 0;
    let bestLeft = Infinity;
    sample.forEach((clue, i) => {
      const left = alive.filter((perm) => clue.test(guess(perm))).length;
      if (left < bestLeft) {
        bestLeft = left;
        best = i;
      }
    });
    const [pick] = sample.splice(best, 1);
    pool.push(...sample);
    if (bestLeft < alive.length) {
      chosen.push(pick);
      alive = alive.filter((perm) => pick.test(guess(perm)));
    }
  }
  return chosen.map((c) => c.text);
}

/**
 * Cuántas formas hay de repartir las piezas en las casillas ocupadas respetando las pistas del
 * Criptógrafo y las mitades del Estratega. El juego garantiza que siempre es 1 (la correcta).
 */
export function countIdentityAssignments(state: Pick<CircuitState, 'layout' | 'clues' | 'halves'>): number {
  const at = new Map(state.layout.map((p) => [p.piece, parseCell(p.cell)!]));
  const texts = new Set(state.clues);
  const tests = candidateClues(at).filter((c) => texts.has(c.text));
  const cellPos = state.layout.map((p) => parseCell(p.cell)!);
  return permutations(cellPos).filter((perm) => {
    const g = (piece: PieceId) => perm[PIECE_IDS.indexOf(piece)];
    return (
      PIECE_IDS.every((id) => isTop(g(id)) === state.halves.top.includes(id)) && tests.every((c) => c.test(g))
    );
  }).length;
}

function halvesOf(layout: PlacedPiece[]): { top: PieceId[]; bottom: PieceId[] } {
  const top = layout.filter((l) => isTop(parseCell(l.cell)!)).map((l) => l.piece);
  return { top, bottom: PIECE_IDS.filter((id) => !top.includes(id)) };
}

const phaseOf = (piece: PieceId): PiecePhase => PIECE_INFO[piece].phase;

/** Primera fase que todavía no tiene todas sus piezas sobre el tablero. */
function currentPhase(state: CircuitState): number {
  const index = state.phases.findIndex((phase) =>
    state.pieces.some((p) => phaseOf(p.piece) === phase && p.cell === null),
  );
  return index === -1 ? state.phases.length : index;
}

const pieceStatus = (state: CircuitState) =>
  state.pieces.map((p) => {
    const target = state.layout.find((l) => l.piece === p.piece);
    return { piece: p.piece, ok: target !== undefined && target.cell === p.cell && target.rotation === p.rotation };
  });

function reject(
  state: CircuitState,
  code: 'invalid_action' | 'wrong_role' | 'sequence_error',
  message: string,
  penaltySeconds = 0,
): ApplyResult<CircuitState> {
  const mistakes = penaltySeconds > 0 ? state.mistakes + 1 : state.mistakes;
  return { state: { ...state, mistakes }, penaltySeconds, error: { code, message } };
}

const isPiece = (piece: unknown): piece is PieceId => PIECE_IDS.includes(piece as PieceId);

export const circuitChallenge: ChallengeModule<CircuitState> = {
  id: 3,
  name: 'Master Circuit Reassembly',
  briefing: {
    story:
      'The beacon’s master circuit was torn apart in the overload. It must be rebuilt piece by piece on a 4×4 board, and each of you holds only a fragment of the blueprint.',
    objective:
      'Nobody has the full solution: by combining cells, identities and rotations, place all 6 pieces correctly, following the assembly sequence, and verify the voltage.',
    roles: {
      navegador: 'Has the compass: knows which way each piece must point. Also marks the focused cell.',
      analista: 'Scans the board for 8 seconds: sees which cells hold pieces, but not which is which.',
      criptografo: 'Has the identity clues that say which piece goes in each cell (rows, columns, corners, neighbors).',
      estratega: 'Dictates the assembly order by phase and knows which pieces go on the top and which on the bottom of the board.',
      ingeniero: 'Knows nothing about the solution: drags, places and rotates pieces according to what the team dictates.',
      hacker: 'Verifies the voltage and sees which pieces are right (not just how many). Can also grant the Analyst a re-scan.',
    },
  },

  init(seed) {
    const rng = mulberry32(seed);
    const cells: Cell[] = [];
    for (let y = 0; y < CIRCUIT_SIZE; y++) for (let x = 0; x < CIRCUIT_SIZE; x++) cells.push(toCell(x, y));
    const chosen = shuffle(cells, rng).slice(0, PIECE_IDS.length);
    const layout: PlacedPiece[] = PIECE_IDS.map((piece, i) => ({
      piece,
      cell: chosen[i],
      rotation: Math.floor(rng() * 4),
    }));
    return {
      layout,
      clues: buildClues(layout, rng),
      halves: halvesOf(layout),
      phases: shuffle(PHASES, rng),
      // Las piezas arrancan en la bandeja, con rotaciones que no son las correctas.
      pieces: layout.map((l) => ({
        piece: l.piece,
        cell: null,
        rotation: (l.rotation + 1 + Math.floor(rng() * 3)) % 4,
      })),
      focus: null,
      scanUsed: false,
      scanEndsAt: null,
      rescansUsed: 0,
      verifications: 0,
      last: null,
      mistakes: 0,
      finished: false,
    };
  },

  viewFor(state, role: Role, clockMs = TOTAL_SECONDS * 1000): ChallengeView {
    switch (role) {
      case 'navegador':
        return {
          kind: 'circuit',
          role,
          occupied: state.pieces.flatMap((p) => (p.cell ? [p.cell] : [])),
          focus: state.focus,
          compass: state.layout.map((l) => ({ piece: l.piece, rotation: l.rotation })),
        };
      case 'analista': {
        const visible = state.scanEndsAt !== null && clockMs > state.scanEndsAt;
        return {
          kind: 'circuit',
          role,
          canScan: !state.scanUsed,
          scan: visible ? { cells: state.layout.map((l) => l.cell), msLeft: clockMs - (state.scanEndsAt as number) } : null,
          rescansGranted: state.rescansUsed,
        };
      }
      case 'criptografo':
        return { kind: 'circuit', role, clues: state.clues };
      case 'estratega': {
        const current = currentPhase(state);
        return {
          kind: 'circuit',
          role,
          phases: state.phases.map((phase) => {
            const pieces = PIECE_IDS.filter((id) => phaseOf(id) === phase);
            return { phase, pieces, placed: pieces.every((id) => state.pieces.find((p) => p.piece === id)?.cell) };
          }),
          current,
          halves: state.halves,
        };
      }
      case 'ingeniero':
        return { kind: 'circuit', role, pieces: state.pieces, focus: state.focus };
      case 'hacker': {
        const visible = state.scanEndsAt !== null && clockMs > state.scanEndsAt;
        return {
          kind: 'circuit',
          role,
          verifications: state.verifications,
          freeLeft: Math.max(0, CIRCUIT_FREE_VERIFICATIONS - state.verifications),
          last: state.last,
          rescansLeft: CIRCUIT_MAX_RESCANS - state.rescansUsed,
          canRescan: state.scanUsed && !visible && state.rescansUsed < CIRCUIT_MAX_RESCANS,
        };
      }
    }
  },

  facilitatorView(state): FacilitatorView {
    return {
      kind: 'circuit',
      layout: state.layout,
      clues: state.clues,
      halves: state.halves,
      phases: state.phases,
      placed: state.pieces.filter((p) => p.cell !== null).length,
      verifications: state.verifications,
      mistakes: state.mistakes,
    };
  },

  viewChangeAt(state) {
    return state.scanEndsAt;
  },

  apply(state, role, action, clockMs = TOTAL_SECONDS * 1000) {
    if (state.finished) return { state };

    switch (action.kind) {
      case 'circuit:scan': {
        if (role !== 'analista') return reject(state, 'wrong_role', 'Only the Analyst can scan.');
        if (state.scanUsed) {
          return reject(state, 'invalid_action', 'The initial scan has already been used. Ask the Hacker for a re-scan.');
        }
        return {
          state: { ...state, scanUsed: true, scanEndsAt: clockMs - CIRCUIT_SCAN_SECONDS * 1000 },
        };
      }

      case 'circuit:rescan': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can grant a re-scan.');
        if (!state.scanUsed) {
          return reject(state, 'invalid_action', 'The Analyst hasn’t done the initial scan yet.');
        }
        if (state.scanEndsAt !== null && clockMs > state.scanEndsAt) {
          return reject(state, 'invalid_action', 'The Analyst is looking at the circuit right now.');
        }
        if (state.rescansUsed >= CIRCUIT_MAX_RESCANS) {
          return reject(state, 'invalid_action', 'No re-scans left.');
        }
        return {
          state: {
            ...state,
            rescansUsed: state.rescansUsed + 1,
            // La penalidad se descuenta del reloj después de esta acción, así que se suma acá.
            scanEndsAt: clockMs - CIRCUIT_RESCAN_PENALTY_SECONDS * 1000 - CIRCUIT_RESCAN_SECONDS * 1000,
          },
          penaltySeconds: CIRCUIT_RESCAN_PENALTY_SECONDS,
        };
      }

      case 'circuit:verify': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can verify the voltage.');
        const verifications = state.verifications + 1;
        const pieces = pieceStatus(state);
        const correct = pieces.filter((p) => p.ok).length;
        const next: CircuitState = {
          ...state,
          verifications,
          last: { correct, total: state.pieces.length, pieces },
          finished: correct === state.pieces.length,
        };
        return verifications > CIRCUIT_FREE_VERIFICATIONS
          ? { state: next, penaltySeconds: CIRCUIT_VERIFY_PENALTY_SECONDS }
          : { state: next };
      }

      case 'circuit:focus': {
        if (role !== 'navegador') return reject(state, 'wrong_role', 'Only the Navigator can mark the focused cell.');
        if (action.cell !== null && !parseCell(action.cell)) {
          return reject(state, 'invalid_action', 'Invalid cell.');
        }
        return { state: { ...state, focus: action.cell } };
      }

      case 'circuit:place': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can place pieces.');
        if (!isPiece(action.piece) || !parseCell(action.cell)) {
          return reject(state, 'invalid_action', 'Invalid piece or cell.');
        }
        const piece = state.pieces.find((p) => p.piece === action.piece)!;
        if (piece.cell === action.cell) return { state };
        if (state.pieces.some((p) => p.cell === action.cell)) {
          return reject(state, 'invalid_action', `Cell ${action.cell} is already occupied.`);
        }
        // Mover una pieza que ya está en el tablero se permite; poner una nueva exige respetar la fase.
        if (piece.cell === null) {
          const current = currentPhase(state);
          if (phaseOf(piece.piece) !== state.phases[current]) {
            return reject(
              state,
              'sequence_error',
              `The ${label(piece.piece)} doesn’t belong to this assembly phase. You lost ${CIRCUIT_ORDER_PENALTY_SECONDS} s.`,
              CIRCUIT_ORDER_PENALTY_SECONDS,
            );
          }
        }
        return {
          state: {
            ...state,
            pieces: state.pieces.map((p) => (p.piece === action.piece ? { ...p, cell: action.cell } : p)),
          },
        };
      }

      case 'circuit:remove': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can remove pieces.');
        const piece = isPiece(action.piece) ? state.pieces.find((p) => p.piece === action.piece) : undefined;
        if (!piece || piece.cell === null) return reject(state, 'invalid_action', 'That piece is not on the board.');
        return {
          state: { ...state, pieces: state.pieces.map((p) => (p.piece === action.piece ? { ...p, cell: null } : p)) },
        };
      }

      case 'circuit:rotate': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can rotate pieces.');
        if (!isPiece(action.piece) || (action.turn !== 'cw' && action.turn !== 'ccw')) {
          return reject(state, 'invalid_action', 'Invalid rotation.');
        }
        const delta = action.turn === 'cw' ? 1 : 3;
        return {
          state: {
            ...state,
            pieces: state.pieces.map((p) =>
              p.piece === action.piece ? { ...p, rotation: (p.rotation + delta) % 4 } : p,
            ),
          },
        };
      }

      default:
        return reject(state, 'invalid_action', 'Unknown action.');
    }
  },

  isComplete(state) {
    return state.finished;
  },
};
