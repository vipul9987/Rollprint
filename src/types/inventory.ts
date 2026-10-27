/**
 * Roll-Based Inventory System Data Types
 * Blueprint: Material Name + Category + Size/Width (M) + Roll Length (M) = Full Roll Inventory Variant
 * Primary Stock: Full Roll Count / Sheet Count
 * Summary Groups: FLEX_ROLL, VINYL_ROLL, RIGID_PVC
 */

export type InventorySummaryGroup = 'FLEX_ROLL' | 'STAR_MATERIAL' | 'VINYL_ROLL' | 'RIGID_PVC';

export const STAR_MATERIAL_CATEGORY = 'Star Material';
export const STAR_MATERIAL_INTERNAL = 'STAR_MATERIAL';
export const STAR_MATERIAL_ALLOWED_SIZES = ['1.02', '1.30', '1.60', '1.90', '2.54', '3.20'] as const;
export type StarMaterialAllowedSize = typeof STAR_MATERIAL_ALLOWED_SIZES[number];
export const STAR_MATERIAL_SIZE_ERROR =
  'Invalid size for Star Material. Please select one of the allowed sizes: 1.02, 1.30, 1.60, 1.90, 2.54, 3.20.';

export type BackupType = 'DAILY' | 'MANUAL' | 'PRE_RESTORE';

export interface InventoryBackupRecordCounts {
  materialsCount: number;
  physicalRollsCount: number;
  inStockCount: number;
  outStockCount: number;
  batchesCount: number;
  batchItemsCount: number;
  transactionsCount: number;
  dispatchesCount: number;
  dispatchItemsCount: number;
}

export interface InventoryBackupSnapshot {
  materials: MatrixInventoryItem[];
  inventoryRolls: InventoryRoll[];
  stockBatches: MatrixBatch[];
  stockTransactions: MatrixStockTransaction[];
  stockOutDispatches?: StockOutDispatch[];
  stockOutDispatchItems?: StockOutDispatchItem[];
  dashboardConfig?: {
    displayOrders: Record<string, number>;
    summaryGroups: Record<string, InventorySummaryGroup>;
  };
}

export interface InventoryBackup {
  id: string;
  backupDate: string; // YYYY-MM-DD
  backupType: BackupType;
  createdBy: string;
  createdAt: string;
  recordCounts: InventoryBackupRecordCounts;
  snapshot?: InventoryBackupSnapshot;
  status: 'COMPLETED' | 'FAILED';
}

export interface InventoryRestoreAudit {
  id: string;
  backupId: string;
  restoredBy: string;
  restoredAt: string;
  preRestoreBackupId?: string;
  status: 'SUCCESS' | 'FAILED';
  notes?: string;
}


export interface MatrixInventoryItem {
  id: string;
  materialName: string; // e.g. "Backlit Sunlex", "Premium M 9", "Vinyl Gloss 80 Mic", "PVC Foam Sheet"
  category: string; // e.g. "Flex PVC", "Backlit", "Frontlit Flex", "Self Adhesive Vinyl", "Lamination Film", "Rigid PVC"
  summaryGroup?: InventorySummaryGroup; // "FLEX_ROLL" | "VINYL_ROLL" | "RIGID_PVC"
  dashboardGroup?: InventorySummaryGroup; // Alias for summaryGroup
  displayOrder?: number; // Integer order for deterministic matrix row placement (e.g. 10, 20, 30...)
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

  // Dedicated Physical Roll Stock OUT Fields:
  inventoryRollId?: string;
  rollBarcode?: string;
  stockOutInvoiceNumber?: string;
  stockOutDate?: string;
  originalStockInInvoiceNumber?: string;

  // DB snake_case aliases for direct Supabase compatibility:
  inventory_roll_id?: string;
  roll_barcode?: string;
  batch_id?: string;
  batch_number?: string;
  material_id?: string;
  material_name_snapshot?: string;
  category_snapshot?: string;
  width?: string;
  roll_length?: number;
  transaction_type?: 'IN' | 'OUT';
  stock_out_invoice_number?: string;
  stock_out_date?: string;
  original_stock_in_invoice_number?: string;
  created_at?: string;
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
  batchId?: string; // Foreign key to stock_batches.id
  batchItemId?: string; // Foreign key to stock_batch_items.id
  materialId?: string; // Foreign key to materials.id
  invoiceNumber: string; // Original receiving invoice number (e.g. GT28728)
  originalStockInInvoiceNumber?: string; // Explicit alias for receiving invoice
  stockOutInvoiceNumber?: string; // Outgoing dispatch invoice number (e.g. DS/26-27/1230)
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

/**
 * POS Dispatch Record (Parent Dispatch Event)
 * Represents one outgoing retail / wholesale billing event
 */
export interface StockOutDispatch {
  id: string;
  dispatchInvoiceNumber: string; // e.g. "DS/26-27/1230"
  dispatchDate: string; // YYYY-MM-DD
  totalRolls: number;
  notes?: string;
  createdAt: string;
  items?: StockOutDispatchItem[];
}

/**
 * POS Dispatch Line Item
 * Each item in the dispatch corresponds to exactly 1 physical roll
 */
export interface StockOutDispatchItem {
  id: string;
  dispatchId: string;
  inventoryRollId: string;
  rollBarcode: string;
  materialNameSnapshot: string;
  categorySnapshot?: string;
  width: string;
  rollLength: number;
  batchNumber: string;
  originalStockInInvoiceNumber: string;
  createdAt: string;
}

