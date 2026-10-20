import type { Ack, ChallengeAction, ChallengeView, Role } from '@enigma/shared';
import { BombPanel } from './BombPanel';
import { BridgePanel } from './BridgePanel';
import { CircuitPanel } from './CircuitPanel';
import { NavigationPanel } from './NavigationPanel';
import { PowerCorePanel } from './PowerCorePanel';
import { SandboxPanel } from './SandboxPanel';
import { SignalPanel } from './SignalPanel';

interface Props {
  role: Role;
  view: ChallengeView;
  disabled: boolean;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
}

/**
 * El panel de un desafío según el tipo de vista. Lo usan el panel propio y también la transmisión
 * de pantalla de un compañero (con `disabled` y una `sendAction` que no hace nada).
 */
export function ChallengePanel({ role, view, disabled, sendAction }: Props) {
  switch (view.kind) {
    case 'sandbox':
      return <SandboxPanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    case 'circuit':
      return <CircuitPanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    case 'bridge':
      return <BridgePanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    case 'bomb':
      return <BombPanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    case 'signal':
      return <SignalPanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    case 'nav':
      return <NavigationPanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    case 'core':
      return <PowerCorePanel role={role} view={view} disabled={disabled} sendAction={sendAction} />;
    default:
      return null;
  }
}
