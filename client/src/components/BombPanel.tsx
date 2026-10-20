import { useEffect, useState } from 'react';
import { BOMB_COLOR_LABELS } from '@enigma/shared';
import type { Ack, BombColor, BombView, ChallengeAction, Role } from '@enigma/shared';
import { Lock, LockOpen, Scissors, Siren } from 'lucide-react';
import { formatClock } from '../lib/useCountdown';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: BombView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

type Send = (action: ChallengeAction) => Promise<Ack>;

const card = 'rounded-xl border border-core-600 bg-core-900 p-5';
const eyebrow = 'font-mono text-xs tracking-widest text-slate-400 uppercase';
const button =
  'rounded-md bg-signal px-4 py-2 font-semibold text-core-950 transition hover:brightness-110 disabled:opacity-40';

const COLOR_HEX: Record<BombColor, string> = {
  rojo: '#ef4444',
  azul: '#3b82f6',
  verde: '#22c55e',
  amarillo: '#eab308',
  blanco: '#f1f5f9',
  negro: '#14110c',
};

function ColorChip({ color }: { color: BombColor }) {
  return (
    <span className="inline-flex items-center gap-2" data-color-chip={color}>
      <span className="h-4 w-4 rounded-full border border-slate-500" style={{ background: COLOR_HEX[color] }} />
      <span>{BOMB_COLOR_LABELS[color]}</span>
    </span>
  );
}

/** Cuenta atrás local que se rearma cada vez que llega una vista nueva del servidor. */
function useMs(ms: number, disabled: boolean): number {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    setLeft(ms);
    if (disabled) return;
    const start = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, ms - (Date.now() - start))), 250);
    return () => clearInterval(id);
  }, [ms, disabled]);
  return left;
}

/** Challenge 5: each role sees a different part of the bomb, but everyone sees the clock. */
export function BombPanel({ role, view, disabled, sendAction }: Props) {
  const left = useMs(view.leftMs, disabled);
  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="bomb" data-role={role} data-attempt={view.attempt}>
      <RoleHeader role={role} />

      <div className={`${card} mt-6 flex items-center justify-between`} data-bomb-clock={Math.ceil(left / 1000)}>
        <div>
          <p className={eyebrow}>Time</p>
          <p className={`font-mono text-4xl ${left < 60_000 ? 'text-alert' : 'text-white'}`}>{formatClock(left)}</p>
        </div>
        <div className="text-center">
          <p className={eyebrow}>Cuts</p>
          <p className="font-mono text-2xl text-white" data-cuts-done={view.cutsDone}>
            {view.cutsDone}/{view.cutsNeeded}
          </p>
          <p className="flex items-center justify-center gap-1 text-xs text-slate-400" data-unlocked={view.unlocked}>
            {view.unlocked ? <LockOpen size={12} className="text-signal" /> : <Lock size={12} />}
            {view.unlocked ? 'Panel open' : 'Panel locked'}
          </p>
        </div>
        <div className="text-right">
          <p className={eyebrow}>Mistakes</p>
          <p className="mt-1 flex justify-end gap-1" data-strikes={view.strikes} aria-label={`Mistakes ${view.strikes} of ${view.maxStrikes}`}>
            {Array.from({ length: view.maxStrikes }, (_, i) => (
              <Siren key={i} size={22} className={i < view.strikes ? 'text-alert' : 'text-core-600'} />
            ))}
          </p>
          <p className="mt-1 text-xs text-slate-500">Attempt {view.attempt}</p>
        </div>
      </div>

      {/* On restart, cada vista arranca limpia: sin errores ni campos del intento anterior. */}
      <div className="mt-4 space-y-4" key={view.attempt}>
        {view.role === 'navegador' && <NavigatorView view={view} />}
        {view.role === 'analista' && <AnalystView view={view} />}
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
    <p role="alert" className="mt-3 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
      {message}
    </p>
  );
}

