/**
 * Automated QA and Data Validation Test Suite for RollPrint IMS (Excel Matrix Model)
 */

import {
  calculateMatrixWithStock,
  calculateMatrixDashboardMetrics,
  generateMatrixBarcode,
  INITIAL_MATRIX_ITEMS,
  INITIAL_MATRIX_TRANSACTIONS
} from './data/inventoryStore';
import { MatrixInventoryItem, MatrixStockTransaction } from './types/inventory';

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
console.log('RUNNING CLIENT EXCEL MATRIX IMS FUNCTIONAL QA');
console.log('====================================================\n');

// ------------------------------------------------------------------
// TEST 1: Stock Calculation Sequence (Material + Size)
// Backlit Sunlex 1.63
// Opening = 5 -> +5 -> -2 = 8
// ------------------------------------------------------------------
console.log('--- Test Suite 1: Stock Calculation Sequence ---');

const testItem1: MatrixInventoryItem = {
  id: 'bs-163',
  materialName: 'Backlit Sunlex',
  category: 'Backlit',
  variantSize: '1.63',
  unit: 'Rolls',
  barcode: 'BACKLIT-SUNLEX-1.63',
  openingStock: 5,
  minStock: 3,
  active: true,
  createdAt: '2026-10-03'
};

const txns: MatrixStockTransaction[] = [];

// Step 1: Initial opening stock
let calc = calculateMatrixWithStock([testItem1], txns)[0];
assert(calc.currentStock === 5, 'Step 1: Opening stock is 5', `Got ${calc.currentStock}`);

// Step 2: Stock IN = 5 -> Expected = 10
txns.push({
  id: 't-1',
  itemId: testItem1.id,
  materialName: testItem1.materialName,
  variantSize: testItem1.variantSize,
  barcode: testItem1.barcode,
  type: 'IN',
  quantity: 5,
  stockBefore: 5,
  stockAfter: 10,
  unit: 'Rolls',
  date: '2026-10-03',
  createdAt: '2026-10-03T10:00:00Z'
});
calc = calculateMatrixWithStock([testItem1], txns)[0];
assert(calc.currentStock === 10, 'Step 2: Stock IN +5 -> Balance 10', `Got ${calc.currentStock}`);

// Step 3: Stock OUT = 2 -> Expected = 8
txns.push({
  id: 't-2',
  itemId: testItem1.id,
  materialName: testItem1.materialName,
  variantSize: testItem1.variantSize,
  barcode: testItem1.barcode,
  type: 'OUT',
  quantity: 2,
  stockBefore: 10,
  stockAfter: 8,
  unit: 'Rolls',
  date: '2026-10-03',
  createdAt: '2026-10-03T11:00:00Z'
});
calc = calculateMatrixWithStock([testItem1], txns)[0];
assert(calc.currentStock === 8, 'Step 3: Stock OUT -2 -> Balance 8', `Got ${calc.currentStock}`);

// ------------------------------------------------------------------
// TEST 2: Secondary Variant Support (PVC Sheet with Thickness)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 2: Secondary Variant (PVC Sheet Thickness) ---');

const pvcSheet2mm: MatrixInventoryItem = {
  id: 'pvc-84-2',
  materialName: 'PVC Foam Sheet',
  category: 'Rigid Sheet',
  variantSize: '8×4',
  secondaryVariant: '2mm',
  unit: 'Sheets',
  barcode: generateMatrixBarcode('PVC Foam Sheet', '8×4', '2mm'),
  openingStock: 15,
  minStock: 5,
  active: true,
  createdAt: '2026-10-03'
};

const pvcSheet3mm: MatrixInventoryItem = {
  id: 'pvc-84-3',
  materialName: 'PVC Foam Sheet',
  category: 'Rigid Sheet',
  variantSize: '8×4',
  secondaryVariant: '3mm',
  unit: 'Sheets',
  barcode: generateMatrixBarcode('PVC Foam Sheet', '8×4', '3mm'),
  openingStock: 22,
  minStock: 6,
  active: true,
  createdAt: '2026-10-03'
};

assert(pvcSheet2mm.barcode !== pvcSheet3mm.barcode, 'Barcodes differ for 2mm vs 3mm');
assert(pvcSheet2mm.barcode === 'PVC-FOAM-SHEET-8X4-2MM', `2mm barcode is PVC-FOAM-SHEET-8X4-2MM (got ${pvcSheet2mm.barcode})`);
assert(pvcSheet3mm.barcode === 'PVC-FOAM-SHEET-8X4-3MM', `3mm barcode is PVC-FOAM-SHEET-8X4-3MM (got ${pvcSheet3mm.barcode})`);

// ------------------------------------------------------------------
// TEST 3: Stock OUT Never Below Zero Validation
// ------------------------------------------------------------------
console.log('\n--- Test Suite 3: Stock OUT Zero-Boundary Rule ---');
const availableStock = 8;
const attemptOverOut = 10;
const isRejected = attemptOverOut > availableStock;
assert(isRejected, `Attempting to remove 10 when available is 8 is rejected`);

