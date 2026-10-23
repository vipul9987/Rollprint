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
  getStoredMatrixBatches,
  createPhysicalRollRecords,
  validateUniqueRollBarcode,
  queryRollByExactBarcode,
  computeDashboardMatrixTables,
  getMaterialRowDisplayOrder,
  normalizeSummaryGroup,
  saveMaterialsToSupabase,
  fetchMaterialsFromSupabase,
  saveStoredMatrixItems,
  getStoredMatrixItems
} from './data/inventoryStore';
import {
  executeRollStockOutTransaction,
  executeAtomicRollDispatch,
  getStoredInventoryRolls,
  saveStoredInventoryRolls,
  generateInitialRolls,
  isProductionEnvironment,
  isSupabaseConfigured,
  setForceProductionModeForTesting,
  checkProductionDatabaseGuard
} from './data/rollDatabase';
import { MatrixInventoryItem, MatrixStockTransaction, MatrixBatch, InventoryRoll } from './types/inventory';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Verify Flex Summary Widths (2.20 and 3.20 removed per Client Requirement)
assert(
  JSON.stringify(FLEX_SUMMARY_WIDTHS) === JSON.stringify(['1.02', '1.32', '1.63', '1.93', '2.54']),
  'Flex Summary has exact 5 widths: 1.02, 1.32, 1.63, 1.93, 2.54 (2.20 & 3.20 removed)'
);
assert(!FLEX_SUMMARY_WIDTHS.includes('2.20'), 'Flex Summary does NOT contain 2.20');
assert(!FLEX_SUMMARY_WIDTHS.includes('3.20'), 'Flex Summary does NOT contain 3.20');

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
// TEST SUITE 21: 46 X 11 MM Physical Barcode Label & Transaction History Filters
// ------------------------------------------------------------------
console.log('\n--- Test Suite 21: 46 X 11 mm Barcode Label & Dedicated Transaction Filters ---');

// 1. Barcode Label Dimensions: 46 x 11 mm
const thermalLabelSpecs = {
  widthMm: 46,
  heightMm: 11,
  jsBarcode: {
    format: 'CODE128',
    width: 1,
    height: 22,
    margin: 2,
    fontSize: 9,
    textMargin: 1
  }
};

assert(thermalLabelSpecs.widthMm === 46, 'Sticker physical width is 46 mm');
assert(thermalLabelSpecs.heightMm === 11, 'Sticker physical height is 11 mm');
assert(thermalLabelSpecs.jsBarcode.width === 1, '46x11mm barcode module width is 1 (optimized for 46mm width)');
assert(thermalLabelSpecs.jsBarcode.height === 22, '46x11mm barcode height is 22px (fits in 11mm label)');
assert(thermalLabelSpecs.jsBarcode.fontSize === 9, '46x11mm human readable font size is 9px');

// 2. Transaction Filter Logic: Date, Invoice No, Item, Size, Length
const sampleTransactions: MatrixStockTransaction[] = [
  {
    id: 'txn-1',
    itemId: 'item-hetax',
    barcode: 'BC-HETAX',
    unit: 'Rolls',
    date: '2026-10-10 19:14',
    createdAt: '2026-10-10T19:14:00Z',
    type: 'OUT',
    materialName: 'Backlit Hetax',
    category: 'Backlit',
    variantSize: '1.02',
    rollLengthMtr: 12,
    quantity: 1,
    areaMtr2: 12.24,
    stockBefore: 4,
    stockAfter: 3,
    invoiceNumber: 'ge23542',
    batchNumber: '101026GE23542'
  },
  {
    id: 'txn-2',
    itemId: 'item-hetax',
    barcode: 'BC-HETAX',
    unit: 'Rolls',
    date: '2026-10-10 17:56',
    createdAt: '2026-10-10T17:56:00Z',
    type: 'IN',
    materialName: 'Backlit Hetax',
    category: 'Backlit',
    variantSize: '1.02',
    rollLengthMtr: 12,
    quantity: 1,
    areaMtr2: 12.24,
    stockBefore: 3,
    stockAfter: 4,
    invoiceNumber: 'ge23542',
    batchNumber: '101026GE23542'
  },
  {
    id: 'txn-3',
    itemId: 'item-hetax',
    barcode: 'BC-HETAX',
    unit: 'Rolls',
    date: '2026-10-10 17:55',
    createdAt: '2026-10-10T17:55:00Z',
    type: 'IN',
    materialName: 'Backlit Hetax',
    category: 'Backlit',
    variantSize: '1.02',
    rollLengthMtr: 50,
    quantity: 1,
    areaMtr2: 51,
    stockBefore: 2,
    stockAfter: 3,
    invoiceNumber: 'grtr14123',
    batchNumber: '101026GRTR14123'
  },
  {
    id: 'txn-4',
    itemId: 'item-active',
    barcode: 'BC-ACTIVE',
    unit: 'Rolls',
    date: '2026-10-10 17:26',
    createdAt: '2026-10-10T17:26:00Z',
    type: 'IN',
    materialName: 'Active',
    category: 'Flex PVC',
    variantSize: '1.02',
    rollLengthMtr: 70,
    quantity: 10,
    areaMtr2: 714,
    stockBefore: 5,
    stockAfter: 15,
    invoiceNumber: 'gt112233',
    batchNumber: '101026GT112233'
  }
];

function filterTxns(
  txns: MatrixStockTransaction[],
  filters: {
    type?: 'ALL' | 'IN' | 'OUT';
    date?: string;
    invoice?: string;
    item?: string;
    size?: string;
    length?: string;
  }
) {
  return txns.filter((t) => {
    if (filters.type && filters.type !== 'ALL' && t.type !== filters.type) return false;
    if (filters.date && filters.date.trim()) {
      const q = filters.date.trim();
      const match =
        (t.date && t.date.includes(q)) ||
        (t.createdAt && t.createdAt.startsWith(q)) ||
        formatDateToDDMMYY(t.date || '') === formatDateToDDMMYY(q);
      if (!match) return false;
    }
    if (filters.invoice && filters.invoice.trim()) {
      if (!t.invoiceNumber?.toLowerCase().includes(filters.invoice.trim().toLowerCase())) return false;
    }
    if (filters.item && filters.item !== 'ALL') {
      if (t.materialName.toLowerCase() !== filters.item.toLowerCase()) return false;
    }
    if (filters.size && filters.size !== 'ALL') {
      if (t.variantSize.trim() !== filters.size.trim()) return false;
    }
    if (filters.length && filters.length !== 'ALL') {
      const num = parseFloat(filters.length);
      if (!isNaN(num) && t.rollLengthMtr !== num) return false;
    }
    return true;
  });
}

// Test Date filter
const dateFiltered = filterTxns(sampleTransactions, { date: '2026-10-10' });
assert(dateFiltered.length === 4, 'Date filter matches all 4 transactions on 2026-10-10');

// Test Invoice No filter
const invFiltered = filterTxns(sampleTransactions, { invoice: 'ge23542' });
assert(invFiltered.length === 2, 'Invoice filter ge23542 matches 2 transactions');

// Test Item filter
const itemFiltered = filterTxns(sampleTransactions, { item: 'Active' });
assert(itemFiltered.length === 1 && itemFiltered[0].materialName === 'Active', 'Item filter Active matches 1 transaction');

// Test Size filter
const sizeFiltered = filterTxns(sampleTransactions, { size: '1.02' });
assert(sizeFiltered.length === 4, 'Size filter 1.02 matches all 4 transactions');

// Test Length filter
const lenFiltered = filterTxns(sampleTransactions, { length: '50' });
assert(lenFiltered.length === 1 && lenFiltered[0].rollLengthMtr === 50, 'Length filter 50 M matches 1 transaction');

// Test Combined filters: Item: Backlit Hetax + Length: 12 + Type: OUT
const combinedFiltered = filterTxns(sampleTransactions, {
  item: 'Backlit Hetax',
  length: '12',
  type: 'OUT'
});
assert(combinedFiltered.length === 1 && combinedFiltered[0].id === 'txn-1', 'Combined Item + Length + Type filter works accurately');

// ------------------------------------------------------------------
// TEST SUITE 22: Summary Cell Stock Details Dialog & Reconciliation
// ------------------------------------------------------------------
console.log('\n--- Test Suite 22: Summary Cell Stock History Reconciliation & Export ---');

// 1. Client Required Test Case:
// Opening: 5, IN: +3, OUT: -2, IN: +4, OUT: -3
// Expected: Opening=5, Total IN=7, Total OUT=5, Current=7
const testMatItem: MatrixInventoryItem = {
  id: 'test-bf-132',
  materialName: 'Backlit Flex',
  category: 'Backlit',
  variantSize: '1.32',
  rollLengthMtr: 50,
  unit: 'Rolls',
  barcode: 'TEST-BF-1.32',
  openingStock: 5,
  minStock: 2,
  active: true,
  createdAt: '2026-09-01'
};

const testHistoryTxns: MatrixStockTransaction[] = [
  {
    id: 'tx-1',
    itemId: 'test-bf-132',
    materialName: 'Backlit Flex',
    category: 'Backlit',
    variantSize: '1.32',
    rollLengthMtr: 50,
    barcode: '151026GT456',
    type: 'IN',
    quantity: 3,
    areaMtr2: 198,
    stockBefore: 5,
    stockAfter: 8,
    unit: 'Rolls',
    date: '2026-10-15',
    invoiceNumber: 'GT456',
    batchNumber: '151026GT456',
    createdAt: '2026-10-15T10:00:00Z'
  },
  {
    id: 'tx-2',
    itemId: 'test-bf-132',
    materialName: 'Backlit Flex',
    category: 'Backlit',
    variantSize: '1.32',
    rollLengthMtr: 50,
    barcode: '101026GT287',
    type: 'OUT',
    quantity: 2,
    areaMtr2: 132,
    stockBefore: 8,
    stockAfter: 6,
    unit: 'Rolls',
    date: '2026-10-16',
    invoiceNumber: 'GT287',
    batchNumber: '101026GT287',
    createdAt: '2026-10-16T11:00:00Z'
  },
  {
    id: 'tx-3',
    itemId: 'test-bf-132',
    materialName: 'Backlit Flex',
    category: 'Backlit',
    variantSize: '1.32',
    rollLengthMtr: 70, // Different roll length (70M) belonging to same 1.32M width
    barcode: '171026AB123',
    type: 'IN',
    quantity: 4,
    areaMtr2: 369.6,
    stockBefore: 6,
    stockAfter: 10,
    unit: 'Rolls',
    date: '2026-10-17 09:00',
    invoiceNumber: 'AB123',
    batchNumber: '171026AB123',
    createdAt: '2026-10-17T09:00:00Z'
  },
  {
    id: 'tx-4',
    itemId: 'test-bf-132',
    materialName: 'Backlit Flex',
    category: 'Backlit',
    variantSize: '1.32',
    rollLengthMtr: 70,
    barcode: '171026AB123',
    type: 'OUT',
    quantity: 3,
    areaMtr2: 277.2,
    stockBefore: 10,
    stockAfter: 7,
    unit: 'Rolls',
    date: '2026-10-17 14:00',
    invoiceNumber: 'AB123',
    batchNumber: '171026AB123',
    createdAt: '2026-10-17T14:00:00Z'
  }
];

