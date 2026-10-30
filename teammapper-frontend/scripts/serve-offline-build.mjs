// Serves dist-offline/browser byte for byte, the way a static host serves the
// offline build. The e2e tests of the service worker need it: the worker
// checks each file against the hash in ngsw.json, and the Angular dev server
// rewrites the files it serves.
//
// Usage: node scripts/serve-offline-build.mjs <port>

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(
  new URL('../dist-offline/browser/', import.meta.url)
);
const port = Number(process.argv[2]);

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
};

/** Maps a request path to a file under the root, or null outside of it. */
function fileFor(url) {
  const path = decodeURIComponent(new URL(url, 'http://host').pathname);
  const file = normalize(join(root, path.endsWith('/') ? 'index.html' : path));
  return file.startsWith(root) ? file : null;
}

createServer(async (request, response) => {
  try {
    const file = fileFor(request.url ?? '/');
    if (!file) throw new Error('outside the root');
    const body = await readFile(file);
    const type = contentTypes[extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }).end(body);
  } catch {
    response.writeHead(404).end();
  }
  // The browser of the playwright container reaches the server over the
  // docker network, so it listens on every interface.
}).listen(port, '0.0.0.0');
