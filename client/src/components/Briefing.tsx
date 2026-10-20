import { useState } from 'react';
import { MAX_PLAYERS, ROLES, ROLE_INFO } from '@enigma/shared';
import type { Ack, FacilitatorCommand, Role, RoomState } from '@enigma/shared';
import { Check } from 'lucide-react';
import type { GameApi } from '../lib/useGame';
import { RoleIcon } from './RoleIcon';
import { FlowList, HowToList } from './TaskCard';

interface Props {
  state: RoomState;
  pickRole: GameApi['pickRole'];
  setReady: GameApi['setReady'];
  sendCommand: (command: FacilitatorCommand) => Promise<Ack>;
}

/**
 * Antes de cada desafío: de qué trata, qué hace cada rol y elección de rol.
 * Nadie puede repetir un rol que ya jugó, así que todos pasan por todos.
 */
export function Briefing({ state, pickRole, setReady, sendCommand }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { briefing, players, you } = state;
  if (!briefing) return null;

  const full = players.length === MAX_PLAYERS;
  const assigned = players.filter((p) => p.roles.length > 0).length;
  const coveredRoles = ROLES.filter((r) => players.some((p) => p.roles.includes(r))).length;
  const allAssigned = assigned === players.length && coveredRoles === ROLES.length;
  const me = players.find((p) => p.playerId === you.playerId);
  const readyCount = players.filter((p) => p.ready).length;
  const myTurnToChoose = you.roles.length === 0;

  async function handle(action: Promise<Ack>) {
    setError(null);
    const res = await action;
    if (!res.ok) setError(res.message);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8" data-briefing={briefing.challengeId}>
      <header>
        <p className="font-mono text-xs tracking-[0.3em] text-signal uppercase">
          Challenge {briefing.challengeId} of {state.totalChallenges} · Preparation
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight font-black tracking-tight text-white sm:text-4xl">{briefing.name}</h1>
        <p className="mt-3 max-w-3xl text-slate-300">{briefing.story}</p>
        <div className="relative mt-5 max-w-3xl border border-core-600 border-l-4 border-l-signal bg-core-950 px-5 py-3 shadow-[0_2px_3px_rgb(60_40_10/0.2)]">
          <p className="font-mono text-[0.65rem] tracking-widest text-signal uppercase">Objective</p>
          <p className="mt-1 text-white">{briefing.objective}</p>
        </div>
      </header>

      <details className="mt-6 max-w-3xl border border-core-600 bg-core-900 px-5 py-3" data-guide open>
        <summary className="cursor-pointer font-mono text-xs tracking-widest text-signal uppercase">
          How this mission works
        </summary>
        <div className="mt-3 space-y-4">
          <HowToList guide={briefing.guide} />
          <div>
            <p className="mb-1.5 font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">
              Who tells what to whom{you.role ? ' (yours are highlighted)' : ''}
            </p>
            <FlowList guide={briefing.guide} role={you.role} />
          </div>
        </div>
      </details>

      {you.roles.length > 0 && (
        <section
          className="mt-6 max-w-3xl border border-core-600 border-l-4 border-l-signal bg-core-950 px-5 py-3"
          data-my-task
        >
          {you.roles.map((role, i) => (
            <div key={role} className={i > 0 ? 'mt-3 border-t border-core-700 pt-3' : ''}>
              <p className="font-mono text-[0.65rem] tracking-widest text-signal uppercase">
                Your task as {ROLE_INFO[role].label}
              </p>
              <p className="mt-1 text-white">{briefing.guide.tasks[role].does}</p>
              <p className="mt-1 text-sm text-slate-300">
                <span className="text-slate-400">Can’t see: </span>
                {briefing.guide.tasks[role].cantSee}
              </p>
              <p className="text-sm text-slate-300">
                <span className="text-slate-400">Talk to: </span>
                {briefing.guide.tasks[role].talkTo}
              </p>
            </div>
          ))}
          <button
            type="button"
            data-ready
            aria-pressed={me?.ready === true}
            onClick={() => void handle(setReady(!(me?.ready === true)))}
            className={`mt-3 rounded-md border px-4 py-1.5 text-sm transition ${
              me?.ready
                ? 'border-signal bg-signal/10 text-signal'
                : 'border-core-600 text-slate-200 hover:border-signal'
            }`}
          >
            {me?.ready ? '✓ I understand my role' : 'I understand my role'}
          </button>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_17rem]">
        <section aria-label="Roles">
          <h2 className="font-mono text-xs tracking-widest text-slate-400 uppercase">
            What each role does in this challenge
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {!full
              ? 'You are fewer than 6, so some of you take several roles. Tap a role to take it, tap it again to release it; every role needs someone. During the challenge you switch between yours.'
              : myTurnToChoose
                ? 'Pick your role. You can\'t repeat one you\'ve already played: that way everyone plays every role.'
                : 'You have a role. To change, release it and pick another.'}
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {ROLES.map((role: Role) => {
              const owner = players.find((p) => p.roles.includes(role));
              const mine = owner?.playerId === you.playerId;
              const taken = owner !== undefined && !mine;
              const used = full && you.usedRoles.includes(role);
              const disabled = taken || (used && !mine);
              return (
                <li key={role}>
                  <button
                    type="button"
                    data-role-card={role}
                    data-state={mine ? 'mine' : used ? 'used' : taken ? 'taken' : 'free'}
                    disabled={disabled}
                    aria-pressed={mine}
                    onClick={() => void handle(pickRole(mine && full ? null : role))}
                    className={[
                      'flex h-full w-full gap-3 rounded-lg border p-4 text-left transition',
                      mine
                        ? 'border-signal bg-signal/10'
                        : disabled
                          ? 'cursor-not-allowed border-core-700 bg-core-900/50 opacity-60'
                          : 'border-core-600 bg-core-900 hover:border-signal-dim',
                    ].join(' ')}
                  >
                    <RoleIcon role={role} size={28} className={mine ? 'shrink-0 text-signal' : 'shrink-0 text-slate-300'} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">{ROLE_INFO[role].label}</span>
                      <span className="mt-0.5 block text-sm text-slate-300">{briefing.roles[role]}</span>
                      <span className="mt-2 flex items-center gap-1 font-mono text-xs text-slate-300">
                        {mine ? (
                          'Your role (tap to release it)'
                        ) : used ? (
                          <>
                            <Check size={12} /> Already played
                          </>
                        ) : owner ? (
                          `Taken: ${owner.name}`
                        ) : (
                          'Available'
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside aria-label="Squad">
          <h2 className="font-mono text-xs tracking-widest text-slate-400 uppercase">
            Squad ({coveredRoles}/{ROLES.length} roles covered)
          </h2>
          <ul className="mt-3 space-y-2">
            {players.map((p) => (
              <li
                key={p.playerId}
                data-player={p.name}
                className="flex items-center gap-2 rounded-md border border-core-700 bg-core-900 px-3 py-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-signal' : 'bg-slate-600'}`}
                  title={p.connected ? 'Connected' : 'Disconnected'}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">
                    {p.name}
                    {p.playerId === you.playerId && <span className="text-slate-400"> (you)</span>}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {p.roles.length > 0 ? p.roles.map((r) => ROLE_INFO[r].label).join(' + ') : 'No role'}
                    {full ? ` · ${p.usedRoles.length} played` : ''}
                    {p.ready ? ' · ✓ ready' : ''}
                  </span>
                </span>
                {p.isFacilitator && (
                  <span className="rounded bg-amber/15 px-1.5 py-0.5 font-mono text-[0.65rem] text-amber uppercase">
                    Facilitator
                  </span>
                )}
                {p.roles.map((r) => (
                  <RoleIcon key={r} role={r} size={16} className="shrink-0 text-slate-300" />
                ))}
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-400">
              {allAssigned
                ? `Every role is covered. ${readyCount}/${players.length} confirmed they understand it (optional). The facilitator can start.`
                : full
                  ? `${players.length - assigned} more people need to pick a role.`
                  : `${ROLES.length - coveredRoles} roles still have nobody, and everyone needs at least one.`}
            </p>
            {error && (
              <p role="alert" className="rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
                {error}
              </p>
            )}
            {you.isFacilitator ? (
              <>
                <button
                  type="button"
                  data-autoassign
                  disabled={allAssigned}
                  onClick={() => void handle(sendCommand({ type: 'autoassign' }))}
                  className="w-full rounded-md border border-core-600 px-4 py-2 text-sm text-slate-200 transition hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {full ? 'Randomly assign the missing roles' : 'Randomly assign the roles nobody has'}
                </button>
                <button
                  type="button"
                  data-begin
                  disabled={!allAssigned}
                  onClick={() => void handle(sendCommand({ type: 'begin' }))}
                  className="w-full rounded-md bg-signal px-4 py-2.5 font-semibold text-core-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Start challenge {briefing.challengeId}
                </button>
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