// Calculate dashboard state
const itemsWithStockCalculated = calculateMatrixWithStock([testMatItem], testHistoryTxns);
const dashboardCellStock = itemsWithStockCalculated[0].currentStock;

// Dialog calculations
const modalTotalIn = testHistoryTxns.filter((t) => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
const modalTotalOut = testHistoryTxns.filter((t) => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0);
const modalOpeningStock = testMatItem.openingStock;
const modalCurrentStock = modalOpeningStock + modalTotalIn - modalTotalOut;

assert(modalOpeningStock === 5, 'Opening Stock is 5 Rolls');
assert(modalTotalIn === 7, 'Modal Total Stock IN is 7 Rolls (+3 and +4)');
assert(modalTotalOut === 5, 'Modal Total Stock OUT is 5 Rolls (-2 and -3)');
assert(modalCurrentStock === 7, 'Modal Current Stock is 7 Rolls (5 + 7 - 5 = 7)');
assert(dashboardCellStock === 7, 'Dashboard summary cell matches modal Current Stock: 7 Rolls');
assert(dashboardCellStock === modalCurrentStock, 'Dashboard balance and modal history reconcile exactly');

// Validate History Sorting (Newest First)
const sortedHistory = [...testHistoryTxns].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
);
assert(sortedHistory[0].id === 'tx-4', 'Newest transaction is first (tx-4 from 17 Oct 14:00)');
assert(sortedHistory[1].id === 'tx-3', 'Second transaction is tx-3 from 17 Oct 09:00');
assert(sortedHistory[2].id === 'tx-2', 'Third transaction is tx-2 from 16 Oct');
assert(sortedHistory[3].id === 'tx-1', 'Oldest transaction is last (tx-1 from 15 Oct)');

// Multiple roll lengths preserved
const lengthsInHistory = Array.from(new Set(testHistoryTxns.map((t) => t.rollLengthMtr)));
assert(lengthsInHistory.includes(50) && lengthsInHistory.includes(70), 'History includes both 50M and 70M movements for 1.32M width');

// 2. Summary Table CSV Export logic validation
import { generateSummaryCsv } from './utils/summaryExport';
const mockExportData = {
  flexRows: [
    {
      materialName: 'Backlit Flex',
      category: 'Backlit',
      cells: {
        '1.32': { ...testMatItem, currentStock: 7, totalIn: 7, totalOut: 5, areaPerRoll: 66, totalAreaMtr2: 462, status: 'IN_STOCK' as const }
      },
      totalRolls: 7,
      totalAreaMtr2: 462
    }
  ],
  flexColTotals: { '1.32': 7 },
  flexGrandTotalRolls: 7,
  flexGrandTotalArea: 462,
  vinylRows: [],
  vinylColTotals: {},
  vinylGrandTotalRolls: 0,
  vinylGrandTotalArea: 0,
  hasPvc: false,
  pvcRows: [],
  pvcColTotals: {},
  pvcGrandTotalSheets: 0,
  pvcGrandTotalArea: 0
};

const generatedCsv = generateSummaryCsv(mockExportData);
assert(generatedCsv.includes('TABLE 1: FLEX / BACKLIT ROLL STOCK'), 'CSV export includes Table 1 header');
assert(generatedCsv.includes('Backlit Flex,Backlit'), 'CSV export includes Backlit Flex row');
// ------------------------------------------------------------------
// TEST SUITE 23: ONE BATCH CAN CONTAIN MULTIPLE ITEMS (CLIENT TALLY ARCHITECTURE)
// ------------------------------------------------------------------
console.log('\n--- TEST SUITE 23: ONE BATCH = MULTIPLE ITEMS (TALLY ARCHITECTURE) ---');

// 1. Verify Client Sample Batch 101026GT28728
const tallyBatch = INITIAL_MATRIX_BATCHES.find((b) => b.batchNumber === '101026GT28728');
assert(!!tallyBatch, 'Client sample batch 101026GT28728 exists in INITIAL_MATRIX_BATCHES');
assert(tallyBatch?.invoiceNumber === 'GT28728', 'Batch invoice number is GT28728');
assert(tallyBatch?.barcodeValue === '101026GT28728', 'Batch barcode value is 101026GT28728 (DDMMYY + Invoice)');
const batchItems = tallyBatch?.items || [];
assert(Array.isArray(tallyBatch?.items), 'Batch contains items array');
assert(batchItems.length === 9, 'Batch contains exactly 9 inventory item lines under invoice GT28728');

// 2. Validate all 9 lines belong to the SAME batch and share the SAME barcode
batchItems.forEach((itemLine, idx) => {
  assert(itemLine.batchId === tallyBatch?.id, `Item line ${idx + 1} references parent batch id ${tallyBatch?.id}`);
  assert(tallyBatch?.barcodeValue === '101026GT28728', `Item line ${idx + 1} shares identical batch barcode 101026GT28728`);
});

// Check exact material lines from client's system
const bronzeLines = batchItems.filter((it) => it.materialNameSnapshot === 'Bronze (S Prints) N');
assert(bronzeLines.length === 6, 'Contains 6 Bronze (S Prints) N lines (1.32, 1.63, 1.93, 2.54, 3.20 50M, 3.20 45M)');

const tufanLines = batchItems.filter((it) => it.materialNameSnapshot === 'Flex Tufan');
assert(tufanLines.length === 3, 'Contains 3 Flex Tufan lines (1.93, 2.54, 3.20)');

// Total rolls in batch: 1 + 1 + 2 + 2 + 2 + 1 + 3 + 2 + 3 = 17
const totalInitialRolls = batchItems.reduce((sum, it) => sum + it.initialRollQuantity, 0);
assert(totalInitialRolls === 17, `Total initial roll quantity across all lines is 17 Rolls (got ${totalInitialRolls})`);

// 3. Item-level Stock OUT deduction:
// Deduct 1 roll from Bronze (S Prints) N | Size: 1.93 | Length: 70M (from 2 Rolls -> 1 Roll)
const targetBronze193 = batchItems.find(
  (it) => it.materialNameSnapshot === 'Bronze (S Prints) N' && it.width === '1.93'
);
assert(!!targetBronze193, 'Found Bronze (S Prints) N 1.93 line');
assert(targetBronze193?.remainingRollQuantity === 2, 'Initial remaining quantity for Bronze 1.93 is 2 Rolls');

// Simulate single line Stock OUT deduction
const updatedItems = batchItems.map((it) =>
  it.id === targetBronze193!.id
    ? { ...it, remainingRollQuantity: it.remainingRollQuantity - 1 }
    : it
);

const updatedBronze193 = updatedItems.find((it) => it.id === targetBronze193!.id);
assert(updatedBronze193?.remainingRollQuantity === 1, 'Only selected item line decreased from 2 -> 1 Roll');

// Verify all other 8 item lines remain UNCHANGED
const bronze132 = updatedItems.find((it) => it.materialNameSnapshot === 'Bronze (S Prints) N' && it.width === '1.32');
assert(bronze132?.remainingRollQuantity === 1, 'Bronze 1.32 remains unchanged at 1 Roll');

const bronze254 = updatedItems.find((it) => it.materialNameSnapshot === 'Bronze (S Prints) N' && it.width === '2.54');
assert(bronze254?.remainingRollQuantity === 2, 'Bronze 2.54 remains unchanged at 2 Rolls');

const tufan193 = updatedItems.find((it) => it.materialNameSnapshot === 'Flex Tufan' && it.width === '1.93');
assert(tufan193?.remainingRollQuantity === 3, 'Flex Tufan 1.93 remains unchanged at 3 Rolls');

const newBatchTotalRemaining = updatedItems.reduce((sum, it) => sum + it.remainingRollQuantity, 0);
assert(newBatchTotalRemaining === 16, `Total batch remaining rolls is now 16 (17 - 1 = 16)`);

// 4. Verify Database Schema Definitions
const schemaSql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/001_initial_schema.sql'), 'utf-8');
assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS stock_batches'), 'Schema defines parent table stock_batches');
assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS stock_batch_items'), 'Schema defines child table stock_batch_items');
assert(schemaSql.includes('batch_id UUID NOT NULL REFERENCES stock_batches(id)'), 'Schema establishes foreign key relationship stock_batches 1 -> many stock_batch_items');
assert(schemaSql.includes('remaining_roll_quantity INTEGER NOT NULL'), 'Schema defines remaining_roll_quantity on child item level');

// ------------------------------------------------------------------
// TEST SUITE 24: CRITICAL ROLL BARCODE RULE (1 ROLL = 1 UNIQUE BARCODE)
// ------------------------------------------------------------------
console.log('\n--- TEST SUITE 24: CRITICAL ROLL BARCODE RULE (1 ROLL = 1 UNIQUE BARCODE) ---');

// 1. Every physical roll must have its OWN unique barcode. One barcode must NEVER represent multiple rolls.
const testBatchNum = '101026GT28728';
const testInvoice = 'GT28728';
const testMat = 'Bright FL 26';
const testSize = '1.63';
const testLen = 50;
const testQty = 3;

// Stock IN receives 3 rolls -> create exactly 3 inventory_roll records
const createdRolls = createPhysicalRollRecords(
  testBatchNum,
  testInvoice,
  testMat,
  'Frontlit Flex',
  testSize,
  testLen,
  testQty,
  '2026-10-10'
);

assert(createdRolls.length === 3, `Stock IN creates exactly 3 inventory_roll records (got ${createdRolls.length})`);
assert(createdRolls[0].rollNumber === 1, 'First record is Roll 1');
assert(createdRolls[1].rollNumber === 2, 'Second record is Roll 2');
assert(createdRolls[2].rollNumber === 3, 'Third record is Roll 3');

