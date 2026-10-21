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

export interface MatrixBatchItem {
  id: string; // Internal unique ID / UUID for this item line
  batchId: string; // Foreign key to parent MatrixBatch.id
  materialId?: string; // Reference to master inventory item if linked
  materialNameSnapshot: string; // Material name (e.g. "Bronze (S Prints) N", "Flex Tufan")
  categorySnapshot?: string; // Category snapshot (e.g. "Flex PVC")
  width: string; // Size / Width in metres (e.g. "1.32", "1.63", "1.93")
  rollLength: number; // Length per roll in metres (e.g. 70, 50, 45)
  initialRollQuantity: number; // Initial received rolls for this item line
  remainingRollQuantity: number; // Currently available rolls for this item line
  areaM2: number; // Width × Length × Quantity
  createdAt: string;
}

export interface MatrixBatch {
  id: string; // Internal unique ID / UUID
  batchNumber: string; // e.g. 101026GT28728 (UNIQUE: DDMMYY + Cleaned Invoice)
  materialName: string;
  category: string;
  variantSize: string; // e.g. "1.63"
  rollLengthMtr: number; // e.g. 50
  initialRollQuantity: number; // Initial received rolls in this batch
  currentRemainingRollQuantity: number; // Remaining rolls in this batch
  invoiceNumber: string; // Original, complete invoice number as entered
  stockInDate: string; // Date received (YYYY-MM-DD)
  barcodeValue: string; // Exactly equal to batchNumber (e.g. 101026GT28728)
  createdAt: string;
  items?: MatrixBatchItem[]; // 1 Batch / Invoice -> Multiple Batch Item Lines
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
  invoiceNumber?: string; // Original complete invoice number
  batchNumber?: string; // Generated batch number / barcode
  batchId?: string; // Reference to parent batch
  batchItemId?: string; // Reference to specific batch item line
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

/**
 * Individual Physical Roll in Inventory
 * Database Table: inventory_rolls
 * RULE: inventory_rolls.roll_barcode must be UNIQUE.
 * Every physical roll has its OWN unique barcode.
 */
export type RollCurrentStatus = 'IN_STOCK' | 'OUT';

export interface InventoryRoll {
  id: string; // Unique UUID
  rollBarcode: string; // UNIQUE barcode for this specific physical roll
  batchNumber: string; // Grouping batch number (e.g. 101026GT28728)
  invoiceNumber: string; // Original invoice number (e.g. GT28728)
  rollNumber: number; // Roll number within batch/item (e.g. 1, 2, 3...)
  materialName: string; // e.g. "Bright FL 26"
  category: string; // e.g. "Frontlit Flex"
  size: string; // Width / size in metres (e.g. "1.63")
  rollLength: number; // Length per roll in metres (e.g. 50)
  status: RollCurrentStatus; // 'IN_STOCK' | 'OUT'
  receivedDate: string; // YYYY-MM-DD
  stockOutDate?: string; // YYYY-MM-DD when stocked out
  stockOutTransactionId?: string; // Reference to stock transaction
  createdAt: string;
  updatedAt: string;
}
