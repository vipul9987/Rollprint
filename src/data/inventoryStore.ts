import { MaterialItem, StockTransaction, MaterialWithStock, DashboardMetrics } from '../types/inventory';

const STORAGE_KEY_MATERIALS = 'rollprint_materials_v2';
const STORAGE_KEY_TRANSACTIONS = 'rollprint_transactions_v2';

export const INITIAL_MATERIALS: MaterialItem[] = [
  {
    id: 'mat-1',
    name: 'PVC Flex',
    category: 'Flex Media',
    size: '3 FT',
    rollLength: 50,
    unit: 'M',
    itemCode: 'PVC-FLEX-3FT',
    barcode: 'PVC-FLEX-3FT',
    openingStock: 0,
    minStock: 100,
    active: true,
    createdAt: '2026-09-01'
  },
  {
    id: 'mat-2',
    name: 'PVC Flex',
    category: 'Flex Media',
    size: '4 FT',
    rollLength: 50,
    unit: 'M',
    itemCode: 'PVC-FLEX-4FT',
    barcode: 'PVC-FLEX-4FT',
    openingStock: 0,
    minStock: 150,
    active: true,
    createdAt: '2026-09-01'
  },
  {
    id: 'mat-3',
    name: 'Canvas',
    category: 'Fabrics & Canvas',
    size: '5 FT',
    rollLength: 30,
    unit: 'M',
    itemCode: 'CANVAS-5FT',
    barcode: 'CANVAS-5FT',
    openingStock: 0,
    minStock: 80,
    active: true,
    createdAt: '2026-09-02'
  },
  {
    id: 'mat-4',
    name: 'Vinyl Gloss',
    category: 'Self Adhesive Vinyl',
    size: '4 FT',
    rollLength: 50,
    unit: 'M',
    itemCode: 'VINYL-GLOSS-4FT',
    barcode: 'VINYL-GLOSS-4FT',
    openingStock: 0,
    minStock: 100,
    active: true,
    createdAt: '2026-09-02'
  },
  {
    id: 'mat-5',
    name: 'Active Flex N',
    category: 'Flex Media',
    size: '3 FT',
    rollLength: 70,
    unit: 'M',
    itemCode: 'AFN-3FT',
    barcode: 'AFN-3FT',
    openingStock: 100,
    minStock: 120,
    active: true,
    createdAt: '2026-09-03'
  },
  {
    id: 'mat-6',
    name: 'Active Flex N',
    category: 'Flex Media',
    size: '4 FT',
    rollLength: 70,
    unit: 'M',
    itemCode: 'AFN-4FT',
    barcode: 'AFN-4FT',
    openingStock: 100,
    minStock: 120,
    active: true,
    createdAt: '2026-09-03'
  },
  {
    id: 'mat-7',
    name: 'Backlit Flex',
    category: 'Flex Media',
    size: '5 FT',
    rollLength: 50,
    unit: 'M',
    itemCode: 'BACKLIT-5FT',
    barcode: 'BACKLIT-5FT',
    openingStock: 50,
    minStock: 60,
    active: true,
    createdAt: '2026-09-05'
  },
  {
    id: 'mat-8',
    name: 'One Way Vision',
    category: 'Speciality Film',
    size: '4 FT',
    rollLength: 50,
    unit: 'M',
    itemCode: 'OWV-4FT',
    barcode: 'OWV-4FT',
    openingStock: 50,
    minStock: 50,
    active: true,
    createdAt: '2026-09-05'
  }
];

