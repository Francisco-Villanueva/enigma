import { useState } from 'react';
import type { Ack, ChallengeAction, FacilitatorCommand, Role, RoomState } from '@enigma/shared';
import { formatClock, useCountdown } from '../lib/useCountdown';
import { Briefing } from './Briefing';
import { FacilitatorPanel } from './FacilitatorPanel';
import { FinalPanel } from './FinalPanel';
import { FragmentsBar } from './FragmentsBar';
import { MapReveal } from './MapReveal';
import { PlayStage } from './PlayStage';
import { SandboxPanel } from './SandboxPanel';
import { ShareBar } from './ShareBar';
import { TaskCard } from './TaskCard';

interface Props {
  state: RoomState;
  pickRole: (role: Role | null) => Promise<Ack>;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
  setReady: (ready: boolean) => Promise<Ack>;
  startGame: () => Promise<Ack>;
  sendCommand: (command: FacilitatorCommand) => Promise<Ack>;
  proposeShare: (target: string) => Promise<Ack>;
  voteShare: (vote: 'yes' | 'no') => Promise<Ack>;
  publishShareUi: (ui: Record<string, unknown>) => void;
}

export function GameScreen({
  state,
  pickRole,
  setReady,
  startGame,
  sendAction,
  sendCommand,
  proposeShare,
  voteShare,
  publishShareUi,
}: Props) {
  const remaining = useCountdown(state.timer);
  const [dismissedHint, setDismissedHint] = useState(0);
  const { status, challenge, you } = state;

  const clockColor =
    remaining < 60_000 ? 'text-alert' : remaining < 300_000 ? 'text-amber' : 'text-white';
  const showHint = state.hint !== null && state.hint.id > dismissedHint;
  const facilitatorControls = you.isFacilitator && ['practice', 'practice_done', 'briefing', 'playing', 'paused', 'transition', 'final', 'won', 'lost'].includes(status);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-core-700 bg-core-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">
              {status === 'practice' || status === 'practice_done'
                ? 'Warm-up'
                : status === 'final' || status === 'won'
                  ? 'Final step'
                  : `Challenge ${state.currentChallenge ?? '–'} of ${state.totalChallenges}`}
            </p>
            <p className="truncate font-semibold text-white">{challenge?.name ?? state.briefing?.name ?? 'Mission: Enigma Core'}</p>
          </div>
          <div className="text-right">
            <p role="timer" className={`font-mono text-3xl font-bold tabular-nums ${clockColor}`}>
              {formatClock(remaining)}
            </p>
            {status === 'paused' && (
              <p className="font-mono text-[0.65rem] tracking-widest text-amber uppercase">Paused</p>
            )}
          </div>
        </div>
      </header>

      {showHint && state.hint && (
        <div role="status" className="border-b border-amber/40 bg-amber/10">
          <div className="mx-auto flex max-w-3xl items-start justify-between gap-4 px-5 py-3">
            <p className="text-sm text-amber">
              <span className="font-mono text-xs tracking-widest uppercase">Facilitator hint · </span>
              {state.hint.text}
            </p>
            <button
              type="button"
              onClick={() => setDismissedHint(state.hint?.id ?? 0)}
              className="shrink-0 rounded border border-amber/50 px-2 py-0.5 text-xs text-amber hover:bg-amber/10"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {!['practice', 'practice_done', 'won'].includes(status) && <FragmentsBar fragments={state.fragments} />}

      <div className="flex-1">
        {status === 'briefing' && (
          <Briefing state={state} pickRole={pickRole} setReady={setReady} sendCommand={sendCommand} />
        )}

        {status === 'practice' && challenge && you.role && (
          <>
            <TaskCard task={challenge.task} guide={challenge.guide} role={you.role} />
            {challenge.view.kind === 'sandbox' && (
              <SandboxPanel role={you.role} view={challenge.view} disabled={false} sendAction={sendAction} />
            )}
          </>
        )}

        {status === 'final' && challenge && you.role && challenge.view.kind === 'final' && (
          <>
            <TaskCard task={challenge.task} guide={challenge.guide} role={you.role} />
            <FinalPanel role={you.role} view={challenge.view} sendAction={sendAction} />
          </>
        )}

        {status === 'practice_done' && (
          <Message
            eyebrow="Warm-up complete"
            tone="ok"
            title="You’re ready"
            text="That’s the whole idea: everyone sees a piece, and you only win by talking. Next up is the real mission, with a clock and new roles."
          >
            {you.isFacilitator ? (
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  data-practice-again
                  onClick={() => void sendCommand({ type: 'practice' })}
                  className="rounded-md border border-core-600 px-4 py-2.5 text-sm text-slate-200 hover:border-signal"
                >
                  Practice again
                </button>
                <button
                  type="button"
                  data-start-mission
                  onClick={() => void startGame()}
                  className="rounded-md bg-signal px-5 py-2.5 font-semibold text-core-950 transition hover:brightness-110"
                >
                  Start mission
                </button>
              </div>
            ) : (
              <p className="mt-6 font-mono text-xs text-slate-500">Waiting for the facilitator…</p>
            )}
          </Message>
        )}

        {(status === 'playing' || status === 'paused') && challenge && you.role && (
          <>
            <TaskCard task={challenge.task} guide={challenge.guide} role={you.role} />
            {status === 'paused' && (
              <p role="status" className="bg-core-800 px-5 py-2 text-center text-sm text-amber">
                The facilitator paused the clock. Wait for them to resume.
              </p>
            )}
            <ShareBar state={state} proposeShare={proposeShare} voteShare={voteShare} />
            <PlayStage state={state} sendAction={sendAction} publishShareUi={publishShareUi} />
          </>
        )}

        {status === 'transition' && (
          <Message
            eyebrow="System restored"
            tone="ok"
            title="Fragment recovered"
            text={`${formatClock(remaining)} left on the clock. ${
              state.fragments.length > 0 ? `Fragment ${state.fragments[state.fragments.length - 1]?.value} is now in your file. ` : ''
            }Take a breather: in the next challenge everyone switches roles.`}
          >
            {you.isFacilitator ? (
              <button
                type="button"
                onClick={() => void sendCommand({ type: 'next' })}
                className="mt-6 rounded-md bg-signal px-5 py-2.5 font-semibold text-core-950 transition hover:brightness-110"
              >
                Release next challenge
              </button>
            ) : (
              <p className="mt-6 font-mono text-xs text-slate-500">Waiting for the facilitator…</p>
            )}
          </Message>
        )}

        {status === 'won' && state.reveal && <MapReveal reveal={state.reveal} timeLeft={formatClock(remaining)} />}

        {status === 'won' && !state.reveal && (
          <Message
            eyebrow="Mission accomplished"
            tone="ok"
            title="The beacon is back online"
            text={`You made it with ${formatClock(remaining)} to spare. Now for the debrief: what helped you communicate better?`}
          >
            <ReplayButton isFacilitator={you.isFacilitator} sendCommand={sendCommand} />
          </Message>
        )}

        {status === 'lost' && (
          <Message
            eyebrow="Signal lost"
            title="The signal went dark"
            text="The beacon ran out of time before you could pin down the aircraft’s position. What matters is what you learned along the way: discuss what you would do differently."
          >
            <ReplayButton isFacilitator={you.isFacilitator} sendCommand={sendCommand} />
          </Message>
        )}
      </div>

      {facilitatorControls && (
        <FacilitatorPanel status={status} view={state.facilitatorView} share={state.share} sendCommand={sendCommand} />
      )}
    </div>
  );
}

function ReplayButton(props: { isFacilitator: boolean; sendCommand: (command: FacilitatorCommand) => Promise<Ack> }) {
  const [busy, setBusy] = useState(false);
  if (!props.isFacilitator) {
    return <p className="mt-6 font-mono text-xs text-slate-500">Waiting for the facilitator…</p>;
  }
  return (
    <button
      type="button"
      data-replay
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void props.sendCommand({ type: 'replay' }).finally(() => setBusy(false));
      }}
      className="mt-8 rounded-md bg-signal px-6 py-3 font-semibold text-core-950 transition hover:brightness-110 disabled:opacity-40"
    >
      Play again
    </button>
  );
}

function Message(props: { eyebrow: string; title: string; text: string; tone?: 'ok' | 'bad'; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-5 py-16 text-center">
      <p className={`stamp text-sm ${props.tone === 'ok' ? 'stamp-ok' : ''}`}>{props.eyebrow}</p>
      <h1 className="mt-6 font-display text-4xl leading-tight font-black tracking-tight text-white">{props.title}</h1>
      <p className="mt-3 text-slate-400">{props.text}</p>
      {props.children}
    </main>
  );
}
