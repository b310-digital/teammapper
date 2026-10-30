// Serves dist-offline/browser unchanged for the service worker e2e spec. The
// dev server rewrites files, and the worker rejects files whose hash differs
// from ngsw.json.
//
// Usage: pnpm run serve:offline <port>

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(
  new URL('../dist-offline/browser/', import.meta.url)
);
const port = Number(process.argv[2]);
if (!Number.isInteger(port)) {
  console.error('Usage: pnpm run serve:offline <port>');
  process.exit(1);
}

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
  // All interfaces, so the playwright container can connect.
}).listen(port, '0.0.0.0');
