function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    error: status >= 500 ? 'internal_error' : 'request_error',
  });
}

module.exports = errorHandler;
