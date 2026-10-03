/**
 * Roll-Based Inventory System Data Types
 * Blueprint: Material Name + Category + Size/Width (M) + Roll Length (M) = Full Roll Inventory Variant
 * Primary Stock: Full Roll Count / Sheet Count
 * Summary Groups: FLEX_ROLL, VINYL_ROLL, RIGID_PVC
 */

export type InventorySummaryGroup = 'FLEX_ROLL' | 'VINYL_ROLL' | 'RIGID_PVC';

export interface MatrixInventoryItem {
  id: string;
  materialName: string; // e.g. "Backlit Sunlex", "Premium M 9", "Vinyl Gloss 80 Mic", "PVC Foam Sheet"
  category: string; // e.g. "Flex PVC", "Backlit", "Frontlit Flex", "Self Adhesive Vinyl", "Lamination Film", "Rigid PVC"
  summaryGroup?: InventorySummaryGroup; // "FLEX_ROLL" | "VINYL_ROLL" | "RIGID_PVC"
  variantSize: string; // Width in metres (e.g. "1.02", "1.32") or Sheet Size (e.g. "8×4")
  rollLengthMtr: number; // Length per roll in metres (e.g. 50, 70), or 0 for sheets
  secondaryVariant?: string; // Thickness (e.g. "2mm", "3mm", "5mm" for sheets)
  unit: string; // "Rolls" or "Sheets"
  barcode: string; // Unique barcode identifying Material + Variant + Length/Thickness
  openingStock: number; // Number of full rolls / sheets in opening inventory
  minStock: number; // Low stock alert threshold
  active: boolean;
  createdAt: string;
}

export interface MatrixStockTransaction {
  id: string;
  itemId: string;
  materialName: string;
  category: string;
  variantSize: string;
  rollLengthMtr: number;
  secondaryVariant?: string;
  barcode: string;
  type: 'IN' | 'OUT';
  quantity: number; // Number of rolls or sheets
  areaMtr2: number; // Total area in m²
  stockBefore: number;
  stockAfter: number;
  unit: string;
  date: string;
  createdAt: string;
}

export interface MatrixItemWithStock extends MatrixInventoryItem {
  totalIn: number;
  totalOut: number;
  currentStock: number; // In-hand rolls/sheets = Opening + In - Out
  areaPerRoll: number; // Width × Length (m²) or Sheet Area (m²)
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
