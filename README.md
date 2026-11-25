# packingTracker

API and web application for shipment traceability and dispatch control. The load document described by the project is the **packing list**, identified by a **folio**.

Version `0.1.0` (from `package.json` and `openapi.yaml`).

## Context

packingTracker records merchandise as it is packed into lots and loaded onto a transport unit (a truck or trailer). Other systems are expected to consume the HTTP API when they need to register or query that load.

The service is **agnostic**: it does not assume a specific customer, warehouse, or merchandise format. Products are referenced by `CLAVE_PRODUCTO`. Locations are a catalog in this service (`UBICACIONES` and `UBICACIONES_CATEGORIAS`).

The packing process modeled in the database is:

1. **Lots (`LOTES`)** form a packing tree through `PADRE_ID`. Seed lot types are *caja* (box) and *tambo* (drum), which are **final** types and may contain products, and *tarima* (pallet), which is **not** final and may contain final lots (a box or drum can sit on a pallet).
2. **Products (`LOTES_PRODUCTOS`)** belong only to a final lot. An external product is identified only by `CLAVE_PRODUCTO`, plus a quantity and a unit of measure allowed for that lot type. Seed measure units are *unidad* (whole units), *litro*, and *kilo*.
3. **Lot references (`LOTES_REFERENCIAS`)** attach an external identifier and optional description to a lot, classified by `REFERENCIAS_TIPOS`. The seed type is `PACKING`. There is no column or table named `FOLIO` in the current schema; a packing-list folio would be stored as a reference of this kind.
4. **Expeditions (`EXPEDICIONES`)** represent a dispatch on one transport unit. An expedition is open while `FECHA_CIERRE` is null, and closed once that timestamp is set. A unit may have only one open expedition at a time. `UBICACION_SALIDA_ID` optionally references `UBICACIONES`. `ID_UBICACION_SALIDA` remains an external integer.
5. **Loadings (`EXPEDICIONES_LOTES`)** embark a lot on an expedition. Only lots without a parent (loose lots) can be embarked, a lot can belong to only one expedition, and lots cannot be added or removed after the expedition is closed. A final lot is not assigned directly to the transport unit (`ID_UNIDAD`); only a non-final lot such as a pallet may point at the unit.
6. **Transport units (`UNIDADES_TRANSPORTE`)** are catalogued with type, plates, optional economic number and capacities, and a status. Seed types are tractocamión, torton, rabón, camioneta, and remolque. Seed statuses are disponible, cargando, en tránsito, mantenimiento, and fuera de servicio.
7. **Receptions (`RECEPCIONES`)** link an expedition (`ID_EXPEDICION`) to the location where it is received (`UBICACION_ID`).
8. **Lot locations (`LOTES_UBICACIONES`)** attach a location to a lot. The seed types in `LOTES_UBICACIONES_TIPOS` are `ORIGEN`, `DESTINO`, and `XDOCK`. A lot has at most one `DESTINO`.
9. **Reception lines (`RECEPCIONES_LOTES`)** receive a parentless lot once, and only when that lot's `DESTINO` is the reception's location. A received lot cannot later be given a parent.

Audit fields `USUARIO_ID` and `ID_ORIGEN_USUARIO` travel together on lots, lot references, lot locations, expeditions, loadings, receptions, and reception lines. Origin `1` (`interno`) means an internal user in `USUARIOS`. Any other origin is treated as external. Every table stores `CREADO_EN` and `ACTUALIZADO_EN`.

## Features

- REST API under Express with a uniform response envelope (`data`, `_metadata`, `error`).
- JWT Bearer authentication (`POST /auth/login`). All API routes require a token except `GET /health` and `POST /auth/login`.
- Health check that reports API and PostgreSQL status (`200` when both are up, `503` with `status: degraded` when the database is unreachable).
- CRUD for catalogs: unit statuses, transport unit types, lot types, units of measure, lot-type-to-measure relations, reference types, location categories, locations, and lot-location types.
- CRUD for transport units, lots, lot products, lot references, lot locations, expeditions, expedition loadings (`EXPEDICIONES_LOTES` has no `PUT`), receptions, and reception lines.
- Paginated list endpoints (`page` and `items`; defaults `1` and `50`) and query filters on several resources.
- Database-enforced packing and dispatch rules (see Context). Seed rows (`ES_SEMILLA = true`) can be updated but not deleted (`409` / `seed_not_deletable`).
- Server-rendered web UI (EJS + Tailwind CSS) in Spanish: login, operations dashboard, lots, expeditions, and catalog screens. The browser stores the access token in `localStorage` and sends it on API calls. HTML pages themselves are served without a server-side session check.
- OpenAPI 3.0.3 contract in `openapi.yaml`. Swagger UI is not bundled in Compose; the Spanish README documents a separate `docker run` command to serve the spec.
- Docker image and Compose file for the Node process. PostgreSQL is **not** defined in `docker-compose.yml`; the database is expected to already exist and be reachable from the container.

