const express = require("express");

const quotationController = require("../controllers/quotation.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const {
  createQuotationSchema,
  updateQuotationSchema,
  updateQuotationStatusSchema,
  listServiceStaffSchema,
  listQuotationsSchema,
  quotationIdParamSchema,
} = require("../validations/quotation.validation");

const router = express.Router();

router.use(protect);


router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  validate(listQuotationsSchema),
  quotationController.getQuotations
);

router.get(
  "/service-staff",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  validate(listServiceStaffSchema),
  quotationController.getEligibleServiceStaff
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  validate(quotationIdParamSchema),
  quotationController.getQuotationById
);



router.patch(
  "/:id/status",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(updateQuotationStatusSchema),
  quotationController.updateQuotationStatus
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(updateQuotationSchema),
  quotationController.updateQuotation
);

const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("ONLY_PDF_ALLOWED: Only PDF quotation documents are supported."));
    }
  },
});

router.post(
  "/ocr-parse",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  upload.single("file"),
  quotationController.parseQuotationPdf
);

router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(createQuotationSchema),
  quotationController.createQuotation
);

module.exports = router;
