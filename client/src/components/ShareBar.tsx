import { useState } from 'react';
import { Radio } from 'lucide-react';
import { ROLE_INFO, SHARE_TIME_PENALTY_SECONDS } from '@enigma/shared';
import type { Ack, RoomState } from '@enigma/shared';
import { useRemaining, wholeSeconds } from '../lib/useRemaining';
import { RoleIcon } from './RoleIcon';

interface Props {
  state: RoomState;
  proposeShare: (target: string) => Promise<Ack>;
  voteShare: (vote: 'yes' | 'no') => Promise<Ack>;
}

const buttonClass =
  'rounded-md border border-core-600 px-3 py-1.5 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Créditos de señal, el botón para proponer una transmisión y la votación en curso.
 * No bloquea el panel: el desafío sigue corriendo mientras el equipo decide.
 */
export function ShareBar({ state, proposeShare, voteShare }: Props) {
  const { share, players, you, status } = state;
  const running = status === 'playing';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cooldown = useRemaining(share.cooldownMs, running && share.cooldownMs > 0, share);
  const voteLeft = useRemaining(share.vote?.msLeft ?? 0, running && share.vote !== null, share);

  const nameOf = (id: string) => players.find((p) => p.playerId === id)?.name ?? 'Someone';
  const vote = share.vote;
  const voteTarget = vote ? players.find((p) => p.playerId === vote.target) : undefined;
  const canPropose = running && !vote && !share.broadcast && cooldown <= 0;
  const pickerVisible = open && canPropose;

  async function run(action: () => Promise<Ack>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await action();
    if (!res.ok) setError(res.message);
    setBusy(false);
    return res.ok;
  }

  const costText =
    share.credits > 0
      ? '1 credit per broadcast'
      : `No credits left: each broadcast costs ${SHARE_TIME_PENALTY_SECONDS} s`;

  return (
    <section aria-label="Screen sharing" className="border-b border-core-700 bg-core-900/60">
      <div className="mx-auto max-w-3xl px-5 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 font-mono text-xs text-slate-400">
            <Radio aria-hidden="true" className="h-4 w-4 shrink-0 text-signal" />
            <span className="tracking-widest uppercase">Signal credits</span>
            <span data-share-credits className="text-sm font-bold text-white">
              {share.credits}
            </span>
            <span className={`hidden truncate sm:inline ${share.credits === 0 ? 'text-amber' : 'text-slate-500'}`}>
              {costText}
            </span>
          </p>
          <button
            type="button"
            data-share-open
            className={buttonClass}
            disabled={!canPropose || busy}
            aria-expanded={pickerVisible}
            onClick={() => {
              setOpen((o) => !o);
              setError(null);
            }}
          >
            {cooldown > 0 ? `Wait ${wholeSeconds(cooldown)} s` : 'Share a screen'}
          </button>
        </div>

        {pickerVisible && (
          <div className="mt-2 rounded-md border border-core-700 bg-core-950 p-2" data-share-picker>
            <p className="px-1 pb-2 text-xs text-slate-400">
              Whose screen should everyone see until the challenge ends? The team votes first. {costText}.
            </p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {players.map((p) => (
                <li key={p.playerId}>
                  <button
                    type="button"
                    disabled={busy || !p.connected || !p.role}
                    onClick={async () => {
                      if (await run(() => proposeShare(p.playerId))) setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-core-700 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {p.role && <RoleIcon role={p.role} className="h-4 w-4 shrink-0 text-signal" />}
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      {p.playerId === you.playerId ? ' (you)' : ''}
                    </span>
                    {p.role && <span className="shrink-0 text-xs text-slate-500">{ROLE_INFO[p.role].label}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {vote && (
          <div role="status" data-share-vote className="mt-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2">
            <p className="text-sm text-amber">
              <span className="font-mono text-xs tracking-widest uppercase">Broadcast vote · </span>
              {nameOf(vote.proposedBy)} proposes showing{' '}
              {vote.target === you.playerId ? 'your' : `${nameOf(vote.target)}’s`} screen
              {voteTarget?.role ? ` (${ROLE_INFO[voteTarget.role].label})` : ''}.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Cost: {vote.payment === 'credit' ? '1 signal credit' : `${SHARE_TIME_PENALTY_SECONDS} s off the clock`} ·{' '}
              {vote.yes} of {vote.needed} yes · {vote.no} no · {wholeSeconds(voteLeft)} s left
            </p>
            <div className="mt-2 flex items-center gap-2">
              {(['yes', 'no'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  data-share-vote-button={choice}
                  aria-pressed={vote.myVote === choice}
                  disabled={busy || vote.myVote !== null}
                  onClick={() => void run(() => voteShare(choice))}
                  className={`${buttonClass} ${vote.myVote === choice ? 'border-signal text-signal' : ''}`}
                >
                  {choice === 'yes' ? 'Yes, show it' : 'No'}
                </button>
              ))}
              {vote.myVote !== null && (
                <span className="font-mono text-xs text-slate-400">You voted {vote.myVote}.</span>
              )}
            </div>
          </div>
        )}

        {share.broadcast && !share.broadcast.view && (
          <p role="status" data-share-live className="mt-2 rounded-md border border-signal/50 bg-signal/10 px-3 py-2 text-sm text-signal">
            <span className="live-dot mr-2" aria-hidden="true" />
            You’re live: your team sees everything you do on your screen until the challenge ends. Talk them through it!
          </p>
        )}

        {error && (
          <p role="alert" className="mt-2 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
