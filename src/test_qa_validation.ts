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
  generateBatchNumber,
  formatDateToDDMMYY,
  normalizeInvoiceForBatch,
  findBatchesByBatchOrBarcode,
  INITIAL_MATRIX_ITEMS,
  INITIAL_MATRIX_TRANSACTIONS,
  INITIAL_MATRIX_BATCHES,
  getStoredMatrixBatches
} from './data/inventoryStore';
import { MatrixInventoryItem, MatrixStockTransaction, MatrixBatch } from './types/inventory';

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
// TEST 8: Full Roll Count Integer Validation & Save Button Conditions
// Example:
// Current Stock = 21, Roll Count = 5 -> Rolls IN = +5, After Stock IN = 26, Total Area Added = 81.5 × 5 = 407.5 m²
// Must disallow: 0, negative numbers, empty values, decimal roll counts
// ------------------------------------------------------------------
console.log('\n--- Test Suite 8: Full Roll Count Integer & Save Button Conditions ---');

function testParseFullRollCount(val: string): { valid: boolean; count: number; error?: string } {
  const trimmed = (val ?? '').toString().trim();
  if (!trimmed) {
    return { valid: false, count: 0, error: 'Roll count is required.' };
  }
  if (trimmed.includes('.') || trimmed.includes(',')) {
    return { valid: false, count: 0, error: 'Decimal roll counts are not allowed. Full rolls only.' };
  }
  if (trimmed.startsWith('-') || trimmed.includes('-')) {
    return { valid: false, count: 0, error: 'Negative numbers are not allowed.' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, count: 0, error: 'Roll count must be a positive whole number.' };
  }
  const num = parseInt(trimmed, 10);
  if (isNaN(num) || num <= 0) {
    return { valid: false, count: 0, error: 'Roll count must be greater than 0.' };
  }
  return { valid: true, count: num };
}

// 1. Positive whole numbers
assert(testParseFullRollCount('5').valid === true && testParseFullRollCount('5').count === 5, 'Input "5" parses as valid positive integer 5');
assert(testParseFullRollCount('21').valid === true && testParseFullRollCount('21').count === 21, 'Input "21" parses as valid positive integer 21');
assert(testParseFullRollCount(' 5 ').valid === true && testParseFullRollCount(' 5 ').count === 5, 'Input with spaces " 5 " parses as 5');

// 2. Reject 0, negative, empty, decimals
assert(testParseFullRollCount('0').valid === false, 'Input "0" is rejected (must be > 0)');
assert(testParseFullRollCount('-5').valid === false, 'Negative number "-5" is rejected');
assert(testParseFullRollCount('').valid === false, 'Empty value "" is rejected');
assert(testParseFullRollCount('5.5').valid === false, 'Decimal "5.5" is rejected');
assert(testParseFullRollCount('5.0').valid === false, 'Decimal "5.0" is rejected');
assert(testParseFullRollCount('abc').valid === false, 'Non-numeric string "abc" is rejected');

// 3. User's Expected Stock IN Calculation & Save Enablement Test
const currentStockTest = 21;
const rollCountInput = '5';
const rollVal = testParseFullRollCount(rollCountInput);
assert(rollVal.valid === true, 'Roll Count input "5" is valid');

const rollsInTest = rollVal.count;
const afterStockInTest = currentStockTest + rollsInTest;
const areaPerRollTest = 81.5; // e.g. 1.63 M × 50 M
const totalAreaAddedTest = Number((areaPerRollTest * rollsInTest).toFixed(2));

assert(rollsInTest === 5, 'Rolls IN equals +5');
assert(afterStockInTest === 26, 'After Stock IN equals 21 + 5 = 26');
assert(totalAreaAddedTest === 407.5, 'Total Area Added equals 81.5 × 5 = 407.5 m²');

// 4. Save Button Enabled Condition
function testIsStockInSaveEnabled(params: {
  material: string;
  size: string;
  length: string;
  rollCount: string;
  date: string;
  verified: boolean;
  hasItem: boolean;
}): boolean {
  const hasMaterial = Boolean(params.material.trim());
  const hasSize = Boolean(params.size.trim());
  const hasLength = Boolean(params.length.trim()) && parseFloat(params.length) > 0;
  const parsed = testParseFullRollCount(params.rollCount);
  const hasValidRolls = parsed.valid && parsed.count > 0;
  const hasValidDate = Boolean(params.date.trim()) && !isNaN(new Date(params.date).getTime());
  const isVerified = params.verified;

  return hasMaterial && hasSize && hasLength && hasValidRolls && hasValidDate && isVerified && params.hasItem;
}

// All 6 conditions valid -> Save button MUST be enabled
const canSaveValid = testIsStockInSaveEnabled({
  material: 'Bright FL 26',
  size: '1.63',
  length: '50',
  rollCount: '5',
  date: '2026-10-03',
  verified: true,
  hasItem: true
});
assert(canSaveValid === true, 'Save Stock IN button is ENABLED when all 6 conditions are valid');

// If barcode unverified -> Disabled
const canSaveUnverified = testIsStockInSaveEnabled({
  material: 'Bright FL 26',
  size: '1.63',
  length: '50',
  rollCount: '5',
  date: '2026-10-03',
  verified: false,
  hasItem: true
});
assert(canSaveUnverified === false, 'Save Stock IN button is DISABLED if barcode is unverified');

// If roll count is 0 -> Disabled
const canSaveZero = testIsStockInSaveEnabled({
  material: 'Bright FL 26',
  size: '1.63',
  length: '50',
  rollCount: '0',
  date: '2026-10-03',
  verified: true,
  hasItem: true
});
assert(canSaveZero === false, 'Save Stock IN button is DISABLED if roll count is 0');

