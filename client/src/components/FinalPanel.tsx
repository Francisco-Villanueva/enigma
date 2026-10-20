import { useState } from 'react';
import { FINAL_SLOT_LABELS } from '@enigma/shared';
import type { Ack, ChallengeAction, FinalView, Role } from '@enigma/shared';
import { RoleHeader } from './RoleHeader';

interface Props {
  role: Role;
  view: FinalView;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

/** Shared board: whatever one player places, everyone sees. */
export function FinalPanel({ role, view, sendAction }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = view.slots.every((v) => v !== null);

  async function run(action: ChallengeAction) {
    setError(null);
    const res = await sendAction(action);
    if (!res.ok) setError(res.message);
  }

  function clickSlot(i: number) {
    const current = view.slots[i];
    if (selected !== null) {
      void run({ kind: 'final:place', slot: i, value: selected });
      setSelected(null);
    } else if (current !== null && current !== undefined) {
      void run({ kind: 'final:clear', slot: i });
    }
  }

  return (
    <section className="mx-auto max-w-xl px-5 py-8" data-challenge="final" data-role={role}>
      <RoleHeader role={role} />

      <div className="mt-6 border border-core-600 border-l-4 border-l-alert bg-core-950 px-5 py-3" data-clue>
        <p className="font-mono text-[0.65rem] tracking-widest text-alert uppercase">Your clue · only you see it</p>
        <p className="mt-1 text-white">{view.clue}</p>
      </div>

      <div className="mt-6">
        <p className="font-mono text-xs tracking-widest text-slate-400 uppercase">Fragments left</p>
        <ul className="mt-2 flex min-h-12 flex-wrap gap-2">
          {view.pool.map((v) => (
            <li key={v}>
              <button
                type="button"
                data-chip={v}
                aria-pressed={selected === v}
                onClick={() => setSelected(selected === v ? null : v)}
                className={`border-2 px-4 py-2 font-mono text-xl font-bold transition ${
                  selected === v
                    ? 'border-signal bg-signal/15 text-signal'
                    : 'border-core-600 bg-core-900 text-white hover:border-signal'
                }`}
              >
                {v}
              </button>
            </li>
          ))}
          {view.pool.length === 0 && <li className="text-sm text-slate-400">All placed. Check them together.</li>}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Tap a fragment, then tap a slot. Tap a filled slot to take the fragment back.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1].map((half) => (
          <div key={half}>
            <p className="font-mono text-xs tracking-widest text-signal uppercase">
              {half === 0 ? 'Latitude (N)' : 'Longitude (E)'}
            </p>
            <ul className="mt-2 space-y-2">
              {[0, 1, 2].map((k) => {
                const i = half * 3 + k;
                const value = view.slots[i];
                return (
                  <li key={i}>
                    <button
                      type="button"
                      data-slot={i}
                      onClick={() => clickSlot(i)}
                      className={`flex w-full items-center justify-between border px-3 py-2 text-left ${
                        value ? 'border-signal bg-signal/10' : 'border-dashed border-core-600 bg-core-900'
                      } ${selected !== null ? 'hover:border-signal' : ''}`}
                    >
                      <span className="text-sm text-slate-300">
                        {FINAL_SLOT_LABELS[i]?.split(' · ')[1]}
                      </span>
                      <span className="font-mono text-xl font-bold text-white">{value ?? '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      {view.attempts > 0 && <p className="mt-2 text-sm text-slate-400">Failed attempts: {view.attempts}</p>}

      <button
        type="button"
        data-final-submit
        disabled={!full}
        onClick={() => void run({ kind: 'final:submit' })}
        className="mt-6 w-full rounded-md bg-signal px-4 py-3 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Verify coordinates
      </button>
    </section>
  );
}
