import { useEffect, useState } from 'react';
import { GRID_SIZE, HACK_LENGTH, HACK_SYMBOLS, NAV_MAX_CHARGE, TERRAIN_INFO } from '@enigma/shared';
import type { Ack, Cell, ChallengeAction, Direction, NavigationView, Role, Thruster } from '@enigma/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bomb, Check, Flag, Radar, Rocket } from 'lucide-react';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: NavigationView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

type Send = (action: ChallengeAction) => Promise<Ack>;

const card = 'rounded-xl border border-core-600 bg-core-900 p-5';
const eyebrow = 'font-mono text-xs tracking-widest text-slate-400 uppercase';
const COLUMNS = Array.from({ length: GRID_SIZE }, (_, i) => String.fromCharCode(65 + i));
const ROWS = Array.from({ length: GRID_SIZE }, (_, i) => i + 1);

/** Desafío 2: cada rol ve una parte distinta del módulo de navegación. */
export function NavigationPanel({ role, view, disabled, sendAction }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="nav" data-role={role}>
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

/** Grilla de 6×6 con letras arriba y números a la izquierda; cada casilla la decide quien la usa. */
function Grid({ render }: { render: (cell: Cell) => React.ReactNode }) {
  return (
    <div className="mt-3 inline-grid grid-cols-[1.5rem_repeat(6,minmax(0,1fr))] gap-1 font-mono text-xs" style={{ width: '100%' }}>
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

const square = 'flex aspect-square items-center justify-center rounded-md border';

const ARROWS: Record<Direction, { icon: typeof ArrowUp; label: string }> = {
  up: { icon: ArrowUp, label: 'Up' },
  down: { icon: ArrowDown, label: 'Down' },
  left: { icon: ArrowLeft, label: 'Left' },
  right: { icon: ArrowRight, label: 'Right' },
};
const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const TERRAIN_STYLE: Record<string, string> = {
  libre: 'border-core-700 bg-core-950 text-slate-500',
  asteroides: 'border-amber/40 bg-amber/10 text-amber',
  pozo: 'border-violet-400/50 bg-violet-500/15 text-violet-700',
};

function NavigatorView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<NavigationView, { role: 'navegador' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(dir: Direction) {
    if (disabled || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'nav:move', dir });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      void go(dir);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const radarOf = new Map(view.trail.map((t) => [t.cell, t.radar]));

  return (
    <div className={card} data-position={view.position} data-radar={view.radar}>
      <p className={eyebrow}>Navigation grid</p>
      <Grid
        render={(cell) => {
          const here = cell === view.position;
          const hit = view.hits.includes(cell);
          const flagged = view.flags.includes(cell);
          const seen = radarOf.get(cell);
          return (
            <div
              data-cell={cell}
              data-hit={hit}
              data-flag={flagged}
              className={`${square} font-mono ${
                here
                  ? 'border-signal bg-signal/20 text-signal'
                  : hit
                    ? 'border-alert/60 bg-alert/15 text-alert'
                    : flagged
                      ? 'border-alert/60 border-dashed bg-alert/10 text-alert'
                      : seen !== undefined
                      ? 'border-core-600 bg-core-800 text-slate-200'
                      : 'border-core-700 bg-core-950'
              }`}
            >
              {here ? <Rocket size={18} aria-label={`Ship at ${cell}`} /> : hit ? <Bomb size={16} /> : flagged ? <Flag size={14} aria-label={`Mine flagged at ${cell}`} /> : seen}
            </div>
          );
        }}
      />
      <p className="mt-3 text-sm text-slate-300">
        Position: <span className="font-mono text-signal">{view.position}</span> · Moves: {view.moves}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-slate-300">
        <Radar size={16} className="text-signal" />
        Radar: <span className="font-mono text-lg text-white">{view.radar}</span> mine{view.radar === 1 ? '' : 's'} in neighboring cells
      </p>
      {view.shield && (
        <p role="status" className="mt-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          Shield active: wait for the Hacker to decrypt it.
        </p>
      )}

      <div className="mx-auto mt-4 grid w-44 grid-cols-3 gap-2">
        {(['up', 'left', 'down', 'right'] as Direction[]).map((dir) => {
          const { icon: Icon, label } = ARROWS[dir];
          const place = { up: 'col-start-2', left: 'col-start-1 row-start-2', down: 'col-start-2 row-start-2', right: 'col-start-3 row-start-2' }[dir];
          return (
            <button
              key={dir}
              type="button"
              data-dir={dir}
              aria-label={label}
              disabled={disabled || busy}
              onClick={() => void go(dir)}
              className={`${place} flex aspect-square items-center justify-center rounded-lg border border-core-600 bg-core-800 text-white transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Icon size={22} />
            </button>
          );
        })}
      </div>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        The numbers are what the radar read on each cell you've already visited; the red flag is a mine the Analyst marked for you. You don't know where the mines are or how much each
        cell costs: ask the team for information before every move.
      </p>
    </div>
  );
}

function AnalystView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<NavigationView, { role: 'analista' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [notes, setNotes] = useState<Record<string, 'mine' | 'safe'>>({});
  const [selected, setSelected] = useState<Cell | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const note = (cell: Cell, value: 'mine' | 'safe' | null) =>
    setNotes((prev) => {
      const next = { ...prev };
      if (value) next[cell] = value;
      else delete next[cell];
      return next;
    });

  async function toggleFlag(cell: Cell) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'nav:flag', cell });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  const quadrants: [string, number][] = [
    ['Northwest (A–C, 1–3)', view.quadrants.no],
    ['Northeast (D–F, 1–3)', view.quadrants.ne],
    ['Southwest (A–C, 4–6)', view.quadrants.so],
    ['Southeast (D–F, 4–6)', view.quadrants.se],
  ];
  const sure = (cell: Cell) => view.rows[Number(cell.slice(1)) - 1] === 0 || view.cols[COLUMNS.indexOf(cell[0])] === 0;
  const flagged = selected ? view.flags.includes(selected) : false;

  return (
    <div className={card} data-analyst>
      <p className={eyebrow}>Mine scan</p>
      <div className="mt-3 inline-grid w-full grid-cols-[1.5rem_repeat(6,minmax(0,1fr))_1.75rem] gap-1 font-mono text-xs">
        <span />
        {COLUMNS.map((c) => (
          <span key={c} className="text-center text-slate-500">
            {c}
          </span>
        ))}
        <span />
        {ROWS.map((r) => (
          <AnalystRow
            key={r}
            row={r}
            count={view.rows[r - 1]}
            notes={notes}
            flags={view.flags}
            selected={selected}
            isSafe={sure}
            onSelect={setSelected}
          />
        ))}
        <span />
        {view.cols.map((n, i) => (
          <span key={i} data-col-count={COLUMNS[i]} className="text-center text-sm text-signal">
            {n}
          </span>
        ))}
        <span />
      </div>

      <div className="mt-4 min-h-[5.5rem] rounded-lg border border-core-600 bg-core-950 p-3" data-selected={selected ?? ''}>
        {selected ? (
          <>
            <p className="text-sm text-slate-300">
              Cell <span className="font-mono text-white">{selected}</span>
              {sure(selected) && <span className="text-signal"> · its row or column has 0 mines: it is safe</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <button type="button" data-note="mine" onClick={() => note(selected, 'mine')} className="rounded-md border border-alert/50 px-3 py-1 text-alert">
                I suspect a mine
              </button>
              <button type="button" data-note="safe" onClick={() => note(selected, 'safe')} className="rounded-md border border-signal/50 px-3 py-1 text-signal">
                Looks safe
              </button>
              <button type="button" data-note="clear" onClick={() => note(selected, null)} className="rounded-md border border-core-600 px-3 py-1 text-slate-400">
                Clear note
              </button>
              <button
                type="button"
                data-flag-send
                disabled={disabled || busy}
                onClick={() => void toggleFlag(selected)}
                className="rounded-md bg-alert px-3 py-1 font-semibold text-white disabled:opacity-40"
              >
                {flagged ? 'Remove flag from the Navigator' : 'I\'m sure: send mine to the Navigator'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Tap a cell to note suspicions or send a confirmed mine to the Navigator.</p>
        )}
      </div>
      <Banner message={error} />

      <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {quadrants.map(([label, n]) => (
          <li key={label} className="flex items-center justify-between rounded-md border border-core-700 px-3 py-2 text-slate-300">
            {label}
            <span className="font-mono text-signal">{n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-400">
        The numbers are how many mines are in each row, column and quadrant, not where. A row or column with 0 is safe (shown in faint
        green). Cross these totals with the Cryptographer's clues, the Navigator's radar and the Hacker's queries until you are sure of
        a cell.
      </p>
    </div>
  );
}

function AnalystRow({
  row,
  count,
  notes,
  flags,
  selected,
  isSafe,
  onSelect,
}: {
  row: number;
  count: number;
  notes: Record<string, 'mine' | 'safe'>;
  flags: Cell[];
  selected: Cell | null;
  isSafe: (cell: Cell) => boolean;
  onSelect: (cell: Cell) => void;
}) {
  return (
    <>
      <span className="flex items-center justify-center text-slate-500">{row}</span>
      {COLUMNS.map((c) => {
        const cell = `${c}${row}`;
        const n = notes[cell];
        const sent = flags.includes(cell);
        return (
          <button
            key={c}
            type="button"
            data-cell={cell}
            data-note={n ?? ''}
            data-flag={sent}
            onClick={() => onSelect(cell)}
            className={`${square} text-sm ${selected === cell ? 'ring-2 ring-white' : ''} ${
              sent
                ? 'border-alert bg-alert/30 text-alert'
                : n === 'mine'
                  ? 'border-alert/60 border-dashed bg-alert/10 text-alert'
                  : n === 'safe'
                    ? 'border-signal/50 bg-signal/10 text-signal'
                    : isSafe(cell)
                      ? 'border-signal/20 bg-signal/5 text-slate-600'
                      : 'border-core-700 bg-core-950 text-slate-600'
            }`}
          >
            {sent ? <Flag size={14} /> : n === 'mine' ? '✕' : n === 'safe' ? '✓' : ''}
          </button>
        );
      })}
      <span data-row-count={row} className="flex items-center justify-center text-sm text-signal">
        {count}
      </span>
    </>
  );
}

function CryptoView({ view }: { view: Extract<NavigationView, { role: 'criptografo' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Protocols</p>
      <ol className="mt-3 space-y-3">
        {view.rules.map((rule, i) => (
          <li key={rule} className="flex gap-3 text-slate-200">
            <span className="font-mono text-signal">{i + 1}.</span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
      <p className={`${eyebrow} mt-6`}>Clues for the Analyst</p>
      <ul className="mt-3 space-y-2" data-mine-clues>
        {view.mineClues.map((c) => (
          <li key={c} className="rounded-md border border-signal/30 bg-signal/5 px-3 py-2 text-slate-200">
            {c}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-slate-400">These are all true. Help the Analyst deduce where the mines are; the Analyst confirms which to flag.</p>

    </div>
  );
}

function StrategistView({ view }: { view: Extract<NavigationView, { role: 'estratega' }> }) {
  const next = view.checkpoints.findIndex((c) => !c.reached);
  const marks = new Map<string, string>();
  marks.set(view.start, 'Start');
  view.checkpoints.forEach((c, i) => marks.set(c.cell, `P${i + 1}`));
  marks.set(view.goal, 'Goal');
  return (
    <div className={card}>
      <p className={eyebrow}>Terrain map</p>
      <p className="mt-1 text-sm text-slate-300" data-ship-position={view.position}>
        Ship at <span className="font-mono text-signal">{view.position}</span>
      </p>
      <Grid
        render={(cell) => {
          const idx = COLUMNS.indexOf(cell[0]) + (Number(cell.slice(1)) - 1) * GRID_SIZE;
          const t = view.terrain[idx];
          const mark = marks.get(cell);
          const here = cell === view.position;
          return (
            <div
              data-cell={cell}
              data-terrain={t}
              data-ship={here}
              className={`${square} font-mono ${here ? 'border-white bg-signal/40 text-white ring-2 ring-white' : mark ? 'border-signal bg-signal/15 text-white' : TERRAIN_STYLE[t]}`}
              title={TERRAIN_INFO[t].label}
            >
              {here ? <Rocket size={18} aria-label={`Ship at ${cell}`} /> : mark ? <span className="text-[10px] leading-none">{mark}</span> : TERRAIN_INFO[t].cost}
            </div>
          );
        }}
      />
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
        {(Object.keys(TERRAIN_INFO) as (keyof typeof TERRAIN_INFO)[]).map((t) => (
          <li key={t} className={`rounded border px-2 py-1 ${TERRAIN_STYLE[t]}`}>
            {TERRAIN_INFO[t].cost} · {TERRAIN_INFO[t].label}
          </li>
        ))}
      </ul>
      <p className={`${eyebrow} mt-5`}>Route plan</p>
      <ol className="mt-3 space-y-2">
        <li className="flex items-center gap-3 rounded-md border border-core-700 px-3 py-2 text-slate-300">
          <Rocket size={16} className="text-signal" />
          Start: <span className="font-mono text-white">{view.start}</span>
        </li>
        {view.checkpoints.map((c, i) => (
          <li
            key={c.cell}
            data-checkpoint={c.cell}
            data-state={c.reached ? 'done' : i === next ? 'current' : 'pending'}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
              c.reached
                ? 'border-signal/40 text-signal'
                : i === next
                  ? 'border-signal bg-signal/10 text-white'
                  : 'border-core-600 text-slate-300'
            }`}
          >
            {c.reached ? <Check size={16} /> : <Flag size={16} />}
            Checkpoint {i + 1}: <span className="font-mono">{c.cell}</span>
          </li>
        ))}
        <li className="flex items-center gap-3 rounded-md border border-core-700 px-3 py-2 text-slate-300">
          <Flag size={16} className="text-amber" />
          Goal: <span className="font-mono text-white">{view.goal}</span>
        </li>
      </ol>
      <p className="mt-3 text-sm text-slate-400">
        The number is the charge needed to enter that cell. Checkpoints must be touched in order before heading to the goal.
        Choose the route that uses the least battery.
      </p>
    </div>
  );
}

function EngineerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<NavigationView, { role: 'ingeniero' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(action: ChallengeAction) {
    setBusy(true);
    setError(null);
    const res = await sendAction(action);
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  const items: { thruster: Thruster; title: string; hint: string }[] = [
    { thruster: 'linear', title: 'Linear thruster', hint: 'Moves up and down' },
    { thruster: 'lateral', title: 'Lateral thruster', hint: 'Moves left and right' },
  ];
  const pct = Math.max(0, Math.min(100, (view.battery / view.capacity) * 100));

  return (
    <div className={card} data-battery={view.battery}>
      <p className={eyebrow}>Battery</p>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-core-950">
        <div className={`h-full ${pct < 25 ? 'bg-alert' : 'bg-signal'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm text-slate-300">
        <span className="font-mono text-white">{view.battery}</span> / {view.capacity} units
      </p>

      <p className={`${eyebrow} mt-5`}>Thrusters</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((it) => {
          const charged = view.charges[it.thruster];
          const room = view.maxCharge - charged;
          return (
            <li
              key={it.thruster}
              data-thruster={it.thruster}
              data-charged={charged}
              className={`rounded-lg border p-4 ${charged ? 'border-signal bg-signal/10' : 'border-core-600 bg-core-950'}`}
            >
              <p className="font-semibold text-white">{it.title}</p>
              <p className="text-sm text-slate-400">{it.hint}</p>
              <p className={`mt-2 font-mono text-xs tracking-widest uppercase ${charged ? 'text-signal' : 'text-slate-500'}`}>
                Charge: {charged}/{view.maxCharge}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {Array.from({ length: NAV_MAX_CHARGE }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    data-inject={it.thruster}
                    data-amount={n}
                    disabled={disabled || busy || n > room || n > view.battery}
                    onClick={() => void send({ kind: 'nav:charge', thruster: it.thruster, amount: n })}
                    className="rounded-md bg-signal px-2 py-2 text-sm font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        data-recharge
        disabled={disabled || busy}
        onClick={() => void send({ kind: 'nav:recharge' })}
        className="mt-4 w-full rounded-md border border-amber/50 px-3 py-2 text-sm text-amber transition hover:bg-amber/10 disabled:opacity-40"
      >
        Emergency recharge (+10 battery, costs 30 s)
      </button>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        Each +1 spends 1 battery. A move uses up all of that thruster's charge, so charge only what the Strategist asks for.
      </p>
    </div>
  );
}

function HackerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<NavigationView, { role: 'hacker' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  // El error vive acá: al fallar, el servidor genera otra secuencia y el minijuego se reinicia.
  const [error, setError] = useState<string | null>(null);
  const [cell, setCell] = useState('');
  const [probeError, setProbeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function probe(e: React.FormEvent) {
    e.preventDefault();
    const value = cell.trim().toUpperCase();
    if (!value || busy || disabled) return;
    setBusy(true);
    setProbeError(null);
    const res = await sendAction({ kind: 'nav:probe', cell: value });
    if (!res.ok) setProbeError(res.message);
    else setCell('');
    setBusy(false);
  }

  return (
    <div className={card}>
      <p className={eyebrow}>Shield terminal</p>
      <p className="mt-2 text-white" data-reached={view.reached}>
        Checkpoints cleared: <span className="font-mono text-signal">{view.reached}/{view.total}</span>
      </p>
      {view.shield && view.sequence ? (
        // La key reinicia el minijuego cada vez que el servidor genera una secuencia nueva.
        <HackGame
          key={view.sequence.join('')}
          sequence={view.sequence}
          disabled={disabled}
          sendAction={sendAction}
          onError={setError}
        />
      ) : (
        <p className="mt-4 text-sm text-slate-400">
          No shields are active. When the ship touches a checkpoint, you'll have to decrypt it here.
        </p>
      )}
      <Banner message={view.shield ? error : null} />

      <p className={`${eyebrow} mt-6`}>Radar query</p>
      <form onSubmit={(e) => void probe(e)} className="mt-3 flex gap-2">
        <input
          data-probe-input
          value={cell}
          onChange={(e) => setCell(e.target.value)}
          placeholder="e.g. C3"
          maxLength={3}
          className="w-24 rounded-md border border-core-600 bg-core-950 px-3 py-2 font-mono text-white uppercase"
        />
        <button
          type="submit"
          data-probe
          disabled={disabled || busy || !cell.trim()}
          className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-core-950 disabled:opacity-40"
        >
          Query
        </button>
      </form>
      <p className="mt-2 text-sm text-slate-400" data-free-probes={view.freeProbesLeft}>
        {view.freeProbesLeft > 0
          ? `You have ${view.freeProbesLeft} free queries left; after that each one costs 10 s.`
          : 'No free queries left: each one costs 10 s.'}
      </p>
      <Banner message={probeError} />
      {view.probes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {view.probes.map((p) => (
            <li
              key={p.cell}
              data-probe-result={p.cell}
              data-mine={p.mine}
              className={`rounded-md border px-3 py-1 font-mono text-sm ${
                p.mine ? 'border-alert/60 bg-alert/15 text-alert' : 'border-signal/40 bg-signal/10 text-signal'
              }`}
            >
              {p.cell}: {p.mine ? 'MINE' : 'safe'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SYMBOLS = [
  { glyph: '▲', color: 'text-signal' },
  { glyph: '■', color: 'text-amber' },
  { glyph: '●', color: 'text-alert' },
  { glyph: '◆', color: 'text-sky-700' },
];
const MEMORIZE_MS = 4000;

function HackGame({
  sequence,
  disabled,
  sendAction,
  onError,
}: {
  sequence: number[];
  disabled: boolean;
  sendAction: Send;
  onError: (message: string | null) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [answer, setAnswer] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), MEMORIZE_MS);
    return () => clearTimeout(t);
  }, [visible]);

  async function tap(symbol: number) {
    if (visible || busy || disabled) return;
    const next = [...answer, symbol];
    setAnswer(next);
    if (next.length < HACK_LENGTH) return;
    setBusy(true);
    onError(null);
    const res = await sendAction({ kind: 'nav:hack', answer: next });
    if (!res.ok) onError(res.message);
    setAnswer([]);
    setBusy(false);
  }

  return (
    <div className="mt-4" data-hack data-sequence={sequence.join(',')}>
      <p className="font-mono text-sm tracking-widest text-amber uppercase">Shield active · decrypt</p>
      <div className="mt-3 flex justify-center gap-2" aria-live="polite">
        {Array.from({ length: HACK_LENGTH }, (_, i) => {
          const shown = visible ? SYMBOLS[sequence[i]] : answer[i] !== undefined ? SYMBOLS[answer[i]] : null;
          return (
            <span
              key={i}
              className={`flex h-14 w-12 items-center justify-center rounded-md border border-core-600 bg-core-950 text-3xl ${shown?.color ?? ''}`}
            >
              {shown?.glyph ?? '·'}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-center text-sm text-slate-400">
        {visible ? 'Memorize the sequence…' : `Repeat it by tapping the symbols (${answer.length}/${HACK_LENGTH})`}
      </p>
      {!visible && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {Array.from({ length: HACK_SYMBOLS }, (_, i) => (
              <button
                key={i}
                type="button"
                data-symbol={i}
                disabled={disabled || busy}
                onClick={() => void tap(i)}
                className={`rounded-lg border border-core-600 bg-core-800 py-3 text-2xl transition hover:border-signal disabled:opacity-40 ${SYMBOLS[i].color}`}
              >
                {SYMBOLS[i].glyph}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-3 text-sm">
            <button type="button" className="text-slate-400 underline" onClick={() => setAnswer([])}>
              Clear
            </button>
            <button
              type="button"
              data-reveal
              className="text-slate-400 underline"
              onClick={() => {
                setAnswer([]);
                setVisible(true);
              }}
            >
              Show again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
