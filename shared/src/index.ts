// Tipos y constantes compartidos entre servidor y cliente.

export const ROLES = [
  'navegador',
  'analista',
  'criptografo',
  'estratega',
  'ingeniero',
  'hacker',
] as const;

export type Role = (typeof ROLES)[number];

export interface RoleInfo {
  label: string;
  /** Nombre del icono en lucide-react */
  icon: 'Compass' | 'Activity' | 'Key' | 'Clock' | 'Sliders' | 'Terminal';
  summary: string;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  navegador: {
    label: 'Navigator',
    icon: 'Compass',
    summary: 'Spatial vision and grids. Steers the ship with the arrow keys.',
  },
  analista: {
    label: 'Analyst',
    icon: 'Activity',
    summary: 'Diagnostics and anomalies. Sees what nobody else can see.',
  },
  criptografo: {
    label: 'Cryptographer',
    icon: 'Key',
    summary: 'Decoding and system laws. Reads formulas and manuals.',
  },
  estratega: {
    label: 'Strategist',
    icon: 'Clock',
    summary: 'Timing and sequences. Dictates the order of every step.',
  },
  ingeniero: {
    label: 'Engineer',
    icon: 'Sliders',
    summary: 'Mechanical control. Moves sliders, fuel and parts.',
  },
  hacker: {
    label: 'Hacker',
    icon: 'Terminal',
    summary: 'Bypasses and special tools. Unlocks and verifies.',
  },
};

export const MAX_PLAYERS = ROLES.length;
export const NAME_MAX_LENGTH = 20;

/** Sin 0/O ni 1/I para que el código se dicte sin confusiones por la llamada. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

/** Duración total de los desafíos (50 minutos). */
export const TOTAL_SECONDS = 3000;

/**
 * lobby → briefing (descripción del desafío + elección de roles) → playing ⇄ paused
 *   → transition (desafío completado) → briefing del siguiente … → won | lost
 */
export type RoomStatus =
  | 'lobby'
  | 'intro' // cinematic call that explains the mission, before the warm-up or challenge 1
  | 'practice' // warm-up round before challenge 1 (no clock, nothing counts)
  | 'practice_done'
  | 'briefing'
  | 'playing'
  | 'paused'
  | 'transition'
  | 'final' // after challenge 6: put the six recovered fragments in order
  | 'won'
  | 'lost';

export const HINT_MAX_LENGTH = 200;
/** Máximo que el facilitador puede sumar o restar al timer en un solo comando. */
export const TIME_ADJUST_MAX_SECONDS = 600;

// ---------------------------------------------------------------------------
// Desafíos: lo que cada rol ve y hace. Cada desafío nuevo suma sus tipos
// a las uniones ChallengeView, FacilitatorView y ChallengeAction.
// ---------------------------------------------------------------------------

/** Desafío de práctica (provisorio hasta la etapa 2): cada rol ve un dígito. */
export interface SandboxView {
  kind: 'sandbox';
  /** Dígito que ve este rol. */
  digit: string;
  /** Solo el Hacker puede ingresar el código. */
  canSubmit: boolean;
  /** Solo el Hacker conoce el orden en que se arma el código. */
  order: Role[] | null;
  attempts: number;
}

export interface SandboxFacilitatorView {
  kind: 'sandbox';
  code: string;
  attempts: number;
}

export interface SandboxAction {
  kind: 'sandbox:submit';
  code: string;
}

// --- Final step: assemble the coordinates ----------------------------------

/** Position of the aircraft, one fragment per mission: deg/min/sec of latitude N, then of longitude E. */
export const FRAGMENTS = ['68', '26', '28.1', '112', '48', '41.2'] as const;
export const FINAL_SLOT_LABELS = [
  'Latitude N · degrees',
  'Latitude N · minutes',
  'Latitude N · seconds',
  'Longitude E · degrees',
  'Longitude E · minutes',
  'Longitude E · seconds',
] as const;

export interface FragmentInfo {
  challengeId: number;
  value: string;
}

/** Only sent once the team has put the fragments in the right order. */
export interface Reveal {
  dms: string;
  lat: number;
  lng: number;
  summary: string[];
}

export interface FinalView {
  kind: 'final';
  /** The one rule of thumb this role knows. */
  clue: string;
  /** Fragments not placed yet, in a fixed shuffled order. */
  pool: string[];
  /** The six slots in reading order; null = empty. */
  slots: (string | null)[];
  attempts: number;
}

