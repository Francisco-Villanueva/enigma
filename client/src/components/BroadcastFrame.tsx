import { ROLE_INFO, SHARE_TIME_PENALTY_SECONDS } from '@enigma/shared';
import type { Ack, PublicPlayer, ShareBroadcastInfo } from '@enigma/shared';
import { MirrorBoundary, ShareUiMirror } from '../lib/shareUi';
import { ChallengePanel } from './ChallengePanel';

interface Props {
  broadcast: ShareBroadcastInfo;
  sender: PublicPlayer | undefined;
  /** El reloj de la partida está en pausa. */
  paused: boolean;
}

/** Esto es un espejo: ninguna acción sale de acá. */
const watchOnly = async (): Promise<Ack> => ({
  ok: false,
  error: 'invalid_action',
  message: 'This is a live broadcast: you can only watch.',
});

/**
 * La pantalla de un compañero, tal como la ve él. El servidor manda la vista de su rol y acá se
 * dibuja con el mismo panel de siempre, pero deshabilitado y sin forma de actuar.
 */
export function BroadcastFrame({ broadcast, sender, paused }: Props) {
  const name = sender?.name ?? 'A teammate';

  if (!broadcast.view) return null;

  return (
    <section aria-label={`Live broadcast from ${name}`} data-broadcast className="mx-auto max-w-3xl px-5 py-3">
      <div className="overflow-hidden rounded-lg border border-signal/60 shadow-[0_0_24px_rgb(53_224_194/0.15)]">
        <div className="flex items-center justify-between gap-3 bg-signal/10 px-4 py-2 font-mono text-xs tracking-widest text-signal uppercase">
          <span className="flex min-w-0 items-center gap-2">
            <span className="live-dot" aria-hidden="true" />
            <span className="truncate">
              Live · {name} ({ROLE_INFO[broadcast.role].label}) · view only
            </span>
          </span>
          <span className="shrink-0" role="timer">
            {paused ? 'Paused' : 'Until the challenge ends'}
            {broadcast.paidWith === 'time' ? ` · −${SHARE_TIME_PENALTY_SECONDS} s paid` : ''}
          </span>
        </div>
        <div className="broadcast-screen pointer-events-none select-none">
          <MirrorBoundary>
            <ShareUiMirror values={broadcast.ui}>
              <ChallengePanel role={broadcast.role} view={broadcast.view} disabled sendAction={watchOnly} />
            </ShareUiMirror>
          </MirrorBoundary>
        </div>
      </div>
    </section>
  );
}
