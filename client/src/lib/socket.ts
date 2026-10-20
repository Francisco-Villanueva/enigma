import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@enigma/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Sin URL: se conecta al mismo origen (en desarrollo, Vite lo redirige al servidor).
export const socket: GameSocket = io({ autoConnect: true });
