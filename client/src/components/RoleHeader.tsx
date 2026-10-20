import { ROLE_INFO } from '@enigma/shared';
import type { Role } from '@enigma/shared';
import { RoleIcon } from './RoleIcon';

/** The "personnel file" strip at the top of every role panel. */
export function RoleHeader({ role }: { role: Role }) {
  return (
    <div className="flex items-center gap-4 border-b-2 border-double border-core-600 pb-4">
      <span className="flex h-14 w-14 shrink-0 -rotate-3 items-center justify-center rounded-full border-2 border-signal/70 text-signal">
        <RoleIcon role={role} size={26} />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[0.65rem] tracking-[0.25em] text-alert uppercase">Eyes only · Role file</p>
        <p className="font-display text-2xl leading-tight font-black text-white">{ROLE_INFO[role].label}</p>
        <p className="text-sm text-slate-400">{ROLE_INFO[role].summary}</p>
      </div>
    </div>
  );
}
