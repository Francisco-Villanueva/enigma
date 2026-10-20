import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

/**
 * Lo que un jugador tiene en pantalla y no vive en el servidor (notas, selección, lo que está
 * tipeando) se publica con `useSharedState`:
 *  - en el panel propio funciona como un `useState` normal y, si el jugador está transmitiendo,
 *    manda cada cambio al servidor;
 *  - en el espejo de un compañero devuelve lo último que ese compañero publicó.
 */

type Values = Record<string, unknown>;

type ShareUiValue =
  | { mode: 'off' }
  | { mode: 'sender'; report: (key: string, value: unknown) => void }
  | { mode: 'mirror'; values: Values };

const ShareUiContext = createContext<ShareUiValue>({ mode: 'off' });

const THROTTLE_MS = 120;

/** Los Set no viajan por JSON: se envían con una marca. */
function encode(value: unknown): unknown {
  return value instanceof Set ? { $set: [...value] } : value;
}

function decode<T>(raw: unknown, initial: T): T {
  if (raw === undefined) return initial;
  if (initial instanceof Set) {
    const list = (raw as { $set?: unknown })?.$set;
    return (Array.isArray(list) ? new Set(list) : initial) as T;
  }
  return raw as T;
}

/** Envuelve el panel propio. Publica los cambios mientras `active` sea true. */
export function ShareUiSender({
  active,
  broadcastId,
  publish,
  children,
}: {
  active: boolean;
  /** Cambia con cada transmisión: obliga a mandar todo de nuevo. */
  broadcastId: number | null;
  publish: (ui: Values) => void;
  children: ReactNode;
}) {
  const store = useRef<Values>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(active);
  const publishRef = useRef(publish);
  activeRef.current = active;
  publishRef.current = publish;

  const flush = useCallback(() => {
    timer.current = null;
    if (activeRef.current) publishRef.current({ ...store.current });
  }, []);

  const schedule = useCallback(() => {
    if (timer.current === null) timer.current = setTimeout(flush, THROTTLE_MS);
  }, [flush]);

  const report = useCallback(
    (key: string, value: unknown) => {
      store.current[key] = encode(value);
      if (activeRef.current) schedule();
    },
    [schedule],
  );

  // Al empezar una transmisión, el espejo tiene que recibir lo que ya había en pantalla.
  useEffect(() => {
    if (active) flush();
  }, [active, broadcastId, flush]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo<ShareUiValue>(() => ({ mode: 'sender', report }), [report]);
  return <ShareUiContext.Provider value={value}>{children}</ShareUiContext.Provider>;
}

/** Envuelve el espejo: ahí el estado sale de lo que publicó el emisor. */
export function ShareUiMirror({ values, children }: { values: Values; children: ReactNode }) {
  const value = useMemo<ShareUiValue>(() => ({ mode: 'mirror', values }), [values]);
  return <ShareUiContext.Provider value={value}>{children}</ShareUiContext.Provider>;
}

/**
 * Como `useState`, pero visible para quien mira tu transmisión. La clave debe ser única dentro
 * del panel (por ejemplo 'nav.analyst.notes') y el valor, serializable (los Set también valen).
 */
export function useSharedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const ctx = useContext(ShareUiContext);
  const [local, setLocal] = useState<T>(initial);

  const report = ctx.mode === 'sender' ? ctx.report : null;
  useEffect(() => {
    report?.(key, local);
  }, [report, key, local]);

  const noop = useCallback(() => {}, []);
  if (ctx.mode === 'mirror') return [decode(ctx.values[key], initial), noop];
  return [local, setLocal];
}

/** Si el estado del emisor llega raro, el espejo no debe llevarse puesta toda la pantalla. */
export class MirrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <p className="px-4 py-6 text-center text-sm text-slate-400">The transmission glitched. Hang on…</p>;
    }
    return this.props.children;
  }
}
