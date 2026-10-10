import {
  MatrixInventoryItem,
  MatrixStockTransaction,
  MatrixItemWithStock,
  MatrixDashboardMetrics,
  InventorySummaryGroup,
  MatrixBatch
} from '../types/inventory';

const STORAGE_KEY_ITEMS = 'rollprint_client_excel_matrix_v8';
const STORAGE_KEY_TRANSACTIONS = 'rollprint_client_excel_txns_v8';
const STORAGE_KEY_BATCHES = 'rollprint_client_batches_v1';

/**
 * Standard Width Columns for Client Summary Tables
 */
export const FLEX_SUMMARY_WIDTHS = ['1.02', '1.32', '1.63', '1.93', '2.20', '2.54', '3.20'];
export const VINYL_SUMMARY_WIDTHS = ['0.94', '0.98', '1.02', '1.06', '1.27', '1.52', '1.37'];
export const PVC_SHEET_SIZES = ['8×4', '6×3', '5×10'];
export const PVC_THICKNESSES = ['2mm', '3mm', '4mm', '5mm'];

/**
 * Client Excel Row Display Orders
 */
export const CLIENT_FLEX_MATERIALS_ORDER = [
  'Backlit Sunlex',
  'Backlit Megha',
  'Backlit Hetax',
  'Premium M 9',
  'Premium M 10 BB',
  'Premium S 10 BB',
  'BB S/M',
  'Lite',
  'Economy',
  'S Print 22',
  'Bright FL 26',
  'Hi Gloss HL-23',
  'Active'
];

export const CLIENT_VINYL_MATERIALS_ORDER = [
  'Vinyl Gloss 80 Mic',
  'Vinyl Gloss 100 Mic',
  'Vinyl Matt 100 Mic',
  'Premium One Way',
  'Lamination Matt',
  'Lamination Gloss'
];

/**
 * Determines summary group based on explicit field or category/unit
 */
export function getItemSummaryGroup(item: {
  summaryGroup?: InventorySummaryGroup;
  category?: string;
  unit?: string;
  materialName?: string;
}): InventorySummaryGroup {
  if (item.summaryGroup) return item.summaryGroup;
  const unit = item.unit?.toLowerCase() || '';
  const cat = item.category?.toLowerCase() || '';
  const mat = item.materialName?.toLowerCase() || '';

  if (unit === 'sheets' || cat.includes('rigid') || cat.includes('pvc') || mat.includes('pvc')) {
    return 'RIGID_PVC';
  }
  if (cat.includes('vinyl') || cat.includes('lamination') || mat.includes('vinyl') || mat.includes('lamination') || mat.includes('one way')) {
    return 'VINYL_ROLL';
  }
  return 'FLEX_ROLL';
}

/**
 * Generates unique stable barcode
 */
export function generateMatrixBarcode(
  materialName: string,
  variantSize: string,
  rollLengthMtr: number = 70,
  secondaryVariant?: string
): string {
  const cleanMat = materialName
    .toUpperCase()
    .replace(/[×]/g, 'X')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const cleanSize = variantSize
    .toUpperCase()
    .replace(/[×]/g, 'X')
    .replace(/[^A-Z0-9.]+/g, '-')
    .replace(/^-|-$/g, '');
  const cleanLength = rollLengthMtr > 0 ? `-${rollLengthMtr}M` : '';
  const cleanSec = secondaryVariant
    ? `-${secondaryVariant.toUpperCase().replace(/[×]/g, 'X').replace(/[^A-Z0-9]+/g, '-')}`
    : '';

  return `${cleanMat}-${cleanSize}${cleanLength}${cleanSec}`;
}

/**
 * Normalizes Invoice Number for Batch Code Generation only:
 * - Convert invoice letters to uppercase
 * - Remove spaces, hyphens, slashes, special characters
 * - Keep only A-Z and 0-9
 * - Truncate to maximum 9 characters
 *
 * NOTE: Original invoice number is stored separately without truncation!
 */
