// Web entry point: npm start → http://localhost:3000
import { serve } from '@hono/node-server';
import { bootstrap } from './bootstrap.ts';
import { createHttpApp } from './http/app.ts';

const app = bootstrap();
const port = app.settings.port;

serve({ fetch: createHttpApp(app).fetch, port }, () => {
  const mode = app.writer.isMock ? 'MOCK mode (no API key or MOCK=1): replaying data/mock/' : `live, model ${app.writer.model}`;
  console.log(`Hook Lab running on http://localhost:${port} · ${mode}`);
});
