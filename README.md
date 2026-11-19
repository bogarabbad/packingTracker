# packingTracker

API para dar trazabilidad a la mercancía que se carga en un camión. El documento que representa esa carga es el **packing list**, identificado por un **folio**.

El servicio es agnóstico: no asume un cliente, un almacén ni un formato de mercancía concretos. Otros proyectos lo consumen por HTTP cuando necesitan registrar o consultar la carga.

El servicio abre un pool de PostgreSQL con las variables de `.env`. No hay modelos ni esquema.

## Ejecutar

El proceso corre en su propio contenedor. Desde la raíz del repositorio:

```bash
docker compose up --build
```

La API queda en `http://localhost:3000`.

```bash
curl http://localhost:3000/health
```

Copia `.env.example` a `.env` y completa la conexión antes de levantar el contenedor. Compose inyecta `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` en el servicio.

```json
{
  "data": {
    "status": "ok",
    "service": "packing-tracker",
    "checks": {
      "api": { "status": "ok" },
      "database": { "status": "ok" }
    }
  },
  "_metadata": {},
  "error": null
}
```

Si la API responde pero PostgreSQL no acepta la conexión, el mismo endpoint responde `503` con `data.checks.database.status` en `error`.

Para detenerlo:

```bash
docker compose down
```

El puerto publicado se puede cambiar con la variable `PORT` del host (por defecto `3000`). Dentro del contenedor el proceso escucha siempre en `3000`.

## Swagger

La especificación está en `openapi.yaml`. Swagger UI corre en otro contenedor y solo la muestra; la API sigue en el puerto `3000`. Desde la raíz del repositorio, en PowerShell:

```powershell
docker run --rm -p 8080:8080 -e SWAGGER_JSON=/spec/openapi.yaml -v "${PWD}\openapi.yaml:/spec/openapi.yaml" swaggerapi/swagger-ui
```

Abre `http://localhost:8080`. Ctrl+C detiene el contenedor.

Si el puerto `8080` ya está ocupado, el comando nuevo no arranca y la página sigue sirviendo el contenedor anterior. Detén ese proceso antes de volver a correrlo. La pestaña abierta no se recarga sola: usa Ctrl+F5 para ver el `openapi.yaml` vigente.

## Integración

La red de Docker se llama `packing-tracker`. Otro Compose puede unirse a ella y llamar al servicio por el nombre `packing-tracker` en el puerto `3000`, sin pasar por el host:

```yaml
services:
  otro-servicio:
    networks:
      - packing-tracker

networks:
  packing-tracker:
    external: true
```

El contrato de la API está en `openapi.yaml`. `GET /health` sirve para que el orquestador y los demás servicios comprueben que el contenedor está listo.