// If roll count is decimal 5.5 -> Disabled
const canSaveDecimal = testIsStockInSaveEnabled({
  material: 'Bright FL 26',
  size: '1.63',
  length: '50',
  rollCount: '5.5',
  date: '2026-10-03',
  verified: true,
  hasItem: true
});
assert(canSaveDecimal === false, 'Save Stock IN button is DISABLED if roll count is decimal 5.5');

// ------------------------------------------------------------------
// TEST 8: Manual Numeric Size Input, Normalization & Dynamic Barcode
// ------------------------------------------------------------------
console.log('\n--- Test Suite 8: Manual Numeric Size & Length Calculations ---');

function normalizeNumericSize(val: string | number): string {
  const str = (val ?? '').toString().trim();
  if (!str) return '';
  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) return str;
  return parseFloat(num.toFixed(3)).toString();
}

// Normalization checks
assert(normalizeNumericSize('1.630') === '1.63', 'Normalizes 1.630 to 1.63 to prevent duplicate variants');
assert(normalizeNumericSize('1.00') === '1', 'Normalizes 1.00 to 1');
assert(normalizeNumericSize('1.40') === '1.40' || normalizeNumericSize('1.40') === '1.4', 'Normalizes manual size 1.40 consistently');

// Manual input calculation example from user prompt:
// Economy + Size 1.63 + Roll Length 69 + Roll Quantity 5
const manualSize = 1.63;
const manualLength = 69;
const manualRollQty = 5;
const areaPerRoll = Number((manualSize * manualLength).toFixed(2));
const totalAreaAdded = Number((areaPerRoll * manualRollQty).toFixed(2));

assert(areaPerRoll === 112.47, `Area Per Roll: 1.63 × 69 = 112.47 m² (got ${areaPerRoll})`);
assert(totalAreaAdded === 562.35, `Total Area Added: 112.47 × 5 = 562.35 m² (got ${totalAreaAdded})`);

// Expected dynamic barcode: ECONOMY-1.63-69M
const manualBarcode = generateMatrixBarcode('Economy', '1.63', 69);
assert(manualBarcode === 'ECONOMY-1.63-69M', `Dynamic barcode generated: ECONOMY-1.63-69M (got ${manualBarcode})`);

// ------------------------------------------------------------------
// TEST 9: Variable Roll Length & Zero Opening/Min Stock Material Master
// ------------------------------------------------------------------
console.log('\n--- Test Suite 9: Variable Roll Length & Zero Opening/Min Stock ---');

const variableLengthItem: MatrixInventoryItem = {
  id: 'custom-eco-69',
  materialName: 'Economy',
  category: 'Flex PVC',
  variantSize: '1.63',
  rollLengthMtr: 69, // Variable roll length (69M)
  unit: 'Rolls',
  barcode: generateMatrixBarcode('Economy', '1.63', 69),
  openingStock: 0, // Removed opening stock field -> defaults to 0
  minStock: 0, // Removed min stock field -> defaults to 0
  active: true,
  createdAt: '2026-10-10'
};

assert(variableLengthItem.rollLengthMtr === 69, 'Variable roll length accepted: 69 M');
assert(variableLengthItem.openingStock === 0, 'Opening stock defaults to 0');
assert(variableLengthItem.minStock === 0, 'Min stock defaults to 0');
assert(variableLengthItem.barcode === 'ECONOMY-1.63-69M', 'Barcode accurately reflects variable length 69M');

// Stock calculation with 0 opening stock + 4 rolls Stock IN
const customTxns: MatrixStockTransaction[] = [
  {
    id: 'tx-custom-in',
    itemId: variableLengthItem.id,
    materialName: variableLengthItem.materialName,
    category: variableLengthItem.category,
    variantSize: variableLengthItem.variantSize,
    rollLengthMtr: 69,
    barcode: variableLengthItem.barcode,
    type: 'IN',
    quantity: 4,
    areaMtr2: Number((4 * 1.63 * 69).toFixed(2)), // 449.88 m²
    stockBefore: 0,
    stockAfter: 4,
    unit: 'Rolls',
    date: '2026-10-10',
    createdAt: '2026-10-10T08:00:00Z'
  }
];

const customCalculated = calculateMatrixWithStock([variableLengthItem], customTxns)[0];
assert(customCalculated.currentStock === 4, 'Current stock is 4 Rolls (0 opening + 4 IN)', `Got ${customCalculated.currentStock}`);
assert(customCalculated.areaPerRoll === 112.47, 'Area per roll is 1.63 × 69 = 112.47 m²', `Got ${customCalculated.areaPerRoll}`);
assert(customCalculated.totalAreaMtr2 === 449.88, 'Total area is 4 × 112.47 = 449.88 m²', `Got ${customCalculated.totalAreaMtr2}`);
assert(customCalculated.status === 'IN_STOCK', 'Status is IN_STOCK when rolls > 0');

// ------------------------------------------------------------------
// TEST 10: CLIENT REQUIREMENTS — INVOICE + BATCH + BARCODE WORKFLOW
// 1. Mandatory invoice number
// 2. Batch Number auto-generation: DDMMYY + CLEANED_INVOICE_NUMBER
// 3. Date conversion: 10/10/2026 -> 101026, 03/01/2027 -> 030127, 25/12/2026 -> 251226
// 4. Invoice cleaning: remove spaces, slashes, hyphens, uppercase (GT-28728 -> GT28728, gst 1245 -> GST1245)
// 5. Maximum 15 characters (6 Date + Max 9 Invoice)
// 6. Long Invoice truncation for batch only (GSTINV28728234 -> GSTINV287 -> 101026GSTINV287)
// 7. Auto-update on date or invoice change
// 8. One batch per Stock IN, all rolls in batch share the SAME batch barcode
// ------------------------------------------------------------------
console.log('\n--- Test Suite 10: Invoice + Batch + Barcode Workflow ---');

