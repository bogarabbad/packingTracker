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

module.exports = router;
