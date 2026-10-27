# TextureForge

TextureForge is a React/Vite texture editor backed by an Express/TypeScript REST API, Prisma 6.19.0, and PostgreSQL. The repository has one root `package.json` and lockfile; `frontend/` is the Vite app root, and `src/` is the API root.

## Requirements and local setup

- Node.js `>=20.19 <25` and npm.
- A PostgreSQL database reachable through `DATABASE_URL`.

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Put the database connection string in the ignored root `.env`. Then apply local development migrations and start the processes in separate terminals:

```powershell
npm run db:migrate
npm run dev
```

In a second terminal from the repository root:

```powershell
npm run dev:frontend
```

Open the Vite URL printed in that terminal (default `http://localhost:5174`). The API defaults to port 3001. The development frontend configuration is in the ignored `frontend/.env.development.local`; its committed template is `frontend/.env.example`.

## Architecture and API

- `frontend/`: React editor, image processing, and IndexedDB source-image storage.
- `src/`: Express app, routes, validation, error handling, and Prisma client.
- `prisma/`: Prisma 6.19.0 schema, migrations, and starter-preset seed.
- `dist/src/server.js`: compiled API entry point.
- `dist/frontend/`: static production frontend.

The API base is configured at frontend build time with `VITE_API_URL`, including the `/api` suffix. For local development it is `http://localhost:3001/api`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check; returns service status only |
| GET | `/api/presets` | List starter presets |
| GET, POST | `/api/projects` | List or create projects |
| GET, PATCH, DELETE | `/api/projects/:id` | Read, update, or delete a project |
| GET, POST | `/api/projects/:id/recipes` | List or save effect recipes |
| GET | `/api/projects/:id/recipes/:recipeId` | Read a recipe |

Project metadata and effect recipes (including effect configuration and random seed) are stored in PostgreSQL. Original PNG/JPEG/WebP image Blobs are stored separately in the current browser's IndexedDB under the project ID. They survive refreshes in the same browser profile but do not sync between browsers or devices; clearing browser site data removes them. Cross-device image persistence would require adding object storage and a server-side asset key later.

## Environment variables

| Variable | Used by | Description |
| --- | --- | --- |
| `DATABASE_URL` | API/Prisma | PostgreSQL URL; set as a secret in deployment settings, never commit it |
| `PORT` | API | HTTP port supplied by the hosting platform; local fallback is 3001 |
| `HOST` | API | Bind address; defaults to `0.0.0.0` for web hosting |
| `CORS_ORIGIN` | API | Comma-separated exact frontend origins; local fallback allows ports 5173 and 5174 |
| `VITE_API_URL` | Vite build | Public API base URL, including `/api`; for example `https://your-api.onrender.com/api` |
| `VITE_DEV_PORT` | Vite dev server | Local frontend port; defaults to 5174 |

Vite variables are embedded in the frontend bundle at build time and must not contain secrets. The example files contain placeholders/local values only. Root `.env`, `.env.*`, build outputs, dependency directories, logs, and Vercel metadata are ignored by Git; `.env.example` files remain trackable.

## Build, test, and database commands

Run these from the repository root:

```powershell
npm run build:backend
npm run build:frontend
npm run build
npm test
npm run start
```

`build:backend` generates Prisma Client and compiles the API. `build:frontend` type-checks and builds only the Vite app. `build` runs both. `npm test` runs the API, image-engine, IndexedDB, and project-save workflow suites.

Prisma is pinned to 6.19.0. For production, apply already-authored migrations with:

```powershell
npm run db:deploy
```

This runs `prisma migrate deploy`; it does not reset the database or create a new migration. Use `npm run db:migrate` only for local development. Do not run the seed command automatically during deployment; run `npm run db:seed` only when you intentionally need the starter data.

## Production deployment

Deploy the API and static frontend as separate services. No deployment account or repository publishing has been performed.

### Render API service

Create a **Node Web Service** using the repository root as its root directory. Configure:

- **Build command:** `npm ci --include=dev && npm run build:backend`
- **Start command:** `npm run start`
- **Health check path:** `/api/health`
- **Environment:** set `DATABASE_URL` as a secret; set `CORS_ORIGIN` to the exact deployed Vercel origin (for example `https://your-app.vercel.app`). `PORT` is supplied by Render; `HOST` defaults to `0.0.0.0`.
- **Migration:** run `npm run db:deploy` as the pre-deploy command when available, or run it once from a trusted shell with the production database environment before deploying the new application version. Never use `db:migrate` or a reset command against production.

Render requires a web service to bind to `0.0.0.0` and recommends using its `PORT`; those are the API defaults here. Render's pre-deploy command is plan-dependent, so the migration must be run separately if it is unavailable. [Render port binding](https://render.com/docs/web-services) · [Render pre-deploy commands](https://render.com/docs/deploys)

### Vercel frontend

Import the same repository as a separate Vercel project. Because the frontend has no separate `package.json`, use the repository root—not `frontend/`—as the Vercel Root Directory. Configure:

- **Framework preset:** Vite
- **Root directory:** `.` (repository root)
- **Install command:** `npm ci --include=dev`
- **Build command:** `npm run build:frontend`
- **Output directory:** `dist/frontend`
- **Environment variable:** `VITE_API_URL=https://<your-render-service>.onrender.com/api`

Set `VITE_API_URL` for Production and for any Preview environment you use. Add each deployed frontend origin that should call the API to Render's `CORS_ORIGIN`. The output path is relative to the configured root. [Vercel build settings](https://vercel.com/docs/builds/configure-a-build)

## Security and limitations

- Never commit `.env`, database URLs, or provider credentials. Use host-provided secret settings for production.
- `/api/health` exposes only a status and service name; it does not test or return database credentials.
- Uploaded images are browser-local IndexedDB data, not PostgreSQL objects and not cross-device backups.
- The API currently has no user authentication; do not treat it as a multi-user production service with private project data until authentication and authorization are added.