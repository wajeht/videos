# Development Guide

## Prerequisites

- Node.js 24+
- npm 11+
- FFmpeg and FFprobe available through `PATH`
- Intel Quick Sync device access when re-encoding incompatible video streams on Linux
  (CPU video fallback is disabled)

## Local Development

```bash
git clone https://github.com/wajeht/videos.git
cd videos
cp .env.example .env
npm ci
npx playwright install chromium
npm run db:migrate
npm run dev
```

Open <http://localhost>. Hono listens on port 80 and proxies the development Vue client running internally on port 3000.

Without `.env`, local commands use `/Volumes/plex/videos` and store the SQLite database, HLS conversion files, generated video thumbnails, and optimized playlist covers in `./data`. Change `VIDEOS_DIR` and `DATA_DIR` in `.env` on another machine. `DATA_DIR` must be outside `VIDEOS_DIR` so app writes cannot trigger library scans. The video directory itself is never changed.

The development database uses one bootstrap migration. After changing the schema, recreate the SQLite database instead of adding upgrade migrations.

## Available Commands

```bash
npm run dev           # Start the API and Vue development servers
npm run dev:server    # Start only the API server
npm run dev:client    # Start only the Vue development server
npm run db:migrate    # Apply SQLite migrations
npm run check         # Run types, lint, formatting, tests, and builds
npm run typecheck     # Run all TypeScript and Vue type checks
npm run lint          # Run Oxlint
npm run format        # Format the repository with Oxfmt
npm run format:check  # Check formatting without changing files
npm run test          # Run tests once
npm run test:pwa      # Test production PWA behavior in Chromium
npm run test:watch    # Run tests in watch mode
npm run build         # Build the server and client
npm start             # Start the production build
```

## Docker Development

Build and start the development stack:

```bash
make up
```

Open <http://localhost>. Source files are bind-mounted into the container, and the API and Vue development servers reload as files change. The SQLite database and generated media caches remain under `./data`.

Common commands run inside the development container:

```bash
make test
make format
make lint
make typecheck
make check
make down
```

Run `make help` for the complete command list. `VIDEOS_DIR` defaults to `/Volumes/plex/videos` on the host and is mounted read-only at `/videos`.

The development Compose file omits hardware device mapping so it works with Docker Desktop on macOS, where Quick Sync is unavailable. To test conversion on Linux, use the included device override:

```bash
make up-qsv
```

## Vue UI Architecture

Reusable interface primitives live in `src/vue/components/ui`. Use these for buttons, form controls, panels, empty states, alerts, modals, confirmations, toasts, and the Videos logo. Keep content-specific components such as `VideoCard`, `PlaylistCard`, and `VideoRow` in `src/vue/components`.

Route pages live under `src/vue/pages`, with route-specific components in that route's `partials` directory. Keep tests beside the page or component they cover. Pages and composables own server fetching through TanStack Vue Query. `src/vue/router.ts` owns route definitions, metadata, scrolling, and navigation
errors.

Shared interaction state lives in `src/vue/composables`. Use `useAsyncAction` for pending and error state, `useConfirm` instead of `window.confirm`, and `useToast` for short success or failure notifications. Mount one `ConfirmDialog` and `ToastViewport` at the application root.

New primitives need component tests in Happy DOM. Browser-boundary coverage uses Playwright files named `*.browser.test.ts`; these are kept out of the Vitest suite. Add browser coverage when an interaction crosses routing, authentication, offline behavior, production PWA behavior, or another browser boundary.

## Deployment

After verification, pushes to `main` create a versioned GitHub release, publish version, commit, and `latest` image tags to `ghcr.io/wajeht/videos`, and run the production deployment workflow. Pull requests can use the `temp-deploy` or `temp-deploy-with-auth` label for a temporary environment.

Production deployment configuration lives in the Home Ops repository, including video and data mounts, `/dev/dri` access, `SESSION_SECRET`, `AUTH_SETUP_TOKEN`, and image updates. Videos handles browser authentication itself and exposes `/healthz` without authentication for its health check.

Login and profile-unlock limits use the network peer address by default. Behind a reverse proxy, set `TRUSTED_PROXIES` to a comma-separated list of the proxy IP addresses or CIDRs. Videos follows `X-Forwarded-For` from right to left through those trusted proxies and stops at the first untrusted address. It ignores `CF-Connecting-IP` and forwarding headers from untrusted peers. Equivalent IPv6 and IPv4-mapped addresses use the same rate-limit identity.

For multiple proxy hops (such as Cloudflare → Traefik → Videos), include every trusted proxy hop, or configure the immediate proxy to overwrite `X-Forwarded-For` with the verified client address. Trust only networks reserved for your proxies, never arbitrary client networks. With no proxy trust configured, users behind a proxy share that proxy's login limit. Direct Docker access needs no trust configuration. Configure the production proxy policy before deploying authentication changes; this repository does not configure the external Home Ops network.

Converted video caches are tied to the source file's size and modification time. Older caches without a source generation are rebuilt on demand, and successful scans clean up obsolete generated files. This requires no database reset and preserves profiles and viewing progress.