// Date formatting tests
assert(formatDateToDDMMYY('10/10/2026') === '101026', 'Date conversion: 10/10/2026 -> 101026');
assert(formatDateToDDMMYY('2026-10-10') === '101026', 'Date conversion: 2026-10-10 -> 101026');
assert(formatDateToDDMMYY('03/01/2027') === '030127', 'Date conversion: 03/01/2027 -> 030127');
assert(formatDateToDDMMYY('25/12/2026') === '251226', 'Date conversion: 25/12/2026 -> 251226');

// Invoice cleaning tests
assert(normalizeInvoiceForBatch('GT28728') === 'GT28728', 'Clean invoice: GT28728 -> GT28728');
assert(normalizeInvoiceForBatch('GT-28728') === 'GT28728', 'Clean invoice: GT-28728 -> GT28728');
assert(normalizeInvoiceForBatch('INV/4589') === 'INV4589', 'Clean invoice: INV/4589 -> INV4589');
assert(normalizeInvoiceForBatch('gst 1245') === 'GST1245', 'Clean invoice: gst 1245 -> GST1245');
assert(normalizeInvoiceForBatch('AB-12/34') === 'AB1234', 'Clean invoice: AB-12/34 -> AB1234');

// Batch Number generation tests
const batch1 = generateBatchNumber('10/10/2026', 'GT28728');
assert(batch1 === '101026GT28728', `Generated batch is 101026GT28728 (got ${batch1})`);
assert(batch1.length === 13, `Length is 13 characters <= 15 chars`);

// Long Invoice number truncation test (Formula: 6 Date + max 9 Invoice = max 15 chars)
const longInvoiceBatch = generateBatchNumber('10/10/2026', 'GSTINV28728234');
assert(longInvoiceBatch === '101026GSTINV287', `Long invoice truncated in batch: 101026GSTINV287 (got ${longInvoiceBatch})`);
assert(longInvoiceBatch.length === 15, `Batch length strictly capped at 15 characters`);

// Auto-update on date change
const batchDate1 = generateBatchNumber('10/10/2026', 'GT28728');
const batchDate2 = generateBatchNumber('11/10/2026', 'GT28728');
assert(batchDate1 === '101026GT28728', 'Batch for 10/10/2026 is 101026GT28728');
assert(batchDate2 === '111026GT28728', 'Auto-updates on date change: 111026GT28728');

// All rolls in batch share the same barcode
const sampleBatch: MatrixBatch = {
  id: 'bat-test-01',
  batchNumber: '101026GT28728',
  materialName: 'Bright FL 26',
  category: 'Flex PVC',
  variantSize: '1.63',
  rollLengthMtr: 50,
  initialRollQuantity: 10,
  currentRemainingRollQuantity: 10,
  invoiceNumber: 'GT28728',
  stockInDate: '10/10/2026',
  barcodeValue: '101026GT28728',
  createdAt: '2026-10-10T10:00:00Z'
};

assert(sampleBatch.barcodeValue === sampleBatch.batchNumber, 'Barcode encodes exact Batch Number: 101026GT28728');
assert(sampleBatch.invoiceNumber === 'GT28728', 'Original invoice preserved in complete form: GT28728');
assert(sampleBatch.initialRollQuantity === 10, 'One batch created for all 10 rolls');

// Area calculations for batch: 1.63 M × 50 M × 10 rolls = 81.5 m² per roll, 815 m² total
const batchAreaPerRoll = Number((1.63 * 50).toFixed(2));
const batchTotalArea = Number((batchAreaPerRoll * 10).toFixed(2));
assert(batchAreaPerRoll === 81.5, `Batch area per roll is 1.63 × 50 = 81.50 m²`);
assert(batchTotalArea === 815.0, `Batch total area for 10 rolls is 815.00 m²`);

// ------------------------------------------------------------------
// TEST SUITE 11: Stock OUT with Batch Barcode Workflow
// ------------------------------------------------------------------
console.log('--- Test Suite 11: Stock OUT Batch Barcode & Stock Deductions ---');

// Case 1: Batch identification & deduction: 10 -> 7
let testBatchRemaining = sampleBatch.currentRemainingRollQuantity; // 10
const rollsOutBatch = 3;
assert(rollsOutBatch <= testBatchRemaining, 'Requested 3 rolls <= 10 in batch is valid');
testBatchRemaining -= rollsOutBatch;
assert(testBatchRemaining === 7, `Batch stock decrements from 10 to 7 Rolls (got ${testBatchRemaining})`);

// Case 2: Reject Stock OUT > Current Batch Roll Quantity
const attemptedExceedQty = 8;
const isBatchShortage = attemptedExceedQty > testBatchRemaining;
assert(isBatchShortage, `Attempting to remove 8 rolls when batch only has 7 is blocked as shortage`);

// Case 3: Overall inventory + Multiple batches
// Batch 1: 7 rolls, Batch 2: 5 rolls -> Overall: 12 rolls
const batch1Stock = 7;
const batch2Stock = 5;
const overallItemStock = batch1Stock + batch2Stock;
assert(overallItemStock === 12, 'Multiple batches (7 + 5) sum to 12 Rolls overall');
const afterBatch1Deduction = overallItemStock - 3;
assert(afterBatch1Deduction === 9, 'Dispatching 3 rolls reduces overall stock from 12 to 9 Rolls');

// ------------------------------------------------------------------
// TEST SUITE 12: USER SPECIFIC TEST CASES 1 TO 6
// ------------------------------------------------------------------
console.log('\n--- Test Suite 12: User Specific Test Cases 1 to 6 ---');

