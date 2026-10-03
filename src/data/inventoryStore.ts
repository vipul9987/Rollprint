import {
  MatrixInventoryItem,
  MatrixStockTransaction,
  MatrixItemWithStock,
  MatrixDashboardMetrics
} from '../types/inventory';

const STORAGE_KEY_ITEMS = 'rollprint_matrix_items_v5';
const STORAGE_KEY_TRANSACTIONS = 'rollprint_matrix_txns_v5';

export function generateMatrixBarcode(
  materialName: string,
  variantSize: string,
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
  const cleanSec = secondaryVariant
    ? `-${secondaryVariant.toUpperCase().replace(/[×]/g, 'X').replace(/[^A-Z0-9]+/g, '-')}`
    : '';

  return `${cleanMat}-${cleanSize}${cleanSec}`;
}

export const INITIAL_MATRIX_ITEMS: MatrixInventoryItem[] = [
  // 1. Backlit Sunlex (Rolls)
  { id: 'bs-102', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.02', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.02', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-132', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.32', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.32', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-163', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.63', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.63', openingStock: 5, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bs-193', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.93', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.93', openingStock: 8, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bs-220', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '2.20', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-2.20', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-254', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '2.54', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-2.54', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-320', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '3.20', unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-3.20', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 2. Backlit Megha (Rolls)
  { id: 'bm-102', materialName: 'Backlit Megha', category: 'Backlit', variantSize: '1.02', unit: 'Rolls', barcode: 'BACKLIT-MEGHA-1.02', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bm-132', materialName: 'Backlit Megha', category: 'Backlit', variantSize: '1.32', unit: 'Rolls', barcode: 'BACKLIT-MEGHA-1.32', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bm-163', materialName: 'Backlit Megha', category: 'Backlit', variantSize: '1.63', unit: 'Rolls', barcode: 'BACKLIT-MEGHA-1.63', openingStock: 6, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bm-193', materialName: 'Backlit Megha', category: 'Backlit', variantSize: '1.93', unit: 'Rolls', barcode: 'BACKLIT-MEGHA-1.93', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bm-254', materialName: 'Backlit Megha', category: 'Backlit', variantSize: '2.54', unit: 'Rolls', barcode: 'BACKLIT-MEGHA-2.54', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bm-320', materialName: 'Backlit Megha', category: 'Backlit', variantSize: '3.20', unit: 'Rolls', barcode: 'BACKLIT-MEGHA-3.20', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 3. Premium M 9 (Rolls)
  { id: 'pm9-102', materialName: 'Premium M 9', category: 'Frontlit Flex', variantSize: '1.02', unit: 'Rolls', barcode: 'PREMIUM-M-9-1.02', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-132', materialName: 'Premium M 9', category: 'Frontlit Flex', variantSize: '1.32', unit: 'Rolls', barcode: 'PREMIUM-M-9-1.32', openingStock: 16, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-163', materialName: 'Premium M 9', category: 'Frontlit Flex', variantSize: '1.63', unit: 'Rolls', barcode: 'PREMIUM-M-9-1.63', openingStock: 9, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-193', materialName: 'Premium M 9', category: 'Frontlit Flex', variantSize: '1.93', unit: 'Rolls', barcode: 'PREMIUM-M-9-1.93', openingStock: 18, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-254', materialName: 'Premium M 9', category: 'Frontlit Flex', variantSize: '2.54', unit: 'Rolls', barcode: 'PREMIUM-M-9-2.54', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-320', materialName: 'Premium M 9', category: 'Frontlit Flex', variantSize: '3.20', unit: 'Rolls', barcode: 'PREMIUM-M-9-3.20', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 4. Premium M 10 BB (Rolls)
  { id: 'pm10-102', materialName: 'Premium M 10 BB', category: 'Frontlit Flex', variantSize: '1.02', unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.02', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm10-132', materialName: 'Premium M 10 BB', category: 'Frontlit Flex', variantSize: '1.32', unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.32', openingStock: 8, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'pm10-163', materialName: 'Premium M 10 BB', category: 'Frontlit Flex', variantSize: '1.63', unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.63', openingStock: 12, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'pm10-193', materialName: 'Premium M 10 BB', category: 'Frontlit Flex', variantSize: '1.93', unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-1.93', openingStock: 7, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'pm10-254', materialName: 'Premium M 10 BB', category: 'Frontlit Flex', variantSize: '2.54', unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-2.54', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm10-320', materialName: 'Premium M 10 BB', category: 'Frontlit Flex', variantSize: '3.20', unit: 'Rolls', barcode: 'PREMIUM-M-10-BB-3.20', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 5. S Print 22 (Rolls)
  { id: 'sp22-102', materialName: 'S Print 22', category: 'Frontlit Flex', variantSize: '1.02', unit: 'Rolls', barcode: 'S-PRINT-22-1.02', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'sp22-132', materialName: 'S Print 22', category: 'Frontlit Flex', variantSize: '1.32', unit: 'Rolls', barcode: 'S-PRINT-22-1.32', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'sp22-163', materialName: 'S Print 22', category: 'Frontlit Flex', variantSize: '1.63', unit: 'Rolls', barcode: 'S-PRINT-22-1.63', openingStock: 8, minStock: 3, active: true, createdAt: '2026-09-02' },
  { id: 'sp22-193', materialName: 'S Print 22', category: 'Frontlit Flex', variantSize: '1.93', unit: 'Rolls', barcode: 'S-PRINT-22-1.93', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'sp22-254', materialName: 'S Print 22', category: 'Frontlit Flex', variantSize: '2.54', unit: 'Rolls', barcode: 'S-PRINT-22-2.54', openingStock: 0, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'sp22-320', materialName: 'S Print 22', category: 'Frontlit Flex', variantSize: '3.20', unit: 'Rolls', barcode: 'S-PRINT-22-3.20', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-02' },

  // 6. Bright FL 26 (Rolls)
  { id: 'bfl26-102', materialName: 'Bright FL 26', category: 'Frontlit Flex', variantSize: '1.02', unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.02', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-132', materialName: 'Bright FL 26', category: 'Frontlit Flex', variantSize: '1.32', unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.32', openingStock: 7, minStock: 3, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-163', materialName: 'Bright FL 26', category: 'Frontlit Flex', variantSize: '1.63', unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.63', openingStock: 10, minStock: 4, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-193', materialName: 'Bright FL 26', category: 'Frontlit Flex', variantSize: '1.93', unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.93', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-254', materialName: 'Bright FL 26', category: 'Frontlit Flex', variantSize: '2.54', unit: 'Rolls', barcode: 'BRIGHT-FL-26-2.54', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-320', materialName: 'Bright FL 26', category: 'Frontlit Flex', variantSize: '3.20', unit: 'Rolls', barcode: 'BRIGHT-FL-26-3.20', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-02' },

  // 7. Vinyl Gloss 80 Mic (Rolls) — Includes 1.27 = 44 Rolls
  { id: 'vg80-094', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '0.94', unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-0.94', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-106', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.06', unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.06', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-127', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.27', unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.27', openingStock: 44, minStock: 5, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-137', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.37', unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.37', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-152', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.52', unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.52', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-03' },

  // 8. Vinyl Gloss 100 Mic (Rolls)
  { id: 'vg100-094', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', variantSize: '0.94', unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-0.94', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg100-106', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.06', unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.06', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg100-127', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.27', unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.27', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg100-137', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.37', unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.37', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg100-152', materialName: 'Vinyl Gloss 100 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.52', unit: 'Rolls', barcode: 'VINYL-GLOSS-100-MIC-1.52', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-03' },

  // 9. Lamination Matt (Rolls)
  { id: 'lm-094', materialName: 'Lamination Matt', category: 'Lamination Film', variantSize: '0.94', unit: 'Rolls', barcode: 'LAMINATION-MATT-0.94', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-04' },
  { id: 'lm-106', materialName: 'Lamination Matt', category: 'Lamination Film', variantSize: '1.06', unit: 'Rolls', barcode: 'LAMINATION-MATT-1.06', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-04' },
  { id: 'lm-127', materialName: 'Lamination Matt', category: 'Lamination Film', variantSize: '1.27', unit: 'Rolls', barcode: 'LAMINATION-MATT-1.27', openingStock: 12, minStock: 4, active: true, createdAt: '2026-09-04' },
  { id: 'lm-137', materialName: 'Lamination Matt', category: 'Lamination Film', variantSize: '1.37', unit: 'Rolls', barcode: 'LAMINATION-MATT-1.37', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-04' },
  { id: 'lm-152', materialName: 'Lamination Matt', category: 'Lamination Film', variantSize: '1.52', unit: 'Rolls', barcode: 'LAMINATION-MATT-1.52', openingStock: 8, minStock: 3, active: true, createdAt: '2026-09-04' },

  // 10. PVC Foam Sheet (Sheets with secondary variant: Thickness)
  { id: 'pvc-84-2', materialName: 'PVC Foam Sheet', category: 'Rigid Sheet', variantSize: '8×4', secondaryVariant: '2mm', unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-2MM', openingStock: 15, minStock: 5, active: true, createdAt: '2026-09-05' },
  { id: 'pvc-84-3', materialName: 'PVC Foam Sheet', category: 'Rigid Sheet', variantSize: '8×4', secondaryVariant: '3mm', unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-3MM', openingStock: 22, minStock: 6, active: true, createdAt: '2026-09-05' },
  { id: 'pvc-84-5', materialName: 'PVC Foam Sheet', category: 'Rigid Sheet', variantSize: '8×4', secondaryVariant: '5mm', unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-8X4-5MM', openingStock: 10, minStock: 4, active: true, createdAt: '2026-09-05' },
  { id: 'pvc-63-3', materialName: 'PVC Foam Sheet', category: 'Rigid Sheet', variantSize: '6×3', secondaryVariant: '3mm', unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-6X3-3MM', openingStock: 8, minStock: 3, active: true, createdAt: '2026-09-05' },
  { id: 'pvc-63-5', materialName: 'PVC Foam Sheet', category: 'Rigid Sheet', variantSize: '6×3', secondaryVariant: '5mm', unit: 'Sheets', barcode: 'PVC-FOAM-SHEET-6X3-5MM', openingStock: 12, minStock: 4, active: true, createdAt: '2026-09-05' }
];

export const INITIAL_MATRIX_TRANSACTIONS: MatrixStockTransaction[] = [
  // Backlit Sunlex 1.63: Opening 5, IN 5, OUT 2 -> Current 8 Rolls
  {
    id: 'tx-1',
    itemId: 'bs-163',
    materialName: 'Backlit Sunlex',
    variantSize: '1.63',
    barcode: 'BACKLIT-SUNLEX-1.63',
    type: 'IN',
    quantity: 5,
    stockBefore: 5,
    stockAfter: 10,
    unit: 'Rolls',
    date: '2026-09-28',
    createdAt: '2026-09-28T09:30:00Z'
  },
  {
    id: 'tx-2',
    itemId: 'bs-163',
    materialName: 'Backlit Sunlex',
    variantSize: '1.63',
    barcode: 'BACKLIT-SUNLEX-1.63',
    type: 'OUT',
    quantity: 2,
    stockBefore: 10,
    stockAfter: 8,
    unit: 'Rolls',
    date: '2026-10-01',
    createdAt: '2026-10-01T14:15:00Z'
  },
  // Premium M 9 1.32: Opening 16, IN 4 -> Current 20 Rolls
  {
    id: 'tx-3',
    itemId: 'pm9-132',
    materialName: 'Premium M 9',
    variantSize: '1.32',
    barcode: 'PREMIUM-M-9-1.32',
    type: 'IN',
    quantity: 4,
    stockBefore: 16,
    stockAfter: 20,
    unit: 'Rolls',
    date: '2026-09-29',
    createdAt: '2026-09-29T11:00:00Z'
  },
  // PVC Foam Sheet 8×4 3mm: Opening 22, OUT 4 -> Current 18 Sheets
  {
    id: 'tx-4',
    itemId: 'pvc-84-3',
    materialName: 'PVC Foam Sheet',
    variantSize: '8×4',
    secondaryVariant: '3mm',
    barcode: 'PVC-FOAM-SHEET-8X4-3MM',
    type: 'OUT',
    quantity: 4,
    stockBefore: 22,
    stockAfter: 18,
    unit: 'Sheets',
    date: '2026-10-02',
    createdAt: '2026-10-02T16:20:00Z'
  }
];

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
    console.error('Failed to save matrix items', e);
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
    console.error('Failed to save matrix transactions', e);
  }
}

/**
 * Calculates current stock dynamically in roll/sheet count:
 * Current Stock (Rolls) = Opening Stock + Total Stock IN - Total Stock OUT
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

    let status: MatrixItemWithStock['status'] = 'IN_STOCK';
    if (currentStock <= 0) {
      status = 'OUT_OF_STOCK';
    } else if (currentStock <= item.minStock) {
      status = 'LOW_STOCK';
    }

    return {
      ...item,
      totalIn,
      totalOut,
      currentStock,
      status
    };
  });
}

/**
 * Calculate Dashboard KPIs across active items in Roll/Sheet counts
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

  const currentStock = activeItems.reduce((sum, i) => sum + i.currentStock, 0);

  const lowStockCount = activeItems.filter((i) => i.status === 'LOW_STOCK').length;
  const outOfStockCount = activeItems.filter((i) => i.status === 'OUT_OF_STOCK').length;

  return {
    totalItems,
    totalStockIn,
    totalStockOut,
    currentStock,
    lowStockCount,
    outOfStockCount
  };
}

/**
 * Returns the direct HTTPS web URL for an item's mobile stock page.
 * Scanned by native phone camera.
 */
export function getItemWebUrl(itemId: string): string {
  if (typeof window === 'undefined') return `/item/${itemId}`;
  const origin = window.location.origin;
  return `${origin}/item/${itemId}`;
}
