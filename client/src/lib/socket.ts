import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@enigma/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Con VITE_SERVER_URL (frontend y servidor en dominios distintos) se conecta a esa URL.
// Sin ella usa el mismo origen (en desarrollo, Vite lo redirige al servidor).
const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
export const socket: GameSocket = serverUrl ? io(serverUrl, { autoConnect: true }) : io({ autoConnect: true });