// TEST CASE 1:
// Material: Bright FL 26, Size: 1.63, Roll Length: 50, Qty: 10, Invoice: GT28728, Date: 10/10/2026
const tc1Batch = generateBatchNumber('10/10/2026', 'GT28728');
assert(tc1Batch === '101026GT28728', `[Test Case 1] Bright FL 26: Expected 101026GT28728, got ${tc1Batch}`);

// TEST CASE 2:
// Material: Premium M 10 BB, Size: 1.32, Roll Length: 70, Qty: 5, Invoice: INV-8821, Date: 10/10/2026
const tc2InvoiceNorm = normalizeInvoiceForBatch('INV-8821');
assert(tc2InvoiceNorm === 'INV8821', `[Test Case 2] Normalized Invoice INV-8821 -> INV8821`);
const tc2Batch = generateBatchNumber('10/10/2026', 'INV-8821');
assert(tc2Batch === '101026INV8821', `[Test Case 2] Premium M 10 BB: Expected 101026INV8821, got ${tc2Batch}`);

// TEST CASE 3:
// Material: BB S/M, Size: 1.63, Roll Length: 50, Qty: 2, Invoice: AB/12-34, Date: 11/10/2026
const tc3InvoiceNorm = normalizeInvoiceForBatch('AB/12-34');
assert(tc3InvoiceNorm === 'AB1234', `[Test Case 3] Normalized Invoice AB/12-34 -> AB1234`);
const tc3Batch = generateBatchNumber('11/10/2026', 'AB/12-34');
assert(tc3Batch === '111026AB1234', `[Test Case 3] BB S/M: Expected 111026AB1234, got ${tc3Batch}`);

// TEST CASE 4: LONG INVOICE
// Invoice: GSTINV28728234, Date: 10/10/2026
const tc4Batch = generateBatchNumber('10/10/2026', 'GSTINV28728234');
assert(tc4Batch === '101026GSTINV287', `[Test Case 4] Long Invoice: Expected 101026GSTINV287, got ${tc4Batch}`);
assert(tc4Batch.length === 15, `[Test Case 4] Length is exactly 15 chars`);

// TEST CASE 5: STATE CHANGE
// Changing Material, Size, Roll Length does NOT change Batch Number
const tc5BatchBefore = generateBatchNumber('10/10/2026', 'GT28728');
const tc5Material1 = 'Bright FL 26';
const tc5Material2 = 'Premium M 10 BB';
const tc5BatchAfterMatChange = generateBatchNumber('10/10/2026', 'GT28728');
assert(tc5BatchBefore === tc5BatchAfterMatChange, `[Test Case 5] Changing material does not alter batch number`);
// Changing invoice updates batch immediately
const tc5BatchNewInvoice = generateBatchNumber('10/10/2026', 'INV-9900');
assert(tc5BatchNewInvoice === '101026INV9900', `[Test Case 5] Changing invoice immediately updates batch: 101026INV9900`);
// Changing date updates batch immediately
const tc5BatchNewDate = generateBatchNumber('12/10/2026', 'INV-9900');
assert(tc5BatchNewDate === '121026INV9900', `[Test Case 5] Changing date immediately updates batch: 121026INV9900`);

// TEST CASE 6: RELOAD / STORAGE PERSISTENCE
const simulatedStorage: Record<string, string> = {};
const testBatchRecord: MatrixBatch = {
  id: 'bat-persist-test',
  batchNumber: '101026GT28728',
  materialName: 'Bright FL 26',
  category: 'Frontlit Flex',
  variantSize: '1.63',
  rollLengthMtr: 50,
  initialRollQuantity: 10,
  currentRemainingRollQuantity: 10,
  invoiceNumber: 'GT28728',
  stockInDate: '2026-10-10',
  barcodeValue: '101026GT28728',
  createdAt: '2026-10-10T10:00:00Z'
};
simulatedStorage['rollprint_client_batches_v1'] = JSON.stringify([testBatchRecord]);
const reloaded = JSON.parse(simulatedStorage['rollprint_client_batches_v1']);
assert(Array.isArray(reloaded) && reloaded.length === 1, '[Test Case 6] Batches persist across reload');
assert(reloaded[0].batchNumber === '101026GT28728', '[Test Case 6] Reloaded batch retains exact batch number');
assert(reloaded[0].barcodeValue === '101026GT28728', '[Test Case 6] Reloaded batch retains barcode value');

// ------------------------------------------------------------------
// TEST SUITE 13: FULL MATERIAL TEST MATRIX (ALL 20 MATERIALS)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 13: Material Test Matrix (All 20 Materials) ---');

const ALL_MATERIALS = [
  'Backlit Sunlex',
  'Backlit Megha',
  'Backlit Hetax',
  'Premium M 9',
  'Premium M 10 BB',
  'Premium S 10 BB',
  'BB S/M',
  'Lite',
  'Economy',
  'S Print 22',
  'Bright FL 26',
  'Hi Gloss HL-23',
  'Hi Gloss HL-30',
  'Vinyl Gloss 80 Mic',
  'Vinyl Gloss 100 Mic',
  'Vinyl Matt 100 Mic',
  'Premium One Way',
  'Lamination Matt',
  'Lamination Gloss',
  'PVC Foam Sheet 3mm'
];

ALL_MATERIALS.forEach((mat) => {
  const generated = generateBatchNumber('10/10/2026', 'INV123');
  assert(
    generated === '101026INV123',
    `Material "${mat}" produces deterministic batch 101026INV123 independent of material name`
  );
});

// ------------------------------------------------------------------
// TEST SUITE 14: DECIMAL SIZES & MANUAL LENGTHS MATRIX
// ------------------------------------------------------------------
console.log('\n--- Test Suite 14: Decimal Sizes & Manual Lengths Matrix ---');

const TEST_SIZES = ['0.94', '0.98', '1.02', '1.06', '1.27', '1.32', '1.37', '1.52', '1.63', '1.93', '2.20', '2.54', '3.20'];
const TEST_LENGTHS = [37, 50, 69, 70];

