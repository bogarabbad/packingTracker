const express = require('express');
const health = require('./health');
const { createCatalogRouter } = require('./catalog');
const unidadesTransporte = require('./unidadesTransporte');

const router = express.Router();

router.use(health);
router.use('/unidades-estatus', createCatalogRouter('UNIDADES_ESTATUS'));
router.use('/unidades-tipos', createCatalogRouter('UNIDADES_TIPOS'));
router.use('/lotes-tipos', createCatalogRouter('LOTES_TIPOS'));
router.use('/unidades-transporte', unidadesTransporte);

module.exports = router;
