import {
  GRID_SIZE,
  HACK_LENGTH,
  HACK_SYMBOLS,
  NAV_CHECKPOINT_COUNT,
  NAV_FREE_PROBES,
  NAV_GRAVITY_PENALTY_SECONDS,
  NAV_HACK_PENALTY_SECONDS,
  NAV_MAX_CHARGE,
  NAV_MAX_STRAIGHT,
  NAV_MINE_PENALTY_SECONDS,
  NAV_PROBE_PENALTY_SECONDS,
  NAV_RECHARGE_AMOUNT,
  NAV_RECHARGE_PENALTY_SECONDS,
  TERRAIN_INFO,
} from '@enigma/shared';
import type {
  Cell,
  ChallengeView,
  Direction,
  FacilitatorView,
  Role,
  Terrain,
  Thruster,
} from '@enigma/shared';
import { mulberry32, shuffle } from '../rng.js';
import type { ApplyResult, ChallengeModule } from './types.js';

/**
 * Desafío 2: Navigation and Blocked Routes Module.
 *
 * Un dron cruza una grilla de 6×6 desde A1 hasta F6, pasando por 2 checkpoints en orden.
 * El mapa está repartido en capas; hay que superponerlas para planear la ruta:
 *   Estratega   → TERRENO: cuánta energía cuesta entrar a cada casilla, más checkpoints, inicio y meta
 *   Analista    → MINAS como deducción: cuántas hay por fila, por columna y por cuadrante
 *   Navegador   → único que mueve el dron; su RADAR dice cuántas minas rodean a la nave
 *   Criptógrafo → PISTAS verdaderas para deducir las minas y los protocolos generales
 *   Ingeniero   → BATERÍA limitada: carga cada propulsor con la energía justa para cada movimiento
 *   Hacker      → minijuego que apaga el escudo en cada checkpoint y consultas al radar (¿es mina?)
 *
 * Propulsor lineal = arriba/abajo; lateral = izquierda/derecha.
 */

const MINE_COUNT = 7;
const START: Pos = { x: 0, y: 0 };
const GOAL: Pos = { x: GRID_SIZE - 1, y: GRID_SIZE - 1 };
/** La batería alcanza para la ruta más barata más este margen. */
const BATTERY_MARGIN = 1.4;
const BATTERY_EXTRA = 2;

interface Pos {
  x: number;
  y: number;
}

export interface NavigationState {
  seed: number;
  mines: Cell[];
  checkpoints: Cell[];
  /** Terreno de cada casilla, fila por fila. */
  terrain: Terrain[];
  reached: number;
  pos: Pos;
  lastDir: Direction | null;
  /** Cuántos movimientos seguidos lleva en lastDir. */
  run: number;
  /** Carga de cada propulsor. */
  charges: Record<Thruster, number>;
  battery: number;
  capacity: number;
  minEnergy: number;
  shield: boolean;
  /** Secuencia que el Hacker debe repetir mientras el escudo está activo. */
  sequence: number[];
  hackAttempts: number;
  /** Resultado de las consultas del Hacker al radar. */
  probes: { cell: Cell; mine: boolean }[];
  /** Casillas visitadas con su lectura de radar. */
  trail: { cell: Cell; radar: number }[];
  /** Minas que ya explotaron. */
  hits: Cell[];
  /** Casillas que el Analista marcó como mina para el Navegador. */
  flags: Cell[];
  /** Pistas del Criptógrafo sobre las minas. */
  mineClues: string[];
  /** A dónde vuelve el dron si pisa una mina. */
  lastSafe: Pos;
  moves: number;
  mistakes: number;
  finished: boolean;
  solution: Direction[];
}

const DELTAS: Record<Direction, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const DIRECTIONS = Object.keys(DELTAS) as Direction[];

export const toCell = ({ x, y }: Pos): Cell => `${String.fromCharCode(65 + x)}${y + 1}`;

export function fromCell(cell: Cell): Pos {
  return { x: cell.charCodeAt(0) - 65, y: Number(cell.slice(1)) - 1 };
}

