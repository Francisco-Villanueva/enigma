import { useState } from 'react';
import { BURST_LABELS, CIPHER_INFO, CIPHER_METHODS, SIGNAL_CHANNELS, SIGNAL_FREE_DECODES } from '@enigma/shared';
import type { Ack, BurstId, ChallengeAction, CipherMethod, Role, SignalView } from '@enigma/shared';
import { Check, Radio } from 'lucide-react';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: SignalView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

type Send = (action: ChallengeAction) => Promise<Ack>;

const card = 'rounded-xl border border-core-600 bg-core-900 p-5';
const eyebrow = 'font-mono text-xs tracking-widest text-slate-400 uppercase';
const input = 'rounded-md border border-core-600 bg-core-950 px-3 py-2 font-mono text-white';

/** Challenge 4: each role sees a different part of the intercepted transmission. */
export function SignalPanel({ role, view, disabled, sendAction }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="signal" data-role={role}>
      <RoleHeader role={role} />
      <div className="mt-6 space-y-4">
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

function NavigatorView({ view }: { view: Extract<SignalView, { role: 'navegador' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Antenna triangulation</p>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {view.bearings.map((b) => (
          <li key={b.burst} data-bearing={b.burst} data-degrees={b.degrees} className="rounded-lg border border-core-600 bg-core-950 p-3 text-center">
            <p className="font-mono text-xs tracking-widest text-slate-400 uppercase">Burst {BURST_LABELS[b.burst]}</p>
            <Compass degrees={b.degrees} />
            <p className="font-mono text-2xl text-signal">{b.degrees}°</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-400">
        This is the bearing each burst arrives from (0° = up, 90° = right). You don't know which channel it is: pass the degrees to the
        Cryptographer.
      </p>
    </div>
  );
}

function Compass({ degrees }: { degrees: number }) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return (
    <svg viewBox="-50 -50 100 100" className="mx-auto my-2 h-20 w-20" aria-hidden>
      <circle r="44" fill="none" className="stroke-core-600" strokeWidth="2" />
      <text y="-34" textAnchor="middle" className="fill-slate-500" fontSize="9">
        N
      </text>
      <line x1="0" y1="0" x2={Math.cos(rad) * 38} y2={Math.sin(rad) * 38} className="stroke-signal" strokeWidth="3" strokeLinecap="round" />
      <circle r="3" className="fill-signal" />
    </svg>
  );
}

function AnalystView({ view }: { view: Extract<SignalView, { role: 'analista' }> }) {
  const max = 25;
  return (
    <div className={card}>
      <p className={eyebrow}>Phase spectrum</p>
      <ul className="mt-4 space-y-3">
        {view.shifts.map((s) => (
          <li key={s.burst} data-shift={s.burst} data-value={s.shift}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Burst {BURST_LABELS[s.burst]}</span>
              <span className="font-mono text-2xl text-signal">{s.shift}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-core-950">
              <div className="h-full bg-signal" style={{ width: `${(s.shift / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-slate-400">
        This is the shift: how many letters each burst's cipher moved. The Hacker needs it to decrypt, so read it out
        along with the burst's name.
      </p>
    </div>
  );
}

function CryptoView({ view }: { view: Extract<SignalView, { role: 'criptografo' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Channel table</p>
      <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {view.bands.map((b) => (
          <li key={b.channel} data-band={b.channel} className="rounded-md border border-core-600 bg-core-950 px-3 py-2 text-center">
            <span className="font-mono text-signal">Channel {b.channel}</span>
            <br />
            <span className="text-slate-300">
              {b.from}°–{b.to}°
            </span>
          </li>
        ))}
      </ul>

      <p className={`${eyebrow} mt-6`}>Cipher methods</p>
      <ul className="mt-3 space-y-2">
        {view.methods.map((m) => (
          <li key={m.burst} data-method={m.burst} data-kind={m.method} className="rounded-md border border-core-600 bg-core-950 px-3 py-2 text-slate-200">
            <span className="font-mono text-signal">
              Burst {BURST_LABELS[m.burst]} · {m.label}
            </span>
            <br />
            <span className="text-sm text-slate-300">{m.steps}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-400">
        Convert each of the Navigator's bearings into a channel for the Engineer, and tell the Hacker which method to use on each burst.
      </p>
    </div>
  );
}

function StrategistView({ view }: { view: Extract<SignalView, { role: 'estratega' }> }) {
  return (
    <div className={card}>
      <p className={eyebrow}>Message reading order</p>
      <ol className="mt-4 space-y-2" data-order={view.order.join(',')}>
        {view.order.map((id, i) => {
          const done = view.tuned.includes(id);
          return (
            <li
              key={id}
              data-order-burst={id}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 ${done ? 'border-signal/40 text-signal' : 'border-core-600 text-slate-200'}`}
            >
              <span className="font-mono text-slate-500">{i + 1}.</span>
              <span className="font-semibold">Burst {BURST_LABELS[id]}</span>
              <span className="ml-auto flex items-center gap-1 text-xs">
                {done ? (
                  <>
                    <Check size={14} /> captured
                  </>
                ) : (
                  'not captured'
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-slate-400">
        The first burst's word goes first, and so on. Tell the Hacker the order before they transmit.
      </p>
    </div>
  );
}

function EngineerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<SignalView, { role: 'ingeniero' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [channels, setChannels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function tune(burst: BurstId) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'sig:tune', burst, channel: channels[burst] ?? 1 });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  return (
    <div className={card}>
      <p className={eyebrow}>Tuning console</p>
      <ul className="mt-4 space-y-3">
        {view.bursts.map((b) => {
          const value = b.channel ?? channels[b.burst] ?? 1;
          return (
            <li
              key={b.burst}
              data-tune-row={b.burst}
              data-tuned={b.tuned}
              className={`rounded-lg border p-3 ${b.tuned ? 'border-signal bg-signal/10' : 'border-core-600 bg-core-950'}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-white">
                  <Radio size={16} className={b.tuned ? 'text-signal' : 'text-slate-500'} />
                  Burst {BURST_LABELS[b.burst]}
                </span>
                {b.tuned && <span className="font-mono text-xs tracking-widest text-signal uppercase">Captured · channel {b.channel}</span>}
              </div>
              {!b.tuned && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-sm text-slate-300" htmlFor={`ch-${b.burst}`}>
                    Channel
                  </label>
                  <input
                    id={`ch-${b.burst}`}
                    data-tune-input={b.burst}
                    type="number"
                    min={1}
                    max={SIGNAL_CHANNELS}
                    value={value}
                    onChange={(e) => setChannels((c) => ({ ...c, [b.burst]: Number(e.target.value) }))}
                    className={`${input} w-20`}
                  />
                  <button
                    type="button"
                    data-tune={b.burst}
                    disabled={disabled || busy}
                    onClick={() => void tune(b.burst)}
                    className="ml-auto rounded-md bg-signal px-4 py-2 text-sm font-semibold text-core-950 transition hover:brightness-110 disabled:opacity-40"
                  >
                    Tune
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        There are {SIGNAL_CHANNELS} channels. Tuning wrong costs time: wait for the Cryptographer to tell you each burst's channel.
      </p>
    </div>
  );
}

function HackerView({
  view,
  disabled,
  sendAction,
}: {
  view: Extract<SignalView, { role: 'hacker' }>;
  disabled: boolean;
  sendAction: Send;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [methods, setMethods] = useState<Record<string, CipherMethod>>({});
  const [shifts, setShifts] = useState<Record<string, number>>({});
  const [words, setWords] = useState<string[]>(['', '', '', '']);

  async function decodeBurst(burst: BurstId) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'sig:decode', burst, method: methods[burst] ?? 'adelante', shift: shifts[burst] ?? 0 });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'sig:submit', words });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  return (
    <div className={card}>
      <p className={eyebrow}>Decryption terminal</p>
      <ul className="mt-4 space-y-3">
        {view.bursts.map((b) => (
          <li key={b.burst} data-burst={b.burst} data-captured={b.captured} className="rounded-lg border border-core-600 bg-core-950 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Burst {BURST_LABELS[b.burst]}</span>
              <span className="font-mono text-lg tracking-widest text-amber" data-cipher={b.cipher ?? ''}>
                {b.cipher ?? '░░░░░░'}
              </span>
            </div>
            {b.captured ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    data-method-select={b.burst}
                    value={methods[b.burst] ?? 'adelante'}
                    onChange={(e) => setMethods((m) => ({ ...m, [b.burst]: e.target.value as CipherMethod }))}
                    className={`${input} text-sm`}
                  >
                    {CIPHER_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {CIPHER_INFO[m].label}
                      </option>
                    ))}
                  </select>
                  <input
                    data-shift-input={b.burst}
                    type="number"
                    min={0}
                    max={25}
                    value={shifts[b.burst] ?? 0}
                    onChange={(e) => setShifts((s) => ({ ...s, [b.burst]: Number(e.target.value) }))}
                    className={`${input} w-20`}
                    aria-label="Shift"
                  />
                  <button
                    type="button"
                    data-decode={b.burst}
                    disabled={disabled || busy}
                    onClick={() => void decodeBurst(b.burst)}
                    className="rounded-md border border-signal/60 px-3 py-2 text-sm text-signal transition hover:bg-signal/10 disabled:opacity-40"
                  >
                    Decrypt
                  </button>
                </div>
                {b.last && (
                  <p className="mt-2 text-sm text-slate-300">
                    Result:{' '}
                    <span className="font-mono text-lg tracking-widest text-white" data-decoded={b.burst}>
                      {b.last.result}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {b.decodes < SIGNAL_FREE_DECODES ? 'First try is free.' : 'Each extra try costs 5 s.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No signal: the Engineer hasn't tuned this burst yet.</p>
            )}
          </li>
        ))}
      </ul>

      <p className={`${eyebrow} mt-6`}>Transmit the key</p>
      <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {words.map((w, i) => (
            <input
              key={i}
              data-word={i}
              value={w}
              placeholder={`Word ${i + 1}`}
              onChange={(e) => setWords((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              className={`${input} uppercase`}
            />
          ))}
        </div>
        <button
          type="submit"
          data-submit
          disabled={disabled || busy}
          className="w-full rounded-md bg-signal px-4 py-2 font-semibold text-core-950 transition hover:brightness-110 disabled:opacity-40"
        >
          Transmit
        </button>
      </form>
      {view.lastCorrect !== null && (
        <p className="mt-2 text-sm text-amber" data-last-correct={view.lastCorrect}>
          Last attempt: {view.lastCorrect} of {view.total} words in place ({view.attempts} attempt{view.attempts === 1 ? '' : 's'}).
        </p>
      )}
      <Banner message={error} />
      <p className="mt-3 text-sm text-slate-400">
        Words are transmitted in the reading order the Strategist gives you. A wrong attempt costs 20 s.
      </p>
    </div>
  );
}