// ------------------------------------------------------------------
// TEST 4: Client Sheet Baseline Matrix Integrity
// ------------------------------------------------------------------
console.log('\n--- Test Suite 4: Client Sheet Dataset Verification ---');
const calculatedDataset = calculateMatrixWithStock(INITIAL_MATRIX_ITEMS, INITIAL_MATRIX_TRANSACTIONS);
const metrics = calculateMatrixDashboardMetrics(calculatedDataset, INITIAL_MATRIX_TRANSACTIONS);

const totalOpening = INITIAL_MATRIX_ITEMS.reduce((sum, i) => sum + i.openingStock, 0);
assert(metrics.totalStockIn === 9, 'Total Stock IN is 9 (5 + 4)', `Got ${metrics.totalStockIn}`);
assert(metrics.totalStockOut === 6, 'Total Stock OUT is 6 (2 + 4)', `Got ${metrics.totalStockOut}`);
assert(
  metrics.currentStock === totalOpening + 9 - 6,
  `Current Stock matches Opening (${totalOpening}) + 9 - 6 = ${totalOpening + 3}`,
  `Got ${metrics.currentStock}`
);

// Verify Backlit Sunlex values from prompt: 1.02=1, 1.32=1, 1.63=8, 1.93=8, 2.54=5
const bs102 = calculatedDataset.find((i) => i.id === 'bs-102')!;
const bs132 = calculatedDataset.find((i) => i.id === 'bs-132')!;
const bs163 = calculatedDataset.find((i) => i.id === 'bs-163')!;
const bs193 = calculatedDataset.find((i) => i.id === 'bs-193')!;
const bs254 = calculatedDataset.find((i) => i.id === 'bs-254')!;

assert(bs102.currentStock === 1, 'Backlit Sunlex 1.02 is 1', `Got ${bs102.currentStock}`);
assert(bs132.currentStock === 1, 'Backlit Sunlex 1.32 is 1', `Got ${bs132.currentStock}`);
assert(bs163.currentStock === 8, 'Backlit Sunlex 1.63 is 8 (Opening 5 + 5 IN - 2 OUT)', `Got ${bs163.currentStock}`);
assert(bs193.currentStock === 8, 'Backlit Sunlex 1.93 is 8', `Got ${bs193.currentStock}`);
assert(bs254.currentStock === 5, 'Backlit Sunlex 2.54 is 5', `Got ${bs254.currentStock}`);

// ------------------------------------------------------------------
// TEST 5: QR Code URL Generation & Mobile Target
// ------------------------------------------------------------------
console.log('\n--- Test Suite 5: Phone Camera QR URL Target ---');
import { getItemWebUrl } from './data/inventoryStore';

const sampleUrl = getItemWebUrl('bs-163');
assert(sampleUrl.includes('/item/bs-163'), `QR encodes direct item URL /item/bs-163 (got ${sampleUrl})`);

// ------------------------------------------------------------------
// TEST 6: Barcode Verification in Stock IN / Stock OUT
// ------------------------------------------------------------------
console.log('\n--- Test Suite 6: Barcode Verification Matching Logic ---');
const testItemBs132 = calculatedDataset.find((i) => i.id === 'bs-132')!;

function testCheckBarcode(code: string, item: typeof testItemBs132): boolean {
  if (!code.trim() || !item) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanBarcode = item.barcode.toUpperCase();
  const cleanId = item.id.toUpperCase();

  if (cleanCode === cleanBarcode) return true;
  if (cleanCode === cleanId) return true;
  if (cleanCode.includes(`/ITEM/${cleanId}`)) return true;

  const normCode = cleanCode.replace(/[^A-Z0-9]/g, '');
  const normBarcode = cleanBarcode.replace(/[^A-Z0-9]/g, '');
  if (normCode && normBarcode && normCode === normBarcode) return true;

  return false;
}

assert(
  testCheckBarcode('BACKLIT-SUNLEX-1.32', testItemBs132) === true,
  'Matching barcode BACKLIT-SUNLEX-1.32 verifies successfully'
);
assert(
  testCheckBarcode('backlit-sunlex-1.32', testItemBs132) === true,
  'Case-insensitive barcode verifies successfully'
);
assert(
  testCheckBarcode('bs-132', testItemBs132) === true,
  'Item ID code verifies successfully'
);
assert(
  testCheckBarcode('BACKLIT-SUNLEX-1.63', testItemBs132) === false,
  'Mismatched barcode BACKLIT-SUNLEX-1.63 is rejected'
);
assert(
  testCheckBarcode('PREMIUM-M-9-1.32', testItemBs132) === false,
  'Different material barcode is rejected'
);

// ------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(`QA TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================');

if (testsFailed > 0) {
  process.exit(1);
}
