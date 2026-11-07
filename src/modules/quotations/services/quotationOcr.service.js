const zlib = require("zlib");
const pdfParseModule = require("pdf-parse");
const prisma = require("../../../config/prisma");
const logger = require("../../../utils/logger");

/**
 * Pure Node.js fallback PDF text extractor using zlib FlateDecode stream decompression
 */
function extractTextFallbackFromPdfBuffer(pdfBuffer) {
  try {
    const rawLatin1 = Buffer.from(pdfBuffer).toString("latin1");
    const chunks = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(rawLatin1)) !== null) {
      const streamBytes = Buffer.from(match[1], "latin1");
      let decoded = "";
      try {
        decoded = zlib.inflateSync(streamBytes).toString("latin1");
      } catch {
        try {
          decoded = zlib.inflateRawSync(streamBytes).toString("latin1");
        } catch {
          decoded = match[1];
        }
      }

      if (decoded.includes("BT") || decoded.includes("Tj") || decoded.includes("TJ")) {
        const lines = [];
        const tjBlocks = decoded.match(/BT[\s\S]*?ET/g) || [decoded];
        for (const block of tjBlocks) {
          const strMatches = block.match(/\((?:\\.|[^\\()])*\)/g) || [];
          if (strMatches.length > 0) {
            const textLine = strMatches
              .map((s) =>
                s
                  .slice(1, -1)
                  .replace(/\\n/g, "\n")
                  .replace(/\\r/g, " ")
                  .replace(/\\t/g, " ")
                  .replace(/\\\(/g, "(")
                  .replace(/\\\)/g, ")")
                  .replace(/\\\\/g, "\\")
              )
              .join(" ");
            lines.push(textLine);
          }
        }
        if (lines.length > 0) {
          chunks.push(lines.join("\n"));
        }
      }
    }

    return chunks.join("\n");
  } catch {
    return "";
  }
}

/**
 * Extract raw text and page count from a PDF Buffer across pdf-parse v1, v2+, and pure-Node fallback
 */
async function extractTextFromPdfBuffer(pdfBuffer) {
  try {
    if (typeof pdfParseModule === "function") {
      const res = await pdfParseModule(pdfBuffer);
      return {
        text: res?.text || "",
        numpages: res?.numpages || 1,
      };
    }

    if (pdfParseModule && typeof pdfParseModule.PDFParse === "function") {
      const parser = new pdfParseModule.PDFParse({
        data: new Uint8Array(pdfBuffer),
      });
      try {
        const res = await parser.getText();
        return {
          text: res?.text || "",
          numpages: res?.total || res?.pages?.length || 1,
        };
      } finally {
        try {
          await parser.destroy();
        } catch {
          // ignore cleanup error
        }
      }
    }
  } catch (pdfErr) {
    logger.warn("Primary pdf-parse failed, using fallback stream extractor", {
      error: pdfErr.message,
    });
  }

  const fallbackText = extractTextFallbackFromPdfBuffer(pdfBuffer);
  return {
    text: fallbackText,
    numpages: 1,
  };
}

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
 * Clean string text (preserving single spaces)
 */
