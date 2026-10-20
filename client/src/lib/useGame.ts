import { useCallback, useEffect, useState } from 'react';
import { normalizeRoomCode } from '@enigma/shared';
import type {
  Ack,
  ChallengeAction,
  FacilitatorCommand,
  JoinedInfo,
  Role,
  RoomState,
} from '@enigma/shared';
import { clearSession, loadSession, saveSession } from './session';
import { socket } from './socket';

export interface GameApi {
  state: RoomState | null;
  /** Hay conexión con el servidor en este momento. */
  connected: boolean;
  /** Se está intentando volver a una sala guardada tras recargar. */
  restoring: boolean;
  createRoom: (name: string) => Promise<Ack<JoinedInfo>>;
  joinRoom: (code: string, name: string) => Promise<Ack<JoinedInfo>>;
  pickRole: (role: Role | null) => Promise<Ack>;
  startGame: () => Promise<Ack>;
  setReady: (ready: boolean) => Promise<Ack>;
  sendAction: (action: ChallengeAction) => Promise<Ack>;
  sendCommand: (command: FacilitatorCommand) => Promise<Ack>;
  proposeShare: (target: string) => Promise<Ack>;
  voteShare: (vote: 'yes' | 'no') => Promise<Ack>;
  /** Publica el estado de pantalla del emisor (sin esperar respuesta). */
  publishShareUi: (ui: Record<string, unknown>) => void;
}

function remember(res: Ack<JoinedInfo>): Ack<JoinedInfo> {
  if (res.ok) saveSession({ roomId: res.roomId, playerId: res.playerId });
  return res;
}

export function useGame(): GameApi {
  const [state, setState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [restoring, setRestoring] = useState(() => loadSession() !== null);

  useEffect(() => {
    // Al conectar (o reconectar) volvemos a entrar a la sala guardada, si hay una.
    const rejoin = () => {
      const saved = loadSession();
      if (!saved) {
        setRestoring(false);
        return;
      }
      socket.emit('room:rejoin', saved, (res) => {
        if (!res.ok) {
          clearSession();
          setState(null);
        }
        setRestoring(false);
      });
    };
    const onConnect = () => {
      setConnected(true);
      rejoin();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (next: RoomState) => setState(next);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
    };
  }, []);

  const createRoom = useCallback(
    (name: string) =>
      new Promise<Ack<JoinedInfo>>((resolve) => {
        socket.emit('room:create', { name }, (res) => resolve(remember(res)));
      }),
    [],
  );

  const joinRoom = useCallback(
    (code: string, name: string) =>
      new Promise<Ack<JoinedInfo>>((resolve) => {
        socket.emit('room:join', { roomId: normalizeRoomCode(code), name }, (res) =>
          resolve(remember(res)),
        );
      }),
    [],
  );

  const pickRole = useCallback(
    (role: Role | null) => new Promise<Ack>((resolve) => socket.emit('role:pick', { role }, resolve)),
    [],
  );

  const startGame = useCallback(
    () => new Promise<Ack>((resolve) => socket.emit('game:start', resolve)),
    [],
  );

  const setReady = useCallback(
    (ready: boolean) => new Promise<Ack>((resolve) => socket.emit('player:ready', { ready }, resolve)),
    [],
  );

  const sendAction = useCallback(
    (action: ChallengeAction) =>
      new Promise<Ack>((resolve) => socket.emit('challenge:action', action, resolve)),
    [],
  );

  const sendCommand = useCallback(
    (command: FacilitatorCommand) =>
      new Promise<Ack>((resolve) => socket.emit('facilitator:command', command, resolve)),
    [],
  );

  const proposeShare = useCallback(
    (target: string) => new Promise<Ack>((resolve) => socket.emit('share:propose', { target }, resolve)),
    [],
  );

  const voteShare = useCallback(
    (vote: 'yes' | 'no') => new Promise<Ack>((resolve) => socket.emit('share:vote', { vote }, resolve)),
    [],
  );

  const publishShareUi = useCallback((ui: Record<string, unknown>) => {
    socket.emit('share:ui', { ui }, () => {});
  }, []);

  return {
    state,
    connected,
    restoring,
    createRoom,
    joinRoom,
    pickRole,
    startGame,
    setReady,
    sendAction,
    sendCommand,
    proposeShare,
    voteShare,
    publishShareUi,
  };
}