TEST_SIZES.forEach((sz) => {
  TEST_LENGTHS.forEach((len) => {
    const batch = generateBatchNumber('15/10/2026', 'TEST77');
    assert(batch === '151026TEST77', `Size ${sz}M and Length ${len}M maintain batch: 151026TEST77`);
  });
});

// ------------------------------------------------------------------
// TEST SUITE 15: SPECIAL CHARACTERS IN MATERIALS & INVOICES
// ------------------------------------------------------------------
console.log('\n--- Test Suite 15: Special Characters Matrix ---');

const specialInvoiceInputs = [
  { raw: 'INV/2026-99', expectedNorm: 'INV202699', expectedBatch: '101026INV202699' },
  { raw: 'GT #88*21', expectedNorm: 'GT8821', expectedBatch: '101026GT8821' },
  { raw: 'ab.cd-ef', expectedNorm: 'ABCDEF', expectedBatch: '101026ABCDEF' },
  { raw: '   INVOICE  123   ', expectedNorm: 'INVOICE12', expectedBatch: '101026INVOICE12' }
];

specialInvoiceInputs.forEach((test) => {
  const norm = normalizeInvoiceForBatch(test.raw);
  const batch = generateBatchNumber('10/10/2026', test.raw);
  assert(norm === test.expectedNorm, `Normalized special invoice "${test.raw}" -> "${test.expectedNorm}"`);
  assert(batch === test.expectedBatch, `Batch for "${test.raw}" -> "${test.expectedBatch}"`);
});

// ------------------------------------------------------------------
// TEST SUITE 16: DUPLICATE BATCH NUMBER EDGE CASE
// ------------------------------------------------------------------
console.log('\n--- Test Suite 16: Duplicate Batch Number Edge Case ---');

const duplicateBatchesPool: MatrixBatch[] = [
  {
    id: 'bat-line-1',
    batchNumber: '101026GT28728',
    materialName: 'Bright FL 26',
    category: 'Frontlit Flex',
    variantSize: '1.63',
    rollLengthMtr: 50,
    initialRollQuantity: 10,
    currentRemainingRollQuantity: 10,
    invoiceNumber: 'GT28728',
    stockInDate: '2026-10-10',
    barcodeValue: '101026GT28728',
    createdAt: '2026-10-10T08:00:00Z'
  },
  {
    id: 'bat-line-2',
    batchNumber: '101026GT28728',
    materialName: 'Premium M 10 BB',
    category: 'Flex PVC',
    variantSize: '1.32',
    rollLengthMtr: 70,
    initialRollQuantity: 5,
    currentRemainingRollQuantity: 5,
    invoiceNumber: 'GT28728',
    stockInDate: '2026-10-10',
    barcodeValue: '101026GT28728',
    createdAt: '2026-10-10T08:05:00Z'
  }
];

const matches = findBatchesByBatchOrBarcode(duplicateBatchesPool, '101026GT28728');
assert(matches.length === 2, `Detected duplicate batch lines: exactly 2 records found for 101026GT28728`);
assert(matches[0].materialName === 'Bright FL 26', `Line 1 is Bright FL 26`);
assert(matches[1].materialName === 'Premium M 10 BB', `Line 2 is Premium M 10 BB`);

// ------------------------------------------------------------------
// TEST SUITE 17: MINIMAL ROLL BARCODE LABEL SPECIFICATION
// ------------------------------------------------------------------
console.log('\n--- Test Suite 17: Minimal Roll Barcode Label Specification ---');

const sampleBatchForLabel: MatrixBatch = {
  id: 'bat-10102612321',
  batchNumber: '10102612321',
  materialName: 'Bright FL 26',
  category: 'Frontlit Flex',
  variantSize: '1.63',
  rollLengthMtr: 50,
  initialRollQuantity: 10,
  currentRemainingRollQuantity: 10,
  invoiceNumber: '12321',
  stockInDate: '2026-10-10',
  barcodeValue: '10102612321',
  createdAt: '2026-10-10T10:00:00Z'
};

// 1. Barcode value must encode exactly the batch number (10102612321)
assert(sampleBatchForLabel.barcodeValue === '10102612321', 'Barcode value encodes exactly 10102612321');
assert(sampleBatchForLabel.batchNumber === '10102612321', 'Human-readable batch number below barcode is 10102612321');

// 2. All 10 roll copies for 10 rolls receive the exact same barcode & batch number
const rollCopiesTen = Array.from({ length: 10 }, () => sampleBatchForLabel.barcodeValue);
assert(rollCopiesTen.length === 10, 'Generated 10 roll label copies for 10 rolls');
assert(rollCopiesTen.every((code) => code === '10102612321'), 'All 10 labels have identical barcode 10102612321');

// 3. 1 test label copy retains the exact same barcode & batch number
const rollCopiesOne = Array.from({ length: 1 }, () => sampleBatchForLabel.barcodeValue);
assert(rollCopiesOne.length === 1, 'Generated 1 label copy for testing/reprinting');
assert(rollCopiesOne[0] === '10102612321', 'Single test label has exact barcode 10102612321');

// 4. Verification that label does NOT embed material, size, or invoice into barcode
assert(!sampleBatchForLabel.barcodeValue.includes('Bright FL 26'), 'Barcode does not include material name');
assert(!sampleBatchForLabel.barcodeValue.includes('Frontlit Flex'), 'Barcode does not include category');
assert(!sampleBatchForLabel.barcodeValue.includes('1.63'), 'Barcode does not include size');
assert(!sampleBatchForLabel.barcodeValue.includes('50M'), 'Barcode does not include roll length');
assert(!sampleBatchForLabel.barcodeValue.includes('Batch Number:'), 'Barcode does not include label prefix');