function NavigatorView({ view }: { view: Extract<BombView, { role: 'navegador' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Bomb wires</p>
      <ul className="mt-3 space-y-2">
        {view.cables.map((c) => (
          <li key={c.position} data-cable={c.position} data-color={c.color} className="flex items-center gap-3 rounded-lg border border-core-600 bg-core-950 px-3 py-2">
            <span className="w-24 font-mono text-sm whitespace-nowrap text-slate-400">Position {c.position}</span>
            <span className="h-2 flex-1 rounded-full" style={{ background: COLOR_HEX[c.color], border: '1px solid #655e4d' }} />
            <span className="w-20 text-right text-white">{BOMB_COLOR_LABELS[c.color]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-400">The Engineer can't see the colors: tell them the color of each position.</p>
    </div>
  );
}

function AnalystView({ view }: { view: Extract<BombView, { role: 'analista' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Decoy wires</p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {view.decoys.map((c) => (
          <li key={c} data-decoy={c} className="rounded-lg border border-alert/50 bg-alert/10 p-3 text-center text-white">
            <ColorChip color={c} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-300">These two colors are NOT cut. The other four are.</p>
    </div>
  );
}

function CryptoView({ view }: { view: Extract<BombView, { role: 'criptografo' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Panel PIN</p>
      <p className="mt-3 flex justify-center gap-4 font-mono text-5xl text-signal" data-pin={view.pin.join('')}>
        {view.pin.map((s, i) => (
          <span key={i} data-pin-symbol={i}>
            {s}
          </span>
        ))}
      </p>
      <p className="mt-3 text-sm text-slate-300">The PIN is in symbols. The Hacker has the table that converts them into digits: read them out in order.</p>
    </div>
  );
}

function StrategistView({ view }: { view: Extract<BombView, { role: 'estratega' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Color priority</p>
      <ol className="mt-3 space-y-2">
        {view.ranking.map((c, i) => (
          <li key={c} data-rank={i + 1} data-color={c} className="flex items-center gap-3 rounded-lg border border-core-600 bg-core-950 px-3 py-2 text-white">
            <span className="w-6 font-mono text-slate-400">{i + 1}º</span>
            <ColorChip color={c} />
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-slate-300">
        Wires are cut in this order, skipping the two the Analyst says are decoys. You set the team's pace.
      </p>
    </div>
  );
}

function EngineerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<BombView, { role: 'ingeniero' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function cut(position: number) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'bomb:cut', position });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }
  return (
    <div className={card}>
      <p className={eyebrow}>Cutting panel</p>
      {!view.unlocked && <p data-panel-locked className="mt-3 rounded-md border border-core-600 bg-core-950 px-3 py-2 text-sm text-slate-300">The panel is locked. Wait for the Hacker to unlock it.</p>}
      <ul className="mt-3 space-y-2">
        {view.cables.map((c) => (
          <li key={c.position} data-cable={c.position} data-cut={c.cut} className="flex items-center justify-between rounded-lg border border-core-600 bg-core-950 px-3 py-2">
            <span className="font-semibold text-white">Cable {c.position}</span>
            {c.cut ? (
              <span className="font-mono text-xs tracking-widest text-signal uppercase">Cut</span>
            ) : (
              <button type="button" data-cut-cable={c.position} className={`${button} flex items-center gap-2`} disabled={disabled || busy || !view.unlocked} onClick={() => void cut(c.position)}>
                <Scissors size={16} /> Cut
              </button>
            )}
          </li>
        ))}
      </ul>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">You can't see the colors: the Navigator tells you which position is which.</p>
    </div>
  );
}

function HackerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<BombView, { role: 'hacker' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function unlock() {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'bomb:unlock', pin });
    if (!res.ok) setError(res.message);
    setPin('');
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className={eyebrow}>Symbol table</p>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {view.table.map((t) => (
            <li key={t.symbol} data-symbol={t.symbol} data-digit={t.digit} className="rounded-lg border border-core-600 bg-core-950 p-3 text-center">
              <p className="text-2xl text-signal">{t.symbol}</p>
              <p className="font-mono text-xl text-white">= {t.digit}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className={card}>
        <p className={eyebrow}>Unlock the panel</p>
        {view.unlocked ? (
          <p data-unlocked-msg className="mt-3 flex items-center gap-2 text-signal">
            <LockOpen size={16} /> Panel unlocked.
          </p>
        ) : (
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <input
              aria-label="PIN"
              data-pin-input
              className="w-28 rounded-md border border-core-600 bg-core-950 px-3 py-2 font-mono text-white"
              inputMode="numeric"
              maxLength={view.pinLength}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <button type="submit" data-unlock className={button} disabled={disabled || busy || pin.length !== view.pinLength}>
              Unlock
            </button>
          </form>
        )}
        <Banner message={error} />
        <p className="mt-3 text-sm text-slate-400">The Cryptographer has the PIN in symbols. Convert it to digits with your table.</p>
      </div>
    </div>
  );
}
