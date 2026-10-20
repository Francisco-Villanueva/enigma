import { useState } from 'react';
import { CORE_CONFIRM_CODE_LENGTH, REACTOR_COUNT, REACTOR_SLIDER_STEP } from '@enigma/shared';
import type { Ack, ChallengeAction, PowerCoreView, Role } from '@enigma/shared';
import { Send } from 'lucide-react';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: PowerCoreView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

const card = 'rounded-xl border border-core-600 bg-core-900 p-5';
const eyebrow = 'font-mono text-xs tracking-widest text-slate-400 uppercase';

/** Challenge 1: each role sees a different part of the core; the Engineer calibrates and the Hacker seals. */
export function PowerCorePanel({ role, view, disabled, sendAction }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="core" data-role={role}>
      <RoleHeader role={role} />

      <div className="mt-6 space-y-4">
        {view.role === 'navegador' && <NavigatorView view={view} />}
        {view.role === 'analista' && <AnalystView view={view} disabled={disabled} sendAction={sendAction} />}
        {view.role === 'criptografo' && <CryptoView view={view} />}
        {view.role === 'estratega' && <StrategistView view={view} disabled={disabled} sendAction={sendAction} />}
        {view.role === 'ingeniero' && <EngineerView view={view} disabled={disabled} sendAction={sendAction} />}
        {view.role === 'hacker' && <HackerView view={view} disabled={disabled} sendAction={sendAction} />}
      </div>
    </section>
  );
}

