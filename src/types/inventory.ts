/**
 * Simple Roll & Material Inventory Management System
 */

export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  size: string; // e.g., "3 FT", "4 FT", "5 FT"
  rollLength?: number; // e.g. 50, 70 (meters)
  unit: string; // "M"
  itemCode: string; // e.g. "AFN-3FT", "PVC-FLEX-4FT"
  barcode: string; // matches itemCode
  openingStock: number;
  minStock: number;
  active: boolean; // For soft delete / safety
  createdAt: string;
}

export interface StockTransaction {
  id: string;
  materialId: string;
  materialName: string;
  size: string;
  itemCode: string; // Unique SKU Code
  type: 'IN' | 'OUT';
  quantity: number;
  unit: string;
  stockBefore: number;
  stockAfter: number;
  date: string;
  reference?: string;
  createdAt: string;
}

export interface MaterialWithStock extends MaterialItem {
  totalIn: number;
  totalOut: number;
  currentStock: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface DashboardMetrics {
  activeSkus: number;
  totalStockIn: number;
  totalStockOut: number;
  currentStock: number;
  lowStockCount: number;
  outOfStockCount: number;
}
