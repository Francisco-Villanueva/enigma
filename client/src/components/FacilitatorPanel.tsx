import { useState } from 'react';
import type { FormEvent } from 'react';
import { BOMB_COLOR_LABELS, CIPHER_INFO, HINT_MAX_LENGTH, PHASE_LABELS, PIECE_INFO, ROLE_INFO, ROTATION_NAMES } from '@enigma/shared';
import type { Ack, FacilitatorCommand, FacilitatorView, RoomStatus, ShareInfo } from '@enigma/shared';

interface Props {
  status: RoomStatus;
  view: FacilitatorView | null;
  share: ShareInfo;
  sendCommand: (command: FacilitatorCommand) => Promise<Ack>;
}

const buttonClass =
  'rounded-md border border-core-600 px-3 py-2 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40';

export function FacilitatorPanel({ status, view, share, sendCommand }: Props) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inChallenge = status === 'playing' || status === 'paused';

  async function send(command: FacilitatorCommand): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await sendCommand(command);
    if (!res.ok) setError(res.message);
    setBusy(false);
    return res.ok;
  }

  async function sendHint(e: FormEvent) {
    e.preventDefault();
    if (await send({ type: 'hint', text: hint })) setHint('');
  }

  function confirmThen(message: string, command: FacilitatorCommand) {
    if (window.confirm(message)) void send(command);
  }

  return (
    <section aria-label="Facilitator panel" className="sticky bottom-0 border-t border-amber/40 bg-core-900">
      <div className="mx-auto max-w-3xl px-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between py-3 font-mono text-xs tracking-widest text-amber uppercase"
        >
          Facilitator panel
          <span aria-hidden="true">{open ? '▼' : '▲'}</span>
        </button>

        {open && (
          <div className="space-y-4 pb-5">
            <div className="flex flex-wrap gap-2">
              {status === 'playing' && (
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'pause' })}>
                  Pause
                </button>
              )}
              {status === 'paused' && (
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'resume' })}>
                  Resume
                </button>
              )}
              {status === 'transition' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send({ type: 'next' })}
                  className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-core-950 transition hover:brightness-110 disabled:opacity-40"
                >
                  Release next challenge
                </button>
              )}
              {status === 'final' && (
                <>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'time', seconds: 60 })}>
                    +1 min
                  </button>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'time', seconds: -60 })}>
                    −1 min
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => confirmThen('Skip the final step and reveal the position?', { type: 'skip' })}
                  >
                    Skip final step
                  </button>
                </>
              )}
              {status === 'practice' && (
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'skip' })}>
                  End warm-up
                </button>
              )}
              {inChallenge && (
                <>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'time', seconds: 60 })}>
                    +1 min
                  </button>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void send({ type: 'time', seconds: -60 })}>
                    −1 min
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => confirmThen('Restart the challenge? Progress is lost, but not time.', { type: 'restart' })}
                  >
                    Restart challenge
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => confirmThen('Skip this challenge and mark it as complete?', { type: 'skip' })}
                  >
                    Skip challenge
                  </button>
                  <button
                    type="button"
                    data-share-cancel
                    className={buttonClass}
                    disabled={busy || (!share.vote && !share.broadcast)}
                    onClick={() => void send({ type: 'share:cancel' })}
                  >
                    {share.broadcast ? 'Cut broadcast' : 'Cancel vote'}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void send({ type: 'share:credits', delta: 1 })}
                  >
                    +1 signal credit ({share.credits})
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || share.credits === 0}
                    onClick={() => void send({ type: 'share:credits', delta: -1 })}
                  >
                    −1 signal credit
                  </button>
                </>
              )}
            </div>

            <div>
              <button
                type="button"
                data-back-lobby
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  confirmThen('Go back to the lobby? The game resets: roles, fragments and the clock start over.', { type: 'lobby' })
                }
              >
                Back to lobby
              </button>
            </div>

            <form onSubmit={sendHint} className={`flex gap-2 ${status === 'won' || status === 'lost' ? 'hidden' : ''}`}>
              <input
                className="min-w-0 flex-1 rounded-md border border-core-600 bg-core-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                maxLength={HINT_MAX_LENGTH}
                placeholder="Write a hint for the whole team"
              />
              <button type="submit" className={buttonClass} disabled={busy || hint.trim().length === 0}>
                Send hint
              </button>
            </form>

            {error && (
              <p role="alert" className="rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
                {error}
              </p>
            )}

            {view && view.kind !== 'final' && (
              <details className="rounded-md border border-core-700 px-3 py-2">
                <summary className="cursor-pointer text-sm text-slate-400">
                  View solution (spoiler: you would see it as a player too)
                </summary>
                <div className="mt-2 font-mono text-sm text-slate-200">
                  {view.kind === 'sandbox' && (
                    <p>
                      Code: <span className="text-signal">{view.code}</span> · Failed attempts: {view.attempts}
                      <span className="mt-1 block text-xs text-slate-500">
                        Order: {Object.values(ROLE_INFO).map((r) => r.label).join(' → ')}
                      </span>
                    </p>
                  )}
                  {view.kind === 'circuit' && (
                    <div className="space-y-1" data-circuit-solution>
                      <p>
                        Phases: <span className="text-signal">{view.phases.map((p) => PHASE_LABELS[p]).join(' → ')}</span>
                      </p>
                      <p className="text-signal">
                        {view.layout
                          .map((p) => `${PIECE_INFO[p.piece].label} ${p.cell} ${ROTATION_NAMES[p.rotation]}`)
                          .join(' · ')}
                      </p>
                      <p className="text-xs text-slate-400">
                        Top: {view.halves.top.map((id) => PIECE_INFO[id].label).join(', ') || '—'} · Bottom:{' '}
                        {view.halves.bottom.map((id) => PIECE_INFO[id].label).join(', ') || '—'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Cryptographer clues: {view.clues.length} · Pieces placed: {view.placed}/{view.layout.length} ·
                        Verifications: {view.verifications} · Mistakes: {view.mistakes}
                      </p>
                    </div>
                  )}
                  {view.kind === 'bridge' && (
                    <div className="space-y-2" data-bridge-solution>
                      {view.rows.map((r) => (
                        <div key={r.row} data-bridge-row={r.row} data-answer={r.answer} className="text-xs">
                          <p>
                            <span className="text-signal">
                              {r.row}. {r.category} ({ROLE_INFO[r.role].label})
                            </span>{' '}
                            → <span className="text-white">{r.answer}</span>
                          </p>
                          <p className="text-slate-400">{r.text}</p>
                        </div>
                      ))}
                      <p className="text-xs text-slate-500">
                        Attempt {view.attempt} · Mistakes {view.strikes} · Rows crossed {view.crossed}
                      </p>
                    </div>
                  )}
                  {view.kind === 'bomb' && (
                    <div className="space-y-1" data-bomb-solution>
                      <p>
                        Cut in order (position): <span className="text-signal">{view.solution.map((c) => `${c.position} (${BOMB_COLOR_LABELS[c.color]})`).join(' → ')}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Wires: {view.layout.map((c, i) => `${i + 1}=${BOMB_COLOR_LABELS[c]}`).join(' | ')} · Decoys: {view.decoys.map((c) => BOMB_COLOR_LABELS[c]).join(', ')}
                      </p>
                      <p className="text-xs text-slate-400">
                        Priority: {view.ranking.map((c) => BOMB_COLOR_LABELS[c]).join(' > ')} · PIN: {view.pin} ({view.pinSymbols.join(' ')})
                      </p>
                      <p className="text-xs text-slate-500">
                        Attempt {view.attempt} · Mistakes {view.strikes} · Cuts {view.cuts}/{view.solution.length} · Penalties {view.mistakes}
                      </p>
                    </div>
                  )}
                  {view.kind === 'signal' && (
                    <div className="space-y-1" data-signal-solution>
                      <p>
                        Key (in order): <span className="text-signal">{view.words.join(' · ')}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {view.bursts
                          .map((b) => `${b.burst}: ${b.word} · ${b.degrees}° → channel ${b.channel} · ${CIPHER_INFO[b.method].label} ${b.shift} · ${b.cipher}`)
                          .join('  |  ')}
                      </p>
                      <p className="text-xs text-slate-500">
                        Bursts captured: {view.tuned}/{view.bursts.length} · Attempts: {view.attempts} · Mistakes: {view.mistakes}
                      </p>
                    </div>
                  )}
                  {view.kind === 'nav' && (
                    <div className="space-y-1" data-nav-solution>
                      <p>
                        Mines: <span className="text-alert">{view.mines.join(', ')}</span>
                      </p>
                      <p>
                        Checkpoints (in order): <span className="text-signal">{view.checkpoints.join(' → ')}</span>
                      </p>
                      <p>
                        Cheapest route ({view.minEnergy} u):{' '}
                        <span className="text-signal">
                          {view.solution
                            .map((d) => ({ up: '↑', down: '↓', left: '←', right: '→' })[d])
                            .join(' ')}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Position: {view.position} · Checkpoints: {view.reached}/{view.checkpoints.length} · Battery:{' '}
                        {view.battery} · Mistakes: {view.mistakes}
                      </p>
                    </div>
                  )}
                  {view.kind === 'core' && (
                    <div className="space-y-1" data-core-solution>
                      <p>
                        Critical (leave at 0%):{' '}
                        <span className="text-alert">
                          {view.reactors.filter((r) => r.critical).map((r) => `R${r.id}`).join(', ')}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {view.reactors
                          .filter((r) => !r.critical)
                          .map((r) => `R${r.id}: T${r.temperature} · ${r.connections} conn. → ${r.target}%`)
                          .join('  |  ')}
                      </p>
                      <p>
                        Order:{' '}
                        <span className="text-signal">
                          {view.sequence
                            .map((id) => `R${id} → ${view.reactors.find((r) => r.id === id)?.target}%`)
                            .join('  ·  ')}
                        </span>
                      </p>
                      <p>
                        Final code: <span className="text-signal">{view.confirmationCode}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Progress: {view.done}/{view.sequence.length} · Mistakes: {view.mistakes}
                      </p>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
