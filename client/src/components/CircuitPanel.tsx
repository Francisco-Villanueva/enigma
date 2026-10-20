import { useEffect, useState } from 'react';
import {
  CIRCUIT_FREE_VERIFICATIONS,
  CIRCUIT_RESCAN_PENALTY_SECONDS,
  CIRCUIT_RESCAN_SECONDS,
  CIRCUIT_SCAN_SECONDS,
  CIRCUIT_SIZE,
  CIRCUIT_VERIFY_PENALTY_SECONDS,
  PHASE_LABELS,
  PIECE_IDS,
  PIECE_INFO,
  ROTATION_NAMES,
} from '@enigma/shared';
import type { Ack, Cell, ChallengeAction, CircuitView, PieceId, PieceState, Role } from '@enigma/shared';
import { Eye, RotateCcw, RotateCw, X, Zap } from 'lucide-react';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: CircuitView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

type Send = (action: ChallengeAction) => Promise<Ack>;

const card = 'rounded-xl border border-core-600 bg-core-900 p-5';
const eyebrow = 'font-mono text-xs tracking-widest text-slate-400 uppercase';
const COLUMNS = Array.from({ length: CIRCUIT_SIZE }, (_, i) => String.fromCharCode(65 + i));
const ROWS = Array.from({ length: CIRCUIT_SIZE }, (_, i) => i + 1);
const CELLS: Cell[] = ROWS.flatMap((r) => COLUMNS.map((c) => `${c}${r}`));
const primaryButton =
  'rounded-md bg-signal px-4 py-2.5 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

/** Desafío 3: cada rol participa en reconstruir el circuito de 4×4. */
export function CircuitPanel({ role, view, disabled, sendAction }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="circuit" data-role={role}>
      <RoleHeader role={role} />

      <div className="mt-6 space-y-4">
        {view.role === 'navegador' && <NavigatorView view={view} disabled={disabled} sendAction={sendAction} />}
        {view.role === 'analista' && <AnalystView view={view} disabled={disabled} sendAction={sendAction} />}
        {view.role === 'criptografo' && <CryptoView view={view} />}
        {view.role === 'estratega' && <StrategistView view={view} />}
        {view.role === 'ingeniero' && <EngineerView view={view} disabled={disabled} sendAction={sendAction} />}
        {view.role === 'hacker' && <HackerView view={view} disabled={disabled} sendAction={sendAction} />}
      </div>
    </section>
  );
}

function Banner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-4 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
      {message}
    </p>
  );
}

/** Ejecuta una acción mostrando el error del servidor, si lo hay. */
function useAction(sendAction: Send) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: ChallengeAction) {
    setBusy(true);
    setError(null);
    const res = await sendAction(action);
    if (!res.ok) setError(res.message);
    setBusy(false);
  }
  return { error, busy, run };
}

/** Dibujo de cada pieza. El punto ámbar marca el Norte y gira con la pieza. */
function PieceGlyph({ piece, rotation, size = 40 }: { piece: PieceId; rotation: number; size?: number }) {
  const stroke = { stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={`${PIECE_INFO[piece].label} pointing ${ROTATION_NAMES[rotation]}`}
    >
      <g transform={`rotate(${rotation * 90} 20 20)`}>
        {piece === 'fusible' && <circle cx="20" cy="22" r="9" {...stroke} />}
        {piece === 'interruptor' && <rect x="11" y="13" width="18" height="18" rx="2" {...stroke} />}
        {piece === 'nodo_t' && <path d="M8 16 H32 M20 16 V34" {...stroke} />}
        {piece === 'nodo_y' && <path d="M10 14 L20 24 L30 14 M20 24 V35" {...stroke} />}
        {piece === 'cable_recto' && <path d="M20 12 V35" {...stroke} strokeWidth={5} />}
        {piece === 'cable_codo' && <path d="M20 12 V28 H34" {...stroke} />}
        <circle cx="20" cy="5" r="3" className="fill-amber" />
      </g>
    </svg>
  );
}

