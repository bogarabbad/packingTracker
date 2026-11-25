# Enrollment de dispositivos

Contrato canónico para la app Android: `openapi.yaml`
→ operación `enrollDispositivo` (`POST /enrollment`)
→ lista estática `PrefijosEscaneo`.

## Prefijo de escaneo

Lista cerrada (hoy un solo valor):

| PREFIJO | ACCION | Payload del QR |
|---------|--------|----------------|
| `PTENR\|` | `enrollment` | `PTENR\|{TOKEN}` |

La app reconoce el prefijo, ejecuta la acción y usa la carga (token sin prefijo).
Más prefijos se agregarán después al mismo esquema OpenAPI.

## Resumen

1. En la web se crea un token de autorización **libre** (`ID_DISPOSITIVO` nulo, `ACTIVO` true).
2. La plataforma muestra un **QR** con payload `PTENR|<TOKEN>`.
3. El dispositivo escanea el QR, detecta `PTENR|` y llama `POST /enrollment` **sin JWT**.
4. Si el token es válido y libre, el servidor crea el dispositivo vacío (si el `IDENTIFICADOR` no existe) y vincula el token.
5. Un operador completa nombre y tipo del dispositivo en la web.

## Petición

```http
POST /enrollment
Content-Type: application/json
```

```json
{
  "TOKEN": "<AUTORIZACION_TOKENS.TOKEN, con o sin PTENR|>",
  "IDENTIFICADOR": "<UUID estable del equipo>"
}
```

No lleva header `Authorization`. El servicio quita `PTENR|` si viene en `TOKEN`.

## Respuesta exitosa

Sobre estándar `{ data, _metadata, error }`.

- `201` si se creó el dispositivo.
- `200` si el dispositivo ya existía, o si el mismo par token+identificador ya estaba vinculado (idempotente).

`data`:

```json
{
  "DISPOSITIVO": {
    "ID": 1,
    "ID_TIPO": 1,
    "IDENTIFICADOR": "550e8400-e29b-41d4-a716-446655440000",
    "NOMBRE": null,
    "ACTIVO": true,
    "CREADO_EN": "...",
    "ACTUALIZADO_EN": "..."
  },
  "TOKEN": {
    "ID": 1,
    "ID_DISPOSITIVO": 1,
    "TOKEN": "...",
    "NOMBRE": "...",
    "ACTIVO": true,
    "EXPIRA_EN": null,
    "ULTIMO_USO_EN": "...",
    "CREADO_EN": "...",
    "ACTUALIZADO_EN": "..."
  },
  "CREADO": true
}
```

Un dispositivo nuevo nace con `NOMBRE: null` y `ID_TIPO` = semilla `DISPOSITIVOS_TIPOS.CODIGO = pendiente`.

## Errores (`error.error`)

| Código | HTTP | Significado |
|--------|------|-------------|
| `invalid_body` / `invalid_token` / `invalid_identificador` | 400 | Cuerpo mal formado |
| `token_not_found` | 404 | El QR no corresponde a un token |
| `token_inactive` | 409 | Token con `ACTIVO = false` |
| `token_expired` | 409 | `EXPIRA_EN` ≤ ahora |
| `token_not_free` | 409 | Token ya ligado a otro dispositivo |
| `duplicate_identificador` | 409 | Conflicto de unicidad al crear |
| `seed_tipo_missing` | 503 | Falta el tipo semilla `pendiente` |

## Semilla de tipo

`DISPOSITIVOS_TIPOS` incluye el registro semilla:

- `CODIGO`: `pendiente`
- `NOMBRE`: `Pendiente`
- `ES_SEMILLA`: `true`

No se elimina; se puede actualizar.

## Uso del API tras el enrollment

En cada petición autenticada la app envía el token **sin prefijo**:

```http
Authorization: Bearer <TOKEN>
```

El middleware acepta ese Bearer igual que un JWT de usuario, si el token:

- está `ACTIVO`
- no ha vencido (`EXPIRA_EN` nulo o futuro)
- ya está ligado a un dispositivo (`ID_DISPOSITIVO` no nulo)
- ese dispositivo está `ACTIVO`

Si no cumple, responde `401` con `invalid_token`, `token_inactive`, `token_expired`,
`token_not_bound` o `dispositivo_inactive`.

Cada uso autenticado actualiza `ULTIMO_USO_EN` del token.
