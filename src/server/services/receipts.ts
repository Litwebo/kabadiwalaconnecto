import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { EPR_DISCLAIMER, formatDateTimeIN, formatINR } from '../../shared/format.ts';
import type { ReceiptPayload } from '../../shared/types.ts';

function getHmacSecret(): string {
  return process.env.RECEIPT_HMAC_SECRET || 'dev-receipt-hmac-secret-change-in-production';
}

export function canonicalizePayload(payload: ReceiptPayload): string {
  return JSON.stringify({
    receiptId: payload.receiptId,
    bookingId: payload.bookingId,
    issuedAt: payload.issuedAt,
    collectorName: payload.collectorName,
    collectorArea: payload.collectorArea,
    recyclerBusinessName: payload.recyclerBusinessName,
    recyclerRegistrationNumber: payload.recyclerRegistrationNumber,
    mode: payload.mode,
    items: payload.items.map((i) => ({
      categoryId: i.categoryId,
      declaredKg: i.declaredKg,
      weighedKg: i.weighedKg,
      ratePerKg: i.ratePerKg,
      lineTotal: i.lineTotal,
    })),
    totalDeclaredKg: payload.totalDeclaredKg,
    totalWeighedKg: payload.totalWeighedKg,
    grossAmount: payload.grossAmount,
    transportCost: payload.transportCost,
    netAmount: payload.netAmount,
    handoverLocation: payload.handoverLocation,
  });
}

export function signReceiptPayload(payload: ReceiptPayload): string {
  return crypto.createHmac('sha256', getHmacSecret()).update(canonicalizePayload(payload)).digest('hex');
}

