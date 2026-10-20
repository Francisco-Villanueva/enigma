import { useState } from 'react';
import type { Ack, BridgeSide, BridgeView, ChallengeAction, Role } from '@enigma/shared';
import { CheckCircle2, Footprints, Lightbulb, Siren } from 'lucide-react';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: BridgeView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

const card = 'rounded-xl border border-core-600 bg-core-900 p-5';
const eyebrow = 'font-mono text-xs tracking-widest text-slate-400 uppercase';

/** Desafío 6: todos ven el acertijo de la fila; solo el Estratega pisa y cada rol tiene las pistas de su categoría. */
export function BridgePanel({ role, view, disabled, sendAction }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="bridge" data-role={role} data-attempt={view.attempt}>
      <RoleHeader role={role} />

      <div className={`${card} mt-6 flex items-center justify-between`}>
        <div>
          <p className={eyebrow}>Rows</p>
          <p className="font-mono text-3xl text-white" data-crossed={view.crossed}>
            {view.crossed}/{view.rows}
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

      {/* Al reiniciar, cada vista arranca limpia: sin errores ni mensajes del intento anterior. */}
      <div className="mt-4 space-y-4" key={view.attempt}>
        {view.solved && (
          <div data-solved={view.solved.row} className="rounded-xl border border-signal/50 bg-signal/10 p-4 text-sm text-slate-200">
            <p className="flex items-center gap-2 font-semibold text-signal">
              <CheckCircle2 size={16} /> Row {view.solved.row} solved: {view.solved.answer}
            </p>
            <p className="mt-1">{view.solved.explanation}</p>
          </div>
        )}

        {view.riddle && (
          <div className={card} data-riddle={view.riddle.row}>
            <p className={eyebrow}>
              Riddle for row {view.riddle.row} · {view.riddle.category}
            </p>
            <p className="mt-3 font-display text-xl leading-snug font-semibold text-white" data-riddle-text>
              {view.riddle.text}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(['L', 'R'] as BridgeSide[]).map((side) => {
                const broken = view.cracked.includes(side);
                const text = side === 'L' ? view.riddle!.left : view.riddle!.right;
                return (
                  <div
                    key={side}
                    data-option={side}
                    data-broken={broken}
                    className={`rounded-lg border p-3 text-center ${
                      broken ? 'border-alert/60 bg-alert/10 text-alert line-through' : 'border-white/30 bg-core-800 text-white'
                    }`}
                  >
                    <p className="font-mono text-xs text-slate-400">{side === 'L' ? 'Left tile' : 'Right tile'}</p>
                    <p className="mt-1 text-base font-semibold">{text}</p>
                    {broken && <p className="mt-1 text-xs">it shattered!</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view.hint ? (
          <div className="rounded-xl border border-amber/50 bg-amber/10 p-4" data-hint>
            <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-amber uppercase">
              <Lightbulb size={14} /> Your hint for this riddle
            </p>
            <p className="mt-2 text-slate-100">{view.hint}</p>
            <p className="mt-2 text-xs text-slate-400">Use it if the team gets stuck: share it out loud.</p>
          </div>
        ) : (
          view.riddle && (
            <p className="text-sm text-slate-400" data-specialty={view.specialty}>
              You are the specialist in <span className="text-slate-200">{view.specialty}</span> riddles: you'll get the hint when one of that type comes up.
            </p>
          )
        )}

        <Mini view={view} />
        {role === 'estratega' && view.riddle && <Stepper view={view} disabled={disabled} sendAction={sendAction} />}
        {role !== 'estratega' && view.riddle && (
          <p className="text-sm text-slate-400">Solve the riddle together: the Strategist steps on a tile once the team agrees.</p>
        )}
      </div>
    </section>
  );
}

function Mini({ view }: { view: BridgeView }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Bridge progress">
      {Array.from({ length: view.rows }, (_, i) => {
        const done = i < view.crossed;
        const current = i === view.crossed;
        return (
          <li
            key={i}
            data-row={i + 1}
            data-row-state={done ? 'done' : current ? 'current' : 'pending'}
            className={`flex h-8 flex-1 items-center justify-center rounded-md border text-xs ${
              done ? 'border-signal/50 bg-signal/10 text-signal' : current ? 'border-white/60 text-white' : 'border-core-600 text-slate-600'
            }`}
          >
            {done ? '✓' : current ? <Footprints size={14} aria-label="The crew is here" /> : i + 1}
          </li>
        );
      })}
    </ol>
  );
}

function Stepper({ view, disabled, sendAction }: { view: BridgeView; disabled: boolean; sendAction: Props['sendAction'] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const riddle = view.riddle!;
  async function step(side: BridgeSide) {
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'bridge:step', side });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }
  return (
    <div className={card}>
      <p className={eyebrow}>Which tile do you step on?</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(['L', 'R'] as BridgeSide[]).map((side) => {
          const text = side === 'L' ? riddle.left : riddle.right;
          return (
            <button
              key={side}
              type="button"
              data-step={side}
              data-option-text={text}
              disabled={disabled || busy || view.cracked.includes(side)}
              onClick={() => void step(side)}
              className="rounded-md bg-signal px-4 py-3 text-left font-semibold text-core-950 transition hover:brightness-110 disabled:opacity-40"
            >
              {side === 'L' ? '←' : '→'} {text}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