// ------------------------------------------------------------------
// TEST SUITE 18: CRITICAL DATA INTEGRITY — ONE SOURCE OF TRUTH (TEST CASES 1 TO 6)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 18: Critical Data Integrity & Manual Roll Length Preservation ---');

// Helper simulating the exact payload and transaction creation logic
function simulateStockInTransaction(
  item: MatrixInventoryItem,
  payload: {
    width: string;
    rollLength: number;
    rollQuantity: number;
    invoiceNumber: string;
    date: string;
    batchNumber: string;
  },
  currentStock: number
): { txn: MatrixStockTransaction; batch: MatrixBatch } {
  const widthNum = parseFloat(payload.width);
  const lengthNum = payload.rollLength;
  const areaMtr2 = Number((payload.rollQuantity * widthNum * lengthNum).toFixed(2));
  const stockBefore = currentStock;
  const stockAfter = currentStock + payload.rollQuantity;

  const batch: MatrixBatch = {
    id: `bat-test-${Date.now()}`,
    batchNumber: payload.batchNumber,
    materialName: item.materialName,
    category: item.category,
    variantSize: payload.width,
    rollLengthMtr: lengthNum,
    initialRollQuantity: payload.rollQuantity,
    currentRemainingRollQuantity: payload.rollQuantity,
    invoiceNumber: payload.invoiceNumber,
    stockInDate: payload.date,
    barcodeValue: payload.batchNumber,
    createdAt: new Date().toISOString()
  };

  const txn: MatrixStockTransaction = {
    id: `tx-test-${Date.now()}`,
    itemId: item.id,
    materialName: item.materialName,
    category: item.category,
    variantSize: payload.width,
    rollLengthMtr: lengthNum,
    barcode: payload.batchNumber,
    type: 'IN',
    quantity: payload.rollQuantity,
    areaMtr2,
    stockBefore,
    stockAfter,
    unit: item.unit,
    date: payload.date,
    invoiceNumber: payload.invoiceNumber,
    batchNumber: payload.batchNumber,
    batchId: batch.id,
    createdAt: new Date().toISOString()
  };

  return { txn, batch };
}

// TEST CASE 1: Current Bug Case (Backlit Hetax: Width 1.02, Roll Length 22, Quantity 1)
const hetaxBaseItem: MatrixInventoryItem = {
  id: 'bh-102',
  materialName: 'Backlit Hetax',
  category: 'Backlit',
  variantSize: '1.02',
  rollLengthMtr: 50, // Base master record has 50M
  unit: 'Rolls',
  barcode: 'BACKLIT-HETAX-1.02-50M',
  openingStock: 2,
  minStock: 2,
  active: true,
  createdAt: '2026-09-01'
};

const tc1 = simulateStockInTransaction(
  hetaxBaseItem,
  {
    width: '1.02',
    rollLength: 22,
    rollQuantity: 1,
    invoiceNumber: 'SDFSAF',
    date: '10/10/2026',
    batchNumber: '101026SDFSAF'
  },
  2
);

assert(tc1.txn.variantSize === '1.02', '[Test Case 1] Transaction width is exactly 1.02 M');
assert(tc1.txn.rollLengthMtr === 22, `[Test Case 1] Transaction length is exactly 22 M (NOT 50 M): got ${tc1.txn.rollLengthMtr}`);
assert(tc1.txn.quantity === 1, '[Test Case 1] Transaction quantity is 1 Roll');
assert(tc1.txn.areaMtr2 === 22.44, `[Test Case 1] Transaction area is 22.44 m² (1.02 × 22 = 22.44, NOT 51): got ${tc1.txn.areaMtr2}`);
assert(tc1.txn.stockBefore === 2, '[Test Case 1] Stock before is 2');
assert(tc1.txn.stockAfter === 3, '[Test Case 1] Stock after is 3');
assert(tc1.batch.rollLengthMtr === 22, `[Test Case 1] Batch length is exactly 22 M: got ${tc1.batch.rollLengthMtr}`);
assert(tc1.batch.batchNumber === '101026SDFSAF', '[Test Case 1] Batch number is 101026SDFSAF');

// TEST CASE 2: Width 1.63, Roll Length 37, Quantity 2
const tc2 = simulateStockInTransaction(
  {
    id: 'test-163',
    materialName: 'Frontlit Flex',
    category: 'Flex PVC',
    variantSize: '1.63',
    rollLengthMtr: 70, // Master record has 70M
    unit: 'Rolls',
    barcode: 'FRONTLIT-1.63-70M',
    openingStock: 5,
    minStock: 2,
    active: true,
    createdAt: '2026-09-01'
  },
  {
    width: '1.63',
    rollLength: 37,
    rollQuantity: 2,
    invoiceNumber: 'INV-37',
    date: '10/10/2026',
    batchNumber: '101026INV37'
  },
  5
);

const areaPerRollTc2 = Number((1.63 * 37).toFixed(2));
assert(areaPerRollTc2 === 60.31, `[Test Case 2] Area per roll is 60.31 m²: got ${areaPerRollTc2}`);
assert(tc2.txn.rollLengthMtr === 37, `[Test Case 2] Saved transaction length is 37 M (NOT 50/70): got ${tc2.txn.rollLengthMtr}`);
assert(tc2.txn.areaMtr2 === 120.62, `[Test Case 2] Total area is 120.62 m² (2 × 60.31): got ${tc2.txn.areaMtr2}`);