export interface FinalFacilitatorView {
  kind: 'final';
  attempts: number;
}

export type FinalAction =
  | { kind: 'final:place'; slot: number; value: string }
  | { kind: 'final:clear'; slot: number }
  | { kind: 'final:submit' };

// --- Desafío 1: Sincronización del Núcleo de Energía -----------------------

export const REACTOR_COUNT = 10;
/** Cuántos de los reactores están en estado crítico (deben quedar en 0%). */
export const CORE_CRITICAL_COUNT = 4;
/** Un reactor es crítico si su temperatura supera a su presión por más que esto. */
export const CORE_FAULT_THRESHOLD = 40;
export const REACTOR_SLIDER_STEP = 10;

/** Penalidades de tiempo del Desafío 1, en segundos. */
export const CORE_OVERLOAD_PENALTY_SECONDS = 30;
export const CORE_ORDER_PENALTY_SECONDS = 30;
export const CORE_VALUE_PENALTY_SECONDS = 15;
/** El Hacker ingresa mal el código de enlace. */
export const CORE_CONFIRM_PENALTY_SECONDS = 10;
export const CORE_CONFIRM_CODE_LENGTH = 4;

/** Lo que ve cada rol en el Desafío 1; ninguno incluye datos de otro rol. */
export type PowerCoreView =
  | {
      kind: 'core';
      role: 'navegador';
      /** Todos los reactores (sanos y críticos, sin distinguirlos), con su lugar en el diagrama (0 a 1). */
      nodes: { reactor: number; x: number; y: number }[];
      /** Todas las conexiones, incluidas las que llegan a reactores críticos. */
      links: [number, number][];
    }
  | {
      kind: 'core';
      role: 'analista';
      /** Lecturas crudas: el Analista decide cuáles son críticos con la regla de diagnóstico. */
      reactors: { id: number; temperature: number; pressure: number }[];
      threshold: number;
      /** Reactores cuyos datos ya le envió al Criptógrafo. */
      shared: number[];
    }
  | {
      kind: 'core';
      role: 'criptografo';
      /** Potencia (%) = base + porConexión × conexiones con reactores sanos + bono según la temperatura. */
      base: number;
      perConnection: number;
      bands: { label: string; bonus: number }[];
      /** Datos que le envió el Analista, el más reciente primero. */
      received: { reactor: number; temperature: number; pressure: number }[];
    }
  | {
      kind: 'core';
      role: 'estratega';
      /**
       * Orden de calibración de TODOS los reactores, también los fallados: el Estratega no sabe cuáles son
       * (eso lo tiene el Analista) y los tacha. El orden final es esta lista sin los tachados.
       */
      sequence: number[];
      /** Reactores que el Estratega marcó como «no funciona». */
      marked: number[];
      /** Reactores sanos que ya fueron calibrados. */
      calibrated: number[];
    }
  | {
      kind: 'core';
      role: 'ingeniero';
      reactors: { id: number; level: number; locked: boolean }[];
      step: number;
      /** Reactor fijado que espera la confirmación del Hacker: hay que dictarle el código. */
      pending: { reactor: number; value: number; code: string } | null;
    }
  | {
      kind: 'core';
      role: 'hacker';
      aligned: boolean;
      /** Fijado del Ingeniero que espera su confirmación (el código se lo dicta el Ingeniero). */
      pending: { reactor: number; value: number } | null;
      /** Solo aparece cuando todos los reactores sanos quedaron calibrados. */
      confirmationCode: string | null;
      done: number;
      total: number;
    };

export interface PowerCoreFacilitatorView {
  kind: 'core';
  /** Secuencia completa que ve el Estratega (con los críticos intercalados). */
  fullSequence: number[];
  reactors: {
    id: number;
    critical: boolean;
    temperature: number;
    pressure: number;
    /** Conexiones que cuentan (solo con reactores sanos). */
    connections: number;
    target: number;
    level: number;
    locked: boolean;
  }[];
  sequence: number[];
  done: number;
  mistakes: number;
  confirmationCode: string;
}

export type PowerCoreAction =
  /** El Ingeniero fija la potencia (%) de un reactor. */
  | { kind: 'core:set'; reactor: number; value: number }
  /** El Hacker inyecta la carga final cuando todo está alineado. */
  | { kind: 'core:seal' }
  /** El Estratega marca o desmarca un reactor como «no funciona» en su secuencia. */
  | { kind: 'core:mark'; reactor: number }
  /** El Analista le envía al Criptógrafo las lecturas de un reactor. */
  | { kind: 'core:share'; reactor: number }
  /** El Hacker confirma el reactor fijado con el código que le dicta el Ingeniero. */
  | { kind: 'core:confirm'; code: string };