function NavigatorView({ view }: { view: Extract<PowerCoreView, { role: 'navegador' }> }) {
  const W = 360;
  const H = 300;
  const pos = new Map(view.nodes.map((n) => [n.reactor, { x: n.x * W, y: n.y * H }]));
  return (
    <div className={card}>
      <p className={eyebrow}>Connection map</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Diagram of connected reactors">
        {view.links.map(([a, b]) => {
          const pa = pos.get(a);
          const pb = pos.get(b);
          if (!pa || !pb) return null;
          return (
            <line
              key={`${a}-${b}`}
              data-link={`${a}-${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              className="stroke-signal"
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
        {view.nodes.map((n) => (
          <g key={n.reactor} data-node={n.reactor}>
            <circle cx={n.x * W} cy={n.y * H} r={19} className="fill-core-800 stroke-signal" strokeWidth={2} />
            <text
              x={n.x * W}
              y={n.y * H + 5}
              textAnchor="middle"
              className="fill-white font-mono text-[14px] font-bold"
            >
              R{n.reactor}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-2 text-sm text-slate-400">
        This is the full map of the core, with every connection. You don't know which reactors are failing: the Analyst
        has that. Tell the team which reactors each one is connected to whenever they ask.
      </p>
    </div>
  );
}

function AnalystView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<PowerCoreView, { role: 'analista' }>;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(reactor: number) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'core:share', reactor });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  // Marcas personales para llevar la cuenta; no se envían a nadie.
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className={card}>
      <p className={eyebrow}>Diagnostic rule</p>
      <p className="mt-2 rounded-md border border-core-600 bg-core-950 px-3 py-2 text-slate-200" data-rule={view.threshold}>
        A reactor is <span className="font-semibold text-alert">critical</span> if its temperature exceeds its pressure by
        more than <span className="font-mono text-signal">{view.threshold}</span>.
      </p>
      <p className={`${eyebrow} mt-5`}>Reactor readings</p>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {view.reactors.map((r) => {
          const isMarked = marked.has(r.id);
          return (
            <li key={r.id} data-reactor={r.id} data-temperature={r.temperature} data-pressure={r.pressure}>
              <div
                className={`rounded-lg border transition ${
                  isMarked ? 'border-alert/60 bg-alert/10' : 'border-core-600 bg-core-950'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={isMarked}
                  data-mark={r.id}
                  onClick={() => toggle(r.id)}
                  className="w-full rounded-t-lg p-3 text-left hover:bg-core-800/40"
                >
                  <p className="flex items-center justify-between font-mono text-sm text-slate-400">
                    R{r.id}
                    {isMarked && <span className="text-[0.65rem] tracking-widest text-alert uppercase">Critical</span>}
                  </p>
                  <p className="font-mono text-lg text-white">T {r.temperature}°C</p>
                  <p className="font-mono text-lg text-slate-300">P {r.pressure}</p>
                </button>
                <button
                  type="button"
                  data-share={r.id}
                  disabled={disabled || busy}
                  onClick={() => void share(r.id)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-b-lg border-t border-core-700 px-3 py-1.5 text-xs text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={13} /> {view.shared.includes(r.id) ? 'Sent ✔ · resend' : 'Send to Cryptographer'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm text-slate-400">
        Work out each reactor. Tap a card to mark it as critical (it's just your own note). Tell the
        team which ones are critical and, for the reactor being calibrated, send its readings to the Cryptographer.
      </p>
    </div>
  );
}

function CryptoView({ view }: { view: Extract<PowerCoreView, { role: 'criptografo' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Power formula</p>
      <p className="mt-2 font-mono text-lg text-signal" data-formula>
        {view.base}% + {view.perConnection}% × connections + temperature bonus
      </p>
      <p className="mt-2 text-sm text-slate-300">
        Only <span className="font-semibold text-white">connections to healthy reactors</span> count: those going to
        a critical reactor add nothing.
      </p>
      <table className="mt-4 w-full text-left font-mono text-sm">
        <thead>
          <tr className="text-slate-400">
            <th className="py-1 font-normal">Reactor temperature</th>
            <th className="py-1 font-normal">Bonus</th>
          </tr>
        </thead>
        <tbody>
          {view.bands.map((band) => (
            <tr key={band.label} data-band className="border-t border-core-700 text-white">
              <td className="py-1.5">{band.label}</td>
              <td className="py-1.5">+{band.bonus}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`${eyebrow} mt-5`}>Readings received from the Analyst</p>
      {view.received.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500" data-received-empty>
          They haven't sent you any yet. Ask for the ones for the reactor being calibrated.
        </p>
      ) : (
        <ul className="mt-2 space-y-2" data-received>
          {view.received.map((r, i) => (
            <li
              key={r.reactor}
              data-received-reactor={r.reactor}
              data-temperature={r.temperature}
              data-pressure={r.pressure}
              className={`flex items-center justify-between rounded-md border px-3 py-2 font-mono ${
                i === 0 ? 'border-signal bg-signal/10 text-white' : 'border-core-700 text-slate-400'
              }`}
            >
              <span className="font-semibold">R{r.reactor}</span>
              <span>T {r.temperature}°C</span>
              <span>P {r.pressure}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-slate-400">
        You need the connections (Navigator), to know which are failing, and the temperature (the Analyst sends it). With that,
        tell the Engineer the power.
      </p>
    </div>
  );
}

function StrategistView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<PowerCoreView, { role: 'estratega' }>;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(reactor: number) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'core:mark', reactor });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  const final = view.sequence.filter((id) => !view.marked.includes(id));
  const current = final.find((id) => !view.calibrated.includes(id));

  return (
    <div className={card}>
      <p className={eyebrow}>Reactor sequence</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-calibrated={view.calibrated.length}>
        {view.sequence.map((id, i) => {
          const isMarked = view.marked.includes(id);
          const state = isMarked ? 'marked' : view.calibrated.includes(id) ? 'done' : id === current ? 'current' : 'pending';
          const styles = {
            marked: 'border-alert/50 bg-alert/10 text-alert',
            done: 'border-signal/40 text-signal opacity-70',
            current: 'border-signal bg-signal/10 text-white',
            pending: 'border-core-600 text-slate-300',
          }[state];
          return (
            <li key={id} data-reactor={id} data-state={state}>
              <button
                type="button"
                data-mark={id}
                aria-pressed={isMarked}
                disabled={disabled || busy}
                onClick={() => void toggle(id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 font-mono text-lg transition hover:border-signal disabled:cursor-not-allowed ${styles}`}
              >
                <span>
                  <span className="mr-2 text-xs text-slate-500">{i + 1}.</span>
                  <span className={isMarked ? 'line-through' : ''}>R{id}</span>
                </span>
                {state === 'done' && <span aria-label="done">✔</span>}
                {state === 'marked' && (
                  <span className="font-sans text-[0.6rem] leading-none tracking-wider whitespace-nowrap uppercase">Fault</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      <p className={`${eyebrow} mt-5`}>Final order</p>
      <p className="mt-2 font-mono text-signal" data-final-order={final.join(',')}>
        {final.map((id) => `R${id}`).join(' → ') || '—'}
      </p>
      <p className="mt-3 text-sm text-slate-400">
        This sequence includes failing reactors. Ask the Analyst which ones are critical and tap them to cross them out:
        what remains is the order in which the Engineer must calibrate.
      </p>
    </div>
  );
}

function EngineerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<PowerCoreView, { role: 'ingeniero' }>;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}) {
  const [values, setValues] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function fix(reactor: number, value: number) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'core:set', reactor, value });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  return (
    <div className={card}>
      <p className={eyebrow}>Calibration console</p>
      {view.pending && (
        <div
          data-pending={view.pending.reactor}
          className="mt-3 rounded-lg border border-amber/50 bg-amber/10 p-4 text-center"
        >
          <p className="text-sm text-amber">
            R{view.pending.reactor} was locked at {view.pending.value}%. The Hacker still has to confirm it: read out this
            link code.
          </p>
          <p
            className="mt-2 font-mono text-4xl font-bold tracking-widest text-white"
            data-pending-code={view.pending.code}
          >
            {view.pending.code}
          </p>
        </div>
      )}
      <ul className="mt-3 space-y-4">
        {view.reactors.map((r) => {
          const value = r.locked ? r.level : (values[r.id] ?? r.level);
          return (
            <li key={r.id} data-reactor={r.id} data-locked={r.locked}>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`reactor-${r.id}`} className="font-mono text-lg text-white">
                  R{r.id}
                </label>
                <span className="font-mono text-lg text-signal" data-value={value}>
                  {value}%
                </span>
                <button
                  type="button"
                  data-fix={r.id}
                  disabled={disabled || busy || r.locked || view.pending !== null}
                  onClick={() => void fix(r.id, value)}
                  className="rounded-md bg-signal px-3 py-1.5 text-sm font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {r.locked ? 'Calibrated ✔' : view.pending?.reactor === r.id ? 'Waiting for the Hacker…' : `Lock R${r.id}`}
                </button>
              </div>
              <input
                id={`reactor-${r.id}`}
                type="range"
                min={0}
                max={100}
                step={view.step}
                value={value}
                disabled={disabled || r.locked || view.pending !== null}
                onChange={(e) => setValues((v) => ({ ...v, [r.id]: Number(e.target.value) }))}
                className="mt-2 w-full accent-[#1d4f7a]"
              />
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm text-slate-400">
        Adjust the power in steps of {REACTOR_SLIDER_STEP}% and lock it only when the team confirms. Then the Hacker must confirm it with the code that appears for you.
      </p>
    </div>
  );
}

function HackerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<PowerCoreView, { role: 'hacker' }>;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  async function seal() {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'core:seal' });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'core:confirm', code });
    if (res.ok) setCode('');
    else setError(res.message);
    setBusy(false);
  }

  return (
    <div className={card}>
      <p className={eyebrow}>Reactor confirmation</p>
      {view.pending ? (
        <div data-confirm-box={view.pending.reactor} className="mt-3 rounded-lg border border-amber/50 bg-amber/10 p-4">
          <p className="text-amber">
            The Engineer locked <span className="font-mono font-bold">R{view.pending.reactor}</span> at{' '}
            <span className="font-mono font-bold">{view.pending.value}%</span>.
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Ask for the link code and type it in to confirm.
          </p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <input
              data-confirm-input
              inputMode="numeric"
              autoComplete="off"
              maxLength={CORE_CONFIRM_CODE_LENGTH}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={'0'.repeat(CORE_CONFIRM_CODE_LENGTH)}
              aria-label="Link code"
              className="min-w-0 flex-1 rounded-md border border-core-600 bg-core-950 px-3 py-2 text-center font-mono text-2xl tracking-widest text-white placeholder:text-slate-600"
            />
            <button
              type="submit"
              data-confirm
              disabled={disabled || busy || code.length !== CORE_CONFIRM_CODE_LENGTH}
              className="rounded-md bg-signal px-4 py-2 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No reactors are waiting for confirmation.</p>
      )}
      <p className={`${eyebrow} mt-6`}>Final injection</p>
      <p className="mt-2 text-white" data-progress={view.done}>
        Reactors aligned: <span className="font-mono text-signal">{view.done}/{view.total}</span>
      </p>
      {view.aligned && view.confirmationCode ? (
        <div className="mt-4 text-center">
          <p className={eyebrow}>Confirmation code</p>
          <p className="mt-1 font-mono text-5xl font-bold tracking-widest text-signal" data-code={view.confirmationCode}>
            {view.confirmationCode}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">
          Wait for the Engineer to finish calibrating the healthy reactors. Once they're all aligned you'll see the code.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      <button
        type="button"
        data-seal
        disabled={disabled || busy || !view.aligned}
        onClick={() => void seal()}
        className="mt-4 w-full rounded-md bg-signal px-4 py-2.5 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Inject final charge
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">
        There are {REACTOR_COUNT} reactors in total; only the {view.total} healthy ones are calibrated and the critical ones stay at 0%.
      </p>
    </div>
  );
}
