import {
  MatrixInventoryItem,
  MatrixStockTransaction,
  MatrixItemWithStock,
  MatrixDashboardMetrics
} from '../types/inventory';

const STORAGE_KEY_ITEMS = 'rollprint_blueprint_items_v6';
const STORAGE_KEY_TRANSACTIONS = 'rollprint_blueprint_txns_v6';

/**
 * Generates unique stable barcode for Material + Size/Width + Roll Length
 * Example: Active + 1.02 + 70M -> ACTIVE-1.02-70M
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
  const cleanLength = `${rollLengthMtr}M`;
  const cleanSec = secondaryVariant
    ? `-${secondaryVariant.toUpperCase().replace(/[×]/g, 'X').replace(/[^A-Z0-9]+/g, '-')}`
    : '';

  return `${cleanMat}-${cleanSize}-${cleanLength}${cleanSec}`;
}

export const INITIAL_MATRIX_ITEMS: MatrixInventoryItem[] = [
  // 1. Active (Flex PVC) — from client handwritten blueprint
  { id: 'act-102-70', materialName: 'Active', category: 'Flex PVC', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.02-70M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'act-132-70', materialName: 'Active', category: 'Flex PVC', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.32-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'act-163-70', materialName: 'Active', category: 'Flex PVC', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.63-70M', openingStock: 6, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'act-193-70', materialName: 'Active', category: 'Flex PVC', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-1.93-70M', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'act-254-70', materialName: 'Active', category: 'Flex PVC', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-2.54-70M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'act-320-70', materialName: 'Active', category: 'Flex PVC', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'ACTIVE-3.20-70M', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 2. Backlit Sunlex (Backlit, 50M rolls)
  { id: 'bs-102-50', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.02', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.02-50M', openingStock: 1, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-132-50', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.32', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.32-50M', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-163-50', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.63', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.63-50M', openingStock: 5, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bs-193-50', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '1.93', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-1.93-50M', openingStock: 8, minStock: 3, active: true, createdAt: '2026-09-01' },
  { id: 'bs-254-50', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '2.54', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-2.54-50M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'bs-320-50', materialName: 'Backlit Sunlex', category: 'Backlit', variantSize: '3.20', rollLengthMtr: 50, unit: 'Rolls', barcode: 'BACKLIT-SUNLEX-3.20-50M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 3. Premium M 9 (Flex PVC, 70M rolls)
  { id: 'pm9-102-70', materialName: 'Premium M 9', category: 'Flex PVC', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.02-70M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-132-70', materialName: 'Premium M 9', category: 'Flex PVC', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.32-70M', openingStock: 16, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-163-70', materialName: 'Premium M 9', category: 'Flex PVC', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.63-70M', openingStock: 9, minStock: 4, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-193-70', materialName: 'Premium M 9', category: 'Flex PVC', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-1.93-70M', openingStock: 18, minStock: 5, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-254-70', materialName: 'Premium M 9', category: 'Flex PVC', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-2.54-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-01' },
  { id: 'pm9-320-70', materialName: 'Premium M 9', category: 'Flex PVC', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'PREMIUM-M-9-3.20-70M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-01' },

  // 4. Bright FL 26 (Flex PVC, 70M rolls)
  { id: 'bfl26-102-70', materialName: 'Bright FL 26', category: 'Flex PVC', variantSize: '1.02', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.02-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-132-70', materialName: 'Bright FL 26', category: 'Flex PVC', variantSize: '1.32', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.32-70M', openingStock: 7, minStock: 3, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-163-70', materialName: 'Bright FL 26', category: 'Flex PVC', variantSize: '1.63', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.63-70M', openingStock: 10, minStock: 4, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-193-70', materialName: 'Bright FL 26', category: 'Flex PVC', variantSize: '1.93', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-1.93-70M', openingStock: 5, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-254-70', materialName: 'Bright FL 26', category: 'Flex PVC', variantSize: '2.54', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-2.54-70M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-02' },
  { id: 'bfl26-320-70', materialName: 'Bright FL 26', category: 'Flex PVC', variantSize: '3.20', rollLengthMtr: 70, unit: 'Rolls', barcode: 'BRIGHT-FL-26-3.20-70M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-02' },

  // 5. Vinyl Gloss 80 Mic (Self Adhesive Vinyl, 50M rolls)
  { id: 'vg80-094-50', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '0.94', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-0.94-50M', openingStock: 2, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-106-50', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.06', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.06-50M', openingStock: 3, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-127-50', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.27', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.27-50M', openingStock: 44, minStock: 5, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-137-50', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.37', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.37-50M', openingStock: 4, minStock: 2, active: true, createdAt: '2026-09-03' },
  { id: 'vg80-152-50', materialName: 'Vinyl Gloss 80 Mic', category: 'Self Adhesive Vinyl', variantSize: '1.52', rollLengthMtr: 50, unit: 'Rolls', barcode: 'VINYL-GLOSS-80-MIC-1.52-50M', openingStock: 6, minStock: 2, active: true, createdAt: '2026-09-03' }
];

export const INITIAL_MATRIX_TRANSACTIONS: MatrixStockTransaction[] = [
  // Active 1.02 (70M): Opening 5, IN 3, OUT 2 -> Current 6 Rolls
  {
    id: 'tx-init-1',
    itemId: 'act-102-70',
    materialName: 'Active',
    category: 'Flex PVC',
    variantSize: '1.02',
    rollLengthMtr: 70,
    barcode: 'ACTIVE-1.02-70M',
    type: 'IN',
    quantity: 3,
    areaMtr2: 214.2, // 3 * 1.02 * 70
    stockBefore: 5,
    stockAfter: 8,
    unit: 'Rolls',
    date: '2026-09-28',
    createdAt: '2026-09-28T09:30:00Z'
  },
  {
    id: 'tx-init-2',
    itemId: 'act-102-70',
    materialName: 'Active',
    category: 'Flex PVC',
    variantSize: '1.02',
    rollLengthMtr: 70,
    barcode: 'ACTIVE-1.02-70M',
    type: 'OUT',
    quantity: 2,
    areaMtr2: 142.8, // 2 * 1.02 * 70
    stockBefore: 8,
    stockAfter: 6,
    unit: 'Rolls',
    date: '2026-10-01',
    createdAt: '2026-10-01T14:15:00Z'
  },
  // Backlit Sunlex 1.32 (50M): Opening 4, IN 5 -> Current 9 Rolls
  {
    id: 'tx-init-3',
    itemId: 'bs-132-50',
    materialName: 'Backlit Sunlex',
    category: 'Backlit',
    variantSize: '1.32',
    rollLengthMtr: 50,
    barcode: 'BACKLIT-SUNLEX-1.32-50M',
    type: 'IN',
    quantity: 5,
    areaMtr2: 330.0, // 5 * 1.32 * 50
    stockBefore: 4,
    stockAfter: 9,
    unit: 'Rolls',
    date: '2026-10-02',
    createdAt: '2026-10-02T10:00:00Z'
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
      rollLengthMtr: item.rollLengthMtr || 70,
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

    const widthNum = parseFloat(item.variantSize) || 1.0;
    const lengthNum = item.rollLengthMtr || 70;
    const areaPerRoll = Number((widthNum * lengthNum).toFixed(2));
    const totalAreaMtr2 = Number((currentStock * areaPerRoll).toFixed(2));

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

/**
 * Returns the direct HTTPS web URL for an item's mobile stock page.
 */
export function getItemWebUrl(itemId: string): string {
  if (typeof window === 'undefined') return `/item/${itemId}`;
  const origin = window.location.origin;
  return `${origin}/item/${itemId}`;
}
