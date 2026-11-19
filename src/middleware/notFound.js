const { sendError } = require('../respond');

function notFound(req, res) {
  sendError(res, 404, {
    error: 'not_found',
    path: req.originalUrl,
  });
}

module.exports = notFound;
