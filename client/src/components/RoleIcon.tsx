import { Activity, Clock, Compass, Key, Sliders, Terminal } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { ROLE_INFO } from '@enigma/shared';
import type { Role } from '@enigma/shared';

const ICONS = { Compass, Activity, Key, Clock, Sliders, Terminal } as const;

export function RoleIcon({ role, ...props }: { role: Role } & LucideProps) {
  const Icon = ICONS[ROLE_INFO[role].icon];
  return <Icon aria-hidden="true" {...props} />;
}
