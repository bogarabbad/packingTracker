function envelope(data, error) {
  return {
    data,
    _metadata: {},
    error,
  };
}

function sendData(res, status, data) {
  res.status(status).json(envelope(data, null));
}

function sendError(res, status, error) {
  res.status(status).json(envelope(null, error));
}

module.exports = { sendData, sendError };
