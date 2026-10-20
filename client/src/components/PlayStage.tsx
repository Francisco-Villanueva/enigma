import { useState } from 'react';
import { Radio } from 'lucide-react';
import type { Ack, ChallengeAction, RoomState } from '@enigma/shared';
import { BroadcastFrame } from './BroadcastFrame';
import { ShareUiSender } from '../lib/shareUi';
import { ChallengePanel } from './ChallengePanel';

interface Props {
  state: RoomState;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
  publishShareUi: (ui: Record<string, unknown>) => void;
}

const tabClass = (selected: boolean) =>
  `flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
    selected
      ? 'border-signal bg-signal/10 text-signal'
      : 'border-core-600 text-slate-300 hover:border-signal'
  }`;

/**
 * Tu panel y, si un compañero está transmitiendo, su pantalla en otra pestaña. Los dos paneles
 * quedan montados: al volver al tuyo no pierdes lo que tenías a medio hacer.
 */
export function PlayStage({ state, sendAction, publishShareUi }: Props) {
  const { challenge, you, share, status, players } = state;
  // Se cuenta como espectador solo si el servidor mandó la vista (el emisor no la recibe).
  const broadcast = share.broadcast?.view ? share.broadcast : null;
  // Guardamos de qué transmisión elegiste «mi panel»: cada transmisión nueva arranca mostrando la suya.
  const [mineFor, setMineFor] = useState<number | null>(null);

  if (!challenge || !you.role) return null;

  // Soy el emisor cuando hay transmisión y el servidor no me manda la vista (la mía ya la tengo).
  const live = share.broadcast !== null && share.broadcast.view === null;
  const showMine = broadcast !== null && mineFor === broadcast.id;
  const sender = broadcast ? players.find((p) => p.playerId === broadcast.fromPlayerId) : undefined;

  return (
    <>
      {broadcast && (
        <div role="tablist" aria-label="Which screen to show" className="mx-auto flex max-w-3xl flex-wrap gap-2 px-5 pt-3">
          <button
            type="button"
            role="tab"
            aria-selected={!showMine}
            data-tab="broadcast"
            onClick={() => setMineFor(null)}
            className={tabClass(!showMine)}
          >
            <Radio aria-hidden="true" className="h-4 w-4" />
            {sender?.name ?? 'Teammate'}’s screen
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showMine}
            data-tab="mine"
            onClick={() => setMineFor(broadcast.id)}
            className={tabClass(showMine)}
          >
            My panel
          </button>
        </div>
      )}

      <div hidden={broadcast !== null && !showMine}>
        <ShareUiSender active={live} broadcastId={share.broadcast?.id ?? null} publish={publishShareUi}>
          <ChallengePanel role={you.role} view={challenge.view} disabled={status === 'paused'} sendAction={sendAction} />
        </ShareUiSender>
      </div>

      {broadcast && (
        <div hidden={showMine}>
          <BroadcastFrame broadcast={broadcast} sender={sender} paused={status === 'paused'} />
        </div>
      )}
    </>
  );
}