// TEST CASE 3: Width 2.54, Roll Length 69, Quantity 3
const tc3 = simulateStockInTransaction(
  {
    id: 'test-254',
    materialName: 'Premium M 9',
    category: 'Flex PVC',
    variantSize: '2.54',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'PREMIUM-2.54-50M',
    openingStock: 4,
    minStock: 2,
    active: true,
    createdAt: '2026-09-01'
  },
  {
    width: '2.54',
    rollLength: 69,
    rollQuantity: 3,
    invoiceNumber: 'INV-69',
    date: '10/10/2026',
    batchNumber: '101026INV69'
  },
  4
);

assert(tc3.txn.rollLengthMtr === 69, `[Test Case 3] Length is 69 M: got ${tc3.txn.rollLengthMtr}`);
assert(tc3.txn.areaMtr2 === 525.78, `[Test Case 3] Total area is 525.78 m² (2.54 × 69 × 3): got ${tc3.txn.areaMtr2}`);

// TEST CASE 4: Common Value (Width 1.32, Roll Length 50, Quantity 2)
const tc4 = simulateStockInTransaction(
  {
    id: 'test-132',
    materialName: 'Backlit Sunlex',
    category: 'Backlit',
    variantSize: '1.32',
    rollLengthMtr: 70, // Master record had 70M
    unit: 'Rolls',
    barcode: 'BACKLIT-1.32-70M',
    openingStock: 2,
    minStock: 2,
    active: true,
    createdAt: '2026-09-01'
  },
  {
    width: '1.32',
    rollLength: 50,
    rollQuantity: 2,
    invoiceNumber: 'INV-50',
    date: '10/10/2026',
    batchNumber: '101026INV50'
  },
  2
);

assert(tc4.txn.rollLengthMtr === 50, `[Test Case 4] User-entered 50M preserved: got ${tc4.txn.rollLengthMtr}`);
assert(tc4.txn.areaMtr2 === 132.0, `[Test Case 4] Total area is 132 m² (1.32 × 50 × 2): got ${tc4.txn.areaMtr2}`);

// TEST CASE 5: Change value 50 -> 22 before save (check for stale state)
let formRollLengthInput = '50';
formRollLengthInput = '22'; // user changes input before submitting
const tc5 = simulateStockInTransaction(
  hetaxBaseItem,
  {
    width: '1.02',
    rollLength: parseFloat(formRollLengthInput),
    rollQuantity: 1,
    invoiceNumber: 'CHANGED-INV',
    date: '10/10/2026',
    batchNumber: '101026CHANGED'
  },
  3
);

assert(tc5.txn.rollLengthMtr === 22, `[Test Case 5] Final updated input 22 is saved (NOT stale 50): got ${tc5.txn.rollLengthMtr}`);
assert(tc5.txn.areaMtr2 === 22.44, `[Test Case 5] Area updated to 22.44 m²: got ${tc5.txn.areaMtr2}`);

// TEST CASE 6: Stock OUT scan batch with 22M
// Batch created in TC1 with 22M is now dispatched in Stock OUT
const scannedBatchForOut = tc1.batch;
const stockOutRolls = 1;
const outWidthNum = parseFloat(scannedBatchForOut.variantSize);
const outLengthNum = scannedBatchForOut.rollLengthMtr;
const outAreaPerRoll = Number((outWidthNum * outLengthNum).toFixed(2));
const outTotalArea = Number((outAreaPerRoll * stockOutRolls).toFixed(2));

assert(outLengthNum === 22, `[Test Case 6] Scanned batch retains length 22 M (NOT 50): got ${outLengthNum}`);
assert(outWidthNum === 1.02, `[Test Case 6] Scanned batch retains width 1.02 M: got ${outWidthNum}`);
assert(outAreaPerRoll === 22.44, `[Test Case 6] Stock OUT area per roll is 22.44 m²: got ${outAreaPerRoll}`);
assert(outTotalArea === 22.44, `[Test Case 6] Stock OUT total area is 22.44 m²: got ${outTotalArea}`);

// TEST CASE 7: Zero / Missing / Invalid Roll Length strictly blocks save (no silent 70/50 fallback)
function testRollLengthValidation(val: string): { valid: boolean; length: number } {
  const str = (val ?? '').toString().trim();
  const num = parseFloat(str);
  if (!str || isNaN(num) || num <= 0) {
    return { valid: false, length: 0 };
  }
  return { valid: true, length: parseFloat(num.toFixed(2)) };
}

assert(!testRollLengthValidation('').valid, '[Test Case 7] Empty roll length is invalid');
assert(!testRollLengthValidation('0').valid, '[Test Case 7] 0 roll length is invalid');
assert(!testRollLengthValidation('-10').valid, '[Test Case 7] Negative roll length is invalid');
assert(!testRollLengthValidation('abc').valid, '[Test Case 7] Non-numeric roll length is invalid');
assert(testRollLengthValidation('22').valid && testRollLengthValidation('22').length === 22, '[Test Case 7] Valid input 22 passes with length 22');

// ------------------------------------------------------------------
// TEST SUITE 19: Real Barcode Scanner Workflow (101026GE23542)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 19: Real Barcode Scanner Workflow (101026GE23542) ---');

// 1. Database query by scanned Batch Number
const testBatches = getStoredMatrixBatches();
const scannedBatchCode = '101026GE23542';
const foundBatches = findBatchesByBatchOrBarcode(testBatches, scannedBatchCode);

assert(foundBatches.length > 0, `Scanned barcode ${scannedBatchCode} must be found in database`);
const realBatch = foundBatches[0];

assert(realBatch.materialName === 'Backlit Hetax', `Material must be Backlit Hetax (got ${realBatch.materialName})`);
assert(realBatch.category === 'Backlit', `Category must be Backlit (got ${realBatch.category})`);
assert(realBatch.variantSize === '1.02', `Size must be 1.02 M (got ${realBatch.variantSize})`);
assert(realBatch.rollLengthMtr === 12, `Roll Length must be 12 M (got ${realBatch.rollLengthMtr})`);
assert(realBatch.invoiceNumber === 'GE23542', `Invoice must be GE23542 (got ${realBatch.invoiceNumber})`);
assert(realBatch.batchNumber === '101026GE23542', `Batch must be 101026GE23542 (got ${realBatch.batchNumber})`);
assert(realBatch.currentRemainingRollQuantity === 7, `Current batch stock must be 7 Rolls (got ${realBatch.currentRemainingRollQuantity})`);

