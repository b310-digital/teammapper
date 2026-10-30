# Offline build

The offline build is a static copy of the TeamMapper frontend that runs without
a backend. It stores every map in the visitor's browser. Any static host can
serve it. A service worker caches the site, so after the first visit the site
also loads without a network.

## Build

```bash
pnpm install
pnpm --filter teammapper-frontend run build:offline
```

The script builds the workspace packages, generates the settings, and compiles
the frontend with the `production` and `offline` configurations. The site lands
in `teammapper-frontend/dist-offline/browser`.

The settings come from `teammapper-backend/config/settings.prod.json`, merged
with `teammapper-frontend/offline/settings.override.json`. The override turns
sharing, pictograms and AI off. Edit the override file and rebuild to change
the settings.

## Host

Copy the contents of `dist-offline/browser` to the static host. The site needs
no server logic.

- The site uses hash routing, so a visitor's reload or bookmark never asks the
  host for a path that does not exist. The host needs no rewrite rules.
- The site uses `<base href="./">`, so it works from the root of a domain and
  from a subpath such as `https://example.org/teammapper/`.

Host options that work:

- IONOS static hosting
- GitHub Pages

The host, the domain and the deploy workflow are not decided yet.

Keep the origin (scheme, host and port) of the site fixed. The browser ties
stored maps to the origin, so a new domain starts empty and leaves the maps
under the old origin orphaned.

Serve the site over HTTPS: browsers register the service worker only there
or on `localhost`. Do not cache `ngsw.json` and `ngsw-worker.js` for long,
or visitors miss updates.

## Service worker

The Angular service worker, configured in
`teammapper-frontend/ngsw-config.json`, caches the site on the first visit.
After that the site loads without a network.

After a deploy, the worker downloads the new version in the background and
the page offers a reload. Without the reload, the next visit uses the new
version.

## Where the data lives

The browser stores everything in IndexedDB, under the origin of the site:

- Map records and node images live in the database `teammapper-offline`.
- The content of each map lives in its own database, `teammapper-map-<uuid>`.

Another domain, another browser, another device or a private window sees none
of these maps. Clearing the browser data for the site deletes them.

The build limits an image to 150,000 bytes and the images of one map to
2,000,000 bytes.

## Change how maps are stored

Each stored map records the format number of the build that saved it. To
change how the build stores a map, add a data migration to
`teammapper-frontend/src/app/core/services/map-backend/local/migrations/`:

1. Write the migration in its own file, named after its format number, such
   as `0002-<what-it-changes>.ts`. Its `migrate` function changes the doc of a
   map on the previous format number in place.
2. Append the migration to `DATA_MIGRATIONS` in `data-migrations.ts`. The
   build takes its format number from the length of that list.
3. Never edit or remove a released migration. A visitor's browser may hold
   maps on any earlier format number.
4. Make the migration give the same map when two tabs run it on the same doc,
   and when an older tab stored content after the migration ran.

The build runs the missing data migrations on a map when it opens the map.

## Back up

Export a map as JSON from the export dialog and keep the file. Import the file
on the start page to restore the map in the same or another browser. The
notice on the map list reminds visitors of this.

## Switched off

The offline build has no backend, so these features are off:

- Sharing and duplication
- Pictograms
- AI generation
- The deletion date: maps stay until the visitor deletes them
- Collaboration: only one visitor edits a map

The app shows an "Offline mode" badge in two places:

- On the start page, in the header and under the heading. The badge under the
  heading states that nobody else sees the maps and changes do not sync with
  peers.
- On the map screen, after the client list. The badge's tooltip shows the
  same statement.

## Known limit

Two tabs on the same map do not sync. A tab shows the edits of the other tab
after a reload.
