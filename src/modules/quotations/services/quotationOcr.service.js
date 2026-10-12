const pdfParse = require("pdf-parse");
const prisma = require("../../../config/prisma");
const logger = require("../../../utils/logger");

/**
 * Clean and parse money strings like "₱1,250.50", "PHP 500", "1,200.00"
 */
function parseMoney(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Clean string text
 */
function cleanText(val) {
  return String(val || "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Smart token similarity for item matching
 */
function calculateSimilarity(str1, str2) {
  const s1 = String(str1 || "").toLowerCase().trim();
  const s2 = String(str2 || "").toLowerCase().trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const tokens1 = new Set(s1.split(/[\s\-_,./]+/));
  const tokens2 = new Set(s2.split(/[\s\-_,./]+/));
  let intersection = 0;
  for (const t of tokens1) {
    if (t.length > 2 && tokens2.has(t)) intersection++;
  }
  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Parse quotation lines and text extracted from PDF
 */
function extractQuotationDetails(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => cleanText(l))
    .filter((l) => l.length > 0);

  const documentInfo = {
    quotationNumber: "",
    date: "",
    validUntil: "",
    preparedBy: "",
    rawTextLength: rawText.length,
  };

  const customer = {
    name: "",
    contactNumber: "",
    email: "",
    address: "",
  };

  const financials = {
    subtotal: 0,
    discount: 0,
    tax: 0,
    totalAmount: 0,
  };

  const extractedItems = [];

  // Patterns for document & customer metadata
  const quoteNoRegex = /(?:quotation\s*(?:#|no\.?|code|ref)?|quote\s*(?:#|no\.?)?)\s*[:#-]?\s*([A-Za-z0-9\-_]+)/i;
  const dateRegex = /(?:date|dated|quotation\s*date)\s*[:#-]?\s*([A-Za-z0-9\s,\/\-]+(?:,\s*\d{4}|\d{4}))/i;
  const validRegex = /(?:valid\s*until|validity|valid\s*thru|expiry)\s*[:#-]?\s*([A-Za-z0-9\s,\/\-]+)/i;
  const customerRegex = /(?:customer|client|sold\s*to|bill\s*to|quote\s*to|recipient|name)\s*[:#-]?\s*([^\n\r,;|]+)/i;
  const phoneRegex = /(?:contact|phone|tel|mobile|cell)\s*[:#-]?\s*([0-9\+\-\s\(\)]{7,20})/i;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const totalRegex = /(?:grand\s*total|total\s*amount|total\s*due|net\s*total|amount\s*due)\s*[:#-]?\s*(?:php|p|₱)?\s*([\d,]+\.?\d*)/i;
  const subtotalRegex = /(?:subtotal|sub-total|sub\s*total)\s*[:#-]?\s*(?:php|p|₱)?\s*([\d,]+\.?\d*)/i;
  const discountRegex = /(?:discount|less)\s*[:#-]?\s*(?:php|p|₱)?\s*([\d,]+\.?\d*)/i;

  // Header skip patterns
  const headerWords = ["description", "item", "qty", "quantity", "unit price", "price", "amount", "total", "subtotal", "terms", "notes"];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Document Info
    if (!documentInfo.quotationNumber) {
      const qMatch = line.match(quoteNoRegex);
      if (qMatch && qMatch[1] && qMatch[1].length >= 3) {
        documentInfo.quotationNumber = qMatch[1].trim();
      }
    }
    if (!documentInfo.date) {
      const dMatch = line.match(dateRegex);
      if (dMatch && dMatch[1]) {
        documentInfo.date = dMatch[1].trim();
      }
    }
    if (!documentInfo.validUntil) {
      const vMatch = line.match(validRegex);
      if (vMatch && vMatch[1]) {
        documentInfo.validUntil = vMatch[1].trim();
      }
    }

    // Check Customer Info
    if (!customer.name) {
      const cMatch = line.match(customerRegex);
      if (cMatch && cMatch[1] && cMatch[1].length > 2) {
        const potentialName = cMatch[1].trim();
        // Ignore if it's a generic word like "Cashier" or "Store"
        if (!potentialName.toLowerCase().includes("quotation") && !potentialName.toLowerCase().includes("pointify")) {
          customer.name = potentialName;
        }
      }
    }
    if (!customer.contactNumber) {
      const pMatch = line.match(phoneRegex);
      if (pMatch && pMatch[1]) {
        customer.contactNumber = pMatch[1].trim();
      }
    }
    if (!customer.email) {
      const eMatch = line.match(emailRegex);
      if (eMatch && eMatch[1]) {
        customer.email = eMatch[1].trim();
      }
    }

    // Financial Totals
    const tMatch = line.match(totalRegex);
    if (tMatch && tMatch[1]) {
      const parsedTotal = parseMoney(tMatch[1]);
      if (parsedTotal > 0 && parsedTotal > financials.totalAmount) {
        financials.totalAmount = parsedTotal;
      }
    }

    const sMatch = line.match(subtotalRegex);
    if (sMatch && sMatch[1]) {
      const parsedSub = parseMoney(sMatch[1]);
      if (parsedSub > 0) financials.subtotal = parsedSub;
    }

    const disMatch = line.match(discountRegex);
    if (disMatch && disMatch[1]) {
      const parsedDis = parseMoney(disMatch[1]);
      if (parsedDis > 0) financials.discount = parsedDis;
    }

    // Line Items parsing
    // Pattern 1: Table row with Description + Qty + UnitPrice + LineTotal
    // e.g., "Paracetamol 500mg 10 25.00 250.00" or "Item A | 2 | 100.00 | 200.00"
    const isHeaderLine = headerWords.filter((w) => line.toLowerCase().includes(w)).length >= 3;
    if (isHeaderLine) continue;

    // Regex matches: Description, Qty (int or float), UnitPrice, LineTotal
    const tableRowRegex = /^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:pcs?|units?|box(?:es)?|packs?|sets?|kg|g|vials?|tabs?|caps?)?\s*(?:php|p|₱)?\s*([\d,]+\.?\d*)\s+(?:php|p|₱)?\s*([\d,]+\.?\d*)$/i;
    const rowMatch = line.match(tableRowRegex);

    if (rowMatch) {
      const rawDesc = cleanText(rowMatch[1]).replace(/^[0-9]+[\.\-\|\s]+/, ""); // remove leading item number
      const qty = parseFloat(rowMatch[2]) || 1;
      const unitPrice = parseMoney(rowMatch[3]);
      const lineTotal = parseMoney(rowMatch[4]) || qty * unitPrice;

      if (rawDesc.length > 1 && unitPrice > 0) {
        extractedItems.push({
          rawDescription: rawDesc,
          quantity: qty,
          unitPrice,
          lineTotal,
        });
        continue;
      }
    }

    // Pattern 2: Pipe or tab separated row
    // e.g. "Paracetamol | 10 | 25.00 | 250.00"
    if (line.includes("|") || line.includes("\t")) {
      const parts = line.split(/[|\t]+/).map((p) => cleanText(p));
      if (parts.length >= 3) {
        const potentialDesc = parts[0].replace(/^[0-9]+[\.\-\s]+/, "");
        const potentialQty = parseFloat(parts[1]);
        const potentialPrice = parseMoney(parts[2]);
        const potentialTotal = parts[3] ? parseMoney(parts[3]) : potentialQty * potentialPrice;

        if (potentialDesc.length > 2 && !isNaN(potentialQty) && potentialPrice > 0) {
          extractedItems.push({
            rawDescription: potentialDesc,
            quantity: potentialQty,
            unitPrice: potentialPrice,
            lineTotal: potentialTotal || potentialQty * potentialPrice,
          });
          continue;
        }
      }
    }

    // Pattern 3: Description followed by price on the same line or next line
    // e.g., "5x Amoxicillin 500mg @ 10.00 = 50.00"
    const atMatch = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(.+?)\s*@?\s*(?:php|p|₱)?\s*([\d,]+\.?\d*)(?:\s*=\s*(?:php|p|₱)?\s*([\d,]+\.?\d*))?$/i);
    if (atMatch) {
      const qty = parseFloat(atMatch[1]) || 1;
      const rawDesc = cleanText(atMatch[2]);
      const unitPrice = parseMoney(atMatch[3]);
      const lineTotal = atMatch[4] ? parseMoney(atMatch[4]) : qty * unitPrice;

      if (rawDesc.length > 1 && unitPrice > 0) {
        extractedItems.push({
          rawDescription: rawDesc,
          quantity: qty,
          unitPrice,
          lineTotal,
        });
      }
    }
  }

  // Calculate financials if not explicitly found in header
  if (financials.subtotal === 0 && extractedItems.length > 0) {
    financials.subtotal = extractedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }
  if (financials.totalAmount === 0) {
    financials.totalAmount = Math.max(0, financials.subtotal - financials.discount + financials.tax);
  }

  return {
    documentInfo,
    customer,
    financials,
    items: extractedItems,
  };
}

/**
 * Match extracted items and customer with Pointify database records
 */
async function matchWithDatabase(parsedData, branchId) {
  const { customer, items } = parsedData;

  // 1. Try matching customer
  let matchedCustomer = null;
  if (customer.name && customer.name.length >= 2) {
    const searchTerms = customer.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const existingCustomers = await prisma.customer.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        status: "ACTIVE",
      },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        address: true,
        priceTier: true,
      },
      take: 20,
    });

    for (const ec of existingCustomers) {
      const sim = calculateSimilarity(ec.fullName, customer.name);
      if (sim >= 0.7) {
        matchedCustomer = {
          id: ec.id,
          customerCode: ec.customerCode,
          fullName: ec.fullName,
          mobileNumber: ec.mobileNumber || customer.contactNumber,
          email: ec.email || customer.email,
          address: ec.address || customer.address,
          priceTier: ec.priceTier,
          matchConfidence: sim,
        };
        break;
      }
    }
  }

  // 2. Fetch catalog items for matching
  const catalogItems = await prisma.item.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: "ACTIVE",
    },
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      barcode: true,
      price1: true,
      price2: true,
      price3: true,
      costPrice: true,
      isSerialized: true,
      hasWarranty: true,
    },
    take: 500,
  });

  const enrichedItems = items.map((item) => {
    let bestMatch = null;
    let highestSim = 0;

    for (const ci of catalogItems) {
      const simName = calculateSimilarity(ci.itemName, item.rawDescription);
      const simCode = ci.itemCode && item.rawDescription.toLowerCase().includes(ci.itemCode.toLowerCase()) ? 0.95 : 0;
      const simBarcode = ci.barcode && item.rawDescription.toLowerCase().includes(ci.barcode.toLowerCase()) ? 1.0 : 0;

      const sim = Math.max(simName, simCode, simBarcode);
      if (sim > highestSim && sim >= 0.5) {
        highestSim = sim;
        bestMatch = ci;
      }
    }

    if (bestMatch) {
      return {
        ...item,
        matchedItemId: bestMatch.id,
        matchedItemCode: bestMatch.itemCode,
        matchedItemName: bestMatch.itemName,
        catalogPrice: Number(bestMatch.price1),
        isSerialized: bestMatch.isSerialized,
        hasWarranty: bestMatch.hasWarranty,
        matchConfidence: highestSim,
        isCatalogMatch: true,
      };
    }

    return {
      ...item,
      matchedItemId: null,
      matchedItemCode: null,
      matchedItemName: null,
      catalogPrice: item.unitPrice,
      isSerialized: false,
      hasWarranty: false,
      matchConfidence: 0,
      isCatalogMatch: false,
    };
  });

  return {
    ...parsedData,
    matchedCustomer,
    items: enrichedItems,
  };
}

/**
 * Main OCR Processing function
 */
async function processQuotationPdfBuffer(pdfBuffer, branchId) {
  try {
    const parsedPdf = await pdfParse(pdfBuffer);
    const rawText = parsedPdf.text || "";

    if (!rawText.trim()) {
      throw new Error("EMPTY_PDF_TEXT: Unable to extract text content from the uploaded quotation PDF.");
    }

    const structured = extractQuotationDetails(rawText);
    const enriched = await matchWithDatabase(structured, branchId);

    return {
      success: true,
      rawTextSummary: {
        totalPages: parsedPdf.numpages || 1,
        totalChars: rawText.length,
      },
      data: enriched,
    };
  } catch (err) {
    logger.error("OCR PDF Parse error", { error: err.message, stack: err.stack });
    throw err;
  }
}

module.exports = {
  processQuotationPdfBuffer,
  extractQuotationDetails,
  matchWithDatabase,
};