// ---------- Desafío 2: Módulo de Navegación y Rutas Bloqueadas ----------

export const GRID_SIZE = 6;
export const NAV_CHECKPOINT_COUNT = 2;
/** Máximo de movimientos seguidos en la misma dirección (Protocolo de Gravedad). */
export const NAV_MAX_STRAIGHT = 2;
export const NAV_MINE_PENALTY_SECONDS = 60;
export const NAV_GRAVITY_PENALTY_SECONDS = 15;
export const NAV_HACK_PENALTY_SECONDS = 10;
export const HACK_LENGTH = 5;
export const HACK_SYMBOLS = 4;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Thruster = 'linear' | 'lateral';
/** Casilla en formato A1 (columna letra A–F, fila número 1–6). */
export type Cell = string;

/** Energía que cuesta entrar a una casilla según su terreno. */
export const NAV_MAX_CHARGE = 3;
/** Batería de emergencia: suma energía pero cuesta tiempo. */
export const NAV_RECHARGE_AMOUNT = 10;
export const NAV_RECHARGE_PENALTY_SECONDS = 30;
/** Consultas del Hacker al radar (¿esta casilla es mina?): las primeras no cuestan. */
export const NAV_FREE_PROBES = 5;
export const NAV_PROBE_PENALTY_SECONDS = 10;

export type Terrain = 'libre' | 'asteroides' | 'pozo';
export const TERRAIN_INFO: Record<Terrain, { label: string; cost: number }> = {
  libre: { label: 'Open space', cost: 1 },
  asteroides: { label: 'Asteroid field', cost: 2 },
  pozo: { label: 'Gravity well', cost: 3 },
};

export type NavigationView =
  | {
      kind: 'nav';
      role: 'navegador';
      position: Cell;
      shield: boolean;
      moves: number;
      /** Minas en las 8 casillas que rodean a la nave (sin decir cuáles). */
      radar: number;
      /** Casillas ya visitadas con su lectura de radar. */
      trail: { cell: Cell; radar: number }[];
      /** Minas que ya explotaron. */
      hits: Cell[];
      /** Minas que el Analista marcó como seguras. */
      flags: Cell[];
    }
  | {
      kind: 'nav';
      role: 'analista';
      /** Minas por fila (1 a 6) y por columna (A a F), y por cuadrante de 3×3. */
      rows: number[];
      cols: number[];
      quadrants: { no: number; ne: number; so: number; se: number };
      /** Casillas que ya le mandó al Navegador como minas. */
      flags: Cell[];
    }
  | {
      kind: 'nav';
      role: 'criptografo';
      rules: string[];
      /** Pistas verdaderas sobre dónde están (o no) las minas, para ayudar al Analista a deducir. */
      mineClues: string[];
    }
  | {
      kind: 'nav';
      role: 'estratega';
      checkpoints: { cell: Cell; reached: boolean }[];
      goal: Cell;
      start: Cell;
      /** Terreno de las 36 casillas (fila por fila). */
      terrain: Terrain[];
      /** Dónde está la nave ahora. */
      position: Cell;
    }
  | {
      kind: 'nav';
      role: 'ingeniero';
      /** Carga actual de cada propulsor (se pierde lo que sobre en cada movimiento). */
      charges: Record<Thruster, number>;
      battery: number;
      capacity: number;
      maxCharge: number;
    }
  | {
      kind: 'nav';
      role: 'hacker';
      shield: boolean;
      sequence: number[] | null;
      reached: number;
      total: number;
      /** Resultado de las consultas al radar. */
      probes: { cell: Cell; mine: boolean }[];
      freeProbesLeft: number;
    };

export interface NavigationFacilitatorView {
  kind: 'nav';
  position: Cell;
  mines: Cell[];
  checkpoints: Cell[];
  reached: number;
  terrain: Terrain[];
  battery: number;
  /** Energía mínima de una ruta válida. */
  minEnergy: number;
  /** Ruta que respeta todas las reglas con el menor gasto, como órdenes que da el Navegador. */
  solution: Direction[];
  mistakes: number;
}

