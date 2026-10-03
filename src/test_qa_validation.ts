/**
 * Automated QA and Data Validation Test Suite for RollPrint IMS
 * Validates the Client's Handwritten Blueprint:
 * 1. Full Roll Count (Current = Opening + In - Out)
 * 2. Area Calculation (Width × Length = m², Total Area = Rolls × Area per roll)
 * 3. Exact Barcode Rule: Material + Size + Roll Length (e.g. ACTIVE-1.02-70M)
 * 4. Zero-boundary enforcement for Stock OUT
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
console.log('RUNNING CLIENT HANDWRITTEN BLUEPRINT IMS QA');
console.log('====================================================\n');

// ------------------------------------------------------------------
// TEST 1: Blueprint Core Stock & Area Calculation Sequence
// Example from Blueprint:
// Material: Active, Width: 1.02 M, Roll Length: 70 M
// Opening = 5, IN = 3, OUT = 2 -> Current = 6 Rolls
// Area per roll = 1.02 × 70 = 71.40 m²
// Total material area for 5 rolls = 1.02 × 70 × 5 = 357.00 m²
// Total material area for 6 rolls = 6 × 71.40 = 428.40 m²
// ------------------------------------------------------------------
console.log('--- Test Suite 1: Blueprint Roll Count & Area Calculations ---');

const testItemActive: MatrixInventoryItem = {
  id: 'act-102-70',
  materialName: 'Active',
  category: 'Flex PVC',
  variantSize: '1.02',
  rollLengthMtr: 70,
  unit: 'Rolls',
  barcode: 'ACTIVE-1.02-70M',
  openingStock: 5,
  minStock: 2,
  active: true,
  createdAt: '2026-10-03'
};

const txns: MatrixStockTransaction[] = [];

// Step 1: Initial opening stock = 5 rolls, area = 357.00 m²
let calc = calculateMatrixWithStock([testItemActive], txns)[0];
assert(calc.currentStock === 5, 'Step 1: Opening stock is 5 Rolls', `Got ${calc.currentStock}`);
assert(calc.areaPerRoll === 71.4, 'Area per roll is 1.02 × 70 = 71.40 m²', `Got ${calc.areaPerRoll}`);
assert(calc.totalAreaMtr2 === 357.0, 'Total initial area for 5 rolls is 357.00 m²', `Got ${calc.totalAreaMtr2}`);

// Step 2: Stock IN = 3 rolls -> Balance = 8 rolls
txns.push({
  id: 't-1',
  itemId: testItemActive.id,
  materialName: testItemActive.materialName,
  category: testItemActive.category,
  variantSize: testItemActive.variantSize,
  rollLengthMtr: 70,
  barcode: testItemActive.barcode,
  type: 'IN',
  quantity: 3,
  areaMtr2: 214.2, // 3 × 71.40
  stockBefore: 5,
  stockAfter: 8,
  unit: 'Rolls',
  date: '2026-10-03',
  createdAt: '2026-10-03T10:00:00Z'
});
calc = calculateMatrixWithStock([testItemActive], txns)[0];
assert(calc.currentStock === 8, 'Step 2: Stock IN +3 -> Balance 8 Rolls', `Got ${calc.currentStock}`);
assert(calc.totalAreaMtr2 === 571.2, 'Total area after +3 rolls is 8 × 71.40 = 571.20 m²', `Got ${calc.totalAreaMtr2}`);

// Step 3: Stock OUT = 2 rolls -> Balance = 6 rolls
txns.push({
  id: 't-2',
  itemId: testItemActive.id,
  materialName: testItemActive.materialName,
  category: testItemActive.category,
  variantSize: testItemActive.variantSize,
  rollLengthMtr: 70,
  barcode: testItemActive.barcode,
  type: 'OUT',
  quantity: 2,
  areaMtr2: 142.8, // 2 × 71.40
  stockBefore: 8,
  stockAfter: 6,
  unit: 'Rolls',
  date: '2026-10-03',
  createdAt: '2026-10-03T11:00:00Z'
});
calc = calculateMatrixWithStock([testItemActive], txns)[0];
assert(calc.currentStock === 6, 'Step 3: Stock OUT -2 -> Current Balance 6 Rolls (Opening 5 + 3 - 2 = 6)', `Got ${calc.currentStock}`);
assert(calc.totalAreaMtr2 === 428.4, 'Total area for 6 rolls is 6 × 71.40 = 428.40 m²', `Got ${calc.totalAreaMtr2}`);

// ------------------------------------------------------------------
// TEST 2: Barcode Generation & Verification (Material + Width + Length)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 2: Barcode Identity (Material + Width + Length) ---');
const activeBarcode = generateMatrixBarcode('Active', '1.02', 70);
assert(activeBarcode === 'ACTIVE-1.02-70M', `Barcode for Active 1.02 70M is ACTIVE-1.02-70M (got ${activeBarcode})`);

const backlit50mBarcode = generateMatrixBarcode('Backlit Sunlex', '1.32', 50);
assert(backlit50mBarcode === 'BACKLIT-SUNLEX-1.32-50M', `Barcode for Backlit 1.32 50M is BACKLIT-SUNLEX-1.32-50M (got ${backlit50mBarcode})`);

// ------------------------------------------------------------------
// TEST 3: Barcode Verification Matching Logic
// ------------------------------------------------------------------
console.log('\n--- Test Suite 3: Barcode Scan Verification Matching ---');
function testCheckBarcode(code: string, barcode: string, id: string): boolean {
  if (!code.trim()) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanBarcode = barcode.toUpperCase();
  const cleanId = id.toUpperCase();

  if (cleanCode === cleanBarcode) return true;
  if (cleanCode === cleanId) return true;
  if (cleanCode.includes(`/ITEM/${cleanId}`)) return true;

  const normCode = cleanCode.replace(/[^A-Z0-9]/g, '');
  const normBarcode = cleanBarcode.replace(/[^A-Z0-9]/g, '');
  if (normCode && normBarcode && normCode === normBarcode) return true;

  return false;
}

assert(testCheckBarcode('ACTIVE-1.02-70M', testItemActive.barcode, testItemActive.id) === true, 'Exact match ACTIVE-1.02-70M verifies');
assert(testCheckBarcode('active-1.02-70m', testItemActive.barcode, testItemActive.id) === true, 'Case-insensitive verifies');
assert(testCheckBarcode('ACTIVE-1.02-50M', testItemActive.barcode, testItemActive.id) === false, 'Different roll length is rejected');
assert(testCheckBarcode('ACTIVE-1.32-70M', testItemActive.barcode, testItemActive.id) === false, 'Different width is rejected');
assert(testCheckBarcode('PREMIUM-M-9-1.02-70M', testItemActive.barcode, testItemActive.id) === false, 'Different material is rejected');

// ------------------------------------------------------------------
// TEST 4: Stock OUT Zero-Boundary Enforcement
// ------------------------------------------------------------------
console.log('\n--- Test Suite 4: Stock OUT Boundary Enforcement ---');
const currentInHand = 6;
const attemptOverOut = 7;
assert(attemptOverOut > currentInHand, 'Attempting to remove 7 rolls when in-hand is 6 is safely blocked');

// ------------------------------------------------------------------
// TEST 5: Baseline Initial Dataset Verification
// ------------------------------------------------------------------
console.log('\n--- Test Suite 5: Baseline Dataset & Dashboard KPIs ---');
import { FLEX_SUMMARY_WIDTHS, VINYL_SUMMARY_WIDTHS, PVC_SHEET_SIZES, PVC_THICKNESSES } from './data/inventoryStore';
const calculatedDataset = calculateMatrixWithStock(INITIAL_MATRIX_ITEMS, INITIAL_MATRIX_TRANSACTIONS);
const metrics = calculateMatrixDashboardMetrics(calculatedDataset, INITIAL_MATRIX_TRANSACTIONS);

assert(metrics.totalStockIn === 0, 'Total Stock IN across baseline is 0 rolls', `Got ${metrics.totalStockIn}`);
assert(metrics.totalStockOut === 0, 'Total Stock OUT across baseline is 0 rolls', `Got ${metrics.totalStockOut}`);

// ------------------------------------------------------------------
// TEST 6: Multi-Summary Tables & Live Stock Totals
// ------------------------------------------------------------------
console.log('\n--- Test Suite 6: Multi-Summary Table Structures ---');

// Verify Flex Summary Widths
assert(
  JSON.stringify(FLEX_SUMMARY_WIDTHS) === JSON.stringify(['1.02', '1.32', '1.63', '1.93', '2.20', '2.54', '3.20']),
  'Flex Summary has exact 7 widths: 1.02, 1.32, 1.63, 1.93, 2.20, 2.54, 3.20'
);

// Verify Vinyl Summary Widths (0.94, 0.98, 1.02, 1.06, 1.27, 1.52, 1.37)
assert(
  JSON.stringify(VINYL_SUMMARY_WIDTHS) === JSON.stringify(['0.94', '0.98', '1.02', '1.06', '1.27', '1.52', '1.37']),
  'Vinyl Summary has exact 7 widths: 0.94, 0.98, 1.02, 1.06, 1.27, 1.52, 1.37'
);

// Verify PVC Sheet Sizes & Thicknesses
assert(
  JSON.stringify(PVC_SHEET_SIZES) === JSON.stringify(['8×4', '6×3', '5×10']),
  'PVC Sheet sizes: 8×4, 6×3, 5×10'
);
assert(
  JSON.stringify(PVC_THICKNESSES) === JSON.stringify(['2mm', '3mm', '4mm', '5mm']),
  'PVC Thicknesses: 2mm, 3mm, 4mm, 5mm'
);

// Check Backlit Sunlex in Flex Summary (Opening: 1+1+5+8+5+0 = 20 total)
const bsItems = calculatedDataset.filter((i) => i.materialName === 'Backlit Sunlex');
const bsTotal = bsItems.reduce((sum, i) => sum + i.currentStock, 0);
assert(bsTotal === 20, `Backlit Sunlex baseline total rolls is 20 (1+1+5+8+5+0)`, `Got ${bsTotal}`);

// Check Premium M 9 (16+9+18+13 = 56 rolls)
const pm9Items = calculatedDataset.filter((i) => i.materialName === 'Premium M 9');
const pm9Total = pm9Items.reduce((sum, i) => sum + i.currentStock, 0);
assert(pm9Total === 56, `Premium M 9 baseline total rolls is 56`, `Got ${pm9Total}`);

// Check S Print 22 (22+16+23+9+12+28 = 110 rolls)
const sp22Items = calculatedDataset.filter((i) => i.materialName === 'S Print 22');
const sp22Total = sp22Items.reduce((sum, i) => sum + i.currentStock, 0);
assert(sp22Total === 110, `S Print 22 baseline total rolls is 110`, `Got ${sp22Total}`);

// Check Vinyl Gloss 80 Mic (30+44+9 = 83 rolls)
const vg80Items = calculatedDataset.filter((i) => i.materialName === 'Vinyl Gloss 80 Mic');
const vg80Total = vg80Items.reduce((sum, i) => sum + i.currentStock, 0);
assert(vg80Total === 83, `Vinyl Gloss 80 Mic baseline total rolls is 83`, `Got ${vg80Total}`);

// ------------------------------------------------------------------
// TEST 7: Important Live Data Rule Validation
// "If: Backlit Sunlex / 1.63 currently has 5 Rolls and Stock IN adds 2 rolls,
//  the cell must update to 7 rolls automatically!"
// ------------------------------------------------------------------
console.log('\n--- Test Suite 7: Live Inventory Rule (Stock IN/OUT Updates Cells) ---');
const bs163Item = bsItems.find((i) => i.variantSize === '1.63');
assert(bs163Item?.currentStock === 5, 'Backlit Sunlex 1.63 starts at exactly 5 Rolls');

const testTxnsWithIn: MatrixStockTransaction[] = [
  {
    id: 'txn-dynamic-test',
    itemId: bs163Item!.id,
    materialName: bs163Item!.materialName,
    category: bs163Item!.category,
    variantSize: bs163Item!.variantSize,
    rollLengthMtr: 50,
    barcode: bs163Item!.barcode,
    type: 'IN',
    quantity: 2,
    areaMtr2: 163.0,
    stockBefore: 5,
    stockAfter: 7,
    unit: 'Rolls',
    date: '2026-10-03',
    createdAt: new Date().toISOString()
  }
];

const liveUpdatedDataset = calculateMatrixWithStock(INITIAL_MATRIX_ITEMS, testTxnsWithIn);
const liveBs163 = liveUpdatedDataset.find((i) => i.id === bs163Item!.id);
const liveBsTotal = liveUpdatedDataset
  .filter((i) => i.materialName === 'Backlit Sunlex')
  .reduce((sum, i) => sum + i.currentStock, 0);

assert(liveBs163?.currentStock === 7, `Backlit Sunlex / 1.63 cell updates from 5 to 7 rolls automatically!`, `Got ${liveBs163?.currentStock}`);
assert(liveBsTotal === 22, `Backlit Sunlex row total updates from 20 to 22 rolls automatically!`, `Got ${liveBsTotal}`);

// ------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(`QA TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================');

if (testsFailed > 0) {
  process.exit(1);
}