const thrusterFor = (dir: Direction): Thruster => (dir === 'up' || dir === 'down' ? 'linear' : 'lateral');
const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
const inBounds = ({ x, y }: Pos) => x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
const indexOf = (pos: Pos) => pos.y * GRID_SIZE + pos.x;
const costAt = (terrain: Terrain[], pos: Pos) => TERRAIN_INFO[terrain[indexOf(pos)]].cost;


const COLS = 'ABCDEF';
const adjacent = (a: Cell, b: Cell) => {
  const p = fromCell(a);
  const q = fromCell(b);
  return a !== b && Math.abs(p.x - q.x) <= 1 && Math.abs(p.y - q.y) <= 1;
};

/** Pistas verdaderas sobre las minas para el Criptógrafo; `check` permite verificarlas en los tests. */
export function mineClues(mines: Cell[], rng: () => number): { text: string; check: (m: Cell[]) => boolean }[] {
  const set = new Set(mines);
  const all: Cell[] = [];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) all.push(toCell({ x, y }));
  const safe = all.filter((c) => !set.has(c));
  const out: { text: string; check: (m: Cell[]) => boolean }[] = [];

  // «En la fila r hay una mina en la columna X o en la Y»
  const row = shuffle(mines, rng)[0];
  const r = fromCell(row).y + 1;
  const rowDecoys = safe.filter((c) => fromCell(c).y + 1 === r);
  if (rowDecoys.length) {
    const d = shuffle(rowDecoys, rng)[0];
    const pair = shuffle([row, d], rng);
    out.push({
      text: `In row ${r} there is a mine in column ${pair[0][0]} or in column ${pair[1][0]}.`,
      check: (m) => m.includes(row) || m.includes(d),
    });
  }
  // «En la columna X hay una mina en la fila a o en la b»
  const other = shuffle(mines.filter((c) => c !== row), rng)[0];
  if (other) {
    const col = other[0];
    const decoys = safe.filter((c) => c[0] === col);
    if (decoys.length) {
      const d = shuffle(decoys, rng)[0];
      const pair = shuffle([other, d], rng);
      out.push({
        text: `In column ${col} there is a mine in row ${pair[0].slice(1)} or in row ${pair[1].slice(1)}.`,
        check: (m) => m.includes(other) || m.includes(d),
      });
    }
  }
  // Paridad de la única mina de una columna
  for (const col of shuffle([...COLS], rng)) {
    const inCol = mines.filter((c) => c[0] === col);
    if (inCol.length !== 1) continue;
    const even = Number(inCol[0].slice(1)) % 2 === 0;
    out.push({
      text: `The only mine in column ${col} is in an ${even ? 'even' : 'odd'} row.`,
      check: (m) => {
        const c = m.filter((x) => x[0] === col);
        return c.length === 1 && (Number(c[0].slice(1)) % 2 === 0) === even;
      },
    });
    break;
  }
  // Casillas libres
  const [s1, s2] = shuffle(safe, rng);
  out.push({ text: `Cells ${s1} and ${s2} have no mines.`, check: (m) => !m.includes(s1) && !m.includes(s2) });
  // Vecindad entre minas
  const touching = mines.some((a) => mines.some((b) => adjacent(a, b)));
  out.push({
    text: touching
      ? 'At least two mines sit in neighboring cells (diagonals count too).'
      : 'No mine touches another: not sideways and not diagonally.',
    check: (m) => m.some((a) => m.some((b) => adjacent(a, b))) === touching,
  });
  return out;
}

const buildMineClues = (mines: Cell[], rng: () => number) => mineClues(mines, rng).map((c) => c.text);

export interface Board {
  mines: Cell[];
  checkpoints: Cell[];
  terrain: Terrain[];
}

/**
 * Busca la ruta de menor gasto de energía sin minas que respete el protocolo de gravedad
 * y pase por los checkpoints en orden. Devuelve las órdenes del Navegador y el gasto, o null si no hay.
 */