export type NavigationAction =
  | { kind: 'nav:move'; dir: Direction }
  /** El Ingeniero suma carga (1 a 3) a un propulsor; sale de la batería. */
  | { kind: 'nav:charge'; thruster: Thruster; amount: number }
  /** Recarga de emergencia de la batería (cuesta tiempo). */
  | { kind: 'nav:recharge' }
  /** El Hacker consulta al radar si una casilla es mina. */
  | { kind: 'nav:probe'; cell: Cell }
  /** El Analista marca (o desmarca) una casilla como mina segura: el Navegador la ve en su mapa. */
  | { kind: 'nav:flag'; cell: Cell }
  | { kind: 'nav:hack'; answer: number[] };


// ---------- Desafío 3: Reensamblaje del Circuito Maestro ----------

export const CIRCUIT_SIZE = 4;
export const CIRCUIT_SCAN_SECONDS = 8;
export const CIRCUIT_RESCAN_SECONDS = 4;
export const CIRCUIT_MAX_RESCANS = 2;
export const CIRCUIT_RESCAN_PENALTY_SECONDS = 20;
/** Verificaciones de voltaje sin costo; a partir de la siguiente cada una resta tiempo. */
export const CIRCUIT_FREE_VERIFICATIONS = 3;
export const CIRCUIT_VERIFY_PENALTY_SECONDS = 10;
export const CIRCUIT_ORDER_PENALTY_SECONDS = 15;

export const PIECE_IDS = ['fusible', 'interruptor', 'nodo_t', 'nodo_y', 'cable_recto', 'cable_codo'] as const;
export type PieceId = (typeof PIECE_IDS)[number];
export type PiecePhase = 'fusibles' | 'nodos' | 'cables';

export const PIECE_INFO: Record<PieceId, { label: string; phase: PiecePhase }> = {
  fusible: { label: 'Fuse', phase: 'fusibles' },
  interruptor: { label: 'Switch', phase: 'fusibles' },
  nodo_t: { label: 'T node', phase: 'nodos' },
  nodo_y: { label: 'Y node', phase: 'nodos' },
  cable_recto: { label: 'Straight wire', phase: 'cables' },
  cable_codo: { label: 'Elbow wire', phase: 'cables' },
};
export const PHASE_LABELS: Record<PiecePhase, string> = {
  fusibles: 'Fuses',
  nodos: 'Nodes',
  cables: 'Wires',
};
/** Hacia dónde apunta la pieza según su rotación (0 a 3, en sentido horario). */
export const ROTATION_NAMES = ['North', 'East', 'South', 'West'] as const;

export interface PlacedPiece {
  piece: PieceId;
  cell: Cell;
  rotation: number;
}
export interface PieceState {
  piece: PieceId;
  rotation: number;
  /** null si todavía está en la bandeja. */
  cell: Cell | null;
}

export type CircuitView =
  | {
      kind: 'circuit';
      role: 'navegador';
      occupied: Cell[];
      focus: Cell | null;
      /** Brújula: hacia dónde apunta cada pieza en el circuito correcto. Solo él la conoce. */
      compass: { piece: PieceId; rotation: number }[];
    }
  | {
      kind: 'circuit';
      role: 'analista';
      canScan: boolean;
      /** Solo mientras dura el escaneo; después el servidor deja de enviarlo. Son casillas sin nombre de pieza. */
      scan: { cells: Cell[]; msLeft: number } | null;
      rescansGranted: number;
    }
  | { kind: 'circuit'; role: 'criptografo'; clues: string[] }
  | {
      kind: 'circuit';
      role: 'estratega';
      phases: { phase: PiecePhase; pieces: PieceId[]; placed: boolean }[];
      current: number;
      /** Qué piezas van en las filas 1-2 (mitad superior) y cuáles en las filas 3-4 (mitad inferior). */
      halves: { top: PieceId[]; bottom: PieceId[] };
    }
  | { kind: 'circuit'; role: 'ingeniero'; pieces: PieceState[]; focus: Cell | null }
  | {
      kind: 'circuit';
      role: 'hacker';
      verifications: number;
      freeLeft: number;
      /** Resultado de la última verificación, pieza por pieza. */
      last: { correct: number; total: number; pieces: { piece: PieceId; ok: boolean }[] } | null;
      rescansLeft: number;
      canRescan: boolean;
    };

export interface CircuitFacilitatorView {
  kind: 'circuit';
  layout: PlacedPiece[];
  clues: string[];
  halves: { top: PieceId[]; bottom: PieceId[] };
  phases: PiecePhase[];
  placed: number;
  verifications: number;
  mistakes: number;
}

