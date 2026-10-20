import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, TOTAL_SECONDS } from '@enigma/shared';
import type { Ack, FacilitatorCommand, RoomState } from '@enigma/shared';
import type { GameApi } from '../lib/useGame';

interface Props {
  state: RoomState;
  startGame: GameApi['startGame'];
  sendCommand: (command: FacilitatorCommand) => Promise<Ack>;
}

export function Lobby({ state, startGame, sendCommand }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ready = state.players.length >= MIN_PLAYERS;
  const [challenge, setChallenge] = useState(3);
  const [minutes, setMinutes] = useState(TOTAL_SECONDS / 60);

  async function handle(action: Promise<Ack>) {
    setError(null);
    const res = await action;
    if (!res.ok) setError(res.message);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(state.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sin permiso de portapapeles: el código igual se ve en pantalla
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-signal uppercase">Waiting room</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-white">Waiting for the squad</h1>
        </div>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="border-2 border-dashed border-core-600 bg-core-900 px-5 py-2 text-left shadow-[0_2px_0_rgb(60_40_10/0.25)] transition hover:border-signal"
          aria-label={`Room code ${state.roomId}. Tap to copy`}
        >
          <span className="block text-[0.65rem] tracking-widest text-slate-400 uppercase">
            {copied ? 'Copied' : 'Room code'}
          </span>
          <span className="font-mono text-3xl font-bold tracking-[0.3em] text-signal">{state.roomId}</span>
        </button>
      </header>

      <section
        className="mt-6 max-w-3xl border border-core-600 border-l-4 border-l-alert bg-core-950 px-5 py-3"
        data-intro
      >
        <p className="font-mono text-[0.65rem] tracking-widest text-alert uppercase">Case file · 22 June 2022</p>
        <p className="mt-1 text-white">
          An Antonov An-30M, flying cargo over Siberia, was forced to land in a remote area. Its location signal is
          silent. Restore the six systems of the core: each one you recover gives you a fragment of the aircraft’s
          position. With all six, you can find it.
        </p>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-label="How it works">
          <h2 className="font-mono text-xs tracking-widest text-slate-400 uppercase">How it works</h2>
          <ol className="mt-3 space-y-3 text-slate-300">
            <li className="rounded-lg border border-core-700 bg-core-900 p-4">
              <span className="font-mono text-signal">1.</span> Share the room code. Ideally {MAX_PLAYERS} players join,
              but you can start with fewer: some of you will play several roles at once and switch between them.
            </li>
            <li className="rounded-lg border border-core-700 bg-core-900 p-4">
              <span className="font-mono text-signal">2.</span> Before each challenge you'll see what it is about and what
              each role does, and everyone picks their own.
            </li>
            <li className="rounded-lg border border-core-700 bg-core-900 p-4">
              <span className="font-mono text-signal">3.</span> With {MAX_PLAYERS} players you can't repeat a role you've
              already played: by the end everyone will have played every role.
            </li>
            <li className="rounded-lg border border-core-700 bg-core-900 p-4">
              <span className="font-mono text-signal">4.</span> Talk on the call: each screen shows only part of the
              information.
            </li>
            <li className="rounded-lg border border-core-700 bg-core-900 p-4">
              <span className="font-mono text-signal">5.</span> New to this? The facilitator can start with a short
              warm-up round: no clock, no penalties.
            </li>
          </ol>
        </section>

        <aside aria-label="Players">
          <h2 className="font-mono text-xs tracking-widest text-slate-400 uppercase">
            Squad ({state.players.length}/{MAX_PLAYERS})
          </h2>
          <ul className="mt-3 space-y-2">
            {state.players.map((p) => (
              <li
                key={p.playerId}
                className="flex items-center gap-2 rounded-md border border-core-700 bg-core-900 px-3 py-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-signal' : 'bg-slate-600'}`}
                  title={p.connected ? 'Connected' : 'Disconnected'}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {p.name}
                  {p.playerId === state.you.playerId && <span className="text-slate-400"> (you)</span>}
                </span>
                {p.isFacilitator && (
                  <span className="rounded bg-amber/15 px-1.5 py-0.5 font-mono text-[0.65rem] text-amber uppercase">
                    Facilitator
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-400">
              {state.players.length < MAX_PLAYERS
                ? `${state.players.length} of ${MAX_PLAYERS} here. You can start now: each person will take ${Math.ceil(
                    MAX_PLAYERS / state.players.length,
                  )} roles at most, or wait for the others.`
                : 'Everything is ready to start.'}
            </p>
            {error && (
              <p role="alert" className="rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
                {error}
              </p>
            )}
            {state.you.isFacilitator ? (
              <>
                <button
                  type="button"
                  data-intro-play
                  disabled={!ready}
                  onClick={() => void handle(sendCommand({ type: 'intro' }))}
                  className="w-full rounded-md bg-signal px-4 py-3 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Play the briefing (recommended)
                </button>
                <button
                  type="button"
                  data-practice
                  disabled={!ready}
                  onClick={() => void handle(sendCommand({ type: 'practice' }))}
                  className="w-full rounded-md border border-core-600 px-4 py-2.5 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Warm-up round
                </button>
                <button
                  type="button"
                  data-start-mission
                  disabled={!ready}
                  onClick={() => void handle(startGame())}
                  className="w-full rounded-md border border-core-600 px-4 py-2.5 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Skip to mission 1
                </button>
                <fieldset className="space-y-2 rounded-md border border-core-700 p-3">
                  <legend className="px-1 font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">
                    Resume a mission
                  </legend>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <label htmlFor="jump-challenge">Start at mission</label>
                    <select
                      id="jump-challenge"
                      data-jump-challenge
                      value={challenge}
                      onChange={(e) => setChallenge(Number(e.target.value))}
                      className="rounded-md border border-core-600 bg-core-950 px-2 py-1 text-white"
                    >
                      {Array.from({ length: state.totalChallenges }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <label htmlFor="jump-minutes">Minutes left</label>
                    <input
                      id="jump-minutes"
                      data-jump-minutes
                      type="number"
                      min={1}
                      max={TOTAL_SECONDS / 60}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                      className="w-20 rounded-md border border-core-600 bg-core-950 px-2 py-1 text-white"
                    />
                  </div>
                  <button
                    type="button"
                    data-jump
                    disabled={!ready || !Number.isFinite(minutes) || minutes < 1}
                    onClick={() =>
                      void handle(sendCommand({ type: 'jump', challenge, seconds: Math.round(minutes * 60) }))
                    }
                    className="w-full rounded-md border border-core-600 px-4 py-2.5 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Start at mission {challenge}
                  </button>
                  <p className="text-xs text-slate-500">
                    Earlier missions count as done, with their fragments already in the file.
                  </p>
                </fieldset>
              </>
            ) : (
              <p className="font-mono text-xs text-slate-500">Waiting for the facilitator…</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
