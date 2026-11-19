const { httpError } = require('./httpError');

function parseQueryInteger(value, fallback, error) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw httpError(400, error);
  }

  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw httpError(400, error);
  }

  return number;
}

function paginationFromQuery(query) {
  const page = parseQueryInteger(query.page, 1, 'invalid_page');
  const items = parseQueryInteger(query.items, 50, 'invalid_items');
  const offset = (page - 1) * items;
  if (!Number.isSafeInteger(offset)) {
    throw httpError(400, 'invalid_page');
  }

  return { page, items, offset };
}

function paginationMetadata(page, items, total) {
  const count = Number(total);
  return {
    page,
    items,
    total: count,
    pages: count === 0 ? 0 : Math.ceil(count / items),
  };
}

module.exports = { paginationFromQuery, paginationMetadata };
