import { useState } from 'react';
import type { FormEvent } from 'react';
import { ROLES, ROLE_INFO } from '@enigma/shared';
import type { Ack, ChallengeAction, Role, SandboxView } from '@enigma/shared';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: SandboxView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

/** Desafío de práctica: cada rol ve un dígito y el Hacker arma el código con el equipo. */
export function SandboxPanel({ role, view, disabled, sendAction }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendAction({ kind: 'sandbox:submit', code });
    if (!res.ok) setError(res.message);
    else setCode('');
    setBusy(false);
  }

  return (
    <section className="mx-auto max-w-xl px-5 py-8">
      <RoleHeader role={role} />

      <div className="mt-8 rounded-xl border border-core-600 bg-core-900 p-6 text-center">
        <p className="font-mono text-xs tracking-widest text-slate-400 uppercase">Your code digit</p>
        <p className="mt-2 font-mono text-8xl font-bold text-signal" aria-label={`Your digit is ${view.digit}`}>
          {view.digit}
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Nobody else sees this number. Say it out loud to build the code together.
        </p>
      </div>

      {view.canSubmit && view.order ? (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-core-600 bg-core-900 p-6">
          <div>
            <p className="font-mono text-xs tracking-widest text-slate-400 uppercase">
              Code order (only you see it)
            </p>
            <ol className="mt-2 flex flex-wrap gap-2">
              {view.order.map((r, i) => (
                <li
                  key={r}
                  className="flex items-center gap-1.5 rounded-md border border-core-600 px-2 py-1 text-sm text-slate-200"
                >
                  <span className="font-mono text-slate-500">{i + 1}.</span>
                  {ROLE_INFO[r].label}
                </li>
              ))}
            </ol>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">{ROLES.length}-digit code</span>
            <input
              className="w-full rounded-md border border-core-600 bg-core-950 px-3 py-2.5 text-center font-mono text-2xl tracking-[0.5em] text-white"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, ROLES.length))}
              inputMode="numeric"
              autoComplete="off"
              disabled={disabled}
              placeholder="······"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
              {error}
            </p>
          )}
          {view.attempts > 0 && (
            <p className="text-sm text-slate-400">Failed attempts: {view.attempts}</p>
          )}

          <button
            type="submit"
            disabled={disabled || busy || code.length !== ROLES.length}
            className="w-full rounded-md bg-signal px-4 py-2.5 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit code
          </button>
        </form>
      ) : (
        <p className="mt-6 text-center text-sm text-slate-400">
          The Hacker is the one who enters the code. Help them by saying your digit when asked.
        </p>
      )}
    </section>
  );
}
