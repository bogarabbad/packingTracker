const express = require('express');
const health = require('./health');
const { createCatalogRouter } = require('./catalog');

const router = express.Router();

router.use(health);
router.use('/unidades-estatus', createCatalogRouter('UNIDADES_ESTATUS'));
router.use('/unidades-tipos', createCatalogRouter('UNIDADES_TIPOS'));

module.exports = router;
