# Deployment

## Behind a Reverse Proxy

TeamMapper supports deployment behind a reverse proxy. Here's an example configuration using nginx with docker compose, though other reverse proxy setups will work as well. Add these lines to your docker-compose.yml:

```
nginx:
  image: nginx:latest
  ports:
    - 80:80
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
```

Then create a `nginx.conf` file in the folder `nginx`, with one of the following setups.

### Reverse Proxy using a Subdomain

```
server {
  listen 80;
  listen [::]:80;
  server_name teammapper.lan.DOMAIN.tld;

  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name teammapper.lan.DOMAIN.tld;

  # certificates for ssl, change according to your setup
  # ssl_certificate /etc/letsencrypt/live/lan.DOMAIN.tld/fullchain.pem;
  # ssl_certificate_key /etc/letsencrypt/live/lan.DOMAIN.tld/privkey.pem;

  location / {
      proxy_pass http://teammapper:3000/;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Access-Control-Allow-Origin *;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "Upgrade";
  }
}
```

### Reverse Proxy using a Path

When hosting TeamMapper under a path (e.g. /teammapper/), the `<base href>` tag in the HTML needs to be updated to match that path. This ensures TeamMapper can correctly resolve relative URLs for assets, API calls, and navigation. For nginx, this can be achieved using the `sub_filter` directive to dynamically replace the base href. For Apache, the equivalent functionality is provided by the `mod_substitute` module.

```
events {
  worker_connections 1024;
}

http {
  server {
    listen 80;
    server_name localhost;

    location /teammapper/ {
      proxy_pass http://teammapper:3000/;
      sub_filter '<base href="/"/>' '<base href="/teammapper/" />';
      sub_filter_types text/html;
      sub_filter_once on;

      # Add proper proxy headers
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # WebSocket support
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
    }
  }
}
```

### Yjs sync limits

These limits apply independently of `FEATURE_YJS_RATE_LIMITING`.

| Backend variable        | Default | Unit         | Limit                                  |
| ----------------------- | ------- | ------------ | -------------------------------------- |
| `YJS_MAP_MAX_BYTES`     | 5242880 | bytes        | Map state, including history           |
| `YJS_MAP_MAX_ENTRIES`   | 100000  | Yjs entries  | Entries in the map                     |
| `YJS_MAP_MAX_NODES`     | 10000   | nodes        | Nodes in the map                       |
| `YJS_MESSAGE_WINDOW_MS` | 10000   | milliseconds | Rate window and reset cooldown         |
| `YJS_MESSAGE_MAX_COUNT` | 100     | messages     | Per window, per connection and per map |
| `YJS_MESSAGE_MAX_BYTES` | 5242880 | bytes        | Per window, per connection and per map |

When a limit is reached:

- **Map size** (`YJS_MAP_*`), or invalid content: the backend discards the
  live map. The client that sent the change stops reconnecting, shows the map
  read-only and tells the user why. Every other client sees a message, reloads
  the saved map after the cooldown, and may lose unsaved edits.
- **Messages per connection**, all messages including presence: the backend
  disconnects that connection.
- **Messages per map**, edits only: the backend disconnects the connection that
  sent the most in the window, and the other peers keep working. At twice the
  limit it disconnects every sender.

A client disconnected by a message limit reconnects after a few hundred
milliseconds and resends any edits the backend did not apply.

`YJS_MAP_MAX_BYTES` also sets the WebSocket message limit: the map limit plus
64 KiB of headroom (5308416 bytes at the default). The backend names the
reason for any message up to that size. A larger message closes with code 1009
before the backend reads it. Keep `YJS_MESSAGE_MAX_BYTES` at or above
`YJS_MAP_MAX_BYTES`, or a large map hits the message budget.

Each connection can buffer one message of that size, so memory grows with the
number of open connections. At the default map limit, 50 connections from one
IP can hold about 253 MiB, and 500 connections about 2.5 GiB. To cap the
connections, set `FEATURE_YJS_RATE_LIMITING=true`. Then size
`WS_GLOBAL_MAX_CONNECTIONS` and `WS_PER_IP_MAX_CONNECTIONS` to the memory of
the host. Without the feature flag, the backend caps neither.

### Rejected map updates

The backend logs a rejected change as a WARN line:

```
Rejected map update on map <mapId>: reason=<reason> bytes=<bytes> clients=<count> action=<action> suppressed=<n>
```

- `reason`: the rule that rejected the change, for example `mapTooLarge`,
  `tooManyNodes`, `invalidContent`, `malformedUpdate` or `rateLimited`.
- `bytes`: size of the rejected message. For a message past the WebSocket
  limit, the field shows `>` and that limit, because the backend never reads
  the message.
- `clients`: open connections on the map before the close.
- `action`: what the backend did with the connections:
  - `closed`: disconnected the sender only.
  - `reset`: discarded the live map and disconnected every client.
  - `retry`: disconnected a sender over a message budget. That client
    reconnects and resends its edits.
- `suppressed`: repeats of the same map and reason that the backend dropped
  since the last line. The backend omits the field when it is zero.

The backend writes at most one line per map and reason per minute. It logs
other socket faults at ERROR.
