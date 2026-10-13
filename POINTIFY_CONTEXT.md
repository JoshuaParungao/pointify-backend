# Pointify Project Context & Developer Handover

## 1. Project Overview & Scope
- **Project Name:** Pointify
- **Full Title:** *Pointify: A Point-of-Sale System with OCR-Assisted Quotation Processing and PayMongo Integration*
- **Authors / Developers:** Parungao, Joshua O., Musngi, Bern Ricel B., Musngi, Lance Kyle A.
- **Client / Domain:** Med C Drugstore & Medical Supplies (generalized architecture for retail and wholesale).

## 2. Tech Stack & Architecture
- **Frontend:**
  - Vite + React SPA
  - Styling: Vanilla CSS with custom design system tokens (Minimalist aesthetic, Primary Royal Blue `#1E60FF`, Dark `#0D4FE0`, Slate Neutrals, Ice Light `#EFF6FF`).
  - Repository: `https://github.com/JoshuaParungao/pointify.git`
- **Backend:**
  - Node.js (Express 5), CommonJS
  - Database & ORM: PostgreSQL with Prisma ORM (`@prisma/client`, `@prisma/adapter-pg`, `pg`)
  - Utilities: `pdf-parse`, `multer`, `bcryptjs`, `jsonwebtoken`, `zod`
  - Repository: `https://github.com/JoshuaParungao/pointify-backend.git`
- **Deployment Platform:**
  - Self-hosted **Coolify** on VPS (Traefik reverse proxy, Nixpacks build packs, internal PostgreSQL).

## 3. Core Special Features Implemented
1. **OCR-Assisted Quotation Processing:**
   - Upload quotation PDF (`/api/quotations/ocr-parse` via Multer and `pdf-parse`).
   - Extracts customer name, contact, lines, prices, and matches existing inventory catalog.
   - Frontend: `OcrQuotationModal.jsx` integrated into `QuotationsPage.jsx`.
2. **PayMongo Digital Payment & Webhooks (Sandbox):**
   - Services: `paymongo.service.js` generates Checkout Sessions (QR Ph, GCash, Maya, Cards).
   - Controller & Routes: `paymongo.controller.js` with HMAC-SHA256 signature verification on `/api/payments/paymongo/webhook`.
   - Frontend: `PayMongoCheckoutModal.jsx` in `PosSalesPage.jsx` with real-time QR display, status polling, and sandbox simulation actions.
   - Keys strictly managed via environment variables (`PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`).

## 4. Key Configurations
- **Coolify Backend Environment Variables:**
  - `PORT=5000`
  - `NODE_ENV=production`
  - `TRUST_PROXY=1`
  - `DATABASE_URL=postgresql://...`
  - `JWT_SECRET=...`
  - `CORS_ORIGINS=https://your-frontend-domain`
  - `PAYMONGO_SECRET_KEY=sk_test_...`
  - `PAYMONGO_PUBLIC_KEY=pk_test_...`
- **Coolify Frontend Environment Variables:**
  - `VITE_API_BASE_URL=https://your-backend-domain/api`
