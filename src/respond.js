function envelope(data, error, metadata) {
  return {
    data,
    _metadata: metadata || {},
    error,
  };
}

function sendData(res, status, data, metadata) {
  res.status(status).json(envelope(data, null, metadata));
}

function sendError(res, status, error) {
  res.status(status).json(envelope(null, error));
}

module.exports = { sendData, sendError };
