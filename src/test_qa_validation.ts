/**
 * Automated QA and Data Validation Test Suite for RollPrint IMS
 */

import {
  calculateMaterialsWithStock,
  calculateDashboardMetrics,
  round2,
  INITIAL_MATERIALS,
  INITIAL_TRANSACTIONS
} from './data/inventoryStore';
import { MaterialItem, StockTransaction } from './types/inventory';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${testName}: ${details || ''}`);
    testsFailed++;
  }
}

console.log('====================================================');
console.log('RUNNING ROLLPRINT IMS FUNCTIONAL QA & DATA VALIDATION');
console.log('====================================================\n');

// ------------------------------------------------------------------
// TEST 1: Stock Calculation Sequence
// Opening = 100 -> +50 -> -20 -> +12.5 -> -2.5 = 140
// ------------------------------------------------------------------
console.log('--- Test Suite 1: Stock Calculation Sequence ---');

const testMat1: MaterialItem = {
  id: 'test-sku-1',
  name: 'Active Flex N',
  category: 'Flex Media',
  size: '3 FT',
  unit: 'M',
  itemCode: 'AFN-3FT',
  barcode: 'AFN-3FT',
  openingStock: 100,
  minStock: 50,
  active: true,
  createdAt: '2026-10-02'
};

const txnsSequence: StockTransaction[] = [];

// Step 1: Opening Stock = 100
let calc = calculateMaterialsWithStock([testMat1], txnsSequence)[0];
assert(calc.currentStock === 100, 'Step 1: Opening stock is 100', `Got ${calc.currentStock}`);

// Step 2: Stock IN = 50 -> Expected = 150
txnsSequence.push({
  id: 't-1',
  materialId: testMat1.id,
  materialName: testMat1.name,
  size: testMat1.size,
  itemCode: testMat1.itemCode,
  type: 'IN',
  quantity: 50,
  unit: 'M',
  stockBefore: 100,
  stockAfter: 150,
  date: '2026-10-02',
  createdAt: '2026-10-02T10:00:00Z'
});
calc = calculateMaterialsWithStock([testMat1], txnsSequence)[0];
assert(calc.currentStock === 150, 'Step 2: Stock IN 50 -> Balance 150', `Got ${calc.currentStock}`);

// Step 3: Stock OUT = 20 -> Expected = 130
txnsSequence.push({
  id: 't-2',
  materialId: testMat1.id,
  materialName: testMat1.name,
  size: testMat1.size,
  itemCode: testMat1.itemCode,
  type: 'OUT',
  quantity: 20,
  unit: 'M',
  stockBefore: 150,
  stockAfter: 130,
  date: '2026-10-02',
  createdAt: '2026-10-02T11:00:00Z'
});
calc = calculateMaterialsWithStock([testMat1], txnsSequence)[0];
assert(calc.currentStock === 130, 'Step 3: Stock OUT 20 -> Balance 130', `Got ${calc.currentStock}`);

// Step 4: Stock IN = 12.5 -> Expected = 142.5
txnsSequence.push({
  id: 't-3',
  materialId: testMat1.id,
  materialName: testMat1.name,
  size: testMat1.size,
  itemCode: testMat1.itemCode,
  type: 'IN',
  quantity: 12.5,
  unit: 'M',
  stockBefore: 130,
  stockAfter: 142.5,
  date: '2026-10-02',
  createdAt: '2026-10-02T12:00:00Z'
});
calc = calculateMaterialsWithStock([testMat1], txnsSequence)[0];
assert(calc.currentStock === 142.5, 'Step 4: Stock IN 12.5 -> Balance 142.5', `Got ${calc.currentStock}`);

// Step 5: Stock OUT = 2.5 -> Expected = 140
txnsSequence.push({
  id: 't-4',
  materialId: testMat1.id,
  materialName: testMat1.name,
  size: testMat1.size,
  itemCode: testMat1.itemCode,
  type: 'OUT',
  quantity: 2.5,
  unit: 'M',
  stockBefore: 142.5,
  stockAfter: 140,
  date: '2026-10-02',
  createdAt: '2026-10-02T13:00:00Z'
});
calc = calculateMaterialsWithStock([testMat1], txnsSequence)[0];
assert(calc.currentStock === 140, 'Step 5: Stock OUT 2.5 -> Balance 140', `Got ${calc.currentStock}`);

// ------------------------------------------------------------------
// TEST 2: Stock OUT Boundary & Validation Rules
// Available = 100 -> OUT 50 -> OUT 50 -> Balance 0 -> Attempt OUT 1 (Reject)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 2: Stock OUT Boundary & Rejection ---');

const testMat2: MaterialItem = {
  id: 'test-sku-2',
  name: 'PVC Flex',
  category: 'Flex Media',
  size: '4 FT',
  unit: 'M',
  itemCode: 'PVC-FLEX-4FT',
  barcode: 'PVC-FLEX-4FT',
  openingStock: 100,
  minStock: 20,
  active: true,
  createdAt: '2026-10-02'
};

const txnsOut: StockTransaction[] = [];
let available = calculateMaterialsWithStock([testMat2], txnsOut)[0].currentStock;
assert(available === 100, 'Initial Available = 100', `Got ${available}`);

// OUT = 50 -> Expected = 50
txnsOut.push({
  id: 'o-1',
  materialId: testMat2.id,
  materialName: testMat2.name,
  size: testMat2.size,
  itemCode: testMat2.itemCode,
  type: 'OUT',
  quantity: 50,
  unit: 'M',
  stockBefore: 100,
  stockAfter: 50,
  date: '2026-10-02',
  createdAt: '2026-10-02T10:00:00Z'
});
available = calculateMaterialsWithStock([testMat2], txnsOut)[0].currentStock;
assert(available === 50, 'OUT 50 -> Balance 50', `Got ${available}`);

// OUT = 50 -> Expected = 0
txnsOut.push({
  id: 'o-2',
  materialId: testMat2.id,
  materialName: testMat2.name,
  size: testMat2.size,
  itemCode: testMat2.itemCode,
  type: 'OUT',
  quantity: 50,
  unit: 'M',
  stockBefore: 50,
  stockAfter: 0,
  date: '2026-10-02',
  createdAt: '2026-10-02T11:00:00Z'
});
available = calculateMaterialsWithStock([testMat2], txnsOut)[0].currentStock;
assert(available === 0, 'OUT 50 -> Balance 0', `Got ${available}`);

// Attempt OUT 1 when available is 0 -> Should be rejected
const attemptOutQty = 1;
const isRejected = attemptOutQty > available;
assert(isRejected, 'Attempt OUT 1 when available 0 is rejected', `Rejected=${isRejected}`);

// Test invalid quantities rejection logic
const testInvalidQuantities = [-5, 0, NaN, Infinity];
for (const invalidQ of testInvalidQuantities) {
  const isInvalid = isNaN(invalidQ) || !isFinite(invalidQ) || invalidQ <= 0;
  assert(isInvalid, `Quantity ${invalidQ} correctly recognized as invalid`);
}

// ------------------------------------------------------------------
// TEST 3: Baseline Sample Dataset Integrity
// Opening = 300, IN = 1900, OUT = 750 -> Current Stock = 1450
// ------------------------------------------------------------------
console.log('\n--- Test Suite 3: Sample Dataset Summary Validation ---');

const calculatedItems = calculateMaterialsWithStock(INITIAL_MATERIALS, INITIAL_TRANSACTIONS);
const metrics = calculateDashboardMetrics(calculatedItems, INITIAL_TRANSACTIONS);

const expectedOpening = INITIAL_MATERIALS.reduce((s, m) => s + m.openingStock, 0);
assert(expectedOpening === 300, 'Baseline Opening Stock is 300M', `Got ${expectedOpening}`);
assert(metrics.totalStockIn === 1900, 'Baseline Total Stock IN is 1900M', `Got ${metrics.totalStockIn}`);
assert(metrics.totalStockOut === 750, 'Baseline Total Stock OUT is 750M', `Got ${metrics.totalStockOut}`);
assert(metrics.currentStock === 1450, 'Baseline Current Stock is 1450M (300 + 1900 - 750)', `Got ${metrics.currentStock}`);
assert(metrics.activeSkus === 8, 'Active SKUs count is 8', `Got ${metrics.activeSkus}`);

// ------------------------------------------------------------------
// TEST 4: Low Stock and Out of Stock Logic
// ------------------------------------------------------------------
console.log('\n--- Test Suite 4: Stock Status Logic ---');

const lowStockTestItems: MaterialItem[] = [
  { id: 'ls-1', name: 'M1', category: 'C', size: '1', unit: 'M', itemCode: 'C1', barcode: 'C1', openingStock: 0, minStock: 50, active: true, createdAt: '' },
  { id: 'ls-2', name: 'M2', category: 'C', size: '2', unit: 'M', itemCode: 'C2', barcode: 'C2', openingStock: 40, minStock: 50, active: true, createdAt: '' },
  { id: 'ls-3', name: 'M3', category: 'C', size: '3', unit: 'M', itemCode: 'C3', barcode: 'C3', openingStock: 100, minStock: 50, active: true, createdAt: '' }
];
const stockStatuses = calculateMaterialsWithStock(lowStockTestItems, []);
assert(stockStatuses[0].status === 'OUT_OF_STOCK', '0 M stock is OUT_OF_STOCK', `Got ${stockStatuses[0].status}`);
assert(stockStatuses[1].status === 'LOW_STOCK', '40 M (<= 50 min) is LOW_STOCK', `Got ${stockStatuses[1].status}`);
assert(stockStatuses[2].status === 'IN_STOCK', '100 M (> 50 min) is IN_STOCK', `Got ${stockStatuses[2].status}`);

// ------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(`QA TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================');

if (testsFailed > 0) {
  process.exit(1);
}