export function solve(board: Board): { path: Direction[]; cost: number } | null {
  const mineSet = new Set(board.mines);
  const stops = board.checkpoints.map(fromCell);
  interface Node {
    pos: Pos;
    last: Direction | null;
    run: number;
    reached: number;
    cost: number;
    path: Direction[];
  }
  const key = (n: Pick<Node, 'pos' | 'last' | 'run' | 'reached'>) =>
    `${n.pos.x},${n.pos.y},${n.last},${n.run},${n.reached}`;
  const best = new Map<string, number>();
  const open: Node[] = [{ pos: START, last: null, run: 0, reached: 0, cost: 0, path: [] }];
  best.set(key(open[0]), 0);

  while (open.length > 0) {
    let at = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[at].cost) at = i;
    const node = open.splice(at, 1)[0];
    if (node.cost > (best.get(key(node)) ?? Infinity)) continue;
    if (samePos(node.pos, GOAL) && node.reached === stops.length) return { path: node.path, cost: node.cost };

    for (const input of DIRECTIONS) {
      const dir = input;
      const run = dir === node.last ? node.run + 1 : 1;
      if (run > NAV_MAX_STRAIGHT) continue;
      const pos = { x: node.pos.x + DELTAS[dir].x, y: node.pos.y + DELTAS[dir].y };
      if (!inBounds(pos) || mineSet.has(toCell(pos))) continue;
      const reached = node.reached < stops.length && samePos(pos, stops[node.reached]) ? node.reached + 1 : node.reached;
      const next: Node = {
        pos,
        last: dir,
        run,
        reached,
        cost: node.cost + costAt(board.terrain, pos),
        path: [...node.path, input],
      };
      const k = key(next);
      if (next.cost < (best.get(k) ?? Infinity)) {
        best.set(k, next.cost);
        open.push(next);
      }
    }
  }
  return null;
}

/** Qué propulsor usa la orden `input` y cuánta carga necesita. */
export function describeMove(state: NavigationState, input: Direction) {
  const dir = input;
  const target = { x: state.pos.x + DELTAS[dir].x, y: state.pos.y + DELTAS[dir].y };
  return { dir, thruster: thrusterFor(dir), cost: inBounds(target) ? costAt(state.terrain, target) : 0 };
}

/** Minas en las 8 casillas que rodean a `pos`. */
function radarAt(mines: Cell[], pos: Pos): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const p = { x: pos.x + dx, y: pos.y + dy };
      if (inBounds(p) && mines.includes(toCell(p))) count++;
    }
  }
  return count;
}

function mineCounts(mines: Cell[]) {
  const rows = Array<number>(GRID_SIZE).fill(0);
  const cols = Array<number>(GRID_SIZE).fill(0);
  const quadrants = { no: 0, ne: 0, so: 0, se: 0 };
  const half = GRID_SIZE / 2;
  for (const cell of mines) {
    const { x, y } = fromCell(cell);
    rows[y]++;
    cols[x]++;
    if (y < half) quadrants[x < half ? 'no' : 'ne']++;
    else quadrants[x < half ? 'so' : 'se']++;
  }
  return { rows, cols, quadrants };
}

function makeSequence(seed: number, reached: number, attempts: number): number[] {
  const rng = mulberry32((seed ^ Math.imul(reached + 1, 7919) ^ Math.imul(attempts + 1, 104729)) >>> 0);
  return Array.from({ length: HACK_LENGTH }, () => Math.floor(rng() * HACK_SYMBOLS));
}

function reject(
  state: NavigationState,
  code:
    | 'no_fuel'
    | 'no_energy'
    | 'gravity_violation'
    | 'shield_active'
    | 'mine_hit'
    | 'wrong_value'
    | 'invalid_action'
    | 'wrong_role',
  message: string,
  penaltySeconds = 0,
  next: NavigationState = state,
): ApplyResult<NavigationState> {
  const mistakes = penaltySeconds > 0 ? next.mistakes + 1 : next.mistakes;
  return { state: { ...next, mistakes }, penaltySeconds, error: { code, message } };
}

