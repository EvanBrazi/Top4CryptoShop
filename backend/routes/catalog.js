'use strict';
const express = require('express');
const catalog = require('../services/catalogService');
const OrderError = require('../utils/orderError');
const router = express.Router();
for (const category of ['apps', 'games', 'cryptos', 'balances']) {
  router.get(`/${category}`, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(catalog.getCategory(category)); }
    catch (error) {
      res.status(error instanceof OrderError ? error.status : 503).json({ success: false,
        code: error instanceof OrderError ? error.code : 'FULFILLMENT_CONFIGURATION_INVALID', error: 'The category catalog is unavailable' });
    }
  });
}
module.exports = router;
