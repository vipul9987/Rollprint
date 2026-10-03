/**
 * Roll-Based Inventory System Data Types
 * Blueprint: Material Name + Category + Size/Width (M) + Roll Length (M) = Full Roll Inventory Variant
 * Primary Stock: Full Roll Count
 * Informational: Area per roll = Width × Length (m²), Total Area = Rolls × Area per roll (m²)
 */

export interface MatrixInventoryItem {
  id: string;
  materialName: string; // e.g. "Active", "Backlit Sunlex", "Premium M 9"
  category: string; // e.g. "Flex PVC", "Backlit", "Frontlit Flex", "Self Adhesive Vinyl", "Lamination Film"
  variantSize: string; // Width in metres, e.g. "1.02", "1.32", "1.63", "1.93", "2.54", "3.20"
  rollLengthMtr: number; // Length per roll in metres, e.g. 50, 70
  secondaryVariant?: string; // Optional thickness/finish if applicable
  unit: string; // Always "Rolls" for roll inventory
  barcode: string; // Unique barcode identifying Material + Width + Roll Length, e.g. "ACTIVE-1.02-70M"
  openingStock: number; // Number of full rolls in opening inventory
  minStock: number; // Low stock alert threshold in rolls
  active: boolean;
  createdAt: string;
}

export interface MatrixStockTransaction {
  id: string;
  itemId: string;
  materialName: string;
  category: string;
  variantSize: string; // Width (M)
  rollLengthMtr: number; // Roll length (M)
  secondaryVariant?: string;
  barcode: string;
  type: 'IN' | 'OUT';
  quantity: number; // Number of rolls
  areaMtr2: number; // Total area = Rolls × Width × Length (m²)
  stockBefore: number; // Rolls before
  stockAfter: number; // Rolls after
  unit: string; // "Rolls"
  date: string;
  createdAt: string;
}

export interface MatrixItemWithStock extends MatrixInventoryItem {
  totalIn: number;
  totalOut: number;
  currentStock: number; // In-hand full rolls = Opening + In - Out
  areaPerRoll: number; // Width × Length (m²)
  totalAreaMtr2: number; // currentStock × areaPerRoll (m²)
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface MatrixDashboardMetrics {
  totalItems: number;
  totalStockIn: number;
  totalStockOut: number;
  currentStock: number;
  totalAreaMtr2: number;
  totalInAreaMtr2: number;
  totalOutAreaMtr2: number;
  lowStockCount: number;
  outOfStockCount: number;
}
