# TalentNexus staging on Docker Swarm

Nginx serves `https://api-stag.talentnexus.app:8443` and forwards HTTP requests to
`api:8000`. The crawler connects to `api:50051` on the encrypted Swarm overlay.
The stack publishes TCP 8443 and leaves the server's existing port 443 available
to its current service.

## DNS, TLS, and database

- Point `api-stag.talentnexus.app` at the public IP of a Swarm node and allow
  inbound TCP 8443 in the server and hosting-provider firewall. With Swarm's
  ingress routing mesh, any node can accept connections on the published port.
  [Docker routing mesh](https://docs.docker.com/engine/swarm/ingress)
- Keep the Cloudflare A record **Proxied** and use **Full (strict)** for this
  hostname. Cloudflare supports HTTPS on 8443. Nginx needs a matching origin
  certificate, either publicly trusted or issued by Cloudflare Origin CA.
  [Cloudflare supported ports](https://developers.cloudflare.com/fundamentals/reference/network-ports/)
  · [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- If issuing a certificate with Certbot's manual DNS-01 challenge, add the TXT
  record Certbot provides at `_acme-challenge.api-stag.talentnexus.app`. Keep the
  proxied A record in place. If you already have a matching origin certificate
  and its private key, use those files directly.
  [Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge)
- Confirm the staging database has migrations through
  `20261101T0025_crawler_scheduling`. The stack starts the runtime images.
  Apply any pending migrations separately from the API checkout.
  [Crawler rollout guide](../../docs/admin-crawler.md)

## Inject configuration with Swarm secrets

Copy this directory to a Swarm manager. Run the remaining commands there, from
the directory containing `swarm.yml` and `nginx.conf`.

```bash
umask 077
cp -n api.env.example api.env
cp -n crawler.env.example crawler.env
```

Edit `api.env` and `crawler.env` with your actual staging values. Both files must
have the same `CRAWLER_WORKER_TOKEN`. Preserve the API's existing staging
`JWT_SECRET` and `ADMIN_MFA_ENCRYPTION_KEY` when redeploying. Use a database
address reachable from inside the API container. Use the actual HTTPS frontend
URLs for `WEB_APP_URL`, `ADMIN_APP_URL`, and `CORS_ORIGIN`, including a custom port
if the **frontend** uses one. Configure the frontend's API base URL as
`https://api-stag.talentnexus.app:8443`, with its usual API path prefix.

Keep the API's `GRPC_TLS_CERT_PATH` and `GRPC_TLS_KEY_PATH` unset for this stack.
Nginx handles public TLS and the encrypted overlay protects internal gRPC traffic.

```bash
docker secret create talentnexus-staging-api-env-v1 ./api.env
docker secret create talentnexus-staging-crawler-env-v1 ./crawler.env
docker secret create talentnexus-staging-tls-fullchain-v1 /path/to/fullchain.pem
docker secret create talentnexus-staging-tls-key-v1 /path/to/privkey.pem
```

Swarm mounts the environment secrets at `/app/.env` for the two Node images.
Their existing dotenv configuration reads those files at startup. This assumes
both pushed images use `/app` as their working directory, as in the supplied
Dockerfiles. Public runtime settings such as ports live in `swarm.yml`.
[Docker Swarm secrets](https://docs.docker.com/engine/swarm/secrets/)

## Use staging from local frontends

Build and push an API image that includes `STAGING_ALLOW_LOCALHOST` support.
Add the following to `api.env`, then create a new version of its Swarm secret.
These URLs are used in account and invitation emails, so their links open the
frontend on the machine of the person testing the flow.

```dotenv
STAGING_ALLOW_LOCALHOST=true
WEB_APP_URL=http://localhost:3000
ADMIN_APP_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

For browser sign-in and session refresh, use a dev-server proxy so requests
and refresh cookies share the frontend's origin. Keep the API base path as
`/api/v1` in each local frontend and forward it to the staging API over HTTPS.

For the Next.js web project, add this to `.env.local` and restart the dev server:

```dotenv
DEV_API_PROXY_ORIGIN=https://api-stag.talentnexus.app:8443
NEXT_PUBLIC_API_BASE_URL=/api/v1
```

For a separate Vite frontend on port 5173, merge this into its Vite config:

```ts
server: {
  proxy: {
    '/api/v1': {
      target: 'https://api-stag.talentnexus.app:8443',
      changeOrigin: true,
    },
  },
},
```

Use `localhost` in the browser. For Safari, use local HTTPS if refresh cookies
are rejected over HTTP. [Vite proxy options](https://vite.dev/config/server-options#server-proxy)
· [Secure cookies on localhost](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#block_access_to_your_cookies)

## Deploy and check

Export the exact Docker Hub repositories and tags you pushed. Digest references
also work. Run `docker login` first if the images are private, using credentials
that can pull both repositories.

```bash
export API_IMAGE='docker.io/YOUR_NAMESPACE/YOUR_API_REPOSITORY:YOUR_TAG'
export CRAWLER_IMAGE='docker.io/YOUR_NAMESPACE/YOUR_CRAWLER_REPOSITORY:YOUR_TAG'

docker stack config -c swarm.yml
docker stack deploy --with-registry-auth -c swarm.yml talentnexus-staging

docker stack services talentnexus-staging
docker stack ps talentnexus-staging --no-trunc
curl --fail --show-error https://api-stag.talentnexus.app:8443/api/health/ready
```

Export the image variables in the shell that runs the Docker CLI. `docker stack`
does not automatically load a Compose `.env` for interpolation. Use the readiness
response to check HTTP, TLS, and database connectivity. Check `workerAvailable`
in the admin crawler source endpoint to confirm the worker has polled the API.
[Docker interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
· [Docker stack deploy](https://docs.docker.com/reference/cli/docker/stack/deploy/)

If a task fails, check the service logs:

```bash
docker service logs --tail 100 talentnexus-staging_api
docker service logs --tail 100 talentnexus-staging_crawler
docker service logs --tail 100 talentnexus-staging_nginx
```

## Rotate settings or certificates

Swarm secrets and configs are immutable. Create a new versioned secret when a
file changes and export the matching name before redeploying. For example:

```bash
docker secret create talentnexus-staging-api-env-v2 ./api.env
export API_ENV_SECRET=talentnexus-staging-api-env-v2
docker stack deploy --with-registry-auth -c swarm.yml talentnexus-staging
```

Use `CRAWLER_ENV_SECRET` for the crawler file and `TLS_FULLCHAIN_SECRET` plus
`TLS_KEY_SECRET` for renewed certificates. Rotate both environment secrets together
when changing the shared worker token. Bump `NGINX_CONFIG_NAME` when editing
`nginx.conf`. Save the selected names with the non-secret image settings you use
for future deployments. [Docker Swarm configs](https://docs.docker.com/engine/swarm/configs/)
