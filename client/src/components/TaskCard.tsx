import { useState } from 'react';
import { ROLE_INFO } from '@enigma/shared';
import type { ChallengeGuide, Role, RoleTask } from '@enigma/shared';
import { ArrowRight, ChevronDown } from 'lucide-react';

/** Who passes what to whom. Rows that involve `role` are highlighted. */
export function FlowList({ guide, role }: { guide: ChallengeGuide; role?: Role | null }) {
  return (
    <ul className="space-y-1.5" data-flow>
      {guide.flow.map((f, i) => {
        const mine = role != null && (f.from === role || f.to === role);
        return (
          <li
            key={i}
            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 border-l-2 px-3 py-1.5 text-sm ${
              mine ? 'border-signal bg-signal/10 text-white' : 'border-core-600 text-slate-300'
            }`}
          >
            <span className="font-semibold">{ROLE_INFO[f.from].label}</span>
            <ArrowRight size={14} className="shrink-0 text-signal" aria-label="tells" />
            <span className="font-semibold">{ROLE_INFO[f.to].label}</span>
            <span className="font-mono text-xs text-slate-400">· {f.what}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function HowToList({ guide }: { guide: ChallengeGuide }) {
  return (
    <ol className="space-y-2" data-howto>
      {guide.howTo.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-200">
          <span className="font-mono text-signal">{i + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** "Your task" card, always visible in play. The mission help folds away. */
export function TaskCard({ task, guide, role }: { task: RoleTask; guide: ChallengeGuide; role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-3xl px-5 pt-4" data-task-card>
      <section className="border border-core-600 border-l-4 border-l-signal bg-core-950 px-5 py-3 shadow-[0_2px_3px_rgb(60_40_10/0.2)]">
        <p className="font-mono text-[0.65rem] tracking-widest text-signal uppercase">Your task</p>
        <p className="mt-1 text-white">{task.does}</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">You can’t see</dt>
            <dd className="text-slate-300">{task.cantSee}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">Talk to</dt>
            <dd className="text-slate-300">{task.talkTo}</dd>
          </div>
        </dl>
        <button
          type="button"
          data-guide-toggle
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-3 flex items-center gap-1 font-mono text-xs text-signal hover:underline"
        >
          How does this mission work?
          <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
        </button>
        {open && (
          <div className="mt-3 space-y-4 border-t border-dashed border-core-600 pt-3">
            <HowToList guide={guide} />
            <div>
              <p className="mb-1.5 font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">
                Who tells what to whom
              </p>
              <FlowList guide={guide} role={role} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
