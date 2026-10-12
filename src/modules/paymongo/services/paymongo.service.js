const logger = require("../../../utils/logger");

const PAYMONGO_BASE_URL = process.env.PAYMONGO_BASE_URL || "https://api.paymongo.com/v1";
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || "";
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY || "";

function getAuthHeader() {
  const token = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Create a PayMongo Checkout Session for POS / Quotations
 * Supports: GCash, Maya, QR Ph, Credit/Debit Card, GrabPay
 */
async function createCheckoutSession({
  amount, // in PHP (e.g. 250.50)
  description = "Pointify POS Transaction",
  referenceNumber,
  customerName,
  customerEmail,
  customerPhone,
  lineItems = [],
  metadata = {},
  successUrl,
  cancelUrl,
}) {
  try {
    // PayMongo expects amount in centavos (integer, minimum 2000 = 20.00 PHP)
    const amountInCentavos = Math.round(Number(amount) * 100);
    if (amountInCentavos < 2000) {
      throw new Error("PayMongo minimum transaction amount is ₱20.00.");
    }

    const formattedLineItems =
      Array.isArray(lineItems) && lineItems.length > 0
        ? lineItems.map((item) => ({
            currency: "PHP",
            amount: Math.round(Number(item.unitPrice || item.price || item.amount) * 100),
            name: String(item.name || item.itemName || item.description || "Item").slice(0, 100),
            quantity: Math.max(1, parseInt(item.quantity || 1, 10)),
          }))
        : [
            {
              currency: "PHP",
              amount: amountInCentavos,
              name: description.slice(0, 100),
              quantity: 1,
            },
          ];

    const payload = {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: description.slice(0, 255),
          payment_method_types: ["gcash", "paymaya", "card", "qrph", "grab_pay", "dob"],
          line_items: formattedLineItems,
          success_url: successUrl || undefined,
          cancel_url: cancelUrl || undefined,
          metadata: {
            referenceNumber: referenceNumber || undefined,
            ...metadata,
          },
        },
      },
    };

    if (customerName || customerEmail || customerPhone) {
      payload.data.attributes.billing = {
        name: customerName || undefined,
        email: customerEmail || undefined,
        phone: customerPhone || undefined,
      };
    }

    const response = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.errors) {
      const errDetail = data.errors?.[0]?.detail || "Failed to create PayMongo checkout session.";
      logger.error("PayMongo Checkout Session Error", { errors: data.errors });
      throw new Error(errDetail);
    }

    const sessionAttr = data.data.attributes;
    return {
      sessionId: data.data.id,
      checkoutUrl: sessionAttr.checkout_url,
      clientKey: sessionAttr.client_key,
      status: sessionAttr.status, // active | paid | expired
      paymentIntentId: sessionAttr.payment_intent?.id,
      paymentIntentStatus: sessionAttr.payment_intent?.attributes?.status,
      amount: sessionAttr.line_items?.reduce((s, i) => s + (i.amount * i.quantity) / 100, 0) || amount,
      paymentMethodAllowed: sessionAttr.payment_method_types,
      createdAt: sessionAttr.created_at,
    };
  } catch (error) {
    logger.error("createCheckoutSession error", { error: error.message });
    throw error;
  }
}

/**
 * Retrieve status of a PayMongo Checkout Session
 */
async function getCheckoutSessionStatus(sessionId) {
  try {
    const response = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: getAuthHeader(),
      },
    });

    const data = await response.json();
    if (!response.ok || data.errors) {
      const errDetail = data.errors?.[0]?.detail || "Failed to fetch checkout session status.";
      throw new Error(errDetail);
    }

    const attr = data.data.attributes;
    const payments = attr.payments || [];
    const isPaid =
      payments.some((p) => p.attributes?.status === "paid") ||
      attr.status === "paid" ||
      attr.payment_intent?.attributes?.status === "succeeded";

    let paymentMethod = "PAYMONGO";
    if (payments.length > 0) {
      paymentMethod = payments[0].attributes?.source?.type || payments[0].attributes?.payment_method_type || "PAYMONGO";
    }

    return {
      sessionId: data.data.id,
      status: isPaid ? "paid" : attr.status,
      isPaid,
      paymentMethod: String(paymentMethod).toUpperCase(),
      payments: payments.map((p) => ({
        id: p.id,
        amount: (p.attributes?.amount || 0) / 100,
        status: p.attributes?.status,
        paidAt: p.attributes?.paid_at,
      })),
      checkoutUrl: attr.checkout_url,
    };
  } catch (error) {
    logger.error("getCheckoutSessionStatus error", { error: error.message });
    throw error;
  }
}

/**
 * Create a simple Payment Link via PayMongo Links API
 */
async function createPaymentLink({ amount, description, remarks }) {
  try {
    const amountInCentavos = Math.round(Number(amount) * 100);
    const payload = {
      data: {
        attributes: {
          amount: amountInCentavos,
          description: String(description || "Pointify Payment").slice(0, 255),
          remarks: remarks || "POS-SALE",
        },
      },
    };

    const response = await fetch(`${PAYMONGO_BASE_URL}/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || data.errors) {
      const errDetail = data.errors?.[0]?.detail || "Failed to create payment link.";
      throw new Error(errDetail);
    }

    return {
      linkId: data.data.id,
      checkoutUrl: data.data.attributes.checkout_url,
      referenceNumber: data.data.attributes.reference_number,
      status: data.data.attributes.status,
      amount: data.data.attributes.amount / 100,
    };
  } catch (error) {
    logger.error("createPaymentLink error", { error: error.message });
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  getCheckoutSessionStatus,
  createPaymentLink,
  PAYMONGO_PUBLIC_KEY,
};