function cleanText(val) {
  return String(val || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .trim();
}

/**
 * Strip warranty suffix or serial number suffix added by Pointify PDF generator
 * e.g. "Biogesic 500mg Tablet | 7 Days Warranty" -> "Biogesic 500mg Tablet"
 */
function stripItemSuffixes(desc) {
  return String(desc || "")
    .replace(/\s*\|\s*\d+\s*(?:days?|months?|years?|mos?|yrs?)\s*(?:warranty|return|exchange).*$/i, "")
    .replace(/\s*\|\s*(?:no\s*warranty|with\s*warranty|service\s*warranty|replacement\s*part).*$/i, "")
    .replace(/\s*S\/N:\s*.+$/i, "")
    .trim();
}

/**
 * Smart token similarity for item matching
 */
function calculateSimilarity(str1, str2) {
  const s1 = stripItemSuffixes(str1).toLowerCase().trim();
  const s2 = stripItemSuffixes(str2).toLowerCase().trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const tokens1 = new Set(s1.split(/[\s\-_,./|()]+/).filter((t) => t.length > 1));
  const tokens2 = new Set(s2.split(/[\s\-_,./|()]+/).filter((t) => t.length > 1));
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if a line is part of table headers, page footers, or disclaimers
 */
function isNoiseOrHeaderLine(line) {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(lower)) return true;

  const exactHeaders = new Set([
    "item",
    "code",
    "item code",
    "item description",
    "description",
    "qty",
    "qty.",
    "quantity",
    "regular",
    "price",
    "regular price",
    "amount",
    "regular amount",
    "cash",
    "promo",
    "cash promo",
    "cash amount",
    "unit price",
    "line total",
    "total",
    "quotation",
  ]);
  if (exactHeaders.has(lower)) return true;

  if (
    lower.includes("item description") ||
    lower.includes("regular price") ||
    lower.includes("cash promo") ||
    lower.includes("consumables, opened items") ||
    lower.includes("warranty guidelines") ||
    lower.includes("prices are subject to change") ||
    lower.includes("received items in good order") ||
    lower.includes("signature over printed name") ||
    lower.startsWith("prepared by:") ||
    lower.startsWith("salesman:") ||
    lower.startsWith("terms:") ||
    lower.startsWith("date:") ||
    lower.startsWith("customer name:") ||
    lower.startsWith("address:") ||
    lower.startsWith("contact no") ||
    lower.startsWith("total amount") ||
    lower.startsWith("grand total") ||
    lower.startsWith("subtotal") ||
    lower.startsWith("pointify business management")
  ) {
    return true;
  }

  return false;
}

/**
 * Parse quotation lines and text extracted from PDF
 */
function extractQuotationDetails(rawText, originalFilename = "") {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((l) => cleanText(l))
    .filter((l) => l.length > 0);

  const documentInfo = {
    quotationNumber: "",
    date: "",
    validUntil: "",
    preparedBy: "",
    terms: "",
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
  const quoteNoRegex = /(?:quotation|quote)\s*(?:no\.?|#|code|ref)?\s*[:#-]?\s*([A-Za-z0-9\-_]{2,})/i;
  const dateRegex = /\b(?:date|dated|quotation\s*date)\s*[:#-]?\s*([A-Za-z0-9\s,/\-]+(?:,\s*\d{4}|\d{4}))/i;
  const validRegex = /\b(?:valid\s*until|validity|valid\s*thru|expiry)\s*[:#-]?\s*([A-Za-z0-9\s,/\-]+)/i;
  const customerRegex = /\b(?:customer\s*name|customer|client\s*name|client|sold\s*to|bill\s*to|quote\s*to|recipient)\s*[:#-]?\s*([^\n\r;|]+)/i;
  const addressRegex = /\baddress\s*[:#-]?\s*([^\n\r;|]+)/i;
  const phoneRegex = /\b(?:contact\s*(?:no\.?|number|#)?|phone|tel|mobile|cell)\s*[:#-]?\s*([0-9+\-\s()/]{7,25})/i;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const salesmanRegex = /\b(?:salesman|prepared\s*by)\s*[:#-]?\s*([^\n\r;|]+)/i;
  const termsRegex = /\bterms\s*[:#-]?\s*([^\n\r;|]+)/i;
  const totalRegex = /\b(?:grand\s*total|total\s*amount|total\s*due|net\s*total|amount\s*due)\s*[:#-]?\s*(?:php|p|₱)?\s*([\d,]+\.\d{2}|[\d,]+)/i;
  const subtotalRegex = /\b(?:subtotal|sub-total|sub\s*total)\s*[:#-]?\s*(?:php|p|₱)?\s*([\d,]+\.\d{2}|[\d,]+)/i;
  const discountRegex = /\b(?:discount|less)\s*[:#-]?\s*(?:php|p|₱)?\s*([\d,]+\.\d{2}|[\d,]+)/i;

  let isInItemsTable = false;
  let pendingDescParts = [];
  let pendingItemCode = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Detect start/end of items table
    if (
      lower.includes("item description") ||
      (lower.includes("regular") && lower.includes("amount")) ||
      (lower.includes("cash") && lower.includes("amount"))
    ) {
      isInItemsTable = true;
      pendingDescParts = [];
      pendingItemCode = "";
      continue;
    }

    if (
      lower.startsWith("total amount") ||
      lower.startsWith("grand total") ||
      lower.includes("consumables, opened items") ||
      lower.includes("prices are subject to change")
    ) {
      isInItemsTable = false;
      pendingDescParts = [];
      pendingItemCode = "";
    }

    // 1. Document Number
    if (!documentInfo.quotationNumber) {
      const qMatch = line.match(quoteNoRegex);
      if (qMatch && qMatch[1] && !/^(no|code|ref|date)$/i.test(qMatch[1])) {
        documentInfo.quotationNumber = qMatch[1].trim();
      }
    }

    // 2. Date & Validity
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
    if (!documentInfo.preparedBy) {
      const smMatch = line.match(salesmanRegex);
      if (smMatch && smMatch[1] && smMatch[1].trim() !== "-") {
        documentInfo.preparedBy = smMatch[1].trim();
      }
    }
    if (!documentInfo.terms) {
      const tmMatch = line.match(termsRegex);
      if (tmMatch && tmMatch[1]) {
        documentInfo.terms = tmMatch[1].trim();
      }
    }

    // 3. Customer Info
    if (!customer.name) {
      const cMatch = line.match(customerRegex);
      if (cMatch && cMatch[1]) {
        const potentialName = cMatch[1].replace(/^name\s*[:#-]?\s*/i, "").trim();
        if (
          potentialName.length >= 2 &&
          potentialName !== "-" &&
          !potentialName.toLowerCase().includes("quotation") &&
          !potentialName.toLowerCase().includes("pointify")
        ) {
          customer.name = potentialName;
        }
      }
    }
    if (!customer.address) {
      const aMatch = line.match(addressRegex);
      if (aMatch && aMatch[1]) {
        const addr = aMatch[1].trim();
        if (addr && addr !== "-" && addr !== "—") {
          customer.address = addr;
        }
      }
    }
    if (!customer.contactNumber) {
      const pMatch = line.match(phoneRegex);
      if (pMatch && pMatch[1]) {
        const ph = pMatch[1].trim();
        if (ph && ph !== "-" && ph !== "—") {
          customer.contactNumber = ph;
        }
      }
    }
    if (!customer.email) {
      const eMatch = line.match(emailRegex);
      if (eMatch && eMatch[1]) {
        customer.email = eMatch[1].trim();
      }
    }

    // 4. Financial Totals
    const tMatch = line.match(totalRegex);
    if (tMatch && tMatch[1]) {
      const parsedTotal = parseMoney(tMatch[1]);
      if (parsedTotal > 0) {
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

    const isInstallmentTerms = /installment|\bar\b/i.test(documentInfo.terms || "");

    // 5. Line Items Parsing
    // Pattern A1: Pointify 7-column single-line row:
    // "[ItemCode] [Description] [Qty] [RegPrice] [RegAmount] [CashPromo] [CashAmount]"
    const pointifySingleRowRegex = /^(?:([A-Za-z0-9\-_]+|-)\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;
    const pSingleMatch = line.match(pointifySingleRowRegex);
    if (pSingleMatch) {
      const code = pSingleMatch[1] && pSingleMatch[1] !== "-" ? pSingleMatch[1].trim() : "";
      const rawDesc = cleanText(pSingleMatch[2]);
      const qty = parseFloat(pSingleMatch[3]) || 1;
      const regUnit = parseMoney(pSingleMatch[4]);
      const regTotal = parseMoney(pSingleMatch[5]);
      const cashUnit = parseMoney(pSingleMatch[6]);
      const cashTotal = parseMoney(pSingleMatch[7]);

      const unitPrice = isInstallmentTerms ? regUnit : (cashUnit || regUnit);
      const lineTotal = isInstallmentTerms ? regTotal : (cashTotal || regTotal || qty * unitPrice);

      if (rawDesc && unitPrice > 0) {
        extractedItems.push({
          rawItemCode: code,
          rawDescription: stripItemSuffixes(rawDesc) || rawDesc,
          quantity: qty,
          unitPrice,
          lineTotal,
        });
        pendingDescParts = [];
        pendingItemCode = "";
        isInItemsTable = true;
        continue;
      }
    }

    // Pattern A2: Pointify multi-line wrapped row where current line is ONLY numbers:
    // "[Qty] [RegPrice] [RegAmount] [CashPromo] [CashAmount]"
    const pointifyNumbersOnlyRegex = /^(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;
    const pNumbersMatch = line.match(pointifyNumbersOnlyRegex);
    if (pNumbersMatch && pendingDescParts.length > 0) {
      const combinedDesc = cleanText(pendingDescParts.join(" "));
      const qty = parseFloat(pNumbersMatch[1]) || 1;
      const regUnit = parseMoney(pNumbersMatch[2]);
      const regTotal = parseMoney(pNumbersMatch[3]);
      const cashUnit = parseMoney(pNumbersMatch[4]);
      const cashTotal = parseMoney(pNumbersMatch[5]);

      const unitPrice = isInstallmentTerms ? regUnit : (cashUnit || regUnit);
      const lineTotal = isInstallmentTerms ? regTotal : (cashTotal || regTotal || qty * unitPrice);

      if (combinedDesc && unitPrice > 0) {
        extractedItems.push({
          rawItemCode: pendingItemCode,
          rawDescription: stripItemSuffixes(combinedDesc) || combinedDesc,
          quantity: qty,
          unitPrice,
          lineTotal,
        });
      }
      pendingDescParts = [];
      pendingItemCode = "";
      isInItemsTable = true;
      continue;
    }

    // Pattern B1: Standard 2-price-column single-line row:
    // "[Description] [Qty] [UnitPrice] [LineTotal]"
    if (!isNoiseOrHeaderLine(line)) {
      const tableRowRegex = /^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:pcs?|units?|box(?:es)?|packs?|sets?|kg|g|vials?|tabs?|caps?)?\s*(?:php|p|₱)?\s*([\d,]+\.\d{2}|[\d,]+)\s+(?:php|p|₱)?\s*([\d,]+\.\d{2}|[\d,]+)$/i;
      const rowMatch = line.match(tableRowRegex);
      if (rowMatch) {
        const rawDesc = cleanText(rowMatch[1]).replace(/^[0-9]+[.\-|\s]+/, "");
        const qty = parseFloat(rowMatch[2]) || 1;
        const unitPrice = parseMoney(rowMatch[3]);
        const lineTotal = parseMoney(rowMatch[4]) || qty * unitPrice;

        if (rawDesc.length > 1 && unitPrice > 0) {
          extractedItems.push({
            rawItemCode: "",
            rawDescription: stripItemSuffixes(rawDesc) || rawDesc,
            quantity: qty,
            unitPrice,
            lineTotal,
          });
          pendingDescParts = [];
          pendingItemCode = "";
          continue;
        }
      }

      // Pattern B2: Multi-line wrapped description followed by "[Qty] [UnitPrice] [LineTotal]"
      const twoPricesNumbersOnlyRegex = /^(\d+(?:\.\d+)?)\s+(?:php|p|₱)?\s*([\d,]+\.\d{2})\s+(?:php|p|₱)?\s*([\d,]+\.\d{2})$/i;
      const twoPricesMatch = line.match(twoPricesNumbersOnlyRegex);
      if (twoPricesMatch && pendingDescParts.length > 0) {
        const combinedDesc = cleanText(pendingDescParts.join(" "));
        const qty = parseFloat(twoPricesMatch[1]) || 1;
        const unitPrice = parseMoney(twoPricesMatch[2]);
        const lineTotal = parseMoney(twoPricesMatch[3]) || qty * unitPrice;

        if (combinedDesc && unitPrice > 0) {
          extractedItems.push({
            rawItemCode: pendingItemCode,
            rawDescription: stripItemSuffixes(combinedDesc) || combinedDesc,
            quantity: qty,
            unitPrice,
            lineTotal,
          });
        }
        pendingDescParts = [];
        pendingItemCode = "";
        continue;
      }

      // Pattern C: Pipe or tab separated row
      if (line.includes("|") || line.includes("\t")) {
        const parts = line.split(/[|\t]+/).map((p) => cleanText(p));
        if (parts.length >= 3) {
          const potentialDesc = parts[0].replace(/^[0-9]+[.\-\s]+/, "");
          const potentialQty = parseFloat(parts[1]);
          const potentialPrice = parseMoney(parts[2]);
          const potentialTotal = parts[3] ? parseMoney(parts[3]) : potentialQty * potentialPrice;

          if (potentialDesc.length > 2 && !isNaN(potentialQty) && potentialPrice > 0) {
            extractedItems.push({
              rawItemCode: "",
              rawDescription: stripItemSuffixes(potentialDesc) || potentialDesc,
              quantity: potentialQty,
              unitPrice: potentialPrice,
              lineTotal: potentialTotal || potentialQty * potentialPrice,
            });
            pendingDescParts = [];
            pendingItemCode = "";
            continue;
          }
        }
      }

      // Pattern D: "5x Amoxicillin 500mg @ 10.00 = 50.00"
      const atMatch = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(.+?)\s*@?\s*(?:php|p|₱)?\s*([\d,]+\.?\d*)(?:\s*=\s*(?:php|p|₱)?\s*([\d,]+\.?\d*))?$/i);
      if (atMatch) {
        const qty = parseFloat(atMatch[1]) || 1;
        const rawDesc = cleanText(atMatch[2]);
        const unitPrice = parseMoney(atMatch[3]);
        const lineTotal = atMatch[4] ? parseMoney(atMatch[4]) : qty * unitPrice;

        if (rawDesc.length > 1 && unitPrice > 0) {
          extractedItems.push({
            rawItemCode: "",
            rawDescription: stripItemSuffixes(rawDesc) || rawDesc,
            quantity: qty,
            unitPrice,
            lineTotal,
          });
          pendingDescParts = [];
          pendingItemCode = "";
          continue;
        }
      }

      // If we are inside the items table and this line is text (wrapped item description), buffer it!
      if (isInItemsTable) {
        if (pendingDescParts.length === 0) {
          const codeMatch = line.match(/^([A-Z]{2,6}-[A-Za-z0-9\-]+|-)\s+(.+)$/);
          if (codeMatch) {
            pendingItemCode = codeMatch[1] !== "-" ? codeMatch[1].trim() : "";
            pendingDescParts.push(codeMatch[2].trim());
          } else {
            pendingDescParts.push(line);
          }
        } else {
          pendingDescParts.push(line);
        }
      }
    }
  }

  // Fallback: extract quotation number from filename (e.g. "Quotation_00003.pdf" -> "00003")
  if (!documentInfo.quotationNumber && originalFilename) {
    const fnMatch = String(originalFilename).match(/(?:quotation|quote)[_\-\s#]*([A-Za-z0-9\-]+)/i);
    if (fnMatch && fnMatch[1]) {
      documentInfo.quotationNumber = fnMatch[1].replace(/\.pdf$/i, "").trim();
    }
  }

  // Calculate financials if not explicitly found in footer
  const computedSubtotal = extractedItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  if (financials.subtotal === 0 && computedSubtotal > 0) {
    financials.subtotal = Math.round(computedSubtotal * 100) / 100;
  }
  if (financials.totalAmount === 0 && computedSubtotal > 0) {
    financials.totalAmount = Math.round(Math.max(0, financials.subtotal - financials.discount + financials.tax) * 100) / 100;
  }

  return {
    documentInfo,
    customer,
    financials,
    items: extractedItems,
  };
}

/**
 * Match extracted items, quotation number, and customer with Pointify database records
 */
async function matchWithDatabase(parsedData, branchId) {
  let { documentInfo, customer, financials, items } = parsedData;

  // 0. If quotationNumber matches an existing Pointify Quotation in DB, cross-check & enrich!
  let matchedQuotation = null;
  if (documentInfo.quotationNumber) {
    try {
      const cleanNum = documentInfo.quotationNumber.replace(/^0+/, "") || "0";
      const padded4 = cleanNum.padStart(4, "0");
      const padded5 = cleanNum.padStart(5, "0");
      const dbQuotations = await prisma.quotation.findMany({
        where: {
          ...(branchId ? { branchId } : {}),
          OR: [
            { quotationCode: { equals: documentInfo.quotationNumber, mode: "insensitive" } },
            { quotationCode: { equals: padded5, mode: "insensitive" } },
            { quotationCode: { equals: padded4, mode: "insensitive" } },
            { quotationCode: { endsWith: `-${padded5}`, mode: "insensitive" } },
            { quotationCode: { endsWith: `-${padded4}`, mode: "insensitive" } },
            { quotationCode: { endsWith: `-${cleanNum}`, mode: "insensitive" } },
            { quotationCode: { contains: documentInfo.quotationNumber, mode: "insensitive" } },
          ],
        },
        include: {
          customer: true,
          items: {
            include: {
              item: true,
            },
            orderBy: { lineNo: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      });

      if (dbQuotations.length > 0) {
        matchedQuotation = dbQuotations[0];
        documentInfo.quotationNumber = matchedQuotation.quotationCode;

        if (!customer.name && matchedQuotation.customer?.fullName) {
          customer.name = matchedQuotation.customer.fullName;
          customer.contactNumber = customer.contactNumber || matchedQuotation.customer.mobileNumber || "";
          customer.email = customer.email || matchedQuotation.customer.email || "";
          customer.address = customer.address || matchedQuotation.customer.address || "";
        }

        // If PDF text extraction missed items or had partial lines, use the exact DB quotation items
        if (items.length === 0 && Array.isArray(matchedQuotation.items) && matchedQuotation.items.length > 0) {
          items = matchedQuotation.items.map((qi) => ({
            rawItemCode: qi.item?.itemCode || qi.itemCodeSnapshot || "",
            rawDescription: qi.item?.itemName || qi.itemNameSnapshot || qi.description || "Quotation Item",
            quantity: Number(qi.quantity || 1),
            unitPrice: Number(qi.unitPrice || 0),
            lineTotal: Number(qi.lineTotal || 0),
          }));
          financials.subtotal = Number(matchedQuotation.subtotal || 0);
          financials.discount = Number(matchedQuotation.totalDiscount || 0);
          financials.totalAmount = Number(matchedQuotation.grandTotal || 0);
        }
      }
    } catch (dbLookupErr) {
      logger.warn("Quotation DB cross-check skipped", { error: dbLookupErr.message });
    }
  }

  // 1. Try matching customer
  let matchedCustomer = null;
  if (matchedQuotation?.customer) {
    const ec = matchedQuotation.customer;
    matchedCustomer = {
      id: ec.id,
      customerCode: ec.customerCode,
      fullName: ec.fullName,
      mobileNumber: ec.mobileNumber || customer.contactNumber,
      email: ec.email || customer.email,
      address: ec.address || customer.address,
      priceTier: ec.priceTier,
      matchConfidence: 1.0,
    };
  } else if (customer.name && customer.name.length >= 2) {
    try {
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
        take: 100,
      });

      let bestCustSim = 0;
      for (const ec of existingCustomers) {
        const sim = calculateSimilarity(ec.fullName, customer.name);
        if (sim >= 0.7 && sim > bestCustSim) {
          bestCustSim = sim;
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
        }
      }
    } catch (custErr) {
      logger.warn("Customer matching skipped", { error: custErr.message });
    }
  }

  // 2. Fetch catalog items for matching
  let catalogItems = [];
  try {
    catalogItems = await prisma.item.findMany({
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
        price4: true,
        price5: true,
        costPrice: true,
        isSerialized: true,
        hasWarranty: true,
        description: true,
        inventoryBatches: {
          where: { status: "ACTIVE" },
          select: { quantityAvailable: true },
        },
      },
      take: 1000,
    });
  } catch (itemErr) {
    logger.warn("Catalog item lookup skipped", { error: itemErr.message });
  }

  const enrichedItems = items.map((item) => {
    let bestMatch = null;
    let highestSim = 0;

    for (const ci of catalogItems) {
      const exactCodeMatch =
        item.rawItemCode &&
        ci.itemCode &&
        ci.itemCode.toLowerCase() === item.rawItemCode.toLowerCase()
          ? 1.0
          : 0;
      const simName = calculateSimilarity(ci.itemName, item.rawDescription);
      const simCode =
        ci.itemCode &&
        item.rawDescription.toLowerCase().includes(ci.itemCode.toLowerCase())
          ? 0.95
          : 0;
      const simBarcode =
        ci.barcode &&
        item.rawDescription.toLowerCase().includes(ci.barcode.toLowerCase())
          ? 1.0
          : 0;

      const sim = Math.max(exactCodeMatch, simName, simCode, simBarcode);
      if (sim > highestSim && sim >= 0.5) {
        highestSim = sim;
        bestMatch = ci;
      }
    }

    if (bestMatch) {
      const availableStock = (bestMatch.inventoryBatches || []).reduce(
        (sum, b) => sum + Number(b.quantityAvailable || 0),
        0
      );
      const hasWarranty = Boolean(bestMatch.hasWarranty);
      let warrantyDuration = "NO WARRANTY";
      if (hasWarranty) {
        const descMatch = (bestMatch.description || "").match(/\[WARRANTY:\s*([^\]]+)\]/i);
        warrantyDuration = descMatch?.[1] ? descMatch[1].trim() : (bestMatch.isSerialized ? "1 YEAR WARRANTY" : "7 DAYS REPLACEMENT");
      }

      return {
        ...item,
        matchedItemId: bestMatch.id,
        matchedItemCode: bestMatch.itemCode,
        matchedItemName: bestMatch.itemName,
        catalogPrice: Number(bestMatch.price1 || 0),
        price1: Number(bestMatch.price1 || 0),
        price2: Number(bestMatch.price2 || bestMatch.price1 || 0),
        price3: Number(bestMatch.price3 || bestMatch.price1 || 0),
        price4: Number(bestMatch.price4 || bestMatch.price1 || 0),
        price5: Number(bestMatch.price5 || bestMatch.price1 || 0),
        availableQuantity: availableStock,
        availableStock,
        isSerialized: Boolean(bestMatch.isSerialized),
        hasWarranty,
        warrantyDuration,
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
    documentInfo,
    customer,
    financials,
    matchedCustomer,
    matchedQuotationId: matchedQuotation?.id || null,
    items: enrichedItems,
  };
}

/**
 * Main OCR Processing function
 */
async function processQuotationPdfBuffer(pdfBuffer, branchId, originalFilename = "") {
  try {
    const parsedPdf = await extractTextFromPdfBuffer(pdfBuffer);
    const rawText = parsedPdf.text || "";

    const structured = extractQuotationDetails(rawText, originalFilename);
    const enriched = await matchWithDatabase(structured, branchId);

    const isScannedImageOnly = rawText.trim().length < 20;
    if (isScannedImageOnly) {
      enriched.isScannedImageOnly = true;
      enriched.scannedWarning =
        "Scanned/Image-only document detected. No selectable text layer found in this PDF. Please upload a digital PDF with selectable text or manually enter quotation items.";
    }

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