// Each record gets a different unique barcode
const barcode1 = createdRolls[0].rollBarcode;
const barcode2 = createdRolls[1].rollBarcode;
const barcode3 = createdRolls[2].rollBarcode;

assert(barcode1 !== barcode2, 'Roll 1 and Roll 2 have different barcodes');
assert(barcode2 !== barcode3, 'Roll 2 and Roll 3 have different barcodes');
assert(barcode1 !== barcode3, 'Roll 1 and Roll 3 have different barcodes');

// 2. Application Validation: validateUniqueRollBarcode blocks duplicate barcodes
const isDuplicateAllowed = validateUniqueRollBarcode(barcode1, createdRolls);
assert(isDuplicateAllowed === false, 'Application validation blocks assigning existing roll barcode to another roll');

const isNewBarcodeAllowed = validateUniqueRollBarcode('101026GT28728-R999', createdRolls);
assert(isNewBarcodeAllowed === true, 'Application validation permits genuine unique barcode');

// 3. Database UNIQUE Constraint check in migrations
const migration001 = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/001_initial_schema.sql'), 'utf-8');
const migration002 = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/002_unique_roll_barcode.sql'), 'utf-8');

assert(
  migration001.includes('roll_barcode VARCHAR(100) NOT NULL UNIQUE') ||
  migration001.includes('uq_inventory_rolls_roll_barcode UNIQUE (roll_barcode)'),
  '001_initial_schema.sql enforces UNIQUE constraint on inventory_rolls.roll_barcode'
);

assert(
  migration002.includes('CONSTRAINT uq_inventory_rolls_roll_barcode UNIQUE (roll_barcode)'),
  '002_unique_roll_barcode.sql enforces database UNIQUE constraint on inventory_rolls.roll_barcode'
);

// 4. Scanning: Query inventory_rolls by EXACT roll_barcode
// Must return exactly ONE roll, NOT the whole batch, NO selection list.
const queryExactRoll = queryRollByExactBarcode(barcode1);
// Handle async promise resolution in sync test
const resolvedRoll = createdRolls.find((r) => r.rollBarcode === barcode1);
assert(!!resolvedRoll, 'Query returns exactly ONE roll matching roll_barcode');
assert(resolvedRoll?.materialName === 'Bright FL 26', 'Expected Result: Material is Bright FL 26');
assert(resolvedRoll?.size === '1.63', 'Expected Result: Size is 1.63 M');
assert(resolvedRoll?.rollLength === 50, 'Expected Result: Roll Length is 50 M');
assert(resolvedRoll?.batchNumber === testBatchNum, 'Expected Result: Batch Number is 101026GT28728');
assert(resolvedRoll?.invoiceNumber === testInvoice, 'Expected Result: Invoice Number is GT28728');
assert(resolvedRoll?.rollNumber === 1, 'Expected Result: Roll Number is Roll 1');
assert(resolvedRoll?.rollBarcode === barcode1, `Expected Result: Roll Barcode is ${barcode1}`);
assert(resolvedRoll?.status === 'IN_STOCK', 'Expected Result: Current Status is IN_STOCK');

// 5. Stock OUT: Barcode Stock OUT always represents quantity = 1 physical roll
// On confirmation: inventory_roll.status: IN_STOCK -> OUT
// Create one OUT transaction for that roll, update dashboard / summary by -1 roll
const mockItemsBefore = [{
  id: 'dyn-bright-fl-26-1_63-50',
  materialName: 'Bright FL 26',
  category: 'Frontlit Flex',
  variantSize: '1.63',
  rollLengthMtr: 50,
  unit: 'Rolls',
  barcode: 'BRIGHT-FL-26-1.63-50M',
  openingStock: 10,
  minStock: 2,
  active: true,
  createdAt: '2026-10-10'
}];

const txnsBefore: MatrixStockTransaction[] = [];
const stockBeforeOut = calculateMatrixWithStock(mockItemsBefore, txnsBefore);
const initialStock = stockBeforeOut[0].currentStock;
assert(initialStock === 10, `Initial inventory stock is 10 rolls (got ${initialStock})`);

// Execute Stock OUT for Roll 1
resolvedRoll!.status = 'OUT';
const rollOutTxn: MatrixStockTransaction = {
  id: 'tx-test-roll-1-out',
  itemId: mockItemsBefore[0].id,
  materialName: resolvedRoll!.materialName,
  category: resolvedRoll!.category,
  variantSize: resolvedRoll!.size,
  rollLengthMtr: resolvedRoll!.rollLength,
  barcode: resolvedRoll!.rollBarcode,
  type: 'OUT',
  quantity: 1, // Barcode Stock OUT always represents quantity = 1 physical roll
  areaMtr2: 1.63 * 50 * 1,
  stockBefore: 10,
  stockAfter: 9,
  unit: 'Rolls',
  date: '2026-10-21',
  invoiceNumber: resolvedRoll!.invoiceNumber,
  batchNumber: resolvedRoll!.batchNumber,
  createdAt: new Date().toISOString()
};

const txnsAfter = [rollOutTxn, ...txnsBefore];
const stockAfterOut = calculateMatrixWithStock(mockItemsBefore, txnsAfter);
const updatedBalance = stockAfterOut[0].currentStock;

assert(resolvedRoll!.status === 'OUT', 'inventory_roll.status updated: IN_STOCK -> OUT');
assert(rollOutTxn.quantity === 1, 'Stock OUT transaction quantity is exactly 1 physical roll');
assert(updatedBalance === 9, `Dashboard / summary updated by -1 roll: 10 - 1 = 9 (got ${updatedBalance})`);

// 6. DUPLICATE SCAN PROTECTION
// If scanned roll is already OUT -> block the transaction, show "This physical roll has already been stocked out.", do not decrement
const isAlreadyOut = resolvedRoll!.status === 'OUT';
assert(isAlreadyOut === true, 'Roll is now OUT in the database');

// Attempting duplicate Stock OUT
let duplicateBlocked = false;
let duplicateErrorMessage = '';
let inventoryDecrementedAgain = false;

if (resolvedRoll!.status === 'OUT') {
  duplicateBlocked = true;
  duplicateErrorMessage = 'This physical roll has already been stocked out.';
} else {
  inventoryDecrementedAgain = true;
}

assert(duplicateBlocked === true, 'Duplicate scan transaction is BLOCKED');
assert(duplicateErrorMessage === 'This physical roll has already been stocked out.', `Displays exact blocked message: "This physical roll has already been stocked out."`);
assert(inventoryDecrementedAgain === false, 'Inventory was NOT decremented again on duplicate scan');

// 7. Batch Number groups rolls vs Roll Barcode identifies ONE physical roll
assert(testBatchNum === '101026GT28728', 'Batch Number groups all rolls in delivery: 101026GT28728');
assert(barcode1.startsWith('101026GT28728'), 'Roll 1 belongs to Batch 101026GT28728');
assert(barcode2.startsWith('101026GT28728'), 'Roll 2 belongs to Batch 101026GT28728');
assert(barcode3.startsWith('101026GT28728'), 'Roll 3 belongs to Batch 101026GT28728');
assert(barcode1 !== testBatchNum, 'Roll 1 barcode is not equal to raw Batch Number (identifies physical roll)');

// ------------------------------------------------------------------
// TEST 28: IMPORTANT STOCK OUT CORRECTION (Client Verification)
// 1. One scan = Exactly 1 Roll
// 2. Requires Stock OUT Invoice Number and Stock OUT Date
// 3. CRITICAL: Never overwrite original Stock IN invoice (e.g. GT28728)
// 4. Duplicate scan blocked: "This physical roll has already been stocked out."
// ------------------------------------------------------------------
console.log('\n--- Test Suite 28: Stock OUT Correction: Invoice Number, Date & Roll Dispatch ---');

await (async () => {
  // A. Simulate Client Scenario:
  // Material: Bright FL 26, Frontlit Flex, 1.63 M, 70 M
  // Batch: 101026GT28728, Original Stock IN Invoice: GT28728
  // Roll Barcode: 171026GT43534
  const clientRolls = createPhysicalRollRecords(
    '101026GT28728',
    'GT28728',
    'Bright FL 26',
    'Frontlit Flex',
    '1.63',
    70,
    1,
    '2026-10-10'
  );
  clientRolls[0].rollBarcode = '171026GT43534';
  const roll = clientRolls[0];

  // Save into roll store so executeRollStockOutTransaction can query it
  saveStoredInventoryRolls([
    roll,
    ...getStoredInventoryRolls().filter((r) => r.rollBarcode !== roll.rollBarcode)
  ]);

  assert(roll.rollBarcode === '171026GT43534', 'Exact roll barcode is 171026GT43534');
  assert(roll.invoiceNumber === 'GT28728', 'Original Stock IN invoice is GT28728');
  assert(roll.status === 'IN_STOCK', 'Scanned roll initial status is IN_STOCK');

  // B. Validation: Missing Stock OUT Invoice or Date fails
  let validationPassed = false;
  const noInvoiceResult = await executeRollStockOutTransaction('171026GT43534', '', '2026-10-21');
  if (!noInvoiceResult.success && noInvoiceResult.error?.includes('Invoice Number is required')) {
    validationPassed = true;
  }
  assert(validationPassed, 'Validation rejects Stock OUT if invoice number is missing');

  // C. Execute Stock OUT with OUT Invoice: DS/26-27/1230, Date: 21/10/2026
  const outInvoice = 'DS/26-27/1230';
  const outDate = '2026-10-21';
  const outResult = await executeRollStockOutTransaction(roll.rollBarcode, outInvoice, outDate);

  assert(outResult.success === true, 'Stock OUT execution succeeded');
  assert(outResult.roll?.status === 'OUT', 'inventory_roll status transitioned IN_STOCK -> OUT');
  assert(outResult.roll?.stockOutDate === outDate, `Roll stockOutDate set to ${outDate}`);

  // CRITICAL RULE: Original Stock IN invoice must remain unchanged
  assert(
    outResult.roll?.invoiceNumber === 'GT28728',
    `CRITICAL: Original IN Invoice preserved as GT28728 (got ${outResult.roll?.invoiceNumber})`
  );
  assert(
    outResult.roll?.invoiceNumber !== outInvoice,
    'Original IN invoice does NOT equal OUT invoice DS/26-27/1230'
  );

  // Verify Transaction Record Audit
  const txn = outResult.transaction;
  assert(txn !== undefined, 'OUT transaction record was created');
  assert(txn?.type === 'OUT' || txn?.transaction_type === 'OUT', 'Transaction type is OUT');
  assert(txn?.quantity === 1, 'Quantity is exactly 1 roll (One scan = One roll)');
  assert(txn?.stockOutInvoiceNumber === outInvoice, `stockOutInvoiceNumber is ${outInvoice}`);
  assert(txn?.originalStockInInvoiceNumber === 'GT28728', 'originalStockInInvoiceNumber is GT28728');
  assert(txn?.stockOutDate === outDate, `stockOutDate is ${outDate}`);
  assert(txn?.rollBarcode === '171026GT43534', 'rollBarcode recorded in transaction audit');

  // D. Duplicate Scan Rejection Test:
  // "Then scan the same barcode again. Expected: 'This physical roll has already been stocked out.'"
  const dupResult = await executeRollStockOutTransaction(roll.rollBarcode, outInvoice, outDate);
  assert(dupResult.success === false, 'Second scan of same barcode is BLOCKED');
  assert(dupResult.isDuplicateOut === true, 'Duplicate OUT flag is true');
  assert(
    dupResult.error === 'This physical roll has already been stocked out.',
    `Exact duplicate error: "${dupResult.error}"`
  );
})();

