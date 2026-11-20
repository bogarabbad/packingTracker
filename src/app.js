const path = require('path');
const express = require('express');
const routes = require('./routes');
const web = require('./routes/web');
const authenticate = require('./middleware/authenticate');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(authenticate);
  app.use(web);
  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
