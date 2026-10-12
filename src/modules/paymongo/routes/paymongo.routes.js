const express = require("express");
const paymongoController = require("../controllers/paymongo.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

// Public Webhook receiver (PayMongo sends POST requests without user JWT auth)
router.post("/webhook", paymongoController.handleWebhook);

// Protected routes (Cashier / POS requires authentication)
router.post("/checkout-session", protect, paymongoController.createCheckoutSession);
router.get("/status/:id", protect, paymongoController.getPaymentStatus);
router.post("/simulate/:id", protect, paymongoController.simulatePayment);

module.exports = router;
