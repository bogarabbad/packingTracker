/**
 * Prefijos de escaneo acordados con Android.
 * La lista canónica para el cliente está en openapi.yaml
 * (`components.schemas.PrefijosEscaneo` / `PrefijoEscaneo`).
 * Mantén estos valores alineados con el YAML.
 */
const PREFIJOS_ESCANEO = Object.freeze({
  ENROLLMENT: Object.freeze({
    PREFIJO: 'PTENR|',
    ACCION: 'enrollment',
  }),
});

function payloadEnrollment(token) {
  return `${PREFIJOS_ESCANEO.ENROLLMENT.PREFIJO}${token}`;
}

function stripEnrollmentPrefix(value) {
  const prefix = PREFIJOS_ESCANEO.ENROLLMENT.PREFIJO;
  if (typeof value === 'string' && value.startsWith(prefix)) {
    return value.slice(prefix.length);
  }
  return value;
}

module.exports = {
  PREFIJOS_ESCANEO,
  payloadEnrollment,
  stripEnrollmentPrefix,
};