function randomTerrain(rng: () => number): Terrain {
  const r = rng();
  return r < 0.5 ? 'libre' : r < 0.83 ? 'asteroides' : 'pozo';
}

export const navigationChallenge: ChallengeModule<NavigationState> = {
  id: 2,
  name: 'Navigation and Blocked Routes Module',
  briefing: {
    story:
      'To reach the beacon’s relay, a scout drone must cross a blocked sector seeded with mines, over terrain that drains energy. Each of you holds one layer of the map.',
    objective:
      'Fly the drone from A1 to F6 through two checkpoints in order, without hitting mines and without running out of battery.',
    roles: {
      navegador: 'The only one who moves the drone. Their radar says how many mines surround the ship, but not which ones.',
      analista: 'Knows how many mines are in each row, column and quadrant, and must deduce where they are.',
      criptografo: 'Holds true clues about the mines to help the Analyst deduce where they are, and knows the gravity protocols.',
      estratega: 'Sees the terrain (how much energy each cell costs) and knows the checkpoints and their order.',
      ingeniero: 'Manages the battery: charges each thruster with just enough energy for every move.',
      hacker: 'Decrypts the shield at each checkpoint and can ask the radar whether a cell is a mine.',
    },
  },

  init(seed) {
    const rng = mulberry32(seed);
    const free: Cell[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = toCell({ x, y });
        if (cell !== toCell(START) && cell !== toCell(GOAL)) free.push(cell);
      }
    }

    // Se sortea hasta que la partida tenga solución (casi siempre alcanza con el primer intento).
    for (let attempt = 0; attempt < 500; attempt++) {
      const picked = shuffle(free, rng);
      const checkpoints = picked.slice(0, NAV_CHECKPOINT_COUNT);
      const mines = picked.slice(NAV_CHECKPOINT_COUNT, NAV_CHECKPOINT_COUNT + MINE_COUNT).sort();
      const terrain = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => randomTerrain(rng));
      const found = solve({ mines, checkpoints, terrain });
      if (!found) continue;
      const capacity = Math.ceil(found.cost * BATTERY_MARGIN) + BATTERY_EXTRA;
      return {
        seed,
        mines,
        checkpoints,
        terrain,
        reached: 0,
        pos: START,
        lastDir: null,
        run: 0,
        charges: { linear: 0, lateral: 0 },
        battery: capacity,
        capacity,
        minEnergy: found.cost,
        shield: false,
        sequence: [],
        hackAttempts: 0,
        probes: [],
        trail: [{ cell: toCell(START), radar: radarAt(mines, START) }],
        hits: [],
        flags: [],
        mineClues: buildMineClues(mines, rng),
        lastSafe: START,
        moves: 0,
        mistakes: 0,
        finished: false,
        solution: found.path,
      };
    }
    throw new Error('Could not generate a solvable board');
  },

  viewFor(state, role: Role): ChallengeView {
    switch (role) {
      case 'navegador':
        return {
          kind: 'nav',
          role,
          position: toCell(state.pos),
          shield: state.shield,
          moves: state.moves,
          radar: radarAt(state.mines, state.pos),
          trail: state.trail,
          hits: state.hits,
          flags: state.flags,
        };
      case 'analista':
        return { kind: 'nav', role, ...mineCounts(state.mines), flags: state.flags };
      case 'criptografo':
        return {
          kind: 'nav',
          role,
          rules: [
            `Gravity: never more than ${NAV_MAX_STRAIGHT} moves in a row in the same direction. The next one is blocked and costs ${NAV_GRAVITY_PENALTY_SECONDS} s.`,
            'Linear thruster: moves the ship up or down. Lateral thruster: left or right.',
            `Mine: the ship returns to the last checkpoint (or the start) and ${NAV_MINE_PENALTY_SECONDS} s are lost.`,
            'Touching a checkpoint raises a shield that blocks progress until the Hacker decrypts it.',
          ],
          mineClues: state.mineClues,
        };
      case 'estratega':
        return {
          kind: 'nav',
          role,
          checkpoints: state.checkpoints.map((cell, i) => ({ cell, reached: i < state.reached })),
          goal: toCell(GOAL),
          start: toCell(START),
          terrain: state.terrain,
          position: toCell(state.pos),
        };
      case 'ingeniero':
        return {
          kind: 'nav',
          role,
          charges: state.charges,
          battery: state.battery,
          capacity: state.capacity,
          maxCharge: NAV_MAX_CHARGE,
        };
      case 'hacker':
        return {
          kind: 'nav',
          role,
          shield: state.shield,
          sequence: state.shield ? state.sequence : null,
          reached: state.reached,
          total: state.checkpoints.length,
          probes: state.probes,
          freeProbesLeft: Math.max(0, NAV_FREE_PROBES - state.probes.length),
        };
    }
  },

  facilitatorView(state): FacilitatorView {
    return {
      kind: 'nav',
      position: toCell(state.pos),
      mines: state.mines,
      checkpoints: state.checkpoints,
      reached: state.reached,
      terrain: state.terrain,
      battery: state.battery,
      minEnergy: state.minEnergy,
      solution: state.solution,
      mistakes: state.mistakes,
    };
  },

  apply(state, role, action) {
    if (state.finished) return { state };

    switch (action.kind) {
      case 'nav:charge': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can charge the thrusters.');
        const { thruster, amount } = action;
        if (thruster !== 'linear' && thruster !== 'lateral') {
          return reject(state, 'invalid_action', 'Unknown thruster.');
        }
        if (!Number.isInteger(amount) || amount < 1 || amount > NAV_MAX_CHARGE) {
          return reject(state, 'invalid_action', `The charge must be from 1 to ${NAV_MAX_CHARGE}.`);
        }
        if (state.charges[thruster] + amount > NAV_MAX_CHARGE) {
          return reject(state, 'invalid_action', `That thruster can’t hold more than ${NAV_MAX_CHARGE} charge.`);
        }
        if (state.battery < amount) {
          return reject(
            state,
            'no_energy',
            `Not enough battery (${state.battery} left). An emergency recharge is needed: it costs ${NAV_RECHARGE_PENALTY_SECONDS} s.`,
          );
        }
        return {
          state: {
            ...state,
            battery: state.battery - amount,
            charges: { ...state.charges, [thruster]: state.charges[thruster] + amount },
          },
        };
      }

      case 'nav:recharge': {
        if (role !== 'ingeniero') return reject(state, 'wrong_role', 'Only the Engineer can recharge the battery.');
        return {
          state: { ...state, battery: state.battery + NAV_RECHARGE_AMOUNT, mistakes: state.mistakes + 1 },
          penaltySeconds: NAV_RECHARGE_PENALTY_SECONDS,
        };
      }

      case 'nav:flag': {
        if (role !== 'analista') return reject(state, 'wrong_role', 'Only the Analyst can mark mines for the Navigator.');
        const cell = typeof action.cell === 'string' ? action.cell.toUpperCase() : '';
        if (!/^[A-Z][0-9]$/.test(cell) || !inBounds(fromCell(cell))) {
          return reject(state, 'invalid_action', 'Invalid cell.');
        }
        const flags = state.flags.includes(cell) ? state.flags.filter((c) => c !== cell) : [...state.flags, cell].sort();
        return { state: { ...state, flags } };
      }

      case 'nav:probe': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can query the radar.');
        const cell = typeof action.cell === 'string' ? action.cell.toUpperCase() : '';
        if (!/^[A-Z][0-9]$/.test(cell) || !inBounds(fromCell(cell))) {
          return reject(state, 'invalid_action', 'Invalid cell.');
        }
        if (state.probes.some((p) => p.cell === cell)) {
          return reject(state, 'invalid_action', `Ya consultaste ${cell}.`);
        }
        const probes = [...state.probes, { cell, mine: state.mines.includes(cell) }];
        const next = { ...state, probes };
        return probes.length > NAV_FREE_PROBES
          ? { state: next, penaltySeconds: NAV_PROBE_PENALTY_SECONDS }
          : { state: next };
      }

      case 'nav:hack': {
        if (role !== 'hacker') return reject(state, 'wrong_role', 'Only the Hacker can decrypt the shield.');
        if (!state.shield) return reject(state, 'invalid_action', 'No shield is active.');
        const { answer } = action;
        if (
          !Array.isArray(answer) ||
          answer.length !== HACK_LENGTH ||
          !answer.every((n) => Number.isInteger(n) && n >= 0 && n < HACK_SYMBOLS)
        ) {
          return reject(state, 'invalid_action', 'Invalid answer.');
        }
        if (answer.every((n, i) => n === state.sequence[i])) {
          return { state: { ...state, shield: false, sequence: [] } };
        }
        const hackAttempts = state.hackAttempts + 1;
        return reject(
          state,
          'wrong_value',
          `Wrong sequence. You lost ${NAV_HACK_PENALTY_SECONDS} s and a new one was generated.`,
          NAV_HACK_PENALTY_SECONDS,
          { ...state, hackAttempts, sequence: makeSequence(state.seed, state.reached, hackAttempts) },
        );
      }

      case 'nav:move': {
        if (role !== 'navegador') return reject(state, 'wrong_role', 'Only the Navigator can move the ship.');
        const input = action.dir;
        if (!DIRECTIONS.includes(input)) return reject(state, 'invalid_action', 'Unknown direction.');
        if (state.shield) {
          return reject(state, 'shield_active', 'The shield is active: the Hacker must decrypt it.');
        }

        const dir = input;
        const target = { x: state.pos.x + DELTAS[dir].x, y: state.pos.y + DELTAS[dir].y };
        if (!inBounds(target)) return reject(state, 'invalid_action', 'You can’t leave the grid.');

        const thruster = thrusterFor(dir);
        const needed = costAt(state.terrain, target);
        if (state.charges[thruster] < needed) {
          return reject(
            state,
            'no_fuel',
            `Not enough charge: the ${thruster === 'linear' ? 'linear' : 'lateral'} thruster can’t reach that cell.`,
          );
        }

        const run = dir === state.lastDir ? state.run + 1 : 1;
        if (run > NAV_MAX_STRAIGHT) {
          return reject(
            state,
            'gravity_violation',
            `Gravity protocol: too many moves in a row in the same direction. You lost ${NAV_GRAVITY_PENALTY_SECONDS} s.`,
            NAV_GRAVITY_PENALTY_SECONDS,
          );
        }

        // El propulsor gasta toda su carga: lo que sobre se pierde.
        const moved: NavigationState = {
          ...state,
          pos: target,
          lastDir: dir,
          run,
          moves: state.moves + 1,
          charges: { ...state.charges, [thruster]: 0 },
        };

        const cell = toCell(target);
        if (state.mines.includes(cell)) {
          return reject(
            state,
            'mine_hit',
            `Mine at ${cell}! The ship returns to ${toCell(state.lastSafe)}. You lost ${NAV_MINE_PENALTY_SECONDS} s.`,
            NAV_MINE_PENALTY_SECONDS,
            { ...moved, pos: state.lastSafe, lastDir: null, run: 0, hits: [...new Set([...state.hits, cell])] },
          );
        }

        const trail = state.trail.some((t) => t.cell === cell)
          ? state.trail
          : [...state.trail, { cell, radar: radarAt(state.mines, target) }];
        const visited: NavigationState = { ...moved, trail };

        if (state.reached < state.checkpoints.length && cell === state.checkpoints[state.reached]) {
          const reached = state.reached + 1;
          return {
            state: {
              ...visited,
              reached,
              shield: true,
              lastSafe: target,
              sequence: makeSequence(state.seed, reached, 0),
              hackAttempts: 0,
            },
          };
        }

        if (samePos(target, GOAL) && state.reached === state.checkpoints.length) {
          return { state: { ...visited, finished: true } };
        }
        return { state: visited };
      }

      default:
        return reject(state, 'invalid_action', 'Unknown action.');
    }
  },

  isComplete(state) {
    return state.finished;
  },
};