export function verifyReceiptSignature(payload: ReceiptPayload, signature: string): boolean {
  const expected = signReceiptPayload(payload);
  if (!signature || expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function toAsciiPdfSafe(text: string): string {
  return text.replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, ' ');
}

export async function generateReceiptPdf(
  payload: ReceiptPayload,
  signature: string,
  verifyUrl: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const monoBold = await doc.embedFont(StandardFonts.CourierBold);

  const copper = rgb(0.69, 0.29, 0.09);
  const dark = rgb(0.08, 0.13, 0.1);
  const muted = rgb(0.36, 0.42, 0.39);
  const border = rgb(0.8, 0.84, 0.82);

  let y = 795;
  const left = 42;
  const right = 553;

  // Header
  page.drawText('KABADIWALA CONNECT', { x: left, y, size: 18, font: fontBold, color: copper });
  page.drawText('VERIFIED WEIGHBRIDGE HANDOVER RECEIPT', {
    x: left,
    y: y - 18,
    size: 10,
    font: monoBold,
    color: dark,
  });
  page.drawText(toAsciiPdfSafe(`Receipt ID: ${payload.receiptId}`), {
    x: left,
    y: y - 34,
    size: 9,
    font: mono,
    color: muted,
  });
  page.drawText(toAsciiPdfSafe(`Issued: ${formatDateTimeIN(payload.issuedAt)}`), {
    x: left,
    y: y - 47,
    size: 9,
    font: mono,
    color: muted,
  });

  // QR code in top-right
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
  const qrBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: right - 92, y: y - 62, width: 88, height: 88 });
  page.drawText('Scan to verify', { x: right - 82, y: y - 73, size: 8, font: mono, color: muted });

  y -= 92;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: border, dashArray: [4, 3] });
  y -= 20;

  // Parties (No phone numbers exposed!)
  page.drawText('COLLECTOR', { x: left, y, size: 8, font: monoBold, color: muted });
  page.drawText('REGISTERED RECYCLER', { x: 300, y, size: 8, font: monoBold, color: muted });
  y -= 15;
  page.drawText(toAsciiPdfSafe(payload.collectorName), { x: left, y, size: 11, font: fontBold, color: dark });
  page.drawText(toAsciiPdfSafe(payload.recyclerBusinessName), { x: 300, y, size: 11, font: fontBold, color: dark });
  y -= 14;
  page.drawText(toAsciiPdfSafe(`Area: ${payload.collectorArea}`), { x: left, y, size: 9, font, color: muted });
  page.drawText(toAsciiPdfSafe(`Reg No: ${payload.recyclerRegistrationNumber}`), {
    x: 300,
    y,
    size: 9,
    font: mono,
    color: muted,
  });
  y -= 14;
  page.drawText(toAsciiPdfSafe(`Mode: ${payload.mode}`), { x: left, y, size: 9, font, color: muted });
  page.drawText(toAsciiPdfSafe(payload.recyclerAddress.slice(0, 42)), { x: 300, y, size: 9, font, color: muted });

  y -= 22;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: border, dashArray: [4, 3] });
  y -= 18;

  // Table header
  page.drawText('MATERIAL', { x: left, y, size: 8, font: monoBold, color: muted });
  page.drawText('DECLARED', { x: 255, y, size: 8, font: monoBold, color: muted });
  page.drawText('WEIGHED', { x: 330, y, size: 8, font: monoBold, color: muted });
  page.drawText('RATE/KG', { x: 405, y, size: 8, font: monoBold, color: muted });
  page.drawText('TOTAL', { x: 490, y, size: 8, font: monoBold, color: muted });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: border });
  y -= 16;

  for (const item of payload.items) {
    page.drawText(toAsciiPdfSafe(item.categoryName.slice(0, 34)), { x: left, y, size: 9, font, color: dark });
    page.drawText(`${item.declaredKg.toFixed(1)} kg`, { x: 255, y, size: 9, font: mono, color: muted });
    page.drawText(`${item.weighedKg.toFixed(1)} kg`, { x: 330, y, size: 9, font: monoBold, color: dark });
    page.drawText(toAsciiPdfSafe(formatINR(item.ratePerKg)), { x: 405, y, size: 9, font: mono, color: dark });
    page.drawText(toAsciiPdfSafe(formatINR(item.lineTotal)), { x: 490, y, size: 9, font: monoBold, color: dark });
    y -= 18;
  }

  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: border, dashArray: [4, 3] });
  y -= 20;

  // Totals
  page.drawText('Gross Material Value:', { x: 300, y, size: 10, font, color: dark });
  page.drawText(toAsciiPdfSafe(formatINR(payload.grossAmount)), { x: 475, y, size: 10, font: monoBold, color: dark });
  y -= 16;
  page.drawText('Transport Adjustment:', { x: 300, y, size: 10, font, color: muted });
  page.drawText(toAsciiPdfSafe(`- ${formatINR(payload.transportCost)}`), {
    x: 475,
    y,
    size: 10,
    font: mono,
    color: muted,
  });
  y -= 20;
  page.drawText('NET PAYABLE AMOUNT:', { x: 300, y, size: 11, font: fontBold, color: copper });
  page.drawText(toAsciiPdfSafe(formatINR(payload.netAmount)), {
    x: 475,
    y,
    size: 12,
    font: monoBold,
    color: copper,
  });

  y -= 30;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: border, dashArray: [4, 3] });
  y -= 18;

  // Handover GPS & HMAC Signature
  page.drawText(
    toAsciiPdfSafe(
      `Handover GPS: ${payload.handoverLocation.lat.toFixed(5)}, ${payload.handoverLocation.lng.toFixed(5)} (±${Math.round(payload.handoverLocation.accuracyM)}m)`
    ),
    { x: left, y, size: 8, font: mono, color: muted }
  );
  y -= 14;
  page.drawText(toAsciiPdfSafe(`HMAC-SHA256: ${signature.slice(0, 48)}...`), {
    x: left,
    y,
    size: 8,
    font: mono,
    color: muted,
  });
  y -= 14;
  page.drawText(toAsciiPdfSafe(`Verify Online: ${verifyUrl}`), {
    x: left,
    y,
    size: 8,
    font: mono,
    color: muted,
  });

  // Compliance Disclaimer Box
  y -= 32;
  page.drawRectangle({
    x: left,
    y: y - 24,
    width: right - left,
    height: 36,
    borderColor: copper,
    borderWidth: 1,
    color: rgb(0.99, 0.96, 0.94),
  });
  page.drawText(toAsciiPdfSafe(EPR_DISCLAIMER), {
    x: left + 10,
    y: y - 10,
    size: 8.5,
    font: fontBold,
    color: copper,
  });

  return doc.save();
}
