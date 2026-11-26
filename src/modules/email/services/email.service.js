const logger = require("../../../utils/logger");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || "POSynctify Warranty <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

/**
 * Send Warranty E-Receipt Email via Resend
 */
async function sendWarrantyReceiptEmail({ sale, recipientEmail, pdfBase64 }) {
  if (!recipientEmail || !recipientEmail.trim()) {
    throw new Error("Recipient email address is required.");
  }

  const cleanRecipient = recipientEmail.trim().toLowerCase();
  const receiptCode = sale.receiptCode || `REC-${sale.id.slice(-6).toUpperCase()}`;
  const customerName = sale.customer?.fullName || sale.customerName || "Valued Customer";
  const branchName = sale.branch?.name || "POSynctify Main Branch";
  const branchAddress = sale.branch?.address || "Philippines";
  const branchPhone = sale.branch?.phone || "";
  const saleDate = sale.saleDate ? new Date(sale.saleDate).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) : new Date().toLocaleDateString();

  const items = sale.items || sale.saleItems || [];

  // Generate Items Table HTML
  const itemsHtml = items.map((it, idx) => {
    const desc = it.description || it.item?.itemName || "Item";
    const qty = it.quantity || 1;
    const serial = it.serialNumber ? `<code style="background: #eff6ff; color: #1e60ff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; border: 1px solid #bfdbfe;">${it.serialNumber}</code>` : `<span style="color: #94a3b8;">None</span>`;
    const warranty = it.warrantyDuration || it.item?.warrantyDuration || "Standard Warranty";
    const unitPrice = Number(it.unitPrice || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
    const lineTotal = Number(it.lineTotal || (Number(it.unitPrice || 0) * qty)).toLocaleString("en-PH", { minimumFractionDigits: 2 });

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 600;">
          ${desc}
          <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
            Serial: ${serial} &bull; Warranty: <strong style="color: #0f172a;">${warranty}</strong>
          </div>
        </td>
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; text-align: center;">${qty}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; text-align: right; font-family: monospace;">₱${unitPrice}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: bold; text-align: right; font-family: monospace;">₱${lineTotal}</td>
      </tr>
    `;
  }).join("");

  const grandTotalFormatted = Number(sale.grandTotal || sale.totalAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Official Warranty Receipt</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #1e60ff 0%, #0036b3 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">POSYNCTIFY STORE & SERVICES</h1>
          <p style="margin: 6px 0 0; font-size: 12px; opacity: 0.9;">Official Warranty E-Receipt & Proof of Purchase</p>
          <div style="display: inline-block; margin-top: 14px; background: rgba(255, 255, 255, 0.18); padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
            RECEIPT NO: ${receiptCode}
          </div>
        </div>

        <!-- Body Content -->
        <div style="padding: 24px;">
          <!-- Greeting & Details Grid -->
          <div style="margin-bottom: 20px;">
            <p style="margin: 0 0 14px; font-size: 14px; color: #334155;">
              Dear <strong>${customerName}</strong>,
            </p>
            <p style="margin: 0 0 16px; font-size: 13px; color: #475569; line-height: 1.5;">
              Thank you for choosing <strong>POSynctify</strong>! Here is the electronic copy of your Warranty Receipt for your records. Please save this email and the attached PDF for any warranty or service requests.
            </p>

            <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: #f8fafc; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0;">
              <tr>
                <td style="padding: 6px 12px; color: #64748b; font-weight: 600;">Transaction Date:</td>
                <td style="padding: 6px 12px; color: #0f172a; font-weight: bold;">${saleDate}</td>
              </tr>
              <tr>
                <td style="padding: 6px 12px; color: #64748b; font-weight: 600;">Branch Location:</td>
                <td style="padding: 6px 12px; color: #0f172a; font-weight: 600;">${branchName} ${branchAddress ? `&bull; ${branchAddress}` : ""}</td>
              </tr>
              ${branchPhone ? `
              <tr>
                <td style="padding: 6px 12px; color: #64748b; font-weight: 600;">Store Contact:</td>
                <td style="padding: 6px 12px; color: #0f172a;">${branchPhone}</td>
              </tr>` : ""}
            </table>
          </div>

          <!-- Items Table -->
          <div style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 10px; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">
              Purchased Items & Warranty Coverage
            </h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 8px 12px;">Item & Serial</th>
                  <th style="padding: 8px 12px; text-align: center;">Qty</th>
                  <th style="padding: 8px 12px; text-align: right;">Price</th>
                  <th style="padding: 8px 12px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr style="background: #f8fafc; border-top: 2px solid #cbd5e1;">
                  <td colspan="3" style="padding: 12px; font-size: 13px; font-weight: 800; color: #0f172a; text-align: right; text-transform: uppercase;">
                    Total Amount Paid:
                  </td>
                  <td style="padding: 12px; font-size: 15px; font-weight: 900; color: #1e60ff; text-align: right; font-family: monospace;">
                    ₱${grandTotalFormatted}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Warranty Policy Box -->
          <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 6px; font-size: 12px; font-weight: bold; color: #92400e; text-transform: uppercase;">
              Important Warranty Guidelines
            </h4>
            <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: #78350f; line-height: 1.5;">
              <li>Please keep your item's <strong>Warranty Sticker</strong> and <strong>Serial Barcode</strong> intact. Damaged or tampered stickers automatically void the warranty.</li>
              <li>Present this electronic receipt or printed copy along with the unit when filing for repair or replacement claims.</li>
              <li>Warranty covers factory and manufacturer defects. Physical damage, liquid spills, burnt ICs, or unauthorized modifications are not covered.</li>
            </ul>
          </div>

          <!-- Footer note -->
          <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center; font-style: italic;">
            * This electronic document serves as an official Warranty Receipt copy and is not valid for claiming input tax.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #0f172a; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 11px;">
          <p style="margin: 0 0 4px; color: #ffffff; font-weight: bold;">POSynctify Cloud POS & Business Monitoring System</p>
          <p style="margin: 0;">Automated Customer E-Receipt Delivery &bull; All Rights Reserved &copy; ${new Date().getFullYear()}</p>
        </div>

      </div>
    </body>
    </html>
  `;

  // Process attachments
  const attachments = [];
  if (pdfBase64) {
    let cleanBase64 = pdfBase64;
    if (cleanBase64.includes(",")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }
    attachments.push({
      filename: `Warranty-Receipt-${receiptCode}.pdf`,
      content: cleanBase64,
    });
  }

  const payload = {
    from: DEFAULT_FROM,
    to: [cleanRecipient],
    subject: `Official Warranty Receipt: ${receiptCode} - POSynctify`,
    html: htmlContent,
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json();

    if (!response.ok) {
      const errorMsg = resData?.message || resData?.error || "Failed to send email via Resend.";
      logger.error("Resend API Email Delivery Failed", { status: response.status, resData });
      
      // Friendly message if unverified domain restriction applies
      if (errorMsg.includes("testing emails to your own email address") || errorMsg.includes("verify your domain")) {
        throw new Error(
          `Resend Sandbox Mode: Sa testing domain (onboarding@resend.dev), maaari lamang magpadala sa account email mo. Para sa lahat ng customer email, i-verify ang sariling domain sa resend.com/domains.`
        );
      }
      throw new Error(errorMsg);
    }

    logger.info("Warranty receipt email dispatched successfully", {
      saleId: sale.id,
      receiptCode,
      recipient: cleanRecipient,
      resendId: resData.id,
    });

    return {
      success: true,
      messageId: resData.id,
      recipient: cleanRecipient,
    };
  } catch (err) {
    logger.error("Error in sendWarrantyReceiptEmail", { error: err.message });
    throw err;
  }
}

module.exports = {
  sendWarrantyReceiptEmail,
};