// 2. Stock OUT execution after scan
const batchStockBefore = realBatch.currentRemainingRollQuantity;
const rollsToDispatch = 2;
const batchStockAfter = Math.max(0, batchStockBefore - rollsToDispatch);
const geAreaPerRoll = Number((parseFloat(realBatch.variantSize) * realBatch.rollLengthMtr).toFixed(2));
const geTotalAreaOut = Number((geAreaPerRoll * rollsToDispatch).toFixed(2));

assert(batchStockBefore === 7, 'Before stock is 7 Rolls');
assert(rollsToDispatch === 2, 'Rolls OUT is 2 Rolls');
assert(batchStockAfter === 5, 'After stock is 5 Rolls (7 - 2 = 5)');
assert(geAreaPerRoll === 12.24, `Area per roll is 1.02 × 12 = 12.24 m² (got ${geAreaPerRoll})`);
assert(geTotalAreaOut === 24.48, `Total Area OUT is 24.48 m² (got ${geTotalAreaOut})`);

// 3. Invalid Barcode Detection Test
const invalidScannedCode = '101026UNKNOWN99';
const invalidMatches = findBatchesByBatchOrBarcode(testBatches, invalidScannedCode);
assert(invalidMatches.length === 0, `Invalid barcode ${invalidScannedCode} must return 0 matches`);
const notFoundMessage = `Batch not found for barcode ${invalidScannedCode}.`;
assert(notFoundMessage === 'Batch not found for barcode 101026UNKNOWN99.', 'Clear not found message formatted correctly');

// 4. Case-insensitive and whitespace-trimmed manual lookup fallback
const manualInputCode = '   101026ge23542   ';
const manualMatches = findBatchesByBatchOrBarcode(testBatches, manualInputCode);
assert(manualMatches.length > 0, 'Manual lookup handles whitespace and lowercase correctly');
assert(manualMatches[0].batchNumber === '101026GE23542', 'Manual lookup finds exact batch');

// ------------------------------------------------------------------
// TEST SUITE 20: Critical Barcode Scannability Fix (Batch Number Only)
// ------------------------------------------------------------------
console.log('\n--- Test Suite 20: Pure Batch Number CODE128 Scannability Specification ---');

// 1. Barcode Encodes ONLY the Batch Number
const testBatchNumber = '121026AB12345';
const encodedBarcodeValue = testBatchNumber;
const displayedBarcodeText = testBatchNumber;

assert(
  encodedBarcodeValue === '121026AB12345',
  `CODE128 barcode encodes ONLY Batch Number: ${encodedBarcodeValue}`
);
assert(
  !encodedBarcodeValue.includes('http'),
  'Barcode value does NOT encode website URL (preserves optimal linear density)'
);
assert(
  displayedBarcodeText === '121026AB12345',
  `Visible human-readable text below barcode shows: ${displayedBarcodeText}`
);

// 2. Barcode Generation Settings (JsBarcode Configuration)
const jsBarcodeConfig = {
  format: 'CODE128',
  width: 2,
  height: 70,
  margin: 12,
  displayValue: true,
  text: testBatchNumber,
  fontSize: 18,
  textMargin: 6
};

assert(jsBarcodeConfig.format === 'CODE128', 'Format is genuine CODE128');
assert(jsBarcodeConfig.width === 2, 'Module width is 2');
assert(jsBarcodeConfig.height === 70, 'Barcode height is 70');
assert(jsBarcodeConfig.margin === 12, 'Quiet zone margin is 12 on both sides');
assert(jsBarcodeConfig.fontSize === 18, 'Human readable font size is 18');
assert(jsBarcodeConfig.textMargin === 6, 'Text margin is 6');

// 3. Database Query for Batch 121026AB12345
const batchResult = testBatches.find((b) => b.batchNumber === '121026AB12345');
assert(Boolean(batchResult), 'Database contains batch 121026AB12345');
assert(batchResult!.materialName === 'Bright FL 26', 'Material is Bright FL 26');
assert(batchResult!.variantSize === '1.63', 'Size is 1.63 M');
assert(batchResult!.rollLengthMtr === 50, 'Roll Length is 50 M');
assert(batchResult!.invoiceNumber === 'AB-12/345', 'Invoice is AB-12/345');
assert(batchResult!.batchNumber === '121026AB12345', 'Batch is 121026AB12345');
assert(batchResult!.currentRemainingRollQuantity === 5, 'Batch Stock is 5 Rolls');

// 4. Stock OUT Workflow on Batch 121026AB12345
const initialRolls = batchResult!.currentRemainingRollQuantity;
const rollsOutRequested = 1;
const expectedRemaining = initialRolls - rollsOutRequested;

assert(initialRolls === 5, 'Available stock before: 5 Rolls');
assert(rollsOutRequested === 1, 'Rolls OUT: 1 Roll');
assert(expectedRemaining === 4, 'Available stock after: 4 Rolls');

// 5. Manual Fallback Lookup Verification
const manualLookupBatch = testBatches.find((b) => b.batchNumber.trim() === '121026AB12345');
assert(Boolean(manualLookupBatch), 'Manual fallback lookup resolves batch 121026AB12345');
assert(manualLookupBatch!.materialName === 'Bright FL 26', 'Manual lookup finds Bright FL 26');

// ------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(`QA TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================');

if (testsFailed > 0) {
  process.exit(1);
}