export type CircuitAction =
  | { kind: 'circuit:scan' }
  | { kind: 'circuit:rescan' }
  | { kind: 'circuit:verify' }
  | { kind: 'circuit:focus'; cell: Cell | null }
  | { kind: 'circuit:place'; piece: PieceId; cell: Cell }
  | { kind: 'circuit:remove'; piece: PieceId }
  | { kind: 'circuit:rotate'; piece: PieceId; turn: 'cw' | 'ccw' };


// ---------- Desafío 4: Intercepción de Señales ----------

export const SIGNAL_BURSTS = ['alfa', 'beta', 'gamma', 'delta'] as const;
export type BurstId = (typeof SIGNAL_BURSTS)[number];
export const BURST_LABELS: Record<BurstId, string> = { alfa: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta' };

/** Canales de frecuencia que puede sintonizar el Ingeniero. */
export const SIGNAL_CHANNELS = 9;
/** Cada canal cubre 40° de rumbo: canal 1 = 0°–39°, canal 2 = 40°–79°… */
export const SIGNAL_DEGREES_PER_CHANNEL = 360 / SIGNAL_CHANNELS;
export const SIGNAL_TUNE_PENALTY_SECONDS = 5;
export const SIGNAL_FREE_DECODES = 1;
export const SIGNAL_DECODE_PENALTY_SECONDS = 5;
export const SIGNAL_SUBMIT_PENALTY_SECONDS = 20;

export type CipherMethod = 'adelante' | 'atras' | 'espejo' | 'inverso';
export const CIPHER_METHODS: CipherMethod[] = ['adelante', 'atras', 'espejo', 'inverso'];
/** Cómo se DESCIFRA cada método, con N = el desfase que mide el Analista. */
export const CIPHER_INFO: Record<CipherMethod, { label: string; steps: string }> = {
  adelante: { label: 'Forward shift', steps: 'Move each letter back N positions in the alphabet (A wraps back to Z).' },
  atras: { label: 'Backward shift', steps: 'Move each letter forward N positions in the alphabet (Z wraps forward to A).' },
  espejo: {
    label: 'Mirror',
    steps: 'First mirror each letter (A↔Z, B↔Y, C↔X…), then move back N positions.',
  },
  inverso: { label: 'Reverse', steps: 'First read the word backwards, then move each letter back N positions.' },
};

export type SignalView =
  | {
      kind: 'signal';
      role: 'navegador';
      /** Rumbo en grados desde el que llega cada ráfaga. */
      bearings: { burst: BurstId; degrees: number }[];
    }
  | {
      kind: 'signal';
      role: 'analista';
      /** Desfase medido en el espectro de cada ráfaga. */
      shifts: { burst: BurstId; shift: number }[];
    }
  | {
      kind: 'signal';
      role: 'criptografo';
      /** Tabla rumbo → canal. */
      bands: { channel: number; from: number; to: number }[];
      /** Método de cifrado de cada ráfaga. */
      methods: { burst: BurstId; method: CipherMethod; label: string; steps: string }[];
    }
  | {
      kind: 'signal';
      role: 'estratega';
      /** Orden en que se lee el mensaje: la primera ráfaga es la palabra 1. */
      order: BurstId[];
      tuned: BurstId[];
    }
  | {
      kind: 'signal';
      role: 'ingeniero';
      channels: number;
      bursts: { burst: BurstId; tuned: boolean; channel: number | null }[];
    }
  | {
      kind: 'signal';
      role: 'hacker';
      bursts: {
        burst: BurstId;
        captured: boolean;
        cipher: string | null;
        decodes: number;
        last: { method: CipherMethod; shift: number; result: string } | null;
      }[];
      freeDecodes: number;
      attempts: number;
      /** Cuántas palabras acertó en el último intento (null si todavía no intentó). */
      lastCorrect: number | null;
      total: number;
    };

export interface SignalFacilitatorView {
  kind: 'signal';
  bursts: { burst: BurstId; word: string; channel: number; degrees: number; method: CipherMethod; shift: number; cipher: string }[];
  /** Palabras en el orden en que hay que escribirlas. */
  words: string[];
  order: BurstId[];
  tuned: number;
  attempts: number;
  mistakes: number;
}

export type SignalAction =
  /** El Ingeniero sintoniza una ráfaga en un canal. */
  | { kind: 'sig:tune'; burst: BurstId; channel: number }
  /** El Hacker prueba un método y un desfase sobre una ráfaga capturada. */
  | { kind: 'sig:decode'; burst: BurstId; method: CipherMethod; shift: number }
  /** El Hacker transmite las 4 palabras, en orden de lectura. */
  | { kind: 'sig:submit'; words: string[] };


// ---------- Desafío 5: La Bomba ----------

/** Tiempo para desactivar la bomba, en segundos de juego (sin contar pausas ni penalidades). Al agotarse, se reinicia. */
export const BOMB_SECONDS = 300;
export const BOMB_MAX_STRIKES = 3;
export const BOMB_WRONG_PIN_PENALTY_SECONDS = 5;
export const BOMB_CUTS = 4;
export const BOMB_PIN_LENGTH = 3;

export type BombColor = 'rojo' | 'azul' | 'verde' | 'amarillo' | 'blanco' | 'negro';
export const BOMB_COLORS: BombColor[] = ['rojo', 'azul', 'verde', 'amarillo', 'blanco', 'negro'];
export const BOMB_COLOR_LABELS: Record<BombColor, string> = {
  rojo: 'Red',
  azul: 'Blue',
  verde: 'Green',
  amarillo: 'Yellow',
  blanco: 'White',
  negro: 'Black',
};

export const BOMB_SYMBOLS = ['▲', '●', '■', '★', '◆', '✚'];

/** Lo que todos los roles ven de la bomba: el reloj, los errores y el avance. */
export interface BombBase {
  kind: 'bomb';
  /** Intento actual, empezando en 1. */
  attempt: number;
  strikes: number;
  maxStrikes: number;
  cutsDone: number;
  cutsNeeded: number;
  unlocked: boolean;
  bombMs: number;
  /** Tiempo que queda, en el momento en que se armó la vista. */
  leftMs: number;
}

export type BombView = BombBase &
  (
    | { role: 'navegador'; cables: { position: number; color: BombColor }[] }
    | { role: 'analista'; decoys: BombColor[] }
    | { role: 'criptografo'; pin: string[] }
    | { role: 'estratega'; ranking: BombColor[] }
    | { role: 'ingeniero'; cables: { position: number; cut: boolean }[] }
    | { role: 'hacker'; table: { symbol: string; digit: number }[]; pinLength: number }
  );

export interface BombFacilitatorView {
  kind: 'bomb';
  attempt: number;
  strikes: number;
  cuts: number;
  layout: BombColor[];
  decoys: BombColor[];
  ranking: BombColor[];
  /** Cables a cortar, en orden. */
  solution: { position: number; color: BombColor }[];
  pin: string;
  pinSymbols: string[];
  mistakes: number;
}

export type BombAction =
  /** El Hacker teclea el PIN del panel. */
  | { kind: 'bomb:unlock'; pin: string }
  /** El Ingeniero corta el cable de una posición (1 a 6). */
  | { kind: 'bomb:cut'; position: number };

// ---------- Desafío 6: El Puente de Cristal (acertijos) ----------

export const BRIDGE_ROWS = 6;
/** Una sola equivocación permitida: con dos opciones, el segundo intento sería obvio. */
export const BRIDGE_MAX_STRIKES = 2;
export type BridgeSide = 'L' | 'R';
/** Cada rol es el especialista de una categoría de acertijos y tiene la pista de los suyos. */
export const BRIDGE_CATEGORY: Record<Role, string> = {
  analista: 'Numbers',
  criptografo: 'Words',
  hacker: 'Logic',
  navegador: 'Space',
  ingeniero: 'Mechanics',
  estratega: 'Reasoning',
};

/** Lo que todos ven del puente: los errores y por dónde va el equipo. */
export interface BridgeBase {
  kind: 'bridge';
  /** Intento actual, empezando en 1. */
  attempt: number;
  strikes: number;
  maxStrikes: number;
  rows: number;
  /** Filas ya cruzadas. */
  crossed: number;
  /** Baldosas que ya se rompieron en la fila actual. */
  cracked: BridgeSide[];
  /** El acertijo de la fila actual (null cuando ya se cruzó todo). Cada opción es una baldosa. */
  riddle: { row: number; category: string; text: string; left: string; right: string } | null;
  /** Lo que se resolvió en último lugar, con su explicación. */
  solved: { row: number; answer: string; explanation: string } | null;
}

export type BridgeView = BridgeBase & {
  role: Role;
  /** Categoría de la que este rol tiene las pistas. */
  specialty: string;
  /** La pista del acertijo actual: solo la ve el rol especialista de esa categoría. */
  hint: string | null;
};

export interface BridgeFacilitatorView {
  kind: 'bridge';
  attempt: number;
  strikes: number;
  crossed: number;
  rows: { row: number; category: string; role: Role; text: string; answer: string; hint: string }[];
  mistakes: number;
}

export type BridgeAction =
  /** El Estratega pisa una de las dos baldosas (opciones) de la fila que sigue. */
  { kind: 'bridge:step'; side: BridgeSide };

// ---------- Transmisión de pantalla (simulada) ----------

export const SHARE_INITIAL_CREDITS = 3;
/** Tope de créditos que puede dejar el facilitador, y máximo que puede sumar o restar de una vez. */
export const SHARE_MAX_CREDITS = 9;
/** «Sí» necesarios para aprobar (de 6 jugadores); quien propone cuenta como el primero. */
export const SHARE_VOTES_NEEDED = 4;
export const SHARE_VOTE_SECONDS = 15;
/** Espera tras una votación rechazada o vencida. */
export const SHARE_COOLDOWN_SECONDS = 20;
/** Costo en tiempo de una transmisión cuando ya no quedan créditos. */
export const SHARE_TIME_PENALTY_SECONDS = 20;
/** Tamaño máximo (JSON) del estado de pantalla que publica el emisor. */
export const SHARE_UI_MAX_CHARS = 20_000;

export interface ShareVoteInfo {
  proposedBy: string;
  /** playerId de quien transmitiría. */
  target: string;
  yes: number;
  no: number;
  needed: number;
  /** El voto de quien recibe este estado. */
  myVote: 'yes' | 'no' | null;
  /** Cómo se pagaría si se aprueba ahora. */
  payment: 'credit' | 'time';
  msLeft: number;
}

export interface ShareBroadcastInfo {
  /** Sube con cada transmisión de la sala. */
  id: number;
  fromPlayerId: string;
  role: Role;
  paidWith: 'credit' | 'time';
  /** Vista del rol del emisor; null para el emisor mismo, que ya tiene la suya. */
  view: ChallengeView | null;
  /** Estado de pantalla que publica el emisor (notas, selección…); vacío para el emisor. */
  ui: Record<string, unknown>;
}

export interface ShareInfo {
  credits: number;
  /** Lo que falta para poder volver a proponer (0 si ya se puede). */
  cooldownMs: number;
  vote: ShareVoteInfo | null;
  broadcast: ShareBroadcastInfo | null;
}

export type ChallengeView = FinalView | SandboxView | PowerCoreView | NavigationView | CircuitView | SignalView | BombView | BridgeView;
export type FacilitatorView =
  | FinalFacilitatorView
  | SandboxFacilitatorView
  | PowerCoreFacilitatorView
  | NavigationFacilitatorView
  | CircuitFacilitatorView
  | SignalFacilitatorView
  | BombFacilitatorView
  | BridgeFacilitatorView;
export type ChallengeAction = FinalAction | SandboxAction | PowerCoreAction | NavigationAction | CircuitAction | SignalAction | BombAction | BridgeAction;

/** El desafío en curso, visto desde un rol. */
export interface ChallengeInfo {
  id: number;
  name: string;
  view: ChallengeView;
  /** Plain-language explanation of this role's job, always available while playing. */
  task: RoleTask;
  /** How the whole challenge works, for the optional help panel. */
  guide: ChallengeGuide;
}

export interface TimerState {
  /** Tiempo restante en el momento en que el servidor armó este estado. */
  remainingMs: number;
  running: boolean;
}

export interface Hint {
  /** Sube con cada pista: el cliente la muestra una sola vez por id. */
  id: number;
  text: string;
}

export type FacilitatorCommand =
  /** From the lobby: starts the warm-up round (random roles, no clock). */
  | { type: 'lobby' }
  | { type: 'intro' }
  | { type: 'practice' }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Pasa del desafío completado al briefing del siguiente. */
  | { type: 'next' }
  /** Con todos los roles elegidos, arranca el desafío. */
  | { type: 'begin' }
  /** Asigna al azar los roles que faltan, respetando los que ya se usaron. */
  | { type: 'autoassign' }
  /** Con la misión terminada (ganada o perdida), vuelve al briefing del desafío 1 con datos nuevos. */
  | { type: 'replay' }
  | { type: 'restart' }
  | { type: 'skip' }
  | { type: 'time'; seconds: number }
  | { type: 'hint'; text: string }
  /** Corta la votación o la transmisión en curso (no devuelve el cobro). */
  | { type: 'share:cancel' }
  /** Suma o resta créditos de señal. */
  | { type: 'share:credits'; delta: number };

export interface PublicPlayer {
  playerId: string;
  name: string;
  role: Role | null;
  connected: boolean;
  isFacilitator: boolean;
  /** Roles de desafíos que ya empezaron: no se pueden volver a elegir. */
  usedRoles: Role[];
  /** Optional "I understand my role" check during the briefing. */
  ready: boolean;
}

export interface YouInfo {
  playerId: string;
  role: Role | null;
  isFacilitator: boolean;
  usedRoles: Role[];
}

/** Descripción de un desafío, antes de empezarlo: de qué trata y qué hace cada rol. */
export interface ChallengeBriefing {
  story: string;
  objective: string;
  roles: Record<Role, string>;
}

/** A role's job in plain words: what to do, what they can't see, and who to talk to. */
export interface RoleTask {
  does: string;
  cantSee: string;
  talkTo: string;
}

/** One arrow in the "who passes what to whom" diagram. */
export interface FlowStep {
  from: Role;
  to: Role;
  what: string;
}

/** Plain-language help for a challenge, shown in the briefing and in the in-game help. */
export interface ChallengeGuide {
  howTo: string[];
  flow: FlowStep[];
  tasks: Record<Role, RoleTask>;
}

export interface BriefingInfo extends ChallengeBriefing {
  challengeId: number;
  name: string;
  guide: ChallengeGuide;
}

/** Lo que cada jugador recibe de la sala (ya filtrado para él). */
export interface RoomState {
  roomId: string;
  status: RoomStatus;
  currentChallenge: number | null;
  totalChallenges: number;
  players: PublicPlayer[];
  you: YouInfo;
  timer: TimerState;
  /** Solo durante el briefing: descripción del desafío que viene. */
  briefing: BriefingInfo | null;
  /** Solo la vista de tu rol; null fuera de un desafío en curso. */
  challenge: ChallengeInfo | null;
  /** Solo para el facilitador: el estado completo del desafío (spoiler). */
  facilitatorView: FacilitatorView | null;
  hint: Hint | null;
  share: ShareInfo;
  /** Fragments recovered so far (one per completed challenge). */
  fragments: FragmentInfo[];
  /** Only once the coordinates are right. */
  reveal: Reveal | null;
}

export type ErrorCode =
  | 'invalid_name'
  | 'name_taken'
  | 'room_not_found'
  | 'room_full'
  | 'game_started'
  | 'role_taken'
  | 'role_used'
  | 'role_unavailable'
  | 'no_energy'
  | 'invalid_role'
  | 'unknown_player'
  | 'not_in_room'
  | 'not_facilitator'
  | 'not_ready'
  | 'wrong_phase'
  | 'wrong_role'
  | 'wrong_code'
  | 'invalid_action'
  | 'invalid_command'
  | 'overload'
  | 'sequence_error'
  | 'wrong_value'
  | 'no_fuel'
  | 'gravity_violation'
  | 'shield_active'
  | 'mine_hit'
  | 'invalid_target'
  | 'already_voted'
  | 'share_busy'
  | 'share_cooldown'
  | 'share_no_budget';

export type Ack<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ErrorCode; message: string };

export interface JoinedInfo {
  roomId: string;
  playerId: string;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string }, cb: (a: Ack<JoinedInfo>) => void) => void;
  'room:join': (
    p: { roomId: string; name: string },
    cb: (a: Ack<JoinedInfo>) => void,
  ) => void;
  'room:rejoin': (
    p: { roomId: string; playerId: string },
    cb: (a: Ack<JoinedInfo>) => void,
  ) => void;
  'role:pick': (p: { role: Role | null }, cb: (a: Ack) => void) => void;
  'player:ready': (p: { ready: boolean }, cb: (a: Ack) => void) => void;
  'game:start': (cb: (a: Ack) => void) => void;
  'challenge:action': (action: ChallengeAction, cb: (a: Ack) => void) => void;
  'facilitator:command': (command: FacilitatorCommand, cb: (a: Ack) => void) => void;
  'share:propose': (p: { target: string }, cb: (a: Ack) => void) => void;
  'share:vote': (p: { vote: 'yes' | 'no' }, cb: (a: Ack) => void) => void;
  'share:ui': (p: { ui: Record<string, unknown> }, cb: (a: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/^ROOM-/, '');
}