There is no user-management API (only login against `USUARIOS`). `hashPassword` exists in code but is not used by a route. There is no automated test suite and no `npm test` script.

## Tech stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js `>= 22` |
| HTTP | Express 5 |
| Database | PostgreSQL, accessed with `pg` (no ORM). Schema is defined in SQL (`db/init.sql` and `db/migrations/`). |
| Auth | JWT (HS256) via `jsonwebtoken`; passwords hashed with `bcryptjs` (10 rounds) |
| Web UI | EJS views, Tailwind CSS 4 (`@tailwindcss/cli`) |
| Config | `dotenv` / environment variables |
| API contract | OpenAPI 3.0.3 (`openapi.yaml`) |
| Containers | Docker (multi-stage `Dockerfile`, Node 22 Alpine) and Docker Compose |
| License | GPL-3.0-only |

## Project structure

```
.
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── openapi.yaml
├── package.json
├── db/
│   ├── create_database.sql   # first-time role and empty database (run as a superuser)
│   ├── init.sql              # current schema and catalog seed for a new database
│   ├── seed.sql              # optional sample transport units
│   └── migrations/           # incremental SQL migrations (0001–0028)
├── src/
│   ├── server.js             # process entry
│   ├── app.js
│   ├── config.js
│   ├── db.js
│   ├── auth/                 # password and JWT helpers
│   ├── middleware/           # authenticate, 404, error handler
│   ├── routes/               # API and web page routes
│   └── frontend/input.css    # Tailwind source
├── views/                    # EJS pages, layout, and UI partials
├── public/                   # compiled CSS and browser JavaScript
└── .env.example
```

Cursor project rules under `.cursor/rules/` describe conventions for migrations, seed rows, timestamps, and keeping `openapi.yaml` in sync. They are for editors, not runtime.

## Getting started

### Prerequisites

- Node.js 22 or newer (for a local, non-Docker run) and npm
- Docker and Docker Compose (for the documented container run)
- A PostgreSQL server. **The repository does not pin a PostgreSQL version and does not start Postgres in Compose.** Host, port, database, user, and password depend on your environment (placeholders below).

### Install (local Node run)

```bash
git clone https://github.com/bogarabbad/packingTracker.git
cd packingTracker
npm ci
cp .env.example .env
# edit .env — see Configuration
npm run build:css
```

### Database setup

On a new PostgreSQL server, create the role and empty database once, as a superuser, after replacing the password in the script:

```bash
psql -U postgres -f db/create_database.sql
```

Then, as user `packing`, load the current schema (catalogs included; operational tables start empty):

```bash
psql -U packing -d packing_tracker -f db/init.sql
```

Optional sample transport units:

```bash
psql -U packing -d packing_tracker -f db/seed.sql
```

`init.sql` is written to leave a new database on the latest schema. Do not also run `db/migrations/` after `init.sql` on a fresh database. Use the numbered migrations only to upgrade an existing database that was created from an earlier version. The header states that the script includes through migration `0028`.

### Configuration

Copy `.env.example` to `.env`. Compose injects these values into the app container. `.env` is gitignored.

| Variable | Default in `.env.example` | Role |
| --- | --- | --- |
| `PORT` | `3000` | Host port published by Compose. Inside the container the process always listens on `3000`. For a local Node run, this is the process port. |
| `PGHOST` | `localhost` | PostgreSQL host. Inside the app container, `localhost` is the container itself. If Postgres runs on the host, set `PGHOST=host.docker.internal` (or another reachable hostname). **Not predefined beyond this example.** |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGDATABASE` | `packing_tracker` | Database name |
| `PGUSER` | `packing` | Database user |
| `PGPASSWORD` | *(empty)* | Database password. **Set this.** `db/create_database.sql` uses a placeholder password you must replace before running it. |
| `JWT_SECRET` | `change-me-in-production` | Required. The process refuses to start if this is missing. Compose fails if it is unset. **Do not use the example value in production.** |
| `JWT_EXPIRES_IN` | `28800` | Access token lifetime in seconds (8 hours) |
| `JWT_ISSUER` | `packing-tracker` | JWT issuer claim |
| `JWT_AUDIENCE` | `packing-tracker-api` | JWT audience claim |
| `PACKING_HOST` | `packing.bogarabbad.me` | Example public hostname for the production Traefik routers. The local Compose file does not read it. Replace it on the server. |

`NODE_ENV` is set to `production` in `docker-compose.yml`. It is not listed in `.env.example`.

### Run with Docker

```bash
docker compose up --build
```

The API and UI are published at `http://localhost:3000` (or the host `PORT` you set).

