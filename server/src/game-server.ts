import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type {
  Ack,
  ClientToServerEvents,
  JoinedInfo,
  ServerToClientEvents,
} from '@enigma/shared';
import type { AnyChallenge } from './challenges/index.js';
import { GameError, RoomManager } from './rooms.js';
import type { Room } from './rooms.js';

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  /** Carpeta con el frontend compilado; si existe, el mismo servidor lo sirve. */
  clientDir?: string;
  /** Orígenes permitidos si el frontend se sirve desde otro dominio. */
  corsOrigin?: string | string[];
  /** Tiempo que una sala vacía se conserva antes de borrarse. */
  maxEmptyMs?: number;
  /** Cada cuánto se revisan los timers de las salas (por defecto 1 s). */
  tickMs?: number;
  /** Desafíos a jugar, en orden; por defecto los del juego. Sirve para probar el motor con otros. */
  challenges?: AnyChallenge[];
}

export interface GameServer {
  httpServer: HttpServer;
  manager: RoomManager;
  close: () => Promise<void>;
}

const SWEEP_EVERY_MS = 60_000;
const DEFAULT_MAX_EMPTY_MS = 30 * 60_000;
const DEFAULT_TICK_MS = 1_000;

type Reply<T extends object = object> = (a: Ack<T>) => void;

/** Un cliente mal hecho puede no mandar callback: no debe tumbar el servidor. */
function safeReply<T extends object>(cb: unknown): Reply<T> {
  return typeof cb === 'function' ? (cb as Reply<T>) : () => {};
}

