import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './game-server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());

const { httpServer } = createGameServer({
  clientDir: path.resolve(here, '../../client/dist'),
  corsOrigin,
});

httpServer.listen(port, () => {
  console.log(`Enigma Core listening on http://localhost:${port}`);
});
