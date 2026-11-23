const { httpError } = require('./httpError');

function parseOptionalBoolean(value, error) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw httpError(400, error);
}

function parseOptionalPositiveInt(value, error) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (!/^[1-9]\d*$/.test(String(value))) {
    throw httpError(400, error);
  }

  return Number(value);
}

function parseOptionalQueryText(value, error, { maxLength = 100 } = {}) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw httpError(400, error);
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw httpError(400, error);
  }

  return trimmed;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function likeContains(value) {
  return `%${escapeLike(value)}%`;
}

module.exports = {
  parseOptionalBoolean,
  parseOptionalPositiveInt,
  parseOptionalQueryText,
  likeContains,
};
