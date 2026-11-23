const express = require('express');
const health = require('./health');
const auth = require('./auth');
const { createCatalogRouter } = require('./catalog');
const unidadesTransporte = require('./unidadesTransporte');
const lotesTiposUnidades = require('./lotesTiposUnidades');
const lotesReferencias = require('./lotesReferencias');
const lotesProductos = require('./lotesProductos');
const lotes = require('./lotes');
const expediciones = require('./expediciones');
const expedicionesLotes = require('./expedicionesLotes');

const router = express.Router();

router.use(health);
router.use('/auth', auth);
router.use('/unidades-estatus', createCatalogRouter('UNIDADES_ESTATUS'));
router.use('/unidades-tipos', createCatalogRouter('UNIDADES_TIPOS'));
router.use('/lotes-tipos', createCatalogRouter('LOTES_TIPOS'));
router.use('/lotes-tipos-unidades', lotesTiposUnidades);
router.use('/referencias-tipos', createCatalogRouter('REFERENCIAS_TIPOS'));
router.use('/lotes-referencias', lotesReferencias);
router.use('/lotes-productos', lotesProductos);
router.use('/lotes', lotes);
router.use('/expediciones-lotes', expedicionesLotes);
router.use('/expediciones', expediciones);
router.use('/unidades-medida', createCatalogRouter('UNIDADES'));
router.use('/unidades-transporte', unidadesTransporte);

module.exports = router;