```bash
curl http://localhost:3000/health
```

Stop with `docker compose down`.

The Compose network is named `packing-tracker`. Another Compose project can attach to that external network and call the service as `packing-tracker` on port `3000`, without going through the host.

The image compiles Tailwind CSS at build time, runs as a non-root `app` user, and defines a Docker `HEALTHCHECK` against `GET /health`.

### Deployment

A push to `master`, or a manual run of the `Deploy` workflow, copies the repository to `/opt/packingTracker` on the VPS and runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans`. The workflow uses OpenSSH and `rsync`. It does not copy `.env`.

Repository Actions secrets (the user and the host may instead be Actions variables):

- `SV01_SSH_KEY`
- `SV01_USER`
- `SV01_IP_ADDRESS`

`/opt/packingTracker/.env` must already exist on the server. It supplies `JWT_SECRET`, the PostgreSQL settings, and `PACKING_HOST`. Set `PGHOST=host.docker.internal` there so the container reaches Postgres (`infra-postgres`) on the host. `PACKING_HOST` is only the hostname Traefik matches, for example `packing.bogarabbad.me`.

The database, the schema, and DNS are managed separately. This repository does not create them. Production Compose publishes no host ports and does not start a second Traefik. The VPS proxy already listens on 80 and 443.

### Run locally (without Docker)

PostgreSQL must already be created and initialized, and `.env` must be filled in.

```bash
npm run build:css
npm start
```

For development, `npm run dev` starts the process with `node --watch`, and `npm run watch:css` rebuilds CSS on change. Open `http://localhost:3000/dashboard` (unauthenticated browsers are sent to `/login` by client-side script).

### Tests

This repository does not include automated tests or an `npm test` script.

## Usage

### Default seed user

`init.sql` inserts an internal user `ADMIN` with temporary password `Admin123!`. The project notes that this password should be changed after the first access. There is no API in this repository to change it; that would be done in the database or by a mechanism not present here.

### Login and a protected call

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"CODIGO":"ADMIN","CONTRASENA":"Admin123!"}' \
  http://localhost:3000/auth/login
```

A successful response looks like:

```json
{
  "data": {
    "access_token": "<jwt>",
    "token_type": "Bearer",
    "expires_in": 28800,
    "usuario": { "ID": 1, "CODIGO": "ADMIN", "NOMBRE": "Administrador" }
  },
  "_metadata": {},
  "error": null
}
```

Send `Authorization: Bearer <token>` on later API requests.

### Health

`GET /health` is public. When the database is up, `data.status` is `ok`. When the API is up but PostgreSQL is not, the status is `503` and `data.status` is `degraded`.

### Web UI

| Path | Screen |
| --- | --- |
| `/` | Redirects to `/dashboard` |
| `/login` | Sign-in form |
| `/dashboard` | Operations panel (counts of lot types, units of measure, and lots; reference-type table) |
| `/operacion/lotes` | Lots |
| `/operacion/expediciones` | Expeditions and loadings |
| `/catalogos/unidades-transporte` | Transport units |
| `/catalogos/unidades-tipos` | Transport unit types |
| `/catalogos/unidades-estatus` | Unit statuses |
| `/catalogos/unidades-medida` | Units of measure |
| `/catalogos/lotes-tipos` | Lot types (and their allowed measures) |
| `/catalogos/referencias-tipos` | Reference types |

### OpenAPI / Swagger UI

The contract is `openapi.yaml`. To view it in Swagger UI (not part of Compose), from the repository root, for example:

```powershell
docker run --rm -p 8080:8080 -e SWAGGER_JSON=/spec/openapi.yaml -v "${PWD}\openapi.yaml:/spec/openapi.yaml" swaggerapi/swagger-ui
```

Then open `http://localhost:8080`. If port `8080` is already in use, stop the previous container first. Refresh the browser to see an updated spec.

