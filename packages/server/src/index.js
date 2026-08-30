// src/index.js
// Entrypoint: listens on 127.0.0.1 ONLY - never expose external interfaces.

import { buildApp } from './app.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4270;

const app = await buildApp();

app.listen({ host: HOST, port: PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});