import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '@enigma/shared';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { Intro } from './components/Intro';
import { Lobby } from './components/Lobby';
import { ScreenLoader } from './components/ScreenLoader';
import { useGame } from './lib/useGame';

/** Pause and play are the same screen; everything else is its own. */
function groupOf(status: string | null): string | null {
  return status === 'paused' ? 'playing' : status;
}

const COVER_MS = 600; // how long the loader takes to cover the old screen before swapping
const FADE_MS = 950; // how long it then takes to fade away

export default function App() {
  const game = useGame();
  const { state, connected, restoring } = game;
  const status = state?.status ?? null;

  // Screen changes go behind a short loading scene. `shown` is what is actually on screen.
  const [shown, setShown] = useState<RoomState | null>(state);
  const [loader, setLoader] = useState<'in' | 'out' | null>(null);
  const [tick, setTick] = useState(0);
  const latest = useRef<RoomState | null>(state);
  const shownGroup = useRef<string | null>(groupOf(status));
  const loaderRef = useRef<'in' | 'out' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    latest.current = state;
    if (!state) {
      setShown(null);
      shownGroup.current = null;
      return;
    }
    if (loaderRef.current === 'in') return; // frozen under the loader until the swap
    const next = groupOf(state.status);
    const prev = shownGroup.current;
    const quiet = prev === null || prev === 'intro' || next === 'intro';
    if (!quiet && next !== prev && loaderRef.current === null) {
      loaderRef.current = 'in';
      setLoader('in');
      setTick((t) => t + 1);
      timers.current.push(
        setTimeout(() => {
          const now = latest.current;
          setShown(now);
          shownGroup.current = groupOf(now?.status ?? null);
          loaderRef.current = 'out';
          setLoader('out');
          timers.current.push(
            setTimeout(() => {
              loaderRef.current = null;
              setLoader(null);
            }, FADE_MS),
          );
        }, COVER_MS),
      );
      return;
    }
    setShown(state);
    shownGroup.current = next;
  }, [state]);

  // The film keeps playing its exit animation for a moment after the room moves on.
  const [exiting, setExiting] = useState(false);
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current === 'intro' && status !== 'intro') {
      setExiting(true);
      const id = setTimeout(() => setExiting(false), 950);
      prev.current = status;
      return () => clearTimeout(id);
    }
    prev.current = status;
  }, [status]);

  const view = shown;
  let screen;
  if (restoring && !view) {
    screen = (
      <main className="flex min-h-screen items-center justify-center font-mono text-sm text-slate-400">
        Returning to your room…
      </main>
    );
  } else if (!view) {
    screen = <Home createRoom={game.createRoom} joinRoom={game.joinRoom} connected={connected} />;
  } else if (view.status === 'lobby' || view.status === 'intro') {
    screen = <Lobby state={view} startGame={game.startGame} sendCommand={game.sendCommand} />;
  } else {
    screen = (
      <GameScreen
        state={view}
        pickRole={game.pickRole}
        setReady={game.setReady}
        startGame={game.startGame}
        sendAction={game.sendAction}
        sendCommand={game.sendCommand}
        proposeShare={game.proposeShare}
        voteShare={game.voteShare}
        publishShareUi={game.publishShareUi}
      />
    );
  }

  return (
    <>
      {state && !connected && (
        <div role="status" className="sticky top-0 z-10 bg-amber px-4 py-2 text-center text-sm font-semibold text-core-950">
          Connection lost. Reconnecting…
        </div>
      )}
      <div key={view?.status === 'intro' ? 'lobby' : (groupOf(view?.status ?? null) ?? 'home')} className="screen-enter">
        {screen}
      </div>
      {state && (status === 'intro' || exiting) && (
        <Intro
          isFacilitator={state.you.isFacilitator}
          exiting={status !== 'intro'}
          sendCommand={game.sendCommand}
          startGame={game.startGame}
        />
      )}
      {loader && <ScreenLoader phase={loader} tick={tick} />}
    </>
  );
}