### API resources

All of the following, except `/health` and `/auth/login`, require a Bearer token.

| Method and path | Resource |
| --- | --- |
| `GET /health` | Health |
| `POST /auth/login` | Login |
| `GET, POST /unidades-estatus` and `GET, PUT, DELETE /unidades-estatus/{id}` | Unit statuses |
| `GET, POST /unidades-tipos` and `GET, PUT, DELETE /unidades-tipos/{id}` | Transport unit types |
| `GET, POST /lotes-tipos` and `GET, PUT, DELETE /lotes-tipos/{id}` | Lot types |
| `GET, POST /lotes-tipos-unidades` and `GET, PUT, DELETE /lotes-tipos-unidades/{id}` | Allowed measures per lot type |
| `GET, POST /referencias-tipos` and `GET, PUT, DELETE /referencias-tipos/{id}` | Reference types |
| `GET, POST /unidades-medida` and `GET, PUT, DELETE /unidades-medida/{id}` | Units of measure (`UNIDADES`) |
| `GET, POST /unidades-transporte` and `GET, PUT, DELETE /unidades-transporte/{id}` | Transport units |
| `GET, POST /lotes` and `GET, PUT, DELETE /lotes/{id}` | Lots |
| `GET, POST /lotes-referencias` and `GET, PUT, DELETE /lotes-referencias/{id}` | Lot references |
| `GET, POST /lotes-productos` and `GET, PUT, DELETE /lotes-productos/{id}` | Lot products |
| `GET, POST /expediciones` and `GET, PUT, DELETE /expediciones/{id}` | Expeditions |
| `GET, POST /expediciones-lotes` and `GET, DELETE /expediciones-lotes/{id}` | Loadings |
| `GET /expediciones/{id}/recepciones` | Receptions of one expedition |
| `GET, POST /ubicaciones-categorias` and `GET, PUT, DELETE /ubicaciones-categorias/{id}` | Location categories |
| `GET, POST /ubicaciones` and `GET, PUT, DELETE /ubicaciones/{id}` | Locations |
| `GET, POST /lotes-ubicaciones-tipos` and `GET, PUT, DELETE /lotes-ubicaciones-tipos/{id}` | Lot-location types |
| `GET, POST /lotes-ubicaciones` and `GET, PUT, DELETE /lotes-ubicaciones/{id}` | Lot locations |
| `GET /lotes/{id}/ubicaciones` | Locations of one lot |
| `GET, POST /recepciones` and `GET, PUT, DELETE /recepciones/{id}` | Receptions |
| `GET /recepciones/{id}/lotes` | Lots of one reception |
| `GET, POST /recepciones-lotes` and `GET, PUT, DELETE /recepciones-lotes/{id}` | Reception lines |

Common list query parameters:

- All lists: `page`, `items`
- Catalogs: `q` (code or name), `activo`; lot types also `es_final`; units of measure also `entera`
- Lots: `padre_id`, `id_tipo`, `id_unidad`, `es_final`, `embarcable` (`true` means no parent and not already embarked)
- Lot products and lot references: `id_lote`
- Lot-type measures: `id_tipo`
- Expeditions: `id_unidad`, `abierta`, `q` (matches `CODIGO` or `NOMBRE` of the location referenced by `UBICACION_SALIDA_ID`)
- Loadings: `id_expedicion`, `id_lote`
- Location categories and locations: `q`, `activo`, `padre_id` (`raiz` means no parent); locations also `id_categoria`
- Lot locations: `id_lote`, `id_tipo`, `ubicacion_id`
- Receptions: `id_expedicion`, `ubicacion_id`
- Reception lines: `id_recepcion`, `id_lote`
- Transport units: `q` (code, plates, economic number, brand, model), `id_tipo`, `id_estatus`, `activo`

A missing route returns `404` with `error.error = not_found` and `error.path`.

## License

[GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html) (`GPL-3.0-only`). See `LICENSE`.

## Author

Bogar Abbad Pérez Mireles

- Website: [https://bogarabbad.me/](https://bogarabbad.me/)
- GitHub: [https://github.com/bogarabbad](https://github.com/bogarabbad)
- LinkedIn: [https://www.linkedin.com/in/bogarabbad/](https://www.linkedin.com/in/bogarabbad/)