export const INITIAL_TRANSACTIONS: StockTransaction[] = [
  // PVC Flex 3 FT: IN 500M, OUT 220M -> Balance 280M
  {
    id: 'txn-1',
    materialId: 'mat-1',
    materialName: 'PVC Flex',
    size: '3 FT',
    itemCode: 'PVC-FLEX-3FT',
    type: 'IN',
    quantity: 500,
    unit: 'M',
    stockBefore: 0,
    stockAfter: 500,
    date: '2026-09-20',
    reference: 'PO-8821 / Supplier Roll Shipment',
    createdAt: '2026-09-20T09:30:00Z'
  },
  {
    id: 'txn-2',
    materialId: 'mat-1',
    materialName: 'PVC Flex',
    size: '3 FT',
    itemCode: 'PVC-FLEX-3FT',
    type: 'OUT',
    quantity: 220,
    unit: 'M',
    stockBefore: 500,
    stockAfter: 280,
    date: '2026-09-28',
    reference: 'Job #401 - City Billboard',
    createdAt: '2026-09-28T14:15:00Z'
  },
  // PVC Flex 4 FT: IN 700M, OUT 300M -> Balance 400M
  {
    id: 'txn-3',
    materialId: 'mat-2',
    materialName: 'PVC Flex',
    size: '4 FT',
    itemCode: 'PVC-FLEX-4FT',
    type: 'IN',
    quantity: 700,
    unit: 'M',
    stockBefore: 0,
    stockAfter: 700,
    date: '2026-09-21',
    reference: 'PO-8822 / Star Flex Delivery',
    createdAt: '2026-09-21T11:00:00Z'
  },
  {
    id: 'txn-4',
    materialId: 'mat-2',
    materialName: 'PVC Flex',
    size: '4 FT',
    itemCode: 'PVC-FLEX-4FT',
    type: 'OUT',
    quantity: 300,
    unit: 'M',
    stockBefore: 700,
    stockAfter: 400,
    date: '2026-09-29',
    reference: 'Job #405 - Highway Hoarding',
    createdAt: '2026-09-29T16:00:00Z'
  },
  // Canvas 5 FT: IN 250M, OUT 100M -> Balance 150M
  {
    id: 'txn-5',
    materialId: 'mat-3',
    materialName: 'Canvas',
    size: '5 FT',
    itemCode: 'CANVAS-5FT',
    type: 'IN',
    quantity: 250,
    unit: 'M',
    stockBefore: 0,
    stockAfter: 250,
    date: '2026-09-22',
    reference: 'PO-8825 / Art Studio Import',
    createdAt: '2026-09-22T10:00:00Z'
  },
  {
    id: 'txn-6',
    materialId: 'mat-3',
    materialName: 'Canvas',
    size: '5 FT',
    itemCode: 'CANVAS-5FT',
    type: 'OUT',
    quantity: 100,
    unit: 'M',
    stockBefore: 250,
    stockAfter: 150,
    date: '2026-09-30',
    reference: 'Job #412 - Exhibition Gallery Prints',
    createdAt: '2026-09-30T12:00:00Z'
  },
  // Vinyl Gloss 4 FT: IN 400M, OUT 130M -> Balance 270M
  {
    id: 'txn-7',
    materialId: 'mat-4',
    materialName: 'Vinyl Gloss',
    size: '4 FT',
    itemCode: 'VINYL-GLOSS-4FT',
    type: 'IN',
    quantity: 400,
    unit: 'M',
    stockBefore: 0,
    stockAfter: 400,
    date: '2026-09-23',
    reference: 'PO-8829 / Vinyl Media Supply',
    createdAt: '2026-09-23T15:30:00Z'
  },
  {
    id: 'txn-8',
    materialId: 'mat-4',
    materialName: 'Vinyl Gloss',
    size: '4 FT',
    itemCode: 'VINYL-GLOSS-4FT',
    type: 'OUT',
    quantity: 130,
    unit: 'M',
    stockBefore: 400,
    stockAfter: 270,
    date: '2026-10-01',
    reference: 'Job #420 - Vehicle Graphics',
    createdAt: '2026-10-01T17:00:00Z'
  },
  // Active Flex N 3 FT: Opening 100M, IN 50M -> Balance 150M
  {
    id: 'txn-9',
    materialId: 'mat-5',
    materialName: 'Active Flex N',
    size: '3 FT',
    itemCode: 'AFN-3FT',
    type: 'IN',
    quantity: 50,
    unit: 'M',
    stockBefore: 100,
    stockAfter: 150,
    date: '2026-10-02',
    reference: 'PO-8835 / Monthly Restock',
    createdAt: '2026-10-02T08:00:00Z'
  }
];

export function getStoredMaterials(): MaterialItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MATERIALS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_MATERIALS, JSON.stringify(INITIAL_MATERIALS));
      return INITIAL_MATERIALS;
    }
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({
      ...m,
      active: m.active !== undefined ? m.active : true
    }));
  } catch {
    return INITIAL_MATERIALS;
  }
}

export function saveStoredMaterials(materials: MaterialItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MATERIALS, JSON.stringify(materials));
  } catch (e) {
    console.error('Failed to save materials', e);
  }
}

export function getStoredTransactions(): StockTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(INITIAL_TRANSACTIONS));
      return INITIAL_TRANSACTIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_TRANSACTIONS;
  }
}

export function saveStoredTransactions(transactions: StockTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to save transactions', e);
  }
}

/**
 * Precision safe helper to round to 2 decimal places
 */
export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates current stock dynamically for all materials:
 * Current Stock = Opening Stock + Total Stock IN - Total Stock OUT
 * Status logic:
 *   If Current Stock == 0: OUT_OF_STOCK
 *   Else if Current Stock <= Min Stock: LOW_STOCK
 *   Else: IN_STOCK
 */
export function calculateMaterialsWithStock(
  materials: MaterialItem[],
  transactions: StockTransaction[]
): MaterialWithStock[] {
  return materials.map((mat) => {
    const matTxns = transactions.filter((t) => t.materialId === mat.id);
    const totalIn = round2(
      matTxns.filter((t) => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0)
    );
    const totalOut = round2(
      matTxns.filter((t) => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0)
    );

    const currentStock = round2(mat.openingStock + totalIn - totalOut);

    let status: MaterialWithStock['status'] = 'IN_STOCK';
    if (currentStock <= 0) {
      status = 'OUT_OF_STOCK';
    } else if (currentStock <= mat.minStock) {
      status = 'LOW_STOCK';
    }

    return {
      ...mat,
      totalIn,
      totalOut,
      currentStock,
      status
    };
  });
}

/**
 * Calculate Dashboard KPIs across active items
 */
export function calculateDashboardMetrics(
  materialsWithStock: MaterialWithStock[],
  transactions: StockTransaction[]
): DashboardMetrics {
  const activeItems = materialsWithStock.filter((m) => m.active);

  const activeSkus = activeItems.length;

  const totalStockIn = round2(
    transactions
      .filter((t) => t.type === 'IN')
      .reduce((sum, t) => sum + t.quantity, 0)
  );

  const totalStockOut = round2(
    transactions
      .filter((t) => t.type === 'OUT')
      .reduce((sum, t) => sum + t.quantity, 0)
  );

  const currentStock = round2(
    activeItems.reduce((sum, m) => sum + m.currentStock, 0)
  );

  const lowStockCount = activeItems.filter((m) => m.status === 'LOW_STOCK').length;
  const outOfStockCount = activeItems.filter((m) => m.status === 'OUT_OF_STOCK').length;

  return {
    activeSkus,
    totalStockIn,
    totalStockOut,
    currentStock,
    lowStockCount,
    outOfStockCount
  };
}
