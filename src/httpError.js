function httpError(status, error) {
  const err = new Error(error);
  err.status = status;
  err.publicError = error;
  return err;
}

module.exports = { httpError };
