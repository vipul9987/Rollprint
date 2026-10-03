/**
 * Matrix-Based Inventory System Data Types
 * Model: Material + Variant/Size (+ Optional Secondary Variant) = Inventory Item
 * Reflects the client's Excel Stock Matrix
 */

export interface MatrixInventoryItem {
  id: string;
  materialName: string; // e.g. "Backlit Sunlex", "Premium M 9", "PVC Foam Sheet"
  category: string; // "Backlit", "Frontlit Flex", "Self Adhesive Vinyl", "Lamination Film", "Rigid Sheet"
  variantSize: string; // e.g. "1.02", "1.32", "1.63", "8×4"
  secondaryVariant?: string; // e.g. "2mm", "3mm", "5mm" (thickness for sheets)
  unit: string; // "Rolls" or "Sheets"
  barcode: string; // unique stable identifier e.g. "BACKLIT-SUNLEX-1.63", "PVC-8X4-3MM"
  openingStock: number; // current quantity from the Excel sheet
  minStock: number; // minimum stock alert threshold
  active: boolean;
  createdAt: string;
}

export interface MatrixStockTransaction {
  id: string;
  itemId: string;
  materialName: string;
  variantSize: string;
  secondaryVariant?: string;
  barcode: string;
  type: 'IN' | 'OUT';
  quantity: number; // number of rolls / sheets / units
  stockBefore: number;
  stockAfter: number;
  unit: string;
  date: string;
  createdAt: string;
}

export interface MatrixItemWithStock extends MatrixInventoryItem {
  totalIn: number;
  totalOut: number;
  currentStock: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface MatrixDashboardMetrics {
  totalItems: number;
  totalStockIn: number;
  totalStockOut: number;
  currentStock: number;
  lowStockCount: number;
  outOfStockCount: number;
}
