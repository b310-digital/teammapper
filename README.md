# TeamMapper

![TeamMapper Screenshot](docs/teammapper-logo.png "TeamMapper Logo")

Mindmapping made simple: Host and create your own mindmaps. Share your mindmap sessions with your team and collaborate on mindmaps.

TeamMapper is based on mindmapp (https://github.com/cedoor/mindmapp , discontinued). In contrast to mindmapp, TeamMapper features shared mindmapping sessions for your team based on websockets. Try it: [TeamMapper.org](https://teammapper.org)

![TeamMapper Trailer](docs/teammapper-trailer.gif?raw=true "Two users build a mind map together in TeamMapper")

## Features:

-   **Creation**: Host and create your own mindmaps
-   **Customization**: Add images, pictograms\*, colors, font properties and links to nodes
-   **Collaboration**: Share your mindmap with friends and collegues, using either a view-only or modification invite!
-   **Interoperability**: Import and export functionality (JSON, Mermaid, SVG, PDF, PNG...)
-   **Shareability**: Use a QR Code or URL to share your maps
-   **GDPR Compliancy**: By default, mindmaps are deleted after 30 days
-   **Usability**: Redo / Undo, many Shortcuts

## Getting started

### Quick Start (without building the image)

Prepared docker image: `docker pull ghcr.io/b310-digital/teammapper:latest`

#### Docker compose

Attention: Add the missing password for postgres inside app_prod and postgres_prod!

`docker compose up -d` and visit `localhost:80`

```docker
version: "3.8"

services:
  app_prod:
    image: ghcr.io/b310-digital/teammapper:latest
    environment:
      MODE: PROD
      BINDING: "0.0.0.0"
      POSTGRES_DATABASE: teammapper-db
      POSTGRES_HOST: postgres_prod
      POSTGRES_PASSWORD:
      POSTGRES_PORT: 5432
      POSTGRES_SSL: false
      POSTGRES_SSL_REJECT_UNAUTHORIZED: false
      POSTGRES_USER: teammapper-user
      POSTGRES_QUERY_TIMEOUT: 100000
      POSTGRES_STATEMENT_TIMEOUT: 100000
      DELETE_AFTER_DAYS: 30
      AI_ENABLED: false
    ports:
      - 80:3000
    depends_on:
      - postgres_prod

  postgres_prod:
    image: postgres:12-alpine
    # Pass config parameters to the postgres server.
    # Find more information below when you need to generate the ssl-relevant file your self
    # command: -c ssl=on -c ssl_cert_file=/var/lib/postgresql/server.crt -c ssl_key_file=/var/lib/postgresql/server.key
    environment:
      PGDATA: /var/lib/postgresql/data/pgdata
      POSTGRES_DB: teammapper-db
      POSTGRES_PASSWORD:
      POSTGRES_PORT: 5432
      POSTGRES_USER: teammapper-user
    volumes:
      # To setup an ssl-enabled postgres server locally, you need to generate a self-signed ssl certificate.
      # See README.md for more information.
      # Mount the ssl_cert_file and ssl_key_file into the docker container.
      - ./ca/server.crt:/var/lib/postgresql/server.crt
      - ./ca/server.key:/var/lib/postgresql/server.key
      - postgres_prod_data:/var/lib/postgresql/data/pgdata

volumes:
  postgres_prod_data:
```

For examples with a reverse proxy, see [documentation about deployment](docs/deployment.md).

### Development

TeamMapper requires Node.js 24.11.1 or later. `pnpm install` refuses an older version. The `app` container already ships a newer Node.

-   Start up app necessary services

    ```bash
    docker compose up -d --build --force-recreate
    ```

-   Install and build local workspace packages required by the frontend

    ```bash
    docker compose exec app pnpm --filter teammapper-frontend run build:packages
    ```

-   Start frontend and backend at once

    ```bash
    docker compose exec app pnpm run dev
    ```

    or start frontend and backend separately

    ```bash
    # Open two terminal sessions on your host machine

    # In first terminal session
    docker compose exec app pnpm --filter teammapper-backend start

    # In second terminal session
    docker compose exec app pnpm --filter teammapper-frontend start
    ```

-   Visit the frontend in http://localhost:4200


### Secret linting via gitleaks
If installed, run gitleaks to make sure to secrets are accidentally included:

```
# Assumes location is set to teammapper repo
docker run -v "$(pwd)":/path ghcr.io/gitleaks/gitleaks:latest dir /path --verbose --config /path/.gitleaks.toml
```

### Test

-   Create a test database

    ```bash
    docker compose exec postgres createdb -e -U teammapper-user -W teammapper-backend-test
    ```

-   Execute the tests

    ```bash
    docker compose exec app pnpm --filter teammapper-backend run test
    ```

### Production

-   Duplicate and rename `.env.default`

    ```bash
    cp .env.default .env.prod
    ```

-   Adjust all configs in `.env.prod`, e.g. database settings, ports, enable ssl env vars if necessary

-   Start everything at once (including a forced build):

    ```bash
    docker compose --file docker-compose-prod.yml --env-file .env.prod up -d --build --force-recreate
    ```

-   Go to `http://localhost:3011` (if default port is used in .env.prod) to open up teammapper. Happy mapping!
-   Optional commands:

    If you want to make sure to include the most recent updates, run first:

    ```bash
    docker compose --file docker-compose-prod.yml --env-file .env.prod build --no-cache
    ```

    then:

    ```bash
    docker compose --file docker-compose-prod.yml --env-file .env.prod up -d --force-recreate
    ```

    If you want to remove old data, including cached node packages and stored databases (DANGER!):

    ```bash
    docker compose --file docker-compose-prod.yml --env-file .env.prod down -v
    ```

    If you want to run prod migrations (again):

    ```bash
    docker compose exec app_prod pnpm --filter teammapper-backend run prod:typeorm:migrate
    ```

#### Postgres and SSL

If needed, you can make the connection to Postgres more secure by using a SSL connection.

-   Generate self-signed ssl sertificate for the postgres server on the host machine; the generated files are mounted into the docker container

    ```bash
    mkdir -p ./ca
    openssl req -new -text -passout pass:abcd -subj /CN=localhost -out ./ca/server.req -keyout ./ca/privkey.pem
    openssl rsa -in ./ca/privkey.pem -passin pass:abcd -out ./ca/server.key
    openssl req -x509 -in ./ca/server.req -text -key ./ca/server.key -out ./ca/server.crt
    chmod 600 ./ca/server.key
    test $(uname -s) = Linux && chown 70 ./ca/server.key
    ```

    And uncomment the line:

    ```bash
     # command: -c ssl=on -c ssl_cert_file=/var/lib/postgresql/server.crt -c ssl_key_file=/var/lib/postgresql/server.key
    ```

    within the docker-compose-prod file.

Anonymous map duplication has shared rate and concurrency limits, and a copy must fit the image cap of one map. See the [backend configuration](teammapper-backend/README.md#node-images).

#### Migrating node images to image references

TeamMapper stores a node image in its own table, and the node holds an `image:<uuid>` reference to it. Earlier releases wrote each image into the node as a base64 data URL.

The current release supports both forms. Maps with inline data URLs keep loading, rendering, syncing and exporting as before, so the migration is optional and you can run it at any time. We still recommend it: a map that holds inline images sends the full image bytes on every map load and in every sync message. Move existing images to the new storage once after upgrading:

1. Upgrade and start the app. The app runs the migrations on start, which create the image tables.
2. Extract the inline images. The app can keep running during the job:

    ```bash
    docker compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod pnpm --filter teammapper-backend run prod:data:images:extract-to-table
    ```

3. Run the same command a second time. A map open during the first run can write its data URLs back, and each run extracts only the images still held inline.
4. Read the job's warnings. The job keeps any data URL that is not a valid raster image, such as an SVG, and warns about it on every run.

#### Running jobs

Trigger delete job (also executed daily with cron task scheduler):

```
docker compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod pnpm --filter teammapper-backend run prod:data:maps:cleanup
```

Trigger the unused image cleanup (also executed daily at 01:00 UTC). It deletes images that no node of their map references and that are older than 7 days:

```
docker compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod pnpm --filter teammapper-backend run prod:data:images:cleanup
```

Extract the images that nodes hold inline as base64 data URLs into the image tables, replacing each with an image reference. See [Migrating node images to image references](#migrating-node-images-to-image-references) for when and how often to run the job:

```
docker compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod pnpm --filter teammapper-backend run prod:data:images:extract-to-table
```

#### Running further queries

Example of running sql via typeorm:

```
docker compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod pnpm --filter teammapper-backend exec typeorm query "select * from mmp_node" --dataSource ./dist/data-source.js
```

### System settings

The server sends system settings to the app: feature flags, the legal links,
the pictogram addresses and the version. Their defaults are part of the code
(`DEFAULT_SYSTEM_SETTINGS` in `packages/shared`), and only the environment
variables below change them. The server resolves the settings once at
startup. The version shown in the info dialog comes from
`teammapper-backend/package.json`.

A flag variable turns its flag on with `true` and off with `false`, in upper
or lower case. An unset, empty or other value keeps the default.

| Variable | Description | Default |
| --- | --- | --- |
| `AI_ENABLED` | Turns on AI generate and its API endpoints | `false` |
| `FEATURE_PICTOGRAMS` | Turns on pictograms. With the flag on, the server also serves two endpoints that call ARASAAC: `/arasaac/api/pictograms` for searches and `/arasaac/images/pictograms` for images; with the flag off, both answer 404 | `true` |
| `FEATURE_ARROWS` | Shows the button and the `alt+a` shortcut that connect two nodes with an arrow. Maps show, sync and export their arrows with the flag off | `false` |
| `FEATURE_SHARING` | Shows the share button and the share dialog, which duplicates maps | `true` |
| `PICTOGRAMS_VIA_SERVER` | With `true`, the browser sends every pictogram search and image request to the server, which calls ARASAAC. Otherwise the browser loads pictograms from ARASAAC directly | `false` |
| `PICTOGRAM_API_URL` | ARASAAC search API that the `/arasaac/api/pictograms` endpoint calls | `https://api.arasaac.org/api` |
| `PICTOGRAM_IMAGES_URL` | ARASAAC image server that the `/arasaac/images/pictograms` endpoint calls | `https://static.arasaac.org/` |
| `IMPRINT_URL` | Target of the imprint link in the start page footer and the info dialog; unset or empty hides the link | unset |
| `PRIVACY_URL` | Target of the privacy policy link in the start page footer and the info dialog; unset or empty hides the link | unset |
| `AI_LLM_MODEL` | The LLM that AI generate uses; the AI dialog shows its name while `AI_ENABLED` is on | unset |
| `DELETE_AFTER_DAYS` | Number of days before unused maps are deleted | `30` |
| `IGNORE_SETTINGS_OVERRIDE` | With `true`, the server skips `config/settings.override.json` and reads the [user settings](#user-settings) from `settings.default.json` | `false` |
| `MODE` | Sets the default log level: `debug` with `DEV`, `log` with any other value | unset |
| `LOG_LEVEL` | NestJS log verbosity (`error`, `warn`, `log`, `debug`, `verbose`); wins over `MODE` | `debug` with `MODE=DEV`, `log` otherwise |

The [backend README](teammapper-backend/README.md#environment-variables) lists
the variables for the database, real-time collaboration, node images and the
LLM connection.

### User settings

**User settings**, such as language, dark mode, the branch style and the
styling of new nodes, belong to one browser. The server sends their starting
values from `teammapper-backend/config/settings.default.json`.

To change the starting values, mount a complete settings file at
`config/settings.override.json` in the app directory, as the commented
`volumes` entry in `docker-compose-prod.yml` shows. The override replaces the
default file; the server merges nothing. Start from a copy of
`settings.default.json` and change the values you need:

```json
{
  "userSettings": {
    "general": { "language": "de", "darkMode": false, "displayName": "" },
    "mapOptions": {
      "branchStyle": "curved",
      ...
    }
  }
}
```

The server checks the file at startup and refuses to start when a field is
missing, unknown or invalid, such as a branch style other than `tapered`,
`curved` or `straight`. The file holds user settings only: feature flags,
links and pictogram addresses come from the environment variables above.

`IGNORE_SETTINGS_OVERRIDE=true` makes the server skip the override file and
read `settings.default.json`. The tests expect the default values, so the CI
workflows set it, and a fork that ships an override keeps its tests green.

### Offline build settings

The offline build has no server and bakes its settings in at build time. It
starts from the same system settings defaults, turns sharing, pictograms and
AI off, and reads `IMPRINT_URL` and `PRIVACY_URL` from the environment of
`pnpm run build:offline`. Its user settings come from
`settings.default.json`.

### Upgrading from earlier settings files

Earlier releases read `teammapper-backend/config/settings.dev.json` or
`settings.prod.json`, chosen by `MODE`, and merged a mounted
`config/settings.override.json` over it. The server now reads the system
settings from environment variables only:

1. Feature flags: `AI_ENABLED`, `FEATURE_PICTOGRAMS`, `FEATURE_ARROWS` and
   `FEATURE_SHARING`.
2. Legal links: `IMPRINT_URL` and `PRIVACY_URL`.
3. Pictogram requests through the server: `PICTOGRAMS_VIA_SERVER=true`.

An existing override file that sets `systemSettings`, or only part of the user
settings, stops the server at startup. Move its system settings to the
variables above. Then either delete the file, or turn it into a complete user
settings file.

The published image set no `MODE` and therefore loaded the development
settings, so its behaviour stays the same: pictograms on, loaded from ARASAAC.
A deployment with `MODE=PROD` used the production settings, which turned
pictograms off and routed them through the server. To keep that, set
`FEATURE_PICTOGRAMS=false`, or `PICTOGRAMS_VIA_SERVER=true` to offer
pictograms through the server. `MODE` now sets only the default log level.

### Offline build

`pnpm --filter teammapper-frontend run build:offline` builds a static site that
runs without a backend and stores maps in the browser. Any static host can serve
it. A service worker caches the site, so the site loads without a network
after the first visit over HTTPS. See [docs/offline.md](docs/offline.md) for building,
hosting, updates and backups.

### Further details

-   Once this docker volume is initialized after the first `docker compose up`, the database-related variables in `.env.prod` will not have any effect; please have this in mind => you will then need to setup your database manually

## Contributing

The frontend compiles under `strict: true` and Angular's `strictTemplates`.
`strictPropertyInitialization` is the one flag still off. Run both checks before
you open a PR:

```bash
pnpm --filter teammapper-frontend run tsc        # TypeScript
pnpm --filter teammapper-frontend run build:dev  # Angular templates
```

1. Fork it
2. Create your feature branch (`git checkout -b fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Push to the branch (`git push origin fooBar`)
5. Create a new Pull Request

## Testimonials

<img src="https://www.nibis.de/img/nlq-medienbildung.png" align="left" style="margin-right:20px">
<img src="https://kits.blog/wp-content/uploads/2021/03/kits_logo.svg" width=100px align="left" style="margin-right:20px">

kits is a project platform hosted by a public institution for quality
development in schools (Lower Saxony, Germany) and focusses on digital tools
and media in language teaching. TeamMapper is used in workshops to activate
prior knowledge, and collect and structure ideas. In addition, TeamMapper can
be found on https://kits.blog/tools and can be used by schools for free.

Logos and text provided with courtesy of kits.

## Acknowledgements

-   \*Pictograms author: Sergio Palao. Origin: ARASAAC (http://www.arasaac.org). License: CC (BY-NC-SA). Owner: Government of Aragon (Spain)
-   Mindmapp: https://github.com/cedoor/mindmapp (discontinued)
-   mmp: https://github.com/cedoor/mmp (discontinued)
-   D3: https://github.com/d3/d3
-   DomPurify: https://github.com/cure53/DOMPurify

```

```
