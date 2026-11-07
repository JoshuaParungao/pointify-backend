const express = require("express");
const {
  getHealthStatus,
  getCatalogStatus,
  triggerCatalogImport,
} = require("../controllers/health.controller");

const router = express.Router();

router.get("/", getHealthStatus);
router.get("/catalog-status", getCatalogStatus);
router.post("/catalog-import", triggerCatalogImport);

module.exports = router;
