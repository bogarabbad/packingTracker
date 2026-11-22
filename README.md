# packingTracker

**Shipment traceability and dispatch control API.** It records what gets loaded onto each truck. The load document is the **packing list**, identified by a **folio** (document number).

The service is client-agnostic: it doesn't assume a specific customer, warehouse, or goods format. Other systems consume it over HTTP to register or query loads.

## Tech stack

- **Backend:** Node.js 22, Express 5, PostgreSQL (`pg` connection pool)
- **Auth:** JWT bearer tokens (`jsonwebtoken`), bcrypt password hashing
- **Web UI:** server-rendered EJS views with Tailwind CSS 4
- **API contract:** OpenAPI 3 spec (`openapi.yaml`), viewable in Swagger UI
- **Infrastructure:** multi-stage Docker build (non-root user, built-in healthcheck), Docker Compose, versioned SQL migrations (`db/migrations`)

## Features

- REST endpoints for transport units, lots (with parent/child hierarchy and references), lot types, units of measure, and status/type catalogs
- Consistent response envelope (`data`, `_metadata`, `error`) and paginated list endpoints
- Health endpoint that checks both the API and the database (returns `503` if PostgreSQL is unreachable)
- Login and dashboard web pages for internal users

## Getting started

Copy `.env.example` to `.env`, then set the database connection and `JWT_SECRET`. From the repository root:

```bash
docker compose up --build
curl http://localhost:3000/health
```

The API listens on `http://localhost:3000` (override the host port with `PORT`). All API routes except `GET /health` and `POST /auth/login` require `Authorization: Bearer <token>`.

Get a token with the seed admin user (change its password after the first login):

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"CODIGO":"ADMIN","CONTRASENA":"Admin123!"}' \
  http://localhost:3000/auth/login
```

To build the CSS during development, run `npm run build:css` (or `npm run watch:css`), then open `http://localhost:3000/dashboard`.

## API documentation

The contract lives in `openapi.yaml`. To browse it in Swagger UI:

```bash
docker run --rm -p 8080:8080 -e SWAGGER_JSON=/spec/openapi.yaml \
  -v "$PWD/openapi.yaml:/spec/openapi.yaml" swaggerapi/swagger-ui
```

Then open `http://localhost:8080`.

## Integrating with other services

The Compose network is named `packing-tracker`. Another Compose project can join it and call the service at `http://packing-tracker:3000` without going through the host:

```yaml
services:
  other-service:
    networks:
      - packing-tracker

networks:
  packing-tracker:
    external: true
```

## License

GPL-3.0
