import { useState } from 'react';
import { ROLE_INFO } from '@enigma/shared';
import type { Ack, Role, YouInfo } from '@enigma/shared';
import { RoleIcon } from './RoleIcon';

interface Props {
  you: YouInfo;
  switchRole: (role: Role) => Promise<Ack>;
}

/**
 * Con menos de 6 jugadores alguien tiene varios roles: este selector elige con cuál juega ahora.
 * Con un solo rol no se muestra.
 */
export function RoleSwitcher({ you, switchRole }: Props) {
  const [error, setError] = useState<string | null>(null);
  if (you.roles.length < 2) return null;

  return (
    <div className="border-b border-core-700 bg-core-900/60" data-role-switcher>
      <div className="mx-auto max-w-3xl px-5 py-2">
        <div role="tablist" aria-label="Your roles" className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">Playing as</span>
          {you.roles.map((role) => {
            const selected = role === you.role;
            return (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={selected}
                data-switch-role={role}
                onClick={async () => {
                  setError(null);
                  const res = await switchRole(role);
                  if (!res.ok) setError(res.message);
                }}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                  selected
                    ? 'border-signal bg-signal/10 text-signal'
                    : 'border-core-600 text-slate-300 hover:border-signal'
                }`}
              >
                <RoleIcon role={role} size={16} />
                {ROLE_INFO[role].label}
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