function fail(err: unknown): Ack<never> {
  if (err instanceof GameError) return { ok: false, error: err.code, message: err.message };
  console.error(err);
  return { ok: false, error: 'not_in_room', message: 'Unexpected server error.' };
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const manager = new RoomManager(Date.now, options.challenges);
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.size });
  });

  if (options.clientDir && existsSync(options.clientDir)) {
    const indexHtml = path.join(options.clientDir, 'index.html');
    app.use(express.static(options.clientDir));
    app.use((_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: options.corsOrigin ? { origin: options.corsOrigin } : undefined,
      // Si el cliente se cae unos segundos, recupera su id, su sala y lo que se perdió.
      connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
    },
  );

  /** Manda a cada jugador de la sala su propia vista. */
  async function broadcast(room: Room): Promise<void> {
    const sockets = await io.in(room.roomId).fetchSockets();
    for (const s of sockets) {
      const playerId = s.data.playerId;
      if (!playerId || !room.players.has(playerId)) continue;
      s.emit('room:state', manager.viewFor(room, playerId));
    }
  }

  /** Si el mismo jugador abrió otra pestaña, la anterior se cierra. */
  async function kickStaleSockets(room: Room, playerId: string, keepId: string): Promise<void> {
    const sockets = await io.in(room.roomId).fetchSockets();
    for (const s of sockets) {
      if (s.data.playerId === playerId && s.id !== keepId) s.disconnect(true);
    }
  }

  function attach(socket: GameSocket, room: Room, playerId: string): JoinedInfo {
    socket.data.roomId = room.roomId;
    socket.data.playerId = playerId;
    void socket.join(room.roomId);
    return { roomId: room.roomId, playerId };
  }

  /**
   * Ejecuta una acción de un jugador ya dentro de una sala, responde y avisa a todos.
   * Se avisa también si la acción falla: algunos rechazos cambian el estado (intentos, tiempo).
   */
  function run(socket: GameSocket, cb: unknown, action: (roomId: string, playerId: string) => void): void {
    const reply = safeReply(cb);
    const { roomId, playerId } = socket.data;
    try {
      if (!roomId || !playerId) throw new GameError('not_in_room', 'You’re not in a room.');
      action(roomId, playerId);
      reply({ ok: true });
    } catch (err) {
      reply(fail(err));
    }
    const room = roomId ? manager.getRoom(roomId) : undefined;
    if (room) void broadcast(room);
  }

  io.on('connection', (socket: GameSocket) => {
    // Recuperación automática de Socket.IO: sala y datos ya vienen restaurados.
    if (socket.recovered && socket.data.roomId && socket.data.playerId) {
      const { roomId, playerId } = socket.data;
      manager.setConnected(roomId, playerId, true);
      const room = manager.getRoom(roomId);
      if (room) void broadcast(room);
    }

    socket.on('room:create', (payload, cb) => {
      const reply = safeReply<JoinedInfo>(cb);
      try {
        const { room, player } = manager.createRoom(payload?.name);
        const info = attach(socket, room, player.playerId);
        reply({ ok: true, ...info });
        void broadcast(room);
      } catch (err) {
        reply(fail(err));
      }
    });

    socket.on('room:join', (payload, cb) => {
      const reply = safeReply<JoinedInfo>(cb);
      try {
        const { room, player } = manager.joinRoom(payload?.roomId, payload?.name);
        const info = attach(socket, room, player.playerId);
        reply({ ok: true, ...info });
        void broadcast(room);
      } catch (err) {
        reply(fail(err));
      }
    });

    socket.on('room:rejoin', async (payload, cb) => {
      const reply = safeReply<JoinedInfo>(cb);
      try {
        const { room, player } = manager.rejoin(payload?.roomId, payload?.playerId);
        const info = attach(socket, room, player.playerId);
        await kickStaleSockets(room, player.playerId, socket.id);
        reply({ ok: true, ...info });
        void broadcast(room);
      } catch (err) {
        reply(fail(err));
      }
    });

    socket.on('role:pick', (payload, cb) => {
      run(socket, cb, (roomId, playerId) => manager.pickRole(roomId, playerId, payload?.role ?? null));
    });

    socket.on('role:switch', (payload, cb) => {
      run(socket, cb, (roomId, playerId) => manager.switchRole(roomId, playerId, payload?.role));
    });

    socket.on('player:ready', (payload, cb) => {
      run(socket, cb, (roomId, playerId) => manager.setReady(roomId, playerId, payload?.ready === true));
    });

    socket.on('game:start', (cb) => {
      run(socket, cb, (roomId, playerId) => manager.startGame(roomId, playerId));
    });

    socket.on('challenge:action', (action, cb) => {
      run(socket, cb, (roomId, playerId) => manager.applyAction(roomId, playerId, action));
    });

    socket.on('share:propose', (payload, cb) => {
      run(socket, cb, (roomId, playerId) => manager.proposeShare(roomId, playerId, payload?.target));
    });

    socket.on('share:vote', (payload, cb) => {
      run(socket, cb, (roomId, playerId) => manager.voteShare(roomId, playerId, payload?.vote));
    });

    socket.on('share:ui', (payload, cb) => {
      run(socket, cb, (roomId, playerId) => manager.updateShareUi(roomId, playerId, payload?.ui));
    });

    socket.on('facilitator:command', (command, cb) => {
      run(socket, cb, (roomId, playerId) => manager.command(roomId, playerId, command));
    });

    socket.on('disconnect', async () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      // Si el jugador ya tiene otra conexión viva (otra pestaña), sigue conectado.
      const others = await io.in(roomId).fetchSockets();
      if (others.some((s) => s.data.playerId === playerId)) return;
      manager.setConnected(roomId, playerId, false);
      const room = manager.getRoom(roomId);
      if (room) void broadcast(room);
    });
  });

  const maxEmptyMs = options.maxEmptyMs ?? DEFAULT_MAX_EMPTY_MS;
  const sweeper = setInterval(() => manager.sweep(maxEmptyMs), SWEEP_EVERY_MS);
  sweeper.unref();

  // El servidor es quien decide cuándo se acaba el tiempo.
  const ticker = setInterval(() => {
    for (const room of manager.tick()) void broadcast(room);
  }, options.tickMs ?? DEFAULT_TICK_MS);
  ticker.unref();

  return {
    httpServer,
    manager,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        clearInterval(ticker);
        void io.close(() => resolve());
      }),
  };
}
