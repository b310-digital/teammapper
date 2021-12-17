# Mindmapper

Mindmapping made simple: Host and create your own mindmaps. Share your mindmap sessions with others and collaborate on mindmaps.

Mindmapper is based on mindmapp (https://github.com/cedoor/mindmapp , discontinued). In contrast to mindmapp, mindmapper features shared mindmapping sessions with multiple users based on websockets.

## Features:

-   Host and create your own mindmaps
-   Set node images, colors and font properties.
-   Shortcuts
-   Import and export functionality (JSON, PDF, PNG...)
-   Mutli user support: Share your mindmap with friends and collegues. Work at the same time on the same mindmap!
-   By default, mindmaps are deleted after 30 days to ensure GDPR compliancy.

## Getting started

### Development

-   Start up app necessary services

    ```bash
    docker-compose up -d --build --force-recreate
    ```

-   Start frontend and backend at once

    ```bash
    docker-compose exec app sh
    # Inside docker container, you execute the following
    npm --prefix mindmapper-backend run dev
    ```

    or start frontend and backend separately

    ```bash
    # Open to terminal session on your host machine

    # I first terminal session
    docker-compose exec app npm --prefix mindmapper-backend start

    # I second terminal session
    docker-compose exec app npm --prefix mindmapper-frontend start
    ```

-   Visit the frontend in http://localhost:4200

### Test

-   Create a test database

    ```bash
    docker-compose exec postgres createdb -e -U mindmapper-user -W mindmapper-backend-test
    ```

-   Execute the tests

    ```bash
    docker-compose exec app npm -prefix mindmapper-backend run test:e2e
    ```

### Production

-   Generate self-signed ssl sertificate for the postgres server on the host machine; the generated files are mounted into the docker container

    ```bash
    mkdir -p ./ca
    openssl req -new -text -passout pass:abcd -subj /CN=localhost -out ./ca/server.req -keyout ./ca/privkey.pem
    openssl rsa -in ./ca/privkey.pem -passin pass:abcd -out ./ca/server.key
    openssl req -x509 -in ./ca/server.req -text -key ./ca/server.key -out ./ca/server.crt
    chmod 600 ./ca/server.key
    test $(uname -s) = Linux && chown 70 ./ca/server.key
    ```

-   Duplicate and rename `.env.default`

    ```bash
    cp .env.default .env.prod
    ```

-   Adjust all configs in `.env.prod`, e.g. database settings, ports, disable ssl env vars if necessary

-   Start everything at once:

    ```bash
    docker-compose --file docker-compose-prod.yml --env-file .env.prod up -d --build --force-recreate
    ```

-   Go to `http://localhost` to open up mindmapper

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
and media in language teaching. mindmapper is used in workshops to activate
prior knowledge, and collect and structure ideas. In addition, mindmapper can
be found on https://kits.blog/tools and can be used by schools for free. More info on
how to use it can be found in this post https://kits.blog/digitale-lesestrategien-brainstorming/

Logos and text provided with courtesy of kits.

## Acknowledgements

-   Mindmapp: https://github.com/cedoor/mindmapp (discontinued)
-   mmp Library: https://github.com/cedoor/mmp (discontinued)
-   https://github.com/JannikStreek
-   https://github.com/gerardo-navarro
-   https://github.com/nwittstruck
