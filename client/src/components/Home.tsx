import { useState } from 'react';
import type { FormEvent } from 'react';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@enigma/shared';
import { primeVoice } from '../lib/voice';
import type { GameApi } from '../lib/useGame';

type Props = Pick<GameApi, 'createRoom' | 'joinRoom' | 'connected'>;

export function Home({ createRoom, joinRoom, connected }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => ReturnType<Props['createRoom']>) {
    primeVoice(); // this tap lets the browser play the intro's voice later, for everyone

    setBusy(true);
    setError(null);
    const res = await action();
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    void run(() => joinRoom(code, name));
  }

  const inputClass =
    'field-line w-full px-1 py-2 text-lg text-white placeholder:text-slate-500/70 focus:bg-core-800/60';

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div>
        <span className="folder-tab">Case file Nº 0042</span>
      </div>
      <div className="folder-sheet px-6 pt-7 pb-8 sm:px-9">
        <span className="tape -top-3 right-24 rotate-3" aria-hidden="true" />
        <span className="stamp absolute top-6 right-5 text-xs sm:text-sm" aria-hidden="true">
          Classified
        </span>

        <p className="font-mono text-xs tracking-[0.3em] text-slate-400 uppercase">Tactical response squad</p>
        <h1 className="mt-3 font-display text-[2.6rem] leading-[1.02] font-black tracking-tight text-white">
          Mission:
          <br />
          Enigma Core
        </h1>
        <p className="mt-2 font-mono text-xs text-slate-400" aria-hidden="true">
          Subject: <span className="redact w-28" /> · Clearance: <span className="redact w-14" />
        </p>
        <p className="mt-5 border-l-2 border-core-600 pl-4 text-[0.95rem] leading-relaxed text-slate-300">
          An aircraft is down in Siberia and its location signal has gone silent. Each person sees only one part:
          to find it you have to talk, listen and trust each other.
        </p>

        <form onSubmit={onJoin} className="mt-8 space-y-6">
          <label className="block">
            <span className="font-mono text-xs tracking-widest text-slate-400 uppercase">Your name</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="given-name"
              placeholder="e.g. Sofia"
            />
          </label>

          <label className="block">
            <span className="font-mono text-xs tracking-widest text-slate-400 uppercase">
              Room code (if you're joining one)
            </span>
            <input
              className={`${inputClass} tracking-[0.4em] uppercase`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={ROOM_CODE_LENGTH + 5}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="X7K9"
            />
          </label>

          {error && (
            <p role="alert" className="border border-alert/50 bg-alert/10 px-3 py-2 text-sm text-alert">
              {error}
            </p>
          )}
          {!connected && <p className="text-sm text-amber">Connecting to the server…</p>}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !connected || code.trim().length === 0}
              className="rounded-md bg-signal px-4 py-3 font-mono text-sm font-bold tracking-[0.2em] text-core-950 uppercase shadow-[0_2px_0_rgb(0_0_0/0.35)] transition hover:brightness-110 active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              Join
            </button>
            <button
              type="button"
              disabled={busy || !connected}
              onClick={() => void run(() => createRoom(name))}
              className="rounded-md border-2 border-signal px-4 py-3 font-mono text-sm font-bold tracking-[0.2em] text-signal uppercase transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create room
            </button>
          </div>
          <p className="font-mono text-xs text-slate-500">
            Whoever creates the room is the facilitator: share the code on the call and start the game.
          </p>
        </form>
      </div>
    </main>
  );
}
