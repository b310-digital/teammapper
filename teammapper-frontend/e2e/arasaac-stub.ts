/**
 * Stub of the ARASAAC web servers for the e2e suite. Node runs this file with
 * type stripping, so it uses only erasable TypeScript and `node:` imports.
 *
 * Routes (the backend's PICTOGRAM_API_URL and PICTOGRAM_IMAGES_URL point here):
 * - GET /api/pictograms/:lang/search/nohits  404 with `[]`, as ARASAAC does
 * - GET /api/pictograms/:lang/search/fail    500
 * - GET /api/pictograms/:lang/search/:term   200 with two pictograms
 * - GET /images/pictograms/:id/:id_300.png   the smallest TeamMapper logo
 */
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** playwright.config.ts, docker-compose.yml and the CI workflow use this port. */
const PORT = 3100;
const LOGO = readFileSync(
  join(import.meta.dirname, '..', 'src', 'assets', 'icons', 'icon-72x72.png')
);
const PICTOGRAMS = [{ _id: 6009 }, { _id: 6010 }];

const SEARCH_PATH = /^\/api\/pictograms\/[^/]+\/search\/([^/]+)$/;
const IMAGE_PATH = /^\/images\/pictograms\/(\d+)\/(\d+)_300\.png$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendSearch(res: ServerResponse, encodedTerm: string): void {
  const term = decodeURIComponent(encodedTerm);
  if (term === 'nohits') return sendJson(res, 404, []);
  if (term === 'fail') return sendJson(res, 500, { error: 'stub failure' });
  sendJson(res, 200, PICTOGRAMS);
}

function sendImage(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': LOGO.length,
  });
  res.end(LOGO);
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const search = req.method === 'GET' ? SEARCH_PATH.exec(path) : null;
  const image = req.method === 'GET' ? IMAGE_PATH.exec(path) : null;

  if (search) return sendSearch(res, search[1]);
  if (image && image[1] === image[2]) return sendImage(res);
  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`ARASAAC stub listening on ${PORT}`);
});
