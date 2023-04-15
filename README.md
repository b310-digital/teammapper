# TeamMapper

Mindmapping made simple: Host and create your own mindmaps. Share your mindmap sessions with your team and collaborate on mindmaps.

TeamMapper is based on mindmapp (https://github.com/cedoor/mindmapp , discontinued). In contrast to mindmapp, TeamMapper features shared mindmapping sessions for your team based on websockets. Try it: [TeamMapper.org](https://teammapper.org)

![TeamMapper Screenshot](docs/teammapper-screenshot.png?raw=true "TeamMapper Screenshot with two users")

## Features:

-   **Creation**: Host and create your own mindmaps
-   **Customization**: Add images, colors, font properties and links to nodes
-   **Collaboration**: Share your mindmap with friends and collegues, using either a view-only or modification invite!
-   **Interoperability**: Import and export functionality (JSON, SVG, PDF, PNG...)
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

### Development

-   Start up app necessary services

    ```bash
    docker-compose up -d --build --force-recreate
    ```

-   Start frontend and backend at once

    ```bash
    docker-compose exec app npm --prefix teammapper-backend run dev
    ```

    or start frontend and backend separately

    ```bash
    # Open two terminal sessions on your host machine

    # In first terminal session
    docker-compose exec app npm --prefix teammapper-backend start

    # In second terminal session
    docker-compose exec app npm --prefix teammapper-frontend start
    ```

-   Visit the frontend in http://localhost:4200

### Test

-   Create a test database

    ```bash
    docker-compose exec postgres createdb -e -U teammapper-user -W teammapper-backend-test
    ```

-   Execute the tests

    ```bash
    docker-compose exec app npm -prefix teammapper-backend run test:e2e
    ```

### Production
-   Duplicate and rename `.env.default`

    ```bash
    cp .env.default .env.prod
    ```

-   Adjust all configs in `.env.prod`, e.g. database settings, ports, enable ssl env vars if necessary

-   Start everything at once (including a forced build):

    ```bash
    docker-compose --file docker-compose-prod.yml --env-file .env.prod up -d --build --force-recreate
    ```

-   Go to `http://localhost:3011` (if default port is used in .env.prod) to open up teammapper. Happy mapping!
-   Optional commands:

    If you want to make sure to include the most recent updates, run first:

    ```bash
    docker-compose --file docker-compose-prod.yml --env-file .env.prod build --no-cache
    ```

    then:

    ```bash
    docker-compose --file docker-compose-prod.yml --env-file .env.prod up -d --force-recreate
    ```

    If you want to remove old data, including cached node packages and stored databases (DANGER!):

    ```bash
    docker-compose --file docker-compose-prod.yml --env-file .env.prod down -v
    ```
    
    If you want to run prod migrations (again):
    
    ```bash
    docker-compose exec app_prod npm -prefix teammapper-backend run prod:typeorm:migrate
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

#### Running jobs

Trigger delete job (also executed daily with cron task scheduler):

```
docker-compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod npm --prefix teammapper-backend run prod:data:maps:cleanup
```

#### Running further queries

Example of running sql via typeorm:

```
docker-compose --file docker-compose-prod.yml --env-file .env.prod exec app_prod npx --prefix teammapper-backend typeorm query "select * from mmp_node" --dataSource ./teammapper-backend/dist/data-source.js
```

### Further details

-   Once this docker volume is initialized after the first `docker-compose up`, the database-related variables in `.env.prod` will not have any effect; please have this in mind => you will then need to setup your database manually

## Contributing

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

## Additional licence

The TeamMapper[logo](https://thenounproject.com/icon/188125/) in this repo – created by [Gregor Cresnar](https://thenounproject.com/grega.cresnar) – is licenced under [CC BY 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).

## Acknowledgements

-   Mindmapp: https://github.com/cedoor/mindmapp (discontinued)
-   mmp: https://github.com/cedoor/mmp (discontinued)
-   D3: https://github.com/d3/d3
-   DomPurify: https://github.com/cure53/DOMPurify
