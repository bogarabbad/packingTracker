const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

router.get('/catalogos/unidades-transporte', (req, res) => {
  res.render('unidades-transporte');
});

router.get('/catalogos/unidades-tipos', (req, res) => {
  res.render('unidades-tipos');
});

router.get('/catalogos/unidades-estatus', (req, res) => {
  res.render('unidades-estatus');
});

router.get('/catalogos/unidades-medida', (req, res) => {
  res.render('unidades-medida');
});

router.get('/catalogos/lotes-tipos', (req, res) => {
  res.render('lotes-tipos');
});

router.get('/catalogos/referencias-tipos', (req, res) => {
  res.render('referencias-tipos');
});

router.get('/catalogos/ubicaciones', (req, res) => {
  res.render('ubicaciones');
});

router.get('/catalogos/ubicaciones-categorias', (req, res) => {
  res.render('ubicaciones-categorias');
});

router.get('/operacion/lotes', (req, res) => {
  res.render('lotes');
});

router.get('/operacion/expediciones', (req, res) => {
  res.render('expediciones');
});

router.get('/operacion/expediciones/:id', (req, res) => {
  res.render('expedicion-detalle', { expedicionId: req.params.id });
});

module.exports = router;
