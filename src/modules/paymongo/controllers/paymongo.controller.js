const paymongoService = require("../services/paymongo.service");
const logger = require("../../../utils/logger");

/**
 * In-memory map for sandbox simulation fallback
 */
const simulatedSessions = new Map();

/**
 * POST /api/v1/payments/paymongo/checkout-session
 */
const createCheckoutSession = async (req, res, next) => {
  try {
    const {
      amount,
      description,
      referenceNumber,
      customerName,
      customerEmail,
      customerPhone,
      lineItems,
      metadata,
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid transaction amount is required.",
      });
    }

    const session = await paymongoService.createCheckoutSession({
      amount: Number(amount),
      description: description || `Pointify Order ${referenceNumber || ""}`,
      referenceNumber,
      customerName,
      customerEmail,
      customerPhone,
      lineItems,
      metadata,
    });

    return res.status(200).json({
      success: true,
      message: "PayMongo checkout session created successfully.",
      data: session,
    });
  } catch (error) {
    logger.error("PayMongo controller createCheckoutSession error", { error: error.message });
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to initiate PayMongo payment session.",
    });
  }
};

/**
 * GET /api/v1/payments/paymongo/status/:id
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const sessionId = req.params.id;

    // Check if locally simulated
    if (simulatedSessions.has(sessionId)) {
      const sim = simulatedSessions.get(sessionId);
      return res.status(200).json({
        success: true,
        data: sim,
      });
    }

    const statusData = await paymongoService.getCheckoutSessionStatus(sessionId);
    return res.status(200).json({
      success: true,
      data: statusData,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to check payment status.",
    });
  }
};

/**
 * POST /api/v1/payments/paymongo/simulate/:id
 * Development & Thesis Demo tool: Simulates customer completing payment
 */
const simulatePayment = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const { paymentMethod = "GCASH" } = req.body;

    simulatedSessions.set(sessionId, {
      sessionId,
      status: "paid",
      isPaid: true,
      paymentMethod: String(paymentMethod).toUpperCase(),
      simulated: true,
      paidAt: Math.floor(Date.now() / 1000),
    });

    logger.info("PayMongo sandbox payment simulated", { sessionId, paymentMethod });

    return res.status(200).json({
      success: true,
      message: "Sandbox payment simulation successful.",
      data: simulatedSessions.get(sessionId),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to simulate payment.",
    });
  }
};

const crypto = require("crypto");

/**
 * Verify PayMongo Webhook Signature
 * Header format: t=<timestamp>,te=<test_signature>,li=<live_signature>
 */
function verifyPayMongoSignature(payloadString, signatureHeader, webhookSecret) {
  if (!webhookSecret) return true; // Skip if no secret is set yet
  if (!signatureHeader) return false;

  try {
    const parts = signatureHeader.split(",");
    let timestamp = "";
    let testSignature = "";
    let liveSignature = "";

    for (const part of parts) {
      const [key, val] = part.split("=");
      if (key === "t") timestamp = val;
      if (key === "te") testSignature = val;
      if (key === "li") liveSignature = val;
    }

    const signatureToVerify = testSignature || liveSignature;
    if (!timestamp || !signatureToVerify) return false;

    const comparisonString = `${timestamp}.${payloadString}`;
    const computedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(comparisonString)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signatureToVerify)
    );
  } catch (err) {
    logger.warn("Signature verification exception", { error: err.message });
    return false;
  }
}

/**
 * POST /api/v1/payments/paymongo/webhook
 * Authenticated webhook listener from PayMongo
 * Supports: checkout_session.payment.paid, payment.paid, link.payment.paid, qr.paid
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signatureHeader = req.headers["paymongo-signature"] || req.headers["Paymongo-Signature"];
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (webhookSecret && signatureHeader) {
      const rawPayload = JSON.stringify(req.body);
      const isValid = verifyPayMongoSignature(rawPayload, signatureHeader, webhookSecret);
      if (!isValid) {
        logger.warn("PayMongo Webhook Signature Mismatch Rejected", { signatureHeader });
        return res.status(401).json({ received: false, error: "Invalid signature" });
      }
    }

    const event = req.body?.data;
    if (!event) {
      return res.status(400).json({ received: false, message: "Invalid webhook payload format." });
    }

    const eventType = event.attributes?.type;
    const eventData = event.attributes?.data;

    logger.info("PayMongo Webhook Event Dispatched", {
      id: event.id,
      type: eventType,
      targetId: eventData?.id,
    });

    const isPaidEvent = [
      "checkout_session.payment.paid",
      "payment.paid",
      "link.payment.paid",
      "qr.paid",
    ].includes(eventType);

    if (isPaidEvent) {
      const sessionId =
        eventData?.attributes?.checkout_session_id ||
        eventData?.attributes?.external_reference_number ||
        eventData?.id;

      const sourceInfo =
        eventData?.attributes?.source?.type ||
        eventData?.attributes?.payment_method_type ||
        "PAYMONGO";

      if (sessionId) {
        simulatedSessions.set(sessionId, {
          sessionId,
          status: "paid",
          isPaid: true,
          paymentMethod: String(sourceInfo).toUpperCase(),
          paidAt: eventData?.attributes?.paid_at || Math.floor(Date.now() / 1000),
          webhookConfirmed: true,
          amount: (eventData?.attributes?.amount || 0) / 100,
        });

        logger.info("PayMongo Payment Confirmed via Webhook", {
          sessionId,
          source: sourceInfo,
          amount: (eventData?.attributes?.amount || 0) / 100,
        });
      }
    }

    // PayMongo expects 200 OK to confirm receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error("PayMongo Webhook handling error", { error: error.message });
    return res.status(200).json({ received: true });
  }
};

module.exports = {
  createCheckoutSession,
  getPaymentStatus,
  simulatePayment,
  handleWebhook,
};
