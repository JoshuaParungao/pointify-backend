const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { requireBranchAccess } = require("../../../middlewares/branchAccess.middleware");
const { loginRateLimit } = require("../../../middlewares/loginRateLimit.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const authController = require("../controllers/auth.controller");
const { loginSchema, updateProfileSchema, verifyPasswordSchema } = require("../validations/auth.validation");

const router = express.Router();

router.post("/login", loginRateLimit, validate(loginSchema), authController.login);
router.get("/bootstrap-demo", async (req, res) => {
  try {
    const { ensureDemoAccounts } = require("../../../utils/demoBootstrap");
    const result = await ensureDemoAccounts();
    res.json({ success: true, message: "Demo accounts verified and active", result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/me", protect, authController.getMe);
router.patch("/profile", protect, validate(updateProfileSchema), authController.updateProfile);
router.post("/verify-password", protect, validate(verifyPasswordSchema), authController.verifyPassword);

router.get(
  "/permission-test/settings",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  authController.permissionTest
);

router.get(
  "/branch-test/:branchId",
  protect,
  requireBranchAccess("params"),
  authController.branchAccessTest
);

module.exports = router;