function BoardGrid({
  render,
  className = '',
}: {
  render: (cell: Cell) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`inline-grid w-full grid-cols-[1.5rem_repeat(4,minmax(0,1fr))] gap-1.5 font-mono text-xs ${className}`}>
      <span />
      {COLUMNS.map((c) => (
        <span key={c} className="text-center text-slate-500">
          {c}
        </span>
      ))}
      {ROWS.map((r) => (
        <Row key={r} row={r} render={render} />
      ))}
    </div>
  );
}

function Row({ row, render }: { row: number; render: (cell: Cell) => React.ReactNode }) {
  return (
    <>
      <span className="flex items-center justify-center text-slate-500">{row}</span>
      {COLUMNS.map((c) => (
        <div key={c}>{render(`${c}${row}`)}</div>
      ))}
    </>
  );
}

const cellBase = 'flex aspect-square items-center justify-center rounded-lg border transition';

// ---------------------------------------------------------------- Navegador

function NavigatorView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<CircuitView, { role: 'navegador' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const { error, busy, run } = useAction(sendAction);
  return (
    <div className={card} data-focus={view.focus ?? ''}>
      <p className={eyebrow}>Board coordinates</p>
      <BoardGrid
        className="mt-3"
        render={(cell) => {
          const focused = view.focus === cell;
          const occupied = view.occupied.includes(cell);
          return (
            <button
              type="button"
              data-cell={cell}
              data-occupied={occupied}
              aria-pressed={focused}
              aria-label={`Cell ${cell}${occupied ? ', occupied' : ''}`}
              disabled={disabled || busy}
              onClick={() => void run({ kind: 'circuit:focus', cell: focused ? null : cell })}
              className={`${cellBase} w-full ${
                focused ? 'border-signal bg-signal/20 text-signal' : 'border-core-700 bg-core-950 text-slate-500'
              } hover:border-signal disabled:cursor-not-allowed`}
            >
              {occupied && <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />}
            </button>
          );
        }}
      />
      <p className="mt-3 text-sm text-slate-300">
        Focused cell: <span className="font-mono text-signal">{view.focus ?? '—'}</span>
      </p>
      <Banner message={error} />
      <p className="mt-2 text-sm text-slate-400">
        Tap a cell to mark it: the Engineer sees it highlighted. Dots show cells that are already occupied.
      </p>

      <p className={`${eyebrow} mt-6`}>Circuit compass</p>
      <ul className="mt-2 grid grid-cols-2 gap-2" data-compass>
        {view.compass.map((c) => (
          <li
            key={c.piece}
            data-compass-piece={c.piece}
            data-rotation={c.rotation}
            className="flex items-center gap-3 rounded-md border border-core-700 px-3 py-2"
          >
            <span className="text-signal">
              <PieceGlyph piece={c.piece} rotation={c.rotation} size={32} />
            </span>
            <span className="text-sm text-slate-200">
              {PIECE_INFO[c.piece].label}
              <span className="block font-mono text-xs text-signal">points {ROTATION_NAMES[c.rotation]}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-slate-400">
        Only you know which way each piece must point. Tell the Engineer how to rotate it (the amber dot is the piece's
        North).
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Analista

function AnalystView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<CircuitView, { role: 'analista' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const { error, busy, run } = useAction(sendAction);
  const scan = view.scan;
  const startMs = scan?.msLeft ?? 0;
  const [left, setLeft] = useState(startMs);
  const [total, setTotal] = useState(startMs || 1);

  // Cuenta regresiva local solo para mostrarla; quien oculta el circuito es el servidor.
  useEffect(() => {
    if (!scan) return;
    const startedAt = Date.now();
    setLeft(scan.msLeft);
    setTotal(scan.msLeft || 1);
    const id = setInterval(() => setLeft(Math.max(0, scan.msLeft - (Date.now() - startedAt))), 100);
    return () => clearInterval(id);
  }, [scan?.msLeft, scan !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells: Cell[] | null = scan?.cells ?? null;

  return (
    <div className={card}>
      <p className={eyebrow}>Circuit scanner</p>
      {cells ? (
        <div data-scan-visible data-cells={[...cells].sort().join(',')}>
          <BoardGrid
            className="mt-3"
            render={(cell) => {
              const used = cells.includes(cell);
              return (
                <div
                  className={`${cellBase} ${used ? 'border-signal/60 bg-signal/10' : 'border-core-700 bg-core-950'}`}
                >
                  {used && <span className="h-4 w-4 rounded-full bg-signal" />}
                </div>
              );
            }}
          />
          <div className="mt-3 h-1.5 overflow-hidden rounded bg-core-700" aria-hidden="true">
            <div className="h-full bg-amber transition-[width] duration-100" style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
          </div>
          <p className="mt-2 text-center font-mono text-sm text-amber">Memorize! {(left / 1000).toFixed(1)} s</p>
        </div>
      ) : (
        <div
          data-scan-hidden
          className="mt-3 flex aspect-[2/1] items-center justify-center rounded-lg border border-core-700 bg-black text-center font-mono text-sm text-slate-600"
        >
          {view.canScan ? 'Screen blank' : 'Screen blank · the board is no longer visible'}
        </div>
      )}
      <button
        type="button"
        data-scan
        disabled={disabled || busy || !view.canScan}
        onClick={() => void run({ kind: 'circuit:scan' })}
        className={`${primaryButton} mt-4 flex w-full items-center justify-center gap-2`}
      >
        <Eye size={18} /> Escanear circuito ({CIRCUIT_SCAN_SECONDS} s, una sola vez)
      </button>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        The dots are the 6 cells where a piece goes. You don't know which is which: the Cryptographer has that. Read the exact
        coordinates out to the team. If you forget them, the Hacker can give you a {CIRCUIT_RESCAN_SECONDS} s re-scan.
      </p>
    </div>
  );
}

// -------------------------------------------------------------- Criptógrafo

function CryptoView({ view }: { view: Extract<CircuitView, { role: 'criptografo' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Identity clues</p>
      <ol className="mt-3 space-y-3">
        {view.clues.map((rule, i) => (
          <li key={rule} className="flex gap-3 text-slate-200">
            <span className="font-mono text-signal">{i + 1}.</span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
      <p className={`${eyebrow} mt-5`}>Piece catalog</p>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {PIECE_IDS.map((id) => (
          <li key={id} className="flex flex-col items-center rounded-md border border-core-700 py-2 text-center text-xs text-slate-300">
            <span className="text-signal">
              <PieceGlyph piece={id} rotation={0} size={36} />
            </span>
            {PIECE_INFO[id].label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-400">
        Using the cells the Analyst reads out and these clues, work out which piece goes in each cell. The Strategist also
        has data that helps.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Estratega

function StrategistView({ view }: { view: Extract<CircuitView, { role: 'estratega' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Assembly sequence</p>
      <ol className="mt-3 space-y-2">
        {view.phases.map((p, i) => {
          const state = p.placed ? 'done' : i === view.current ? 'current' : 'pending';
          return (
            <li
              key={p.phase}
              data-phase={p.phase}
              data-state={state}
              className={`rounded-md border px-3 py-2 ${
                state === 'done'
                  ? 'border-signal/40 text-signal'
                  : state === 'current'
                    ? 'border-signal bg-signal/10 text-white'
                    : 'border-core-600 text-slate-300'
              }`}
            >
              <p className="font-semibold">
                Phase {i + 1}: {PHASE_LABELS[p.phase]} {state === 'done' && '✔'}
              </p>
              <p className="text-sm opacity-80">{p.pieces.map((id) => PIECE_INFO[id].label).join(' and ')}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-slate-400">
        Tell the Engineer which phase is next. A piece out of phase costs time.
      </p>
      <p className={`${eyebrow} mt-6`}>Board halves</p>
      <div className="mt-2 grid grid-cols-2 gap-2" data-halves>
        <div data-half="top" className="rounded-md border border-core-600 px-3 py-2">
          <p className="font-mono text-xs text-signal">Rows 1 and 2 (top)</p>
          <p className="mt-1 text-sm text-slate-200">
            {view.halves.top.length ? view.halves.top.map((id) => PIECE_INFO[id].label).join(', ') : 'None'}
          </p>
        </div>
        <div data-half="bottom" className="rounded-md border border-core-600 px-3 py-2">
          <p className="font-mono text-xs text-signal">Rows 3 and 4 (bottom)</p>
          <p className="mt-1 text-sm text-slate-200">
            {view.halves.bottom.length ? view.halves.bottom.map((id) => PIECE_INFO[id].label).join(', ') : 'None'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Pass this to the Cryptographer: together with their clues, it says which piece goes in each cell.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- Ingeniero

function EngineerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<CircuitView, { role: 'ingeniero' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const { error, busy, run } = useAction(sendAction);
  const [selected, setSelected] = useState<PieceId | null>(null);
  const [dragging, setDragging] = useState<PieceId | null>(null);
  const [over, setOver] = useState<Cell | null>(null);
  const tray = view.pieces.filter((p) => p.cell === null);
  const locked = disabled || busy;

  async function place(piece: PieceId, cell: Cell) {
    setSelected(null);
    setDragging(null);
    setOver(null);
    await run({ kind: 'circuit:place', piece, cell });
  }

  // Función (no componente): si fuera un componente se recrearía en cada render y cortaría el arrastre.
  function renderChip(p: PieceState, onBoard: boolean) {
    const isSelected = selected === p.piece;
    return (
      <div
        key={p.piece}
        data-piece={p.piece}
        data-rotation={p.rotation}
        data-cell={p.cell ?? ''}
        draggable={!locked}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', p.piece);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(p.piece);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        className={`group relative flex flex-col items-center rounded-lg border bg-core-800 p-1.5 ${
          isSelected ? 'border-signal text-signal' : 'border-core-600 text-slate-200'
        }`}
      >
        <button
          type="button"
          data-select={p.piece}
          aria-pressed={isSelected}
          aria-label={`${PIECE_INFO[p.piece].label}${onBoard ? ` at ${p.cell}` : ''}`}
          disabled={locked}
          onClick={() => setSelected(isSelected ? null : p.piece)}
          className="flex cursor-grab flex-col items-center disabled:cursor-not-allowed"
        >
          <PieceGlyph piece={p.piece} rotation={p.rotation} size={onBoard ? 36 : 44} />
          {!onBoard && <span className="mt-0.5 text-[0.65rem] leading-tight">{PIECE_INFO[p.piece].label}</span>}
        </button>
        <div className="mt-1 flex gap-1 text-slate-400">
          <button
            type="button"
            data-rotate-ccw={p.piece}
            aria-label={`Rotate ${PIECE_INFO[p.piece].label} counterclockwise`}
            disabled={locked}
            onClick={() => void run({ kind: 'circuit:rotate', piece: p.piece, turn: 'ccw' })}
            className="rounded p-0.5 hover:text-signal disabled:opacity-40"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            data-rotate-cw={p.piece}
            aria-label={`Rotate ${PIECE_INFO[p.piece].label} clockwise`}
            disabled={locked}
            onClick={() => void run({ kind: 'circuit:rotate', piece: p.piece, turn: 'cw' })}
            className="rounded p-0.5 hover:text-signal disabled:opacity-40"
          >
            <RotateCw size={14} />
          </button>
          {onBoard && (
            <button
              type="button"
              data-remove={p.piece}
              aria-label={`Remove ${PIECE_INFO[p.piece].label} from the board`}
              disabled={locked}
              onClick={() => void run({ kind: 'circuit:remove', piece: p.piece })}
              className="rounded p-0.5 hover:text-alert disabled:opacity-40"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={card} data-focus={view.focus ?? ''}>
      <p className={eyebrow}>Circuit board</p>
      <BoardGrid
        className="mt-3"
        render={(cell) => {
          const piece = view.pieces.find((p) => p.cell === cell);
          const focused = view.focus === cell;
          const canDrop = (dragging !== null || selected !== null) && !piece;
          return (
            <div
              data-slot={cell}
              data-focused={focused}
              onDragOver={(e) => {
                if (locked) return;
                e.preventDefault();
                setOver(cell);
              }}
              onDragLeave={() => setOver((o) => (o === cell ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = (e.dataTransfer.getData('text/plain') || dragging) as PieceId | null;
                if (id && PIECE_IDS.includes(id)) void place(id, cell);
              }}
              onClick={() => {
                if (selected && !piece && !locked) void place(selected, cell);
              }}
              className={`${cellBase} relative ${
                over === cell
                  ? 'border-signal bg-signal/20'
                  : focused
                    ? 'border-amber bg-amber/10'
                    : canDrop
                      ? 'border-dashed border-signal/50 bg-core-950'
                      : 'border-core-700 bg-core-950'
              }`}
            >
              {piece ? (
                renderChip(piece, true)
              ) : (
                focused && <span className="font-mono text-[0.65rem] text-amber">focus</span>
              )}
            </div>
          );
        }}
      />

      <p className={`${eyebrow} mt-5`}>Component tray</p>
      <div
        data-tray
        className="mt-2 grid min-h-20 grid-cols-3 gap-2 rounded-lg border border-dashed border-core-600 p-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = (e.dataTransfer.getData('text/plain') || dragging) as PieceId | null;
          if (id && view.pieces.find((p) => p.piece === id)?.cell) void run({ kind: 'circuit:remove', piece: id });
        }}
      >
        {tray.length === 0 ? (
          <p className="col-span-3 self-center text-center text-sm text-slate-500">All pieces are on the board</p>
        ) : (
          tray.map((p) => renderChip(p, false))
        )}
      </div>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        Drag a piece onto a cell, or tap it and then tap the cell. Rotate with the curved arrows. Follow the
        order the Strategist gives you.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- Hacker

function HackerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<CircuitView, { role: 'hacker' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const { error, busy, run } = useAction(sendAction);
  const next = view.freeLeft > 0 ? 'free' : `costs ${CIRCUIT_VERIFY_PENALTY_SECONDS} s`;
  return (
    <div className={card}>
      <p className={eyebrow}>Voltage terminal</p>
      <div className="mt-3 rounded-lg border border-core-700 bg-core-950 p-4 text-center">
        {view.last ? (
          <div data-result={view.last.correct}>
            <p className="font-mono text-4xl font-bold text-signal">
              {view.last.correct}/{view.last.total}
              <span className="mt-1 block text-xs font-normal tracking-widest text-slate-400 uppercase">
                pieces correctly placed
              </span>
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 text-left text-xs" data-piece-results>
              {view.last.pieces.map((p) => (
                <li
                  key={p.piece}
                  data-piece-ok={p.ok}
                  className={`rounded border px-2 py-1 ${p.ok ? 'border-signal/50 text-signal' : 'border-alert/50 text-alert'}`}
                >
                  {p.ok ? '✔' : '✘'} {PIECE_INFO[p.piece].label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-400">You haven't verified the voltage yet.</p>
        )}
      </div>
      <button
        type="button"
        data-verify
        disabled={disabled || busy}
        onClick={() => void run({ kind: 'circuit:verify' })}
        className={`${primaryButton} mt-4 flex w-full items-center justify-center gap-2`}
      >
        <Zap size={18} /> Verify voltage ({next})
      </button>
      <p className="mt-2 text-center text-xs text-slate-500" data-verifications={view.verifications}>
        Verifications: {view.verifications} · Free: the first {CIRCUIT_FREE_VERIFICATIONS}
      </p>

      <button
        type="button"
        data-rescan
        disabled={disabled || busy || !view.canRescan}
        onClick={() => void run({ kind: 'circuit:rescan' })}
        className="mt-4 w-full rounded-md border border-core-600 px-4 py-2.5 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
      >
        Grant the Analyst a {CIRCUIT_RESCAN_SECONDS} s re-scan (−{CIRCUIT_RESCAN_PENALTY_SECONDS} s) · {view.rescansLeft} left
      </button>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        A piece is right only if it has the correct cell and rotation. With all 6 right, the circuit powers up.
      </p>
    </div>
  );
}