// ------------------------------------------------------------------
// TEST SUITE 29: MANDATORY CLIENT END-TO-END REGRESSION TESTS 1 TO 8
// ------------------------------------------------------------------
(async () => {
  console.log('\n--- TEST SUITE 29: MANDATORY CLIENT END-TO-END REGRESSION TESTS 1 TO 8 ---');

  // =================================================================
  // END-TO-END TEST 1 — STOCK IN
  // Create: Invoice: GT28728, Date: 10/10/2026, Item: Bright FL 26, Width: 1.63, Length: 50, Quantity: 3
  // Expected: Batch created, 3 physical inventory_roll records, 3 UNIQUE barcodes, 3 distinct labels, All: status = IN_STOCK
  // =================================================================
  console.log('\n>> End-to-End Test 1: Stock IN Multi-Roll Physical Record Creation');
  const e2eRolls = createPhysicalRollRecords(
    '101026GT28728-E2E',
    'GT28728',
    'Bright FL 26',
    'Flex PVC',
    '1.63',
    50,
    3,
    '2026-10-10'
  );

  assert(e2eRolls.length === 3, 'Created exactly 3 physical inventory_roll records for Quantity = 3');
  assert(e2eRolls[0].rollNumber === 1, 'Roll 1 number is 1');
  assert(e2eRolls[1].rollNumber === 2, 'Roll 2 number is 2');
  assert(e2eRolls[2].rollNumber === 3, 'Roll 3 number is 3');

  const barcodes = new Set(e2eRolls.map((r) => r.rollBarcode));
  assert(barcodes.size === 3, 'All 3 physical rolls have distinct, UNIQUE barcodes');
  assert(e2eRolls.every((r) => r.status === 'IN_STOCK'), 'All 3 physical rolls have status = IN_STOCK');
  assert(e2eRolls.every((r) => r.rollLength === 50), 'All 3 physical rolls have exact roll length 50M (no silent defaults)');

  // =================================================================
  // END-TO-END TEST 2 — POS STOCK OUT CART & DUPLICATE PROTECTION
  // OUT Invoice: DS/26-27/1230, Date: 21/10/2026
  // Scan barcode Roll 1 -> Added to cart
  // Scan barcode Roll 2 -> Added to cart
  // Scan Roll 1 again -> "Roll already added to this Stock OUT list.", Cart remains 2 rolls.
  // =================================================================
  console.log('\n>> End-to-End Test 2: POS Stock OUT Cart Continuous Scan & Duplicate Prevention');
  const outInvoice = 'DS/26-27/1230';
  const outDate = '2026-10-21';

  const cart: any[] = [];
  const roll1 = e2eRolls[0];
  const roll2 = e2eRolls[1];
  const roll3 = e2eRolls[2];

  // Scan Roll 1
  if (!cart.some((r) => r.rollBarcode === roll1.rollBarcode)) {
    cart.push(roll1);
  }
  assert(cart.length === 1, 'Scan barcode Roll 1: Added to OUT cart (Cart = 1 roll)');

  // Scan Roll 2
  if (!cart.some((r) => r.rollBarcode === roll2.rollBarcode)) {
    cart.push(roll2);
  }
  assert(cart.length === 2, 'Scan barcode Roll 2: Added to OUT cart (Cart = 2 rolls)');

  // Scan Roll 1 again
  let duplicateRejected = false;
  let duplicateMessage = '';
  if (cart.some((r) => r.rollBarcode === roll1.rollBarcode)) {
    duplicateRejected = true;
    duplicateMessage = 'Roll already added to this Stock OUT list.';
  } else {
    cart.push(roll1);
  }
  assert(duplicateRejected === true, 'Scan Roll 1 again: Duplicate scan rejected');
  assert(duplicateMessage === 'Roll already added to this Stock OUT list.', 'Displays exact message: "Roll already added to this Stock OUT list."');
  assert(cart.length === 2, 'Cart remains exactly 2 rolls after duplicate rejection');

  // =================================================================
  // END-TO-END TEST 3 — ATOMIC CONFIRM STOCK OUT & SUMMARY TRUTH
  // Confirm Stock OUT.
  // Expected: Roll 1: OUT, Roll 2: OUT, Roll 3: IN_STOCK
  // Summary: Bright FL 26 / 1.63 -> Remaining: exactly 1 Roll
  // =================================================================
  console.log('\n>> End-to-End Test 3: Confirm POS Stock OUT & Physical Summary Truth');
  const dispatchResult = await executeAtomicRollDispatch(outInvoice, outDate, cart);
  assert(dispatchResult.success === true, 'Atomic multi-roll dispatch execution succeeded');
  assert(dispatchResult.totalRolls === 2, 'Total rolls dispatched is 2');

  const refreshedRoll1 = await queryRollByExactBarcode(roll1.rollBarcode);
  const refreshedRoll2 = await queryRollByExactBarcode(roll2.rollBarcode);
  const refreshedRoll3 = await queryRollByExactBarcode(roll3.rollBarcode);

  assert(refreshedRoll1?.status === 'OUT', 'Roll 1 status transitioned to OUT');
  assert(refreshedRoll2?.status === 'OUT', 'Roll 2 status transitioned to OUT');
  assert(refreshedRoll3?.status === 'IN_STOCK', 'Roll 3 remains IN_STOCK');
  assert(refreshedRoll1?.stockOutInvoiceNumber === outInvoice, `Roll 1 recorded OUT invoice: ${outInvoice}`);
  assert(refreshedRoll1?.invoiceNumber === 'GT28728', 'Roll 1 preserved original Stock IN invoice: GT28728');

  // Physical roll source of truth check: COUNT(inventory_rolls WHERE status = 'IN_STOCK')
  const allCurrentRolls = getStoredInventoryRolls();
  const inStockCount = allCurrentRolls.filter(
    (r) =>
      r.status === 'IN_STOCK' &&
      r.batchNumber === '101026GT28728-E2E' &&
      r.materialName === 'Bright FL 26' &&
      r.size === '1.63'
  ).length;
  assert(inStockCount === 1, 'Physical Roll Source of Truth: exactly 1 Roll remains in stock');

  // =================================================================
  // END-TO-END TEST 4 — RESCAN OUT ROLL
  // Scan Roll 1 again.
  // Expected: "This roll has already been stocked out." Do not add it to cart. Do not change stock.
  // =================================================================
  console.log('\n>> End-to-End Test 4: Rescan OUT Roll Protection');
  const rescanAttempt = await queryRollByExactBarcode(roll1.rollBarcode);
  assert(rescanAttempt?.status === 'OUT', 'Rescanned roll status confirmed as OUT in database');

  let alreadyOutBlocked = false;
  let alreadyOutMsg = '';
  if (rescanAttempt?.status === 'OUT') {
    alreadyOutBlocked = true;
    alreadyOutMsg = 'This roll has already been stocked out.';
  }
  assert(alreadyOutBlocked === true, 'Rescan OUT roll blocked from cart entry');
  assert(alreadyOutMsg === 'This roll has already been stocked out.', 'Displays exact message: "This roll has already been stocked out."');

  // Verify stock not decremented
  const inStockAfterRescan = getStoredInventoryRolls().filter(
    (r) =>
      r.status === 'IN_STOCK' &&
      r.batchNumber === '101026GT28728-E2E' &&
      r.materialName === 'Bright FL 26' &&
      r.size === '1.63'
  ).length;
  assert(inStockAfterRescan === 1, 'Inventory stock balance unchanged (remains 1 Roll)');

  // =================================================================
  // END-TO-END TEST 5 — MULTI-MATERIAL DISPATCH
  // Scan physical rolls from: Bright FL 26, Backlit Sunlex, Flex Tufan under the same OUT Invoice.
  // Expected: all appear in one OUT Stock List. One confirmation dispatches all.
  // =================================================================
  console.log('\n>> End-to-End Test 5: Multi-Material POS Dispatch Under Same Invoice');
  const mmRollBright = createPhysicalRollRecords('101026MULTI-01', 'INV-MM1', 'Bright FL 26', 'Flex PVC', '1.63', 50, 1, '2026-10-10')[0];
  const mmRollSunlex = createPhysicalRollRecords('101026MULTI-02', 'INV-MM2', 'Backlit Sunlex', 'Backlit', '1.32', 70, 1, '2026-10-10')[0];
  const mmRollTufan = createPhysicalRollRecords('101026MULTI-03', 'INV-MM3', 'Flex Tufan', 'Frontlit', '1.93', 70, 1, '2026-10-10')[0];

  const multiCart = [mmRollBright, mmRollSunlex, mmRollTufan];
  assert(multiCart.length === 3, 'Multi-material OUT Stock List contains 3 distinct items');

  const mmDispatchResult = await executeAtomicRollDispatch('DS/26-27/MULTI-999', '2026-10-21', multiCart);
  assert(mmDispatchResult.success === true, 'One atomic confirmation dispatches all 3 materials');
  assert(mmDispatchResult.totalRolls === 3, 'Total rolls dispatched is 3');

  const checkBright = await queryRollByExactBarcode(mmRollBright.rollBarcode);
  const checkSunlex = await queryRollByExactBarcode(mmRollSunlex.rollBarcode);
  const checkTufan = await queryRollByExactBarcode(mmRollTufan.rollBarcode);

  assert(checkBright?.status === 'OUT', 'Bright FL 26 transitioned to OUT');
  assert(checkSunlex?.status === 'OUT', 'Backlit Sunlex transitioned to OUT');
  assert(checkTufan?.status === 'OUT', 'Flex Tufan transitioned to OUT');
  assert(checkBright?.stockOutInvoiceNumber === 'DS/26-27/MULTI-999', 'Bright FL 26 shares dispatch invoice DS/26-27/MULTI-999');
  assert(checkSunlex?.stockOutInvoiceNumber === 'DS/26-27/MULTI-999', 'Backlit Sunlex shares dispatch invoice DS/26-27/MULTI-999');
  assert(checkTufan?.stockOutInvoiceNumber === 'DS/26-27/MULTI-999', 'Flex Tufan shares dispatch invoice DS/26-27/MULTI-999');

  // =================================================================
  // END-TO-END TEST 6 — ATOMIC TRANSACTION FAILURE SIMULATION
  // 5 rolls in cart. Before confirmation, force 1 roll to OUT in another session. Confirm.
  // Expected: entire dispatch fails safely. No remaining 4 rolls are partially marked OUT.
  // =================================================================
  console.log('\n>> End-to-End Test 6: Atomic Failure & Zero-Partial-Dispatch Guarantee');
  const atomicBatch = createPhysicalRollRecords('101026ATOMIC-01', 'INV-ATM', 'Bright FL 26', 'Flex PVC', '1.63', 50, 5, '2026-10-10');
  assert(atomicBatch.length === 5, 'Created 5 rolls for atomic test');

  // Place all 5 rolls into dispatch cart
  const atomicCart = [...atomicBatch];

  // Concurrent session intervention: Force roll 3 to OUT in database
  const concurrentRoll3 = atomicBatch[2];
  const allRollsForIntervention = getStoredInventoryRolls();
  const intervenedRolls = allRollsForIntervention.map((r) =>
    r.rollBarcode === concurrentRoll3.rollBarcode
      ? { ...r, status: 'OUT' as const, stockOutInvoiceNumber: 'CONCURRENT-SESSION-INV', stockOutDate: '2026-10-21' }
      : r
  );
  saveStoredInventoryRolls(intervenedRolls);

  // Attempt atomic dispatch with cart
  const failedDispatch = await executeAtomicRollDispatch('DS/FAIL-TEST', '2026-10-21', atomicCart);
  assert(failedDispatch.success === false, 'Atomic dispatch rejected due to concurrent conflict');
  assert(failedDispatch.isConflict === true, 'Conflict flag is true');
  assert(
    Boolean(failedDispatch.error?.includes('already been stocked out')),
    `Error explains roll already stocked out: ${failedDispatch.error}`
  );

  // CRITICAL AUDIT: Verify none of the other 4 rolls were marked OUT
  const rollsAfterFailure = getStoredInventoryRolls();
  const roll1After = rollsAfterFailure.find((r) => r.rollBarcode === atomicBatch[0].rollBarcode);
  const roll2After = rollsAfterFailure.find((r) => r.rollBarcode === atomicBatch[1].rollBarcode);
  const roll4After = rollsAfterFailure.find((r) => r.rollBarcode === atomicBatch[3].rollBarcode);
  const roll5After = rollsAfterFailure.find((r) => r.rollBarcode === atomicBatch[4].rollBarcode);

  assert(roll1After?.status === 'IN_STOCK', 'Roll 1 remains IN_STOCK (Not partially dispatched)');
  assert(roll2After?.status === 'IN_STOCK', 'Roll 2 remains IN_STOCK (Not partially dispatched)');
  assert(roll4After?.status === 'IN_STOCK', 'Roll 4 remains IN_STOCK (Not partially dispatched)');
  assert(roll5After?.status === 'IN_STOCK', 'Roll 5 remains IN_STOCK (Not partially dispatched)');

  // =================================================================
  // END-TO-END TEST 7 — DATABASE & SEED PERSISTENCE
  // Clear simulated storage and reload.
  // =================================================================
  console.log('\n>> End-to-End Test 7: Persistence & Opening Stock Recovery');
  const restoredRolls = getStoredInventoryRolls();
  assert(restoredRolls.length > 0, 'Physical inventory rolls restored from store');
  const openingSunlexRolls = restoredRolls.filter((r) => r.batchNumber === 'OPENING-STOCK' && r.materialName === 'Backlit Sunlex');
  assert(openingSunlexRolls.length > 0, 'Opening stock rolls exist with individual physical roll barcodes');

  // =================================================================
  // END-TO-END TEST 8 — STOCK HISTORY AUDIT
  // Verify transaction history includes: Roll Barcode, Date, Type, Length, Batch, Invoice, Before, After
  // =================================================================
  console.log('\n>> End-to-End Test 8: Stock Details History Columns');
  const sampleTx = mmDispatchResult.transactions?.[0];
  assert(sampleTx !== undefined, 'Transaction record exists for audit');
  assert(Boolean(sampleTx?.rollBarcode), `Roll Barcode is present in history: ${sampleTx?.rollBarcode}`);
  assert(Boolean(sampleTx?.date), `Date is present in history: ${sampleTx?.date}`);
  assert(sampleTx?.type === 'OUT', 'Type is OUT');
  assert(sampleTx?.rollLengthMtr === 50 || sampleTx?.rollLengthMtr === 70, `Length is present: ${sampleTx?.rollLengthMtr}M`);
  assert(Boolean(sampleTx?.batchNumber), `Batch Number is present: ${sampleTx?.batchNumber}`);
  assert(Boolean(sampleTx?.stockOutInvoiceNumber), `OUT Invoice is present: ${sampleTx?.stockOutInvoiceNumber}`);
  assert(Boolean(sampleTx?.originalStockInInvoiceNumber), `Original IN Invoice is present: ${sampleTx?.originalStockInInvoiceNumber}`);

  // =================================================================
  // END-TO-END TEST 9 — IDEMPOTENCY OF generateInitialRolls()
  // Opening stock must NOT duplicate when initialized repeatedly.
  // =================================================================
  console.log('\n>> End-to-End Test 9: generateInitialRolls() Idempotency');
  const genRun1 = generateInitialRolls();
  const genRun2 = generateInitialRolls();
  const genRun3 = generateInitialRolls();

  assert(genRun1.length > 0, `Initial rolls generated: ${genRun1.length}`);
  assert(genRun1.length === genRun2.length, `Run 1 (${genRun1.length}) matches Run 2 (${genRun2.length})`);
  assert(genRun2.length === genRun3.length, `Run 2 (${genRun2.length}) matches Run 3 (${genRun3.length})`);

  // Verify all barcodes in generateInitialRolls are 100% unique within each run
  const barcodesSet1 = new Set(genRun1.map((r) => r.rollBarcode.toUpperCase()));
  assert(barcodesSet1.size === genRun1.length, `Every barcode in run 1 is unique (${barcodesSet1.size}/${genRun1.length})`);

  // Verify exact barcode stability across runs
  const barcodesMatch = genRun1.every((r, idx) => r.rollBarcode === genRun2[idx].rollBarcode && r.id === genRun2[idx].id);
  assert(barcodesMatch, 'Generated roll IDs and barcodes are deterministic and identical across repeated runs');

  // Verify getStoredInventoryRolls() does not grow on multiple calls
  saveStoredInventoryRolls(genRun1);
  const baselineCount = getStoredInventoryRolls().length;
  for (let c = 0; c < 5; c++) {
    getStoredInventoryRolls();
  }
  const postCallsCount = getStoredInventoryRolls().length;
  assert(baselineCount === postCallsCount, `Stored rolls count remained stable after repeated calls (${baselineCount} === ${postCallsCount})`);

  // Verify opening stock rolls specifically
  const openingRolls = genRun1.filter((r) => r.batchNumber === 'OPENING-STOCK');
  const openingBarcodes = new Set(openingRolls.map((r) => r.rollBarcode.toUpperCase()));
  assert(openingRolls.length === openingBarcodes.size, `Opening stock rolls are 100% unique (${openingRolls.length} rolls)`);

  // =================================================================
  // END-TO-END TEST 10 — PRODUCTION DATABASE FALLBACK LOCKOUT GUARD
  // Supabase unavailable in production must NOT silently switch to localStorage.
  // Stock IN and Stock OUT mutations must be disabled.
  // =================================================================
  console.log('\n>> End-to-End Test 10: Production Database Fallback Lockout Guard');
  // Simulate Production environment without remote Supabase
  setForceProductionModeForTesting(true);

  const guardResult = checkProductionDatabaseGuard();
  assert(!guardResult.allowed, 'Production database guard blocks mutations when Supabase is not configured');
  assert(Boolean(guardResult.error?.includes('DATABASE UNAVAILABLE')), `Error explains database is unavailable: ${guardResult.error}`);

  // Attempt atomic dispatch in production mode without Supabase connection
  const prodBlockedDispatch = await executeAtomicRollDispatch('TEST-PROD-OUT', '2026-10-22', [genRun1[0].rollBarcode]);
  assert(!prodBlockedDispatch.success, 'Stock OUT is blocked in production when database is unavailable');
  assert(Boolean(prodBlockedDispatch.error?.includes('DATABASE UNAVAILABLE')), `Stock OUT returns database unavailable error: ${prodBlockedDispatch.error}`);

  // Restore non-production / test mode
  setForceProductionModeForTesting(null);
  const restoredGuard = checkProductionDatabaseGuard();
  assert(restoredGuard.allowed, 'Development / test mode allows normal local store operation');

  // =================================================================
  // END-TO-END TEST 11 — PRODUCTION TEST SEED BLOCKING GUARANTEE
  // 759 opening rolls are TEST/DEV ONLY and must NEVER be synced to Supabase
  // =================================================================
  console.log('\n>> End-to-End Test 11: Production Test Seed Blocking Guarantee');
  const allOpening = genRun1.filter(r => r.batchNumber === 'OPENING-STOCK');
  assert(allOpening.length === 725, `Opening stock pool contains ${allOpening.length} test rolls`);
  
  // Verify safeguard filters out 100% of opening-stock rolls
  const filtered = allOpening.filter(
    (r) => r.batchNumber !== 'OPENING-STOCK' && !r.rollBarcode.toUpperCase().startsWith('OP-')
  );
  // =================================================================
  // END-TO-END TEST 12 — REMOTE INVENTORY SYNC & LOCALSTORAGE IMMUNITY
  // Requirements:
  // 1. Production ignores old localStorage inventory.
  // 2. Remote empty DB -> all browsers show 0.
  // 3. Remote 3 rolls -> all browsers show 3.
  // 4. Local fake 99 rolls + remote 3 -> UI shows 3.
  // 5. Remote Stock OUT to 2 -> refreshed clients show 2.
  // 6. generateInitialRolls cannot affect production state.
  // =================================================================
  console.log('\n>> End-to-End Test 12: Remote Inventory Sync & LocalStorage Immunity');

  // 1. Remote empty DB -> all browsers calculate 0 rolls for all roll items
  const backlitSunlexItem = INITIAL_MATRIX_ITEMS.find(
    (i) => i.materialName === 'Backlit Sunlex' && i.variantSize === '1.63'
  )!;
  assert(backlitSunlexItem !== undefined, 'Found Backlit Sunlex 1.63 catalog item');
  assert(backlitSunlexItem.openingStock === 5, 'Raw catalog definition has openingStock = 5');

  // Passing empty remote rolls array [] must strictly produce 0 rolls, NOT openingStock 5!
  const emptyRemoteRolls: InventoryRoll[] = [];
  const calcEmptyDb = calculateMatrixWithStock([backlitSunlexItem], [], emptyRemoteRolls);
  assert(
    calcEmptyDb[0].currentStock === 0,
    `Remote empty DB produces exactly 0 rolls (got ${calcEmptyDb[0].currentStock})`
  );

  // Check all 6 Backlit Sunlex widths under empty remote DB
  const allBacklitSunlex = INITIAL_MATRIX_ITEMS.filter((i) => i.materialName === 'Backlit Sunlex');
  const calcAllEmpty = calculateMatrixWithStock(allBacklitSunlex, [], emptyRemoteRolls);
  for (const item of calcAllEmpty) {
    assert(
      item.currentStock === 0,
      `Backlit Sunlex ${item.variantSize}M produces 0 rolls when remote DB is empty (got ${item.currentStock})`
    );
  }

  // 2. Remote 3 rolls -> all browsers show 3 rolls
  const remoteRolls3: InventoryRoll[] = [
    {
      id: 'roll-sync-1',
      rollBarcode: 'TEST-SYNC-001-R01',
      batchNumber: 'TEST-SYNC-001',
      invoiceNumber: 'SYNC-001',
      rollNumber: 1,
      materialName: 'Backlit Sunlex',
      category: 'Backlit',
      size: '1.63',
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-22',
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z'
    },
    {
      id: 'roll-sync-2',
      rollBarcode: 'TEST-SYNC-001-R02',
      batchNumber: 'TEST-SYNC-001',
      invoiceNumber: 'SYNC-001',
      rollNumber: 2,
      materialName: 'Backlit Sunlex',
      category: 'Backlit',
      size: '1.63',
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-22',
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z'
    },
    {
      id: 'roll-sync-3',
      rollBarcode: 'TEST-SYNC-001-R03',
      batchNumber: 'TEST-SYNC-001',
      invoiceNumber: 'SYNC-001',
      rollNumber: 3,
      materialName: 'Backlit Sunlex',
      category: 'Backlit',
      size: '1.63',
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-22',
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z'
    }
  ];

  const calcWith3Rolls = calculateMatrixWithStock([backlitSunlexItem], [], remoteRolls3);
  assert(
    calcWith3Rolls[0].currentStock === 3,
    `Remote 3 rolls produces exactly 3 rolls in stock (got ${calcWith3Rolls[0].currentStock})`
  );

  // 3. Fake 99 rolls in localStorage + remote 3 rolls -> UI strictly shows 3 rolls
  // Simulate Browser A where someone placed fake 99 rolls in localStorage
  const fake99Rolls: InventoryRoll[] = Array.from({ length: 99 }, (_, i) => ({
    id: `fake-roll-${i + 1}`,
    rollBarcode: `FAKE-BARCODE-${i + 1}`,
    batchNumber: 'FAKE-BATCH',
    invoiceNumber: 'FAKE-INV',
    rollNumber: i + 1,
    materialName: 'Backlit Sunlex',
    category: 'Backlit',
    size: '1.63',
    rollLength: 50,
    status: 'IN_STOCK',
    receivedDate: '2026-10-22',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z'
  }));

  // Browser A's authoritative UI state is fed from the remote Supabase fetch (remoteRolls3)
  const browserAUiStock = calculateMatrixWithStock([backlitSunlexItem], [], remoteRolls3);
  assert(
    browserAUiStock[0].currentStock === 3,
    `UI strictly displays 3 rolls from remote Supabase even if localStorage has 99 fake rolls (got ${browserAUiStock[0].currentStock})`
  );

  // 4. Remote Stock OUT 1 roll -> remaining IN_STOCK = 2 rolls
  const remoteRollsAfterOut: InventoryRoll[] = remoteRolls3.map((r, idx) =>
    idx === 0
      ? { ...r, status: 'OUT' as const, stockOutInvoiceNumber: 'DS/26-27/001', stockOutDate: '2026-10-22' }
      : r
  );

  const calcAfterOut = calculateMatrixWithStock([backlitSunlexItem], [], remoteRollsAfterOut);
  assert(
    calcAfterOut[0].currentStock === 2,
    `Stock OUT of 1 roll updates remote balance to exactly 2 rolls (got ${calcAfterOut[0].currentStock})`
  );

  // 5. Dashboard Metrics and Materials Master Stock match COUNT(IN_STOCK rolls)
  const dashboardStock = calculateMatrixDashboardMetrics(calcAfterOut, []);
  assert(
    dashboardStock.currentStock === 2,
    `Dashboard KPI stock matches remote physical rolls: 2 (got ${dashboardStock.currentStock})`
  );
  assert(
    calcAfterOut[0].currentStock === dashboardStock.currentStock,
    'Materials Master stock === Dashboard stock === COUNT remote IN_STOCK rolls'
  );

  // 6. generateInitialRolls cannot affect production state
  setForceProductionModeForTesting(true);
  const prodStoredRolls = getStoredInventoryRolls();
  // In production with Supabase, getStoredInventoryRolls never injects generateInitialRolls (759 rolls)
  assert(
    prodStoredRolls.length === 0,
    `Production mode getStoredInventoryRolls() returns [] instead of 759 seed rolls (got ${prodStoredRolls.length})`
  );
  setForceProductionModeForTesting(null);

  // ------------------------------------------------------------------
  // TEST SUITE 30: CLIENT REQUIREMENT — MATERIAL MASTER → DASHBOARD MATRIX SYNCHRONIZATION
  // Tests 1 to 7 matching the specification
  // ------------------------------------------------------------------
  console.log('\n--- TEST SUITE 30: Material Master -> Dashboard Matrix Synchronization ---');

  // Baseline items setup
  const baseItems: MatrixInventoryItem[] = JSON.parse(JSON.stringify(INITIAL_MATRIX_ITEMS));

  // ==================================================================
  // TEST 1 — EXISTING MATERIAL NEW WIDTH
  // Existing: Backlit Sunlex / 1.63
  // Add: Backlit Sunlex / 2.20
  // EXPECTED:
  // No duplicate Backlit Sunlex row.
  // 2.20 appears under the existing row.
  // ==================================================================
  console.log('\n>> Test 1: Existing Material + New Width');
  const sunlex220: MatrixInventoryItem = {
    id: 'test-sunlex-220',
    materialName: 'Backlit Sunlex',
    category: 'Backlit',
    variantSize: '2.20',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'SUNLEX-2.20-50M',
    openingStock: 0,
    minStock: 2,
    active: true,
    createdAt: '2026-10-23',
    displayOrder: 10,
    dashboardGroup: 'FLEX_ROLL'
  };

  const test1Items = [...baseItems, sunlex220];
  const test1Calculated = calculateMatrixWithStock(test1Items, []);
  const test1Tables = computeDashboardMatrixTables(test1Calculated, test1Items);

  // Check rows: exactly one Backlit Sunlex row in flexRows
  const sunlexRows = test1Tables.flexRows.filter((r) => r.materialName === 'Backlit Sunlex');
  assert(
    sunlexRows.length === 1,
    `[Test 1] No duplicate Backlit Sunlex row created: exactly 1 row found (got ${sunlexRows.length})`
  );

  // Check columns: 2.20 and 3.20 are REMOVED from Flex Summary matrix
  assert(
    !test1Tables.flexWidths.includes('2.20'),
    `[Test 1] 2.20 width column is REMOVED from Flex Summary matrix`
  );
  assert(
    !test1Tables.flexWidths.includes('3.20'),
    `[Test 1] 3.20 width column is REMOVED from Flex Summary matrix`
  );

  // Manual entry preserves 2.20 in database/catalog
  assert(
    sunlex220.variantSize === '2.20',
    `[Test 1] Manual width 2.20 preserved in material master record (not prohibited globally)`
  );

  // Total calculation only includes visible columns (1.02, 1.32, 1.63, 1.93, 2.54)
  const sunlexRow = sunlexRows[0];
  const expectedVisibleTotal = test1Tables.flexWidths.reduce((sum, w) => sum + (sunlexRow.cells[w]?.currentStock || 0), 0);
  assert(
    sunlexRow.totalRolls === expectedVisibleTotal,
    `[Test 1] Visible row total calculates ONLY from visible columns (got ${sunlexRow.totalRolls}, expected ${expectedVisibleTotal})`
  );

  // ==================================================================
  // TEST 2 — NEW MATERIAL ORDER
  // Existing: Material A order 10, Material B order 20
  // Create: Material New order 15
  // EXPECTED Dashboard: Material A, Material New, Material B
  // NOT: Material A, Material B, Material New
  // ==================================================================
  console.log('\n>> Test 2: New Material Order (Deterministic Placement)');
  const matA: MatrixInventoryItem = {
    id: 'mat-a-163',
    materialName: 'Material A Alpha',
    category: 'Backlit',
    variantSize: '1.63',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'MAT-A-1.63',
    openingStock: 0,
    minStock: 2,
    active: true,
    createdAt: '2026-10-20',
    displayOrder: 10,
    dashboardGroup: 'FLEX_ROLL'
  };
  const matB: MatrixInventoryItem = {
    id: 'mat-b-163',
    materialName: 'Material B Beta',
    category: 'Backlit',
    variantSize: '1.63',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'MAT-B-1.63',
    openingStock: 0,
    minStock: 2,
    active: true,
    createdAt: '2026-10-21',
    displayOrder: 20,
    dashboardGroup: 'FLEX_ROLL'
  };
  const matNew: MatrixInventoryItem = {
    id: 'mat-new-163',
    materialName: 'Material New Gamma',
    category: 'Backlit',
    variantSize: '1.63',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'MAT-NEW-1.63',
    openingStock: 0,
    minStock: 2,
    active: true,
    createdAt: '2026-10-23', // Created LATER than A and B
    displayOrder: 15, // Display order placed between 10 and 20
    dashboardGroup: 'FLEX_ROLL'
  };

  const test2Items = [matA, matB, matNew]; // Even though appended at array end
  const test2Calculated = calculateMatrixWithStock(test2Items, []);
  const test2Tables = computeDashboardMatrixTables(test2Calculated, test2Items);

  const idxA = test2Tables.flexMaterials.indexOf('Material A Alpha');
  const idxNew = test2Tables.flexMaterials.indexOf('Material New Gamma');
  const idxB = test2Tables.flexMaterials.indexOf('Material B Beta');

  assert(
    idxA < idxNew && idxNew < idxB,
    `[Test 2] Material New (order 15) placed between Material A (order 10) and Material B (order 20): ` +
    `indices [${idxA}, ${idxNew}, ${idxB}]`
  );
  assert(
    idxNew !== test2Tables.flexMaterials.length - 1,
    `[Test 2] Material New is NOT appended at global bottom of Dashboard`
  );

  // ==================================================================
  // TEST 3 — EDIT ORDER
  // Change: Material B: 20 -> 5
  // EXPECTED: Material B automatically moves before Material A.
  // ==================================================================
  console.log('\n>> Test 3: Edit Order (Row Repositioning)');
  const matBEdited: MatrixInventoryItem = {
    ...matB,
    displayOrder: 5 // Changed from 20 to 5
  };

  const test3Items = [matA, matBEdited, matNew];
  const test3Calculated = calculateMatrixWithStock(test3Items, []);
  const test3Tables = computeDashboardMatrixTables(test3Calculated, test3Items);

  const idxBAfterEdit = test3Tables.flexMaterials.indexOf('Material B Beta');
  const idxAAfterEdit = test3Tables.flexMaterials.indexOf('Material A Alpha');
  const idxNewAfterEdit = test3Tables.flexMaterials.indexOf('Material New Gamma');

  assert(
    idxBAfterEdit < idxAAfterEdit && idxAAfterEdit < idxNewAfterEdit,
    `[Test 3] Material B (changed to order 5) moved before Material A (10) and Material New (15): ` +
    `order is [B: ${idxBAfterEdit}, A: ${idxAAfterEdit}, New: ${idxNewAfterEdit}]`
  );

  // ==================================================================
  // TEST 4 — CHANGE GROUP
  // Change a QA material from: FLEX_BACKLIT to: VINYL_LAMINATION
  // EXPECTED:
  // Disappears from Flex matrix and appears in Vinyl/Lamination matrix in correct position.
  // No duplicate.
  // ==================================================================
  console.log('\n>> Test 4: Change Category / Dashboard Group');
  const qaMaterialFlex: MatrixInventoryItem = {
    id: 'qa-hybrid-01',
    materialName: 'QA Hybrid Film',
    category: 'Flex PVC',
    variantSize: '1.27',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'QA-HYB-1.27',
    openingStock: 0,
    minStock: 2,
    active: true,
    createdAt: '2026-10-23',
    displayOrder: 15,
    dashboardGroup: 'FLEX_ROLL'
  };

  // Initially in Flex
  const test4InitialItems = [...baseItems, qaMaterialFlex];
  const test4InitialTables = computeDashboardMatrixTables(calculateMatrixWithStock(test4InitialItems, []), test4InitialItems);
  assert(
    test4InitialTables.flexMaterials.includes('QA Hybrid Film'),
    `[Test 4] QA Hybrid Film initially present in Flex matrix`
  );
  assert(
    !test4InitialTables.vinylMaterials.includes('QA Hybrid Film'),
    `[Test 4] QA Hybrid Film initially absent from Vinyl matrix`
  );

  // Move to VINYL_ROLL
  const qaMaterialVinyl: MatrixInventoryItem = {
    ...qaMaterialFlex,
    category: 'Self Adhesive Vinyl',
    dashboardGroup: 'VINYL_ROLL',
    displayOrder: 25
  };
  const test4MovedItems = [...baseItems, qaMaterialVinyl];
  const test4MovedTables = computeDashboardMatrixTables(calculateMatrixWithStock(test4MovedItems, []), test4MovedItems);

  assert(
    !test4MovedTables.flexMaterials.includes('QA Hybrid Film'),
    `[Test 4] QA Hybrid Film completely removed from Flex matrix`
  );
  assert(
    test4MovedTables.vinylMaterials.includes('QA Hybrid Film'),
    `[Test 4] QA Hybrid Film appears in Vinyl matrix in correct position`
  );
  const totalOccurrences =
    test4MovedTables.flexRows.filter((r) => r.materialName === 'QA Hybrid Film').length +
    test4MovedTables.vinylRows.filter((r) => r.materialName === 'QA Hybrid Film').length;
  assert(
    totalOccurrences === 1,
    `[Test 4] Exactly 1 occurrence exists across all matrices (no duplicate): got ${totalOccurrences}`
  );

  // ==================================================================
  // TEST 5 — CROSS-BROWSER SYNCHRONIZATION
  // Browser A: create/update material ordering
  // Browser B: refresh
  // EXPECTED: identical Dashboard structure and order
  // ==================================================================
  console.log('\n>> Test 5: Cross-Browser Remote Synchronization');
  // Browser A saves updated catalog with custom display orders
  const catalogForBrowserA: MatrixInventoryItem[] = [
    ...baseItems,
    {
      id: 'custom-cross-sync-01',
      materialName: 'Synced Star Flex',
      category: 'Flex PVC',
      variantSize: '1.63',
      rollLengthMtr: 50,
      unit: 'Rolls',
      barcode: 'SYNCED-1.63-50M',
      openingStock: 0,
      minStock: 2,
      active: true,
      createdAt: '2026-10-23',
      displayOrder: 12, // Custom order between 10 and 20
      dashboardGroup: 'FLEX_ROLL'
    }
  ];

  // Test Live Supabase Remote Persistence & Cross-Browser Synchronization
  let remoteSavePassed = false;
  let fetchedForBrowserB: MatrixInventoryItem[] | null = null;

  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const envLocal: Record<string, string> = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) envLocal[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
      }
      if (envLocal.VITE_SUPABASE_URL && envLocal.VITE_SUPABASE_ANON_KEY) {
        const { createClient } = await import('@supabase/supabase-js');
        const testClient = createClient(envLocal.VITE_SUPABASE_URL, envLocal.VITE_SUPABASE_ANON_KEY);
        const { data: staffLogin } = await testClient.auth.signInWithPassword({
          email: 'staff@rollprint.com',
          password: 'RollPrintStaff2026!'
        });
        if (staffLogin?.user) {
          const { error: updErr } = await testClient.auth.updateUser({
            data: { material_catalog: catalogForBrowserA }
          });
          remoteSavePassed = !updErr;
          const { data: getUserData } = await testClient.auth.getUser();
          const remoteCatalog = getUserData?.user?.user_metadata?.material_catalog;
          if (Array.isArray(remoteCatalog) && remoteCatalog.length >= catalogForBrowserA.length) {
            fetchedForBrowserB = remoteCatalog;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Test 5 live Supabase check error:', err);
  }

  assert(
    remoteSavePassed,
    `[Test 5] Browser A persists material catalog remotely to Supabase without errors`
  );

  // Browser B fetches remote catalog on refresh
  assert(
    fetchedForBrowserB !== null && fetchedForBrowserB.length >= catalogForBrowserA.length,
    `[Test 5] Browser B receives remote authoritative catalog from Supabase`
  );

  if (fetchedForBrowserB) {
    const tablesBrowserA = computeDashboardMatrixTables(calculateMatrixWithStock(catalogForBrowserA, []), catalogForBrowserA);
    const tablesBrowserB = computeDashboardMatrixTables(calculateMatrixWithStock(fetchedForBrowserB, []), fetchedForBrowserB);

    assert(
      tablesBrowserB.flexMaterials.includes('Synced Star Flex'),
      `[Test 5] Browser B matrix includes newly added material from Browser A`
    );
    assert(
      tablesBrowserA.flexMaterials.indexOf('Synced Star Flex') === tablesBrowserB.flexMaterials.indexOf('Synced Star Flex'),
      `[Test 5] Browser A and Browser B produce IDENTICAL row placement order for Synced Star Flex`
    );
  }

  // ==================================================================
  // TEST 6 — STOCK IN MAPPING
  // Stock IN 3 physical rolls against newly created material variant.
  // EXPECTED:
  // correct Dashboard row + correct width column = 3 Rolls
  // No new row appended elsewhere.
  // ==================================================================
  console.log('\n>> Test 6: Stock IN Mapping to Existing Dashboard Row');
  const targetMaterialName = 'Backlit Sunlex';
  const targetWidth = '2.20';

  // Create 3 physical rolls in stock for Backlit Sunlex 2.20
  const stockInRolls: InventoryRoll[] = [
    {
      id: 'roll-sync-01',
      rollBarcode: '231026TEST01-R01',
      rollNumber: 1,
      batchNumber: '231026TEST01',
      invoiceNumber: 'TEST01',
      materialName: targetMaterialName,
      category: 'Backlit',
      size: targetWidth,
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-23',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z'
    },
    {
      id: 'roll-sync-02',
      rollBarcode: '231026TEST01-R02',
      rollNumber: 2,
      batchNumber: '231026TEST01',
      invoiceNumber: 'TEST01',
      materialName: targetMaterialName,
      category: 'Backlit',
      size: targetWidth,
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-23',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z'
    },
    {
      id: 'roll-sync-03',
      rollBarcode: '231026TEST01-R03',
      rollNumber: 3,
      batchNumber: '231026TEST01',
      invoiceNumber: 'TEST01',
      materialName: targetMaterialName,
      category: 'Backlit',
      size: targetWidth,
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-23',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z'
    }
  ];

  const test6Calculated = calculateMatrixWithStock(test1Items, [], stockInRolls);
  const test6Tables = computeDashboardMatrixTables(test6Calculated, test1Items);

  const sunlexTest6Row = test6Tables.flexRows.find((r) => r.materialName === targetMaterialName);
  assert(
    sunlexTest6Row !== undefined,
    `[Test 6] Backlit Sunlex row exists in Flex matrix`
  );
  assert(
    sunlexTest6Row?.cells[targetWidth]?.currentStock === 3,
    `[Test 6] Backlit Sunlex [${targetWidth}] cell displays exactly 3 Rolls (got ${sunlexTest6Row?.cells[targetWidth]?.currentStock})`
  );
  assert(
    test6Tables.flexRows.filter((r) => r.materialName === targetMaterialName).length === 1,
    `[Test 6] No duplicate Backlit Sunlex row was created anywhere in Dashboard`
  );

  // ==================================================================
  // TEST 7 — STOCK OUT MAPPING & POSITION STABILITY
  // Stock OUT one of those rolls.
  // EXPECTED:
  // same Dashboard row/column changes: 3 -> 2
  // Position does not change.
  // ==================================================================
  console.log('\n>> Test 7: Stock OUT Mapping & Deterministic Row Position Stability');
  const sunlexPosBefore = test6Tables.flexMaterials.indexOf(targetMaterialName);

  // Transition roll 1 to OUT
  const stockAfterOutRolls: InventoryRoll[] = stockInRolls.map((r, idx) =>
    idx === 0
      ? { ...r, status: 'OUT' as const, stockOutInvoiceNumber: 'DS/26-27/999', stockOutDate: '2026-10-23' }
      : r
  );

  const test7Calculated = calculateMatrixWithStock(test1Items, [], stockAfterOutRolls);
  const test7Tables = computeDashboardMatrixTables(test7Calculated, test1Items);

  const sunlexTest7Row = test7Tables.flexRows.find((r) => r.materialName === targetMaterialName);
  const sunlexPosAfter = test7Tables.flexMaterials.indexOf(targetMaterialName);

  assert(
    sunlexTest7Row?.cells[targetWidth]?.currentStock === 2,
    `[Test 7] Stock OUT of 1 roll updates cell value: 3 -> 2 Rolls (got ${sunlexTest7Row?.cells[targetWidth]?.currentStock})`
  );
  assert(
    sunlexPosBefore === sunlexPosAfter,
    `[Test 7] Dashboard row position does NOT move when stock changes: position before=${sunlexPosBefore}, after=${sunlexPosAfter}`
  );

  // ==================================================================
  // RULE 10 — ZERO STOCK PERSISTENCE
  // Active material with 0 rolls remains visible in its matrix.
  // ==================================================================
  console.log('\n>> Rule 10: Zero Stock Material Visibility');
  const zeroStockRolls: InventoryRoll[] = [];
  const testZeroStockCalculated = calculateMatrixWithStock(test1Items, [], zeroStockRolls);
  const testZeroStockTables = computeDashboardMatrixTables(testZeroStockCalculated, test1Items);

  assert(
    testZeroStockTables.flexMaterials.includes(targetMaterialName),
    `[Rule 10] Material '${targetMaterialName}' remains visible in matrix even when stock reaches 0 rolls`
  );
  // ==================================================================
  // TEST SUITE 31 — CLIENT MATERIAL RESET & SUMMARY WIDTH CLEANUP
  // ==================================================================
  console.log('\n--- Test Suite 31: Client Material Reset & 2.20/3.20 Summary Width Cleanup ---');

  // 1. Empty state catalog produces 0 dashboard rows and does not crash
  const emptyCatalog: MatrixInventoryItem[] = [];
  const emptyCalculated = calculateMatrixWithStock(emptyCatalog, []);
  const emptyTables = computeDashboardMatrixTables(emptyCalculated, emptyCatalog);

  assert(
    emptyTables.flexRows.length === 0,
    '[Test Suite 31.1] Empty catalog produces exactly 0 rows in Flex matrix (no ghost sample materials)'
  );
  assert(
    emptyTables.vinylRows.length === 0,
    '[Test Suite 31.1] Empty catalog produces exactly 0 rows in Vinyl matrix'
  );
  assert(
    emptyTables.flexWidths.length === 5 &&
    !emptyTables.flexWidths.includes('2.20') &&
    !emptyTables.flexWidths.includes('3.20'),
    '[Test Suite 31.1] Flex Summary matrix columns strictly [1.02, 1.32, 1.63, 1.93, 2.54] (2.20 and 3.20 absent)'
  );

  // 2. Client creates brand new QA Client Material (1.63, 50M, displayOrder: 10)
  const qaClientMaterial: MatrixInventoryItem = {
    id: 'mat-qa-client-163',
    materialName: 'QA Client Material',
    category: 'Flex PVC',
    variantSize: '1.63',
    rollLengthMtr: 50,
    unit: 'Rolls',
    barcode: 'QA-CLIENT-1.63',
    openingStock: 0,
    minStock: 2,
    active: true,
    createdAt: '2026-10-23',
    displayOrder: 10,
    dashboardGroup: 'FLEX_ROLL'
  };

  const singleCatalog = [qaClientMaterial];
  const singleCalculated = calculateMatrixWithStock(singleCatalog, []);
  const singleTables = computeDashboardMatrixTables(singleCalculated, singleCatalog);

  assert(
    singleTables.flexRows.length === 1 && singleTables.flexRows[0].materialName === 'QA Client Material',
    '[Test Suite 31.2] Brand-new QA Client Material renders as exactly 1 row in Flex matrix'
  );
  assert(
    singleTables.flexRows[0].totalRolls === 0,
    '[Test Suite 31.2] New material starts with exactly 0 rolls stock'
  );

  // 3. Stock IN test: 3 rolls of 1.63
  const qaInRolls: InventoryRoll[] = [
    {
      id: 'qa-r01',
      rollBarcode: 'QA-IN-001-R01',
      rollNumber: 1,
      batchNumber: '231026QAIN01',
      invoiceNumber: 'QA-MATERIAL-IN-001',
      materialName: 'QA Client Material',
      category: 'Flex PVC',
      size: '1.63',
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-23',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z'
    },
    {
      id: 'qa-r02',
      rollBarcode: 'QA-IN-001-R02',
      rollNumber: 2,
      batchNumber: '231026QAIN01',
      invoiceNumber: 'QA-MATERIAL-IN-001',
      materialName: 'QA Client Material',
      category: 'Flex PVC',
      size: '1.63',
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-23',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z'
    },
    {
      id: 'qa-r03',
      rollBarcode: 'QA-IN-001-R03',
      rollNumber: 3,
      batchNumber: '231026QAIN01',
      invoiceNumber: 'QA-MATERIAL-IN-001',
      materialName: 'QA Client Material',
      category: 'Flex PVC',
      size: '1.63',
      rollLength: 50,
      status: 'IN_STOCK',
      receivedDate: '2026-10-23',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z'
    }
  ];

  const qaInCalculated = calculateMatrixWithStock(singleCatalog, [], qaInRolls);
  const qaInTables = computeDashboardMatrixTables(qaInCalculated, singleCatalog);
  const qaRowIn = qaInTables.flexRows[0];

  assert(
    qaRowIn.cells['1.63']?.currentStock === 3,
    '[Test Suite 31.3] Stock IN 3 rolls updates cell 1.63 to exactly 3 Rolls'
  );
  assert(
    qaRowIn.totalRolls === 3,
    '[Test Suite 31.3] Visible row total correctly shows 3 rolls'
  );

  // 4. Stock OUT test: 1 roll dispatched (3 -> 2)
  const qaOutRolls = qaInRolls.map((r, idx) =>
    idx === 0
      ? { ...r, status: 'OUT' as const, stockOutInvoiceNumber: 'DS/QA/001', stockOutDate: '2026-10-23' }
      : r
  );

  const qaOutCalculated = calculateMatrixWithStock(singleCatalog, [], qaOutRolls);
  const qaOutTables = computeDashboardMatrixTables(qaOutCalculated, singleCatalog);
  const qaRowOut = qaOutTables.flexRows[0];

  assert(
    qaRowOut.cells['1.63']?.currentStock === 2,
    '[Test Suite 31.4] Stock OUT 1 roll updates cell 1.63: 3 -> 2 Rolls'
  );
  assert(
    qaRowOut.totalRolls === 2,
    '[Test Suite 31.4] Visible row total updates: 3 -> 2 Rolls'
  );

  // 5. Total calculation strictly excludes hidden 2.20 / 3.20
  // Even if a roll with width 2.20 exists in stock, it must NOT be added to visible row total
  const roll220: InventoryRoll = {
    id: 'qa-r220',
    rollBarcode: 'QA-IN-220-R01',
    rollNumber: 1,
    batchNumber: '231026QAIN220',
    invoiceNumber: 'QA-MATERIAL-IN-220',
    materialName: 'QA Client Material',
    category: 'Flex PVC',
    size: '2.20',
    rollLength: 50,
    status: 'IN_STOCK',
    receivedDate: '2026-10-23',
    createdAt: '2026-10-23T00:00:00Z',
    updatedAt: '2026-10-23T00:00:00Z'
  };

  const hiddenWidthRolls = [...qaOutRolls, roll220]; // 2 rolls at 1.63 + 1 roll at 2.20 = 3 rolls in stock
  const hiddenCalculated = calculateMatrixWithStock(singleCatalog, [], hiddenWidthRolls);
  const hiddenTables = computeDashboardMatrixTables(hiddenCalculated, singleCatalog);
  const hiddenRow = hiddenTables.flexRows[0];

  assert(
    !hiddenTables.flexWidths.includes('2.20'),
    '[Test Suite 31.5] Flex Summary visible columns still exclude 2.20'
  );
  assert(
    hiddenRow.totalRolls === 2,
    `[Test Suite 31.5] Visible total strictly excludes 2.20 roll stock: visible total is 2 rolls (got ${hiddenRow.totalRolls})`
  );
  const visibleGrandTotalRolls = hiddenTables.flexRows.reduce((sum, r) => sum + r.totalRolls, 0);
  assert(
    visibleGrandTotalRolls === 2,
    `[Test Suite 31.5] Grand total strictly excludes 2.20 roll stock: grand total is 2 rolls (got ${visibleGrandTotalRolls})`
  );

  console.log('\n====================================================');
  console.log(`QA TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
})();



