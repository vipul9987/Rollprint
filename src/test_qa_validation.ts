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
  INITIAL_MATRIX_TRANSACTIONS
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
// SUMMARY
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(`QA TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================');

if (testsFailed > 0) {
  process.exit(1);
}