export function normalizeInvoiceForBatch(rawInvoice: string): string {
  if (!rawInvoice) return '';
  const cleaned = rawInvoice
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, 9);
}

/**
 * Formats a date into DDMMYY format (exactly 6 characters):
 * Supports "YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", or ISO date strings.
 * Example: "2026-10-10" or "10/10/2026" -> "101026"
 */
export function formatDateToDDMMYY(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '';

  const trimmed = dateStr.trim();

  // If already in DD/MM/YYYY or DD-MM-YYYY format
  const slashOrHyphenMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashOrHyphenMatch) {
    const day = slashOrHyphenMatch[1].padStart(2, '0');
    const month = slashOrHyphenMatch[2].padStart(2, '0');
    let year = slashOrHyphenMatch[3];
    if (year.length === 4) year = year.slice(2);
    return `${day}${month}${year}`;
  }

  // If in YYYY-MM-DD or standard HTML date input format
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1].slice(2);
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}${month}${year}`;
  }

  // Fallback to Date parser
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const day = parsed.getDate().toString().padStart(2, '0');
    const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const year = parsed.getFullYear().toString().slice(2);
    return `${day}${month}${year}`;
  }

  return '';
}

/**
 * Generates Batch Number automatically:
 * Formula: DDMMYY (6 chars) + CLEANED_INVOICE_NUMBER (max 9 chars) = Max 15 chars
 *
 * Example:
 * Date: 10/10/2026
 * Invoice: GT28728
 * Batch: 101026GT28728 (13 characters)
 *
 * Long invoice example:
 * Date: 10/10/2026
 * Invoice: GSTINV28728234
 * Normalized (first 9): GSTINV287
 * Batch: 101026GSTINV287 (15 characters)
 */
export function generateBatchNumber(dateStr: string, rawInvoice: string): string {
  const datePart = formatDateToDDMMYY(dateStr);
  const invoicePart = normalizeInvoiceForBatch(rawInvoice);
  if (!datePart && !invoicePart) return '';
  const batch = `${datePart}${invoicePart}`;
  return batch.slice(0, 15);
}

export function getStoredMatrixBatches(): MatrixBatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BATCHES);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveStoredMatrixBatches(batches: MatrixBatch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(batches));
  } catch (e) {
    console.error('Failed to save batches', e);
  }
}

export const INITIAL_MATRIX_ITEMS: MatrixInventoryItem[] = [
  // =========================================================
  // GROUP 1: FLEX / BACKLIT / SIMILAR ROLL MATERIALS
  // Widths: 1.02, 1.32, 1.63, 1.93, 2.20, 2.54, 3.20
  // =========================================================
  // 1. Backlit Sunlex (1: 1.02, 1: 1.32, 5: 1.63, 8: 1.93, 5: 2.54, 0: 3.20 -> Total: 20)
  { id: 'bs-102', materialName: 'Backlit Sunlex', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.02-50M', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-132', materialName: 'Backlit Sunlex', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.32-50M', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-163', materialName: 'Backlit Sunlex', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.63-50M', openingStock: 5, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bs-193', materialName: 'Backlit Sunlex', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.93-50M', openingStock: 8, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bs-254', materialName: 'Backlit Sunlex', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-2.54-50M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-320', materialName: 'Backlit Sunlex', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-3.20-50M', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 2. Backlit Megha (5: 1.93, 7: 2.54 -> Total: 12)
  { id: 'bm-193', materialName: 'Backlit Megha', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-MEGHA-1.93-50M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bm-254', materialName: 'Backlit Megha', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-MEGHA-2.54-50M', openingStock: 7, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 3. Backlit Hetax (2: 1.02, 2: 1.32, 5: 2.54 -> Total: 9)
  { id: 'bh-102', materialName: 'Backlit Hetax', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-HETAX-1.02-50M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bh-132', materialName: 'Backlit Hetax', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-HETAX-1.32-50M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bh-254', materialName: 'Backlit Hetax', category: 'Backlit', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-HETAX-2.54-50M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 4. Premium M 9 (16: 1.32, 9: 1.63, 18: 1.93, 13: 3.20 -> Total: 56)
  { id: 'pm9-132', materialName: 'Premium M 9', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.32-70M', openingStock: 16, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-163', materialName: 'Premium M 9', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.63-70M', openingStock: 9, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-193', materialName: 'Premium M 9', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.93-70M', openingStock: 18, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-320', materialName: 'Premium M 9', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-3.20-70M', openingStock: 13, minStock: 3, active: true, createdAt: '2026-09-01' },

  // 5. Premium M 10 BB (1: 1.32, 9: 1.63, 4: 1.93, 3: 2.54 -> Total: 17)
  { id: 'pm10bb-132', materialName: 'Premium M 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.32-70M', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm10bb-163', materialName: 'Premium M 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.63-70M', openingStock: 9, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'pm10bb-193', materialName: 'Premium M 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.93-70M', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm10bb-254', materialName: 'Premium M 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-2.54-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 6. Premium S 10 BB (3: 1.02, 14: 1.32, 2: 1.63, 6: 1.93, 15: 2.54, 3: 3.20 -> Total: 43)
  { id: 'ps10bb-102', materialName: 'Premium S 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-S-10-BB-1.02-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'ps10bb-132', materialName: 'Premium S 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-S-10-BB-1.32-70M', openingStock: 14, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'ps10bb-163', materialName: 'Premium S 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-S-10-BB-1.63-70M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'ps10bb-193', materialName: 'Premium S 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-S-10-BB-1.93-70M', openingStock: 6, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'ps10bb-254', materialName: 'Premium S 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-S-10-BB-2.54-70M', openingStock: 15, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'ps10bb-320', materialName: 'Premium S 10 BB', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-S-10-BB-3.20-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 7. BB S/M (11: 1.02, 6: 1.32, 10: 1.63, 6: 1.93, 13: 2.54, 10: 3.20 -> Total: 56)
  { id: 'bbsm-102', materialName: 'BB S/M', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BB-S-M-1.02-70M', openingStock: 11, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'bbsm-132', materialName: 'BB S/M', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BB-S-M-1.32-70M', openingStock: 6, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bbsm-163', materialName: 'BB S/M', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BB-S-M-1.63-70M', openingStock: 10, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bbsm-193', materialName: 'BB S/M', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BB-S-M-1.93-70M', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bbsm-254', materialName: 'BB S/M', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BB-S-M-2.54-70M', openingStock: 13, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bbsm-320', materialName: 'BB S/M', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BB-S-M-3.20-70M', openingStock: 10, minStock: 3, active: true, createdAt: '2026-09-01' },

  // 8. Lite (16: 1.63 -> Total: 16)
  { id: 'lite-163', materialName: 'Lite', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'LITE-1.63-70M', openingStock: 16, minStock: 4, active: true, createdAt: '2026-09-01' },

  // 9. Economy (6: 1.63 -> Total: 6)
  { id: 'econ-163', materialName: 'Economy', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ECONOMY-1.63-70M', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 10. S Print 22 (22: 1.02, 16: 1.32, 23: 1.63, 9: 1.93, 12: 2.54, 28: 3.20 -> Total: 110)
  { id: 'sp22-102', materialName: 'S Print 22', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'S-PRINT-22-1.02-70M', openingStock: 22, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'sp22-132', materialName: 'S Print 22', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'S-PRINT-22-1.32-70M', openingStock: 16, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'sp22-163', materialName: 'S Print 22', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'S-PRINT-22-1.63-70M', openingStock: 23, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'sp22-193', materialName: 'S Print 22', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'S-PRINT-22-1.93-70M', openingStock: 9, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'sp22-254', materialName: 'S Print 22', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'S-PRINT-22-2.54-70M', openingStock: 12, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'sp22-320', materialName: 'S Print 22', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'S-PRINT-22-3.20-70M', openingStock: 28, minStock: 5, active: true, createdAt: '2026-09-01' },

  // 11. Bright FL 26 (12: 1.02, 3: 1.32, 21: 1.63, 24: 1.93, 21: 2.54, 3: 3.20 -> Total: 84)
  { id: 'bfl26-102', materialName: 'Bright FL 26', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.02-70M', openingStock: 12, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bfl26-132', materialName: 'Bright FL 26', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.32-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bfl26-163', materialName: 'Bright FL 26', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.63-70M', openingStock: 21, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'bfl26-193', materialName: 'Bright FL 26', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.93-70M', openingStock: 24, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'bfl26-254', materialName: 'Bright FL 26', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-2.54-70M', openingStock: 21, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'bfl26-320', materialName: 'Bright FL 26', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-3.20-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 12. Hi Gloss HL-23 (23: 1.32, 14: 1.63, 33: 1.93, 5: 3.20 -> Total: 75)
  { id: 'hg23-132', materialName: 'Hi Gloss HL-23', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'HI-GLOSS-HL-23-1.32-70M', openingStock: 23, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'hg23-163', materialName: 'Hi Gloss HL-23', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'HI-GLOSS-HL-23-1.63-70M', openingStock: 14, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'hg23-193', materialName: 'Hi Gloss HL-23', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'HI-GLOSS-HL-23-1.93-70M', openingStock: 33, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'hg23-320', materialName: 'Hi Gloss HL-23', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'HI-GLOSS-HL-23-3.20-70M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 13. Active (Blueprint Example)
  { id: 'act-102', materialName: 'Active', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.02-70M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'act-132', materialName: 'Active', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.32-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'act-163', materialName: 'Active', category: 'Flex PVC', summaryGroup: 'FLEX_ROLL', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.63-70M', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-01' },

  // =========================================================
  // GROUP 2: VINYL / LAMINATION MATERIALS
  // Widths: 0.94, 0.98, 1.02, 1.06, 1.27, 1.37, 1.52
  // =========================================================
  // 1. Vinyl Gloss 80 Mic (30: 1.02, 44: 1.27, 9: 1.52 -> Total: 83)
  { id: 'vg80-102', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.02-50M', openingStock: 30, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'vg80-127', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.27-50M', openingStock: 44, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'vg80-152', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.52', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.52-50M', openingStock: 9, minStock: 3, active: true, createdAt: '2026-09-01' },

  // 2. Vinyl Gloss 100 Mic (15: 1.02, 17: 1.27, 15: 1.52 -> Total: 47)
  { id: 'vg100-102', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.02-50M', openingStock: 15, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'vg100-127', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.27-50M', openingStock: 17, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'vg100-152', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.52', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.52-50M', openingStock: 15, minStock: 3, active: true, createdAt: '2026-09-01' },

  // 3. Vinyl Matt 100 Mic (6: 1.02, 7: 1.27, 8: 1.52 -> Total: 21)
  { id: 'vm100-102', materialName: 'Vinyl Matt 100 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-MATT-100-MIC-1.02-50M', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'vm100-127', materialName: 'Vinyl Matt 100 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-MATT-100-MIC-1.27-50M', openingStock: 7, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'vm100-152', materialName: 'Vinyl Matt 100 Mic', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.52', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-MATT-100-MIC-1.52-50M', openingStock: 8, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 4. Premium One Way (Total: 0)
  { id: 'pow-127', materialName: 'Premium One Way', category: 'Self Adhesive Vinyl', summaryGroup: 'VINYL_ROLL', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'PREMIUM-ONE-WAY-1.27-50M', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 5. Lamination Matt (24: 1.02, 10: 1.27, 6: 1.52 -> Total: 40)
  { id: 'lm-102', materialName: 'Lamination Matt', category: 'Lamination Film', summaryGroup: 'VINYL_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'LAMINATION-MATT-1.02-50M', openingStock: 24, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'lm-127', materialName: 'Lamination Matt', category: 'Lamination Film', summaryGroup: 'VINYL_ROLL', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'LAMINATION-MATT-1.27-50M', openingStock: 10, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'lm-152', materialName: 'Lamination Matt', category: 'Lamination Film', summaryGroup: 'VINYL_ROLL', variantSize: '1.52', rollLengthMtr: 50, unit: 'Rolls', barcode: 'LAMINATION-MATT-1.52-50M', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 6. Lamination Gloss (7: 1.02, 5: 1.27, 4: 1.52 -> Total: 16)
  { id: 'lg-102', materialName: 'Lamination Gloss', category: 'Lamination Film', summaryGroup: 'VINYL_ROLL', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'LAMINATION-GLOSS-1.02-50M', openingStock: 7, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'lg-127', materialName: 'Lamination Gloss', category: 'Lamination Film', summaryGroup: 'VINYL_ROLL', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'LAMINATION-GLOSS-1.27-50M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'lg-152', materialName: 'Lamination Gloss', category: 'Lamination Film', summaryGroup: 'VINYL_ROLL', variantSize: '1.52', rollLengthMtr: 50, unit: 'Rolls', barcode: 'LAMINATION-GLOSS-1.52-50M', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },

  // =========================================================
  // GROUP 3: PVC / RIGID MATERIAL SUMMARY
  // Rows: 8×4, 6×3, 5×10 | Columns: 2mm, 3mm, 4mm, 5mm
  // =========================================================
  { id: 'pvc-8x4-2mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '8×4', secondaryVariant: '2mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-2MM', openingStock: 12, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-8x4-3mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '8×4', secondaryVariant: '3mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-3MM', openingStock: 18, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-8x4-4mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '8×4', secondaryVariant: '4mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-4MM', openingStock: 8, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-8x4-5mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '8×4', secondaryVariant: '5mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-5MM', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },

  { id: 'pvc-6x3-2mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '6×3', secondaryVariant: '2mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-6X3-2MM', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-6x3-3mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '6×3', secondaryVariant: '3mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-6X3-3MM', openingStock: 10, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-6x3-4mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '6×3', secondaryVariant: '4mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-6X3-4MM', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-6x3-5mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '6×3', secondaryVariant: '5mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-6X3-5MM', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },

  { id: 'pvc-5x10-2mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '5×10', secondaryVariant: '2mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-5X10-2MM', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-5x10-3mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '5×10', secondaryVariant: '3mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-5X10-3MM', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-5x10-4mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '5×10', secondaryVariant: '4mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-5X10-4MM', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pvc-5x10-5mm', materialName: 'PVC Foam Sheet', category: 'Rigid PVC', summaryGroup: 'RIGID_PVC', variantSize: '5×10', secondaryVariant: '5mm', rollLengthMtr: 0, unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-5X10-5MM', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' }
];

export const INITIAL_MATRIX_TRANSACTIONS: MatrixStockTransaction[] = [];

export function getStoredMatrixItems(): MatrixInventoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(INITIAL_MATRIX_ITEMS));
      return INITIAL_MATRIX_ITEMS;
    }
    const parsed = JSON.parse(raw);
    return parsed.map((item: any) => ({
      ...item,
      summaryGroup: item.summaryGroup || getItemSummaryGroup(item),
      rollLengthMtr: item.rollLengthMtr !== undefined ? item.rollLengthMtr : 70,
      active: item.active !== undefined ? item.active : true
    }));
  } catch {
    return INITIAL_MATRIX_ITEMS;
  }
}

export function saveStoredMatrixItems(items: MatrixInventoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save items', e);
  }
}

export function getStoredMatrixTransactions(): MatrixStockTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(INITIAL_MATRIX_TRANSACTIONS));
      return INITIAL_MATRIX_TRANSACTIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MATRIX_TRANSACTIONS;
  }
}

export function saveStoredMatrixTransactions(transactions: MatrixStockTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to save transactions', e);
  }
}

/**
 * Calculates current stock dynamically in roll count and material area (m²):
 * Current Stock (Rolls) = Opening Stock + Total Stock IN - Total Stock OUT
 * Area Per Roll (m²) = Width × Roll Length
 * Total Area (m²) = Current Stock × Area Per Roll
 */
export function calculateMatrixWithStock(
  items: MatrixInventoryItem[],
  transactions: MatrixStockTransaction[]
): MatrixItemWithStock[] {
  return items.map((item) => {
    const itemTxns = transactions.filter((t) => t.itemId === item.id);
    const totalIn = itemTxns
      .filter((t) => t.type === 'IN')
      .reduce((sum, t) => sum + t.quantity, 0);
    const totalOut = itemTxns
      .filter((t) => t.type === 'OUT')
      .reduce((sum, t) => sum + t.quantity, 0);

    const currentStock = item.openingStock + totalIn - totalOut;

    // Calculate area
    let areaPerRoll = 0;
    if (item.unit === 'Sheets') {
      // e.g. 8x4 feet converted to m²: 8 * 4 * 0.092903 = 2.97 m²
      if (item.variantSize === '8×4') areaPerRoll = 2.97;
      else if (item.variantSize === '6×3') areaPerRoll = 1.67;
      else if (item.variantSize === '5×10') areaPerRoll = 4.65;
      else areaPerRoll = 2.97;
    } else {
      const widthNum = parseFloat(item.variantSize) || 1.0;
      const lengthNum = item.rollLengthMtr || 70;
      areaPerRoll = Number((widthNum * lengthNum).toFixed(2));
    }

    const totalAreaMtr2 = Number((currentStock * areaPerRoll).toFixed(2));

    let status: MatrixItemWithStock['status'] = 'IN_STOCK';
    if (currentStock <= 0) {
      status = 'OUT_OF_STOCK';
    } else if (currentStock <= item.minStock) {
      status = 'LOW_STOCK';
    }

    return {
      ...item,
      summaryGroup: item.summaryGroup || getItemSummaryGroup(item),
      totalIn,
      totalOut,
      currentStock,
      areaPerRoll,
      totalAreaMtr2,
      status
    };
  });
}

/**
 * Calculate Dashboard KPIs across active items in Full Roll counts and Total Area (m²)
 */
export function calculateMatrixDashboardMetrics(
  itemsWithStock: MatrixItemWithStock[],
  transactions: MatrixStockTransaction[]
): MatrixDashboardMetrics {
  const activeItems = itemsWithStock.filter((i) => i.active);

  const totalItems = activeItems.length;

  const totalStockIn = transactions
    .filter((t) => t.type === 'IN')
    .reduce((sum, t) => sum + t.quantity, 0);

  const totalStockOut = transactions
    .filter((t) => t.type === 'OUT')
    .reduce((sum, t) => sum + t.quantity, 0);

  const totalInAreaMtr2 = Number(
    transactions
      .filter((t) => t.type === 'IN')
      .reduce((sum, t) => sum + (t.areaMtr2 || 0), 0)
      .toFixed(2)
  );

  const totalOutAreaMtr2 = Number(
    transactions
      .filter((t) => t.type === 'OUT')
      .reduce((sum, t) => sum + (t.areaMtr2 || 0), 0)
      .toFixed(2)
  );

  const currentStock = activeItems.reduce((sum, i) => sum + i.currentStock, 0);
  const totalAreaMtr2 = Number(
    activeItems.reduce((sum, i) => sum + i.totalAreaMtr2, 0).toFixed(2)
  );

  const lowStockCount = activeItems.filter((i) => i.status === 'LOW_STOCK').length;
  const outOfStockCount = activeItems.filter((i) => i.status === 'OUT_OF_STOCK').length;

  return {
    totalItems,
    totalStockIn,
    totalStockOut,
    currentStock,
    totalAreaMtr2,
    totalInAreaMtr2,
    totalOutAreaMtr2,
    lowStockCount,
    outOfStockCount
  };
}

export function getItemWebUrl(itemId: string): string {
  if (typeof window === 'undefined') return `/item/${itemId}`;
  const origin = window.location.origin;
  return `${origin}/item/${itemId}`;
}
