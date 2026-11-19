const { sendError } = require('../respond');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('request failed', err.code || err.message);
  }

  sendError(res, status, {
    error: err.publicError || (status >= 500 ? 'internal_error' : 'request_error'),
  });
}

module.exports = errorHandler;
