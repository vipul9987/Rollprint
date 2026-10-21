import { InventoryRoll, RollCurrentStatus, MatrixStockTransaction, MatrixBatch } from '../types/inventory';
import {
  getStoredMatrixItems,
  saveStoredMatrixItems,
  getStoredMatrixTransactions,
  saveStoredMatrixTransactions,
  getStoredMatrixBatches,
  saveStoredMatrixBatches,
  INITIAL_MATRIX_BATCHES,
  INITIAL_MATRIX_ITEMS,
  normalizeNumericSize
} from './inventoryStore';

export const STORAGE_KEY_ROLLS = 'rollprint_inventory_rolls_v1';

/**
 * Normalizes roll barcode string by trimming, uppercasing, and removing URL prefixes
 */
export function extractRollBarcode(input: string): string {
  if (!input) return '';
  let clean = input.trim();
  if (clean.includes('/r/')) {
    const parts = clean.split('/r/');
    clean = parts[parts.length - 1];
  } else if (clean.includes('/b/')) {
    const parts = clean.split('/b/');
    clean = parts[parts.length - 1];
  }
  clean = clean.split('?')[0].split('#')[0].trim().toUpperCase();
  return clean;
}

/**
 * Generates unique roll barcode format:
 * Example:
 * Batch 101026GT28728 -> Roll 1: 101026GT28728-R01, Roll 2: 101026GT28728-R02, Roll 3: 101026GT28728-R03
 */
export function generateRollBarcode(
  batchNumber: string,
  rollNumber: number,
  lineIndex?: number
): string {
  const cleanBatch = batchNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const rollPad = String(rollNumber).padStart(2, '0');
  if (lineIndex !== undefined && lineIndex > 0) {
    return `${cleanBatch}-L${lineIndex}-R${rollPad}`;
  }
  return `${cleanBatch}-R${rollPad}`;
}

/**
 * Application-level Unique Barcode Validation
 * Enforces that two physical rolls must never receive the same barcode.
 */
export function validateUniqueRollBarcode(barcode: string, existingRolls?: InventoryRoll[]): boolean {
  if (!barcode || !barcode.trim()) return false;
  const target = barcode.trim().toUpperCase();
  const pool = existingRolls || getStoredInventoryRolls();
  return !pool.some((r) => r.rollBarcode.toUpperCase() === target);
}

/**
 * Generate seed physical rolls from initial system batches and opening stock
 */
export function generateInitialRolls(): InventoryRoll[] {
  const rolls: InventoryRoll[] = [];
  const existingBarcodes = new Set<string>();

  INITIAL_MATRIX_BATCHES.forEach((batch) => {
    (batch.items || []).forEach((item, itemIdx) => {
      const qty = item.initialRollQuantity || 1;
      const isMultiLine = (batch.items || []).length > 1;

      for (let r = 1; r <= qty; r++) {
        const barcode = isMultiLine
          ? generateRollBarcode(batch.batchNumber, r, itemIdx + 1)
          : generateRollBarcode(batch.batchNumber, r);

        // First roll of test batch GE23542 or AB12345 is IN_STOCK
        // If remaining is less than initial, mark appropriate number of rolls as OUT
        const remainingForThisItem = item.remainingRollQuantity;
        const isOut = r > remainingForThisItem;

        existingBarcodes.add(barcode.toUpperCase());
        rolls.push({
          id: `roll-${batch.batchNumber.toLowerCase()}-${item.id}-${r}`,
          rollBarcode: barcode,
          batchNumber: batch.batchNumber,
          batchId: batch.id,
          batchItemId: item.id,
          invoiceNumber: batch.invoiceNumber,
          originalStockInInvoiceNumber: batch.invoiceNumber,
          rollNumber: r,
          materialName: item.materialNameSnapshot || batch.materialName || 'Material',
          category: item.categorySnapshot || batch.category || 'Flex PVC',
          size: item.width || batch.variantSize || '1.63',
          rollLength: item.rollLength || batch.rollLengthMtr || 0,
          status: isOut ? 'OUT' : 'IN_STOCK',
          receivedDate: batch.stockInDate,
          stockOutDate: isOut ? batch.stockInDate : undefined,
          createdAt: batch.createdAt,
          updatedAt: batch.createdAt
        });
      }
    });
  });

  // Seed physical roll records for Opening Stock items
  INITIAL_MATRIX_ITEMS.forEach((item) => {
    if (item.unit !== 'Sheets' && item.openingStock > 0) {
      for (let r = 1; r <= item.openingStock; r++) {
        const pad = String(r).padStart(2, '0');
        const barcode = `OP-${item.id.toUpperCase()}-R${pad}`;
        if (!existingBarcodes.has(barcode.toUpperCase())) {
          existingBarcodes.add(barcode.toUpperCase());
          rolls.push({
            id: `roll-op-${item.id}-${r}`,
            rollBarcode: barcode,
            batchNumber: 'OPENING-STOCK',
            invoiceNumber: 'OPENING-INV',
            originalStockInInvoiceNumber: 'OPENING-INV',
            rollNumber: r,
            materialName: item.materialName,
            category: item.category,
            size: item.variantSize,
            rollLength: item.rollLengthMtr || 0,
            status: 'IN_STOCK',
            receivedDate: '2026-09-01',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z'
          });
        }
      }
    }
  });

  return rolls;
}

// In-memory fallback for non-browser environments (e.g. Node.js QA tests)
let memoryRollStore: InventoryRoll[] | null = null;

let forceProductionModeForTesting: boolean | null = null;

export function setForceProductionModeForTesting(val: boolean | null): void {
  forceProductionModeForTesting = val;
}

export function getEnvVar(key: string): string | undefined {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  return undefined;
}

export function isProductionEnvironment(): boolean {
  if (forceProductionModeForTesting !== null) {
    return forceProductionModeForTesting;
  }
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      if ((import.meta as any).env.PROD === true) return true;
      if ((import.meta as any).env.MODE === 'production') return true;
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV === 'production') return true;
      if (process.env.VITE_APP_ENV === 'production') return true;
    }
  } catch {}
  return false;
}

export function isSupabaseConfigured(): boolean {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  return Boolean(url && url.trim() && key && key.trim() && !url.includes('placeholder') && !url.includes('YOUR_'));
}

export function checkProductionDatabaseGuard(): { allowed: boolean; error?: string } {
  if (isProductionEnvironment() && !isSupabaseConfigured()) {
    return {
      allowed: false,
      error: 'DATABASE UNAVAILABLE: Supabase database connection is not configured. Inventory mutations are disabled in production to prevent device divergence.'
    };
  }
  return { allowed: true };
}

/**
 * Retrieve physical rolls from LocalStorage
 */
export function getStoredInventoryRolls(): InventoryRoll[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      if (!memoryRollStore) {
        memoryRollStore = generateInitialRolls();
      }
      return memoryRollStore;
    }
    const raw = localStorage.getItem(STORAGE_KEY_ROLLS);
    if (!raw) {
      const initial = generateInitialRolls();
      saveStoredInventoryRolls(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Ensure seed batches (like AB12345, GT28728, GE23542) rolls are present
      const seedRolls = generateInitialRolls();
      const existingBarcodes = new Set(parsed.map((r: InventoryRoll) => r.rollBarcode.toUpperCase()));
      const missingSeeds = seedRolls.filter((sr) => !existingBarcodes.has(sr.rollBarcode.toUpperCase()));
      if (missingSeeds.length > 0) {
        const merged = [...parsed, ...missingSeeds];
        saveStoredInventoryRolls(merged);
        return merged;
      }
      return parsed;
    }
    const initial = generateInitialRolls();
    saveStoredInventoryRolls(initial);
    return initial;
  } catch (err) {
    if (!memoryRollStore) {
      memoryRollStore = generateInitialRolls();
    }
    return memoryRollStore;
  }
}

/**
 * Save physical rolls into LocalStorage
 */
export function saveStoredInventoryRolls(rolls: InventoryRoll[]): void {
  try {
    memoryRollStore = rolls;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY_ROLLS, JSON.stringify(rolls));
    }
  } catch (err) {
    memoryRollStore = rolls;
  }
}

/**
 * Creates individual inventory_roll records for Stock IN
 * Example:
 * Stock IN receives 3 rolls of Bright FL 26 1.63 50M ->
 * Creates exactly 3 inventory_roll records:
 * Roll 1, Roll 2, Roll 3, each with a different, unique barcode.
 */
export function createPhysicalRollRecords(
  batchNumber: string,
  invoiceNumber: string,
  materialName: string,
  category: string,
  size: string,
  rollLength: number,
  quantity: number,
  receivedDate: string,
  lineIndex?: number
): InventoryRoll[] {
  const existingRolls = getStoredInventoryRolls();
  const newRolls: InventoryRoll[] = [];
  const existingBarcodes = new Set(existingRolls.map((r) => r.rollBarcode.toUpperCase()));

  for (let i = 1; i <= quantity; i++) {
    let candidateBarcode = generateRollBarcode(batchNumber, i, lineIndex);

    // Enforce uniqueness validation: if barcode exists, append unique suffix
    if (existingBarcodes.has(candidateBarcode.toUpperCase())) {
      let suffix = 1;
      while (existingBarcodes.has(`${candidateBarcode}-${suffix}`.toUpperCase())) {
        suffix++;
      }
      candidateBarcode = `${candidateBarcode}-${suffix}`;
    }

    existingBarcodes.add(candidateBarcode.toUpperCase());

    const roll: InventoryRoll = {
      id: `roll-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
      rollBarcode: candidateBarcode,
      batchNumber,
      invoiceNumber,
      rollNumber: i,
      materialName,
      category,
      size,
      rollLength,
      status: 'IN_STOCK',
      receivedDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    newRolls.push(roll);
  }

  // Persist new rolls to storage
  const updatedPool = [...newRolls, ...existingRolls];
  saveStoredInventoryRolls(updatedPool);

  // Sync to Supabase if configured
  syncRollsToSupabase(newRolls).catch((e) => console.warn('Supabase roll sync failed', e));

  return newRolls;
}

/**
 * Syncs physical rolls to Supabase table inventory_rolls
 */
export async function syncRollsToSupabase(rolls: InventoryRoll[]): Promise<void> {
  const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
  const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey || rolls.length === 0) return;

  try {
    const payload = rolls.map((r) => ({
      id: r.id,
      roll_barcode: r.rollBarcode,
      barcode: r.rollBarcode,
      batch_number: r.batchNumber,
      invoice_number: r.invoiceNumber,
      roll_number: r.rollNumber,
      material_name: r.materialName,
      size: r.size,
      roll_length: r.rollLength,
      status: r.status === 'IN_STOCK' ? 'AVAILABLE' : 'CONSUMED',
      initial_length: r.rollLength,
      remaining_length: r.status === 'IN_STOCK' ? r.rollLength : 0,
      received_date: r.receivedDate,
      created_at: r.createdAt,
      updated_at: r.updatedAt
    }));

    await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/inventory_rolls`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Failed to insert rolls into Supabase:', err);
  }
}

/**
 * EXACT SCAN QUERY:
 * When a barcode is scanned:
 * Query inventory_rolls by EXACT roll_barcode.
 * The query must return exactly ONE roll.
 * Do NOT query the whole batch and show all items.
 * Do NOT show a selection list.
 */
export async function queryRollByExactBarcode(rawBarcode: string): Promise<InventoryRoll | null> {
  const targetCode = extractRollBarcode(rawBarcode);
  if (!targetCode) return null;

  // 1. Try Supabase query if credentials configured
  const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
  const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

  if (supabaseUrl && supabaseKey) {
    try {
      const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/inventory_rolls?roll_barcode=eq.${encodeURIComponent(targetCode)}&select=*`;
      const res = await fetch(endpoint, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[0];
          return {
            id: row.id,
            rollBarcode: row.roll_barcode || row.barcode,
            batchNumber: row.batch_number || '',
            invoiceNumber: row.invoice_number || '',
            rollNumber: row.roll_number || 1,
            materialName: row.material_name || '',
            category: row.category || 'Flex PVC',
            size: String(row.size || ''),
            rollLength: Number(row.roll_length || row.initial_length) || 0,
            status: (row.status === 'AVAILABLE' || row.status === 'IN_STOCK') ? 'IN_STOCK' : 'OUT',
            receivedDate: row.received_date || '',
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString()
          };
        }
      }
    } catch (err) {
      console.warn('Supabase queryRollByExactBarcode failed, fallback to local storage:', err);
    }
  }

  // 2. Query Local Database for EXACT match
  const rolls = getStoredInventoryRolls();
  const matched = rolls.find(
    (r) => r.rollBarcode.toUpperCase() === targetCode ||
           r.rollBarcode.toUpperCase().replace(/[^A-Z0-9]/g, '') === targetCode.replace(/[^A-Z0-9]/g, '')
  );

  return matched || null;
}

export interface RollStockOutResult {
  success: boolean;
  error?: string;
  isDuplicateOut?: boolean;
  roll?: InventoryRoll;
  transaction?: MatrixStockTransaction;
  newBalance?: number;
}

/**
 * STOCK OUT FOR A SPECIFIC PHYSICAL ROLL:
 * - Barcode Stock OUT always represents quantity = 1 physical roll.
 * - Do not ask for "Roll Quantity OUT" after scanning one roll.
 * - DUPLICATE SCAN PROTECTION: If scanned roll is already OUT:
 *   Block the transaction. Show: "This roll has already been stocked out."
 *   Do not decrement inventory again.
 * - On confirmation:
 *   inventory_roll.status: IN_STOCK -> OUT
 *   Create one OUT transaction for that roll.
 *   Update dashboard / summary by -1 roll.
 */
export async function executeRollStockOutTransaction(
  rawRollBarcode: string,
  stockOutInvoiceNumber?: string,
  stockOutDate?: string
): Promise<RollStockOutResult> {
  const targetCode = extractRollBarcode(rawRollBarcode);
  if (!targetCode) {
    return { success: false, error: 'Invalid barcode provided.' };
  }

  const roll = await queryRollByExactBarcode(targetCode);
  if (!roll) {
    return {
      success: false,
      error: `Roll not found in database for barcode: ${targetCode}.`
    };
  }

  // DUPLICATE SCAN PROTECTION
  if (roll.status === 'OUT') {
    return {
      success: false,
      isDuplicateOut: true,
      error: 'This physical roll has already been stocked out.',
      roll
    };
  }

  // VALIDATION: Stock OUT Invoice Number and Date are REQUIRED
  const cleanOutInvoice = (stockOutInvoiceNumber || '').trim();
  if (!cleanOutInvoice) {
    return {
      success: false,
      error: 'Stock OUT Invoice Number is required.'
    };
  }

  const cleanOutDate = (stockOutDate || '').trim() || new Date().toISOString().split('T')[0];
  if (!cleanOutDate) {
    return {
      success: false,
      error: 'Stock OUT Date is required.'
    };
  }

  // 1. Update roll status: IN_STOCK -> OUT
  // CRITICAL RULE: DO NOT OVERWRITE STOCK IN INVOICE.
  // The original invoice associated with the roll when it came IN (roll.invoiceNumber) must remain unchanged!
  const rolls = getStoredInventoryRolls();
  const updatedRoll: InventoryRoll = {
    ...roll,
    status: 'OUT',
    stockOutDate: cleanOutDate,
    updatedAt: new Date().toISOString()
  };

  const updatedRolls = rolls.map((r) =>
    r.rollBarcode.toUpperCase() === roll.rollBarcode.toUpperCase() || r.id === roll.id
      ? updatedRoll
      : r
  );
  saveStoredInventoryRolls(updatedRolls);

  // 2. Update parent batch remaining roll count if present
  const batches = getStoredMatrixBatches();
  const updatedBatches = batches.map((b) => {
    if (b.batchNumber.toUpperCase() === roll.batchNumber.toUpperCase()) {
      let updatedItems = b.items;
      if (b.items && b.items.length > 0) {
        // Find matching item line
        updatedItems = b.items.map((it) => {
          if (
            it.materialNameSnapshot.toLowerCase() === roll.materialName.toLowerCase() &&
            it.width.trim() === roll.size.trim()
          ) {
            return {
              ...it,
              remainingRollQuantity: Math.max(0, it.remainingRollQuantity - 1)
            };
          }
          return it;
        });
      }

      const newRemaining = updatedItems && updatedItems.length > 0
        ? updatedItems.reduce((acc, it) => acc + it.remainingRollQuantity, 0)
        : Math.max(0, b.currentRemainingRollQuantity - 1);

      return {
        ...b,
        items: updatedItems,
        currentRemainingRollQuantity: newRemaining
      };
    }
    return b;
  });
  saveStoredMatrixBatches(updatedBatches);

  // 3. Find matching inventory variant to compute stock before/after
  const items = getStoredMatrixItems();
  const transactions = getStoredMatrixTransactions();

  const widthNum = parseFloat(roll.size) || 1.0;
  const lengthNum = roll.rollLength;
  if (!lengthNum || lengthNum <= 0) {
    return {
      success: false,
      error: `Roll ${roll.rollBarcode} has invalid roll length (${roll.rollLength}M). Dispatch blocked.`
    };
  }
  const areaMtr2 = Number((widthNum * lengthNum * 1).toFixed(2));

  let matchedItem = items.find(
    (i) =>
      i.active &&
      i.materialName.toLowerCase() === roll.materialName.toLowerCase() &&
      i.variantSize.trim() === roll.size.trim()
  );

  const curIn = transactions
    .filter((t) => t.itemId === matchedItem?.id && t.type === 'IN')
    .reduce((s, t) => s + t.quantity, 0);
  const curOut = transactions
    .filter((t) => t.itemId === matchedItem?.id && t.type === 'OUT')
    .reduce((s, t) => s + t.quantity, 0);

  const stockBefore = (matchedItem ? matchedItem.openingStock : 0) + curIn - curOut;
  const stockAfter = Math.max(0, stockBefore - 1);

  // 4. Create one OUT transaction for that roll (quantity = 1 physical roll)
  // Preserves original Stock IN invoice and stores Stock OUT invoice and date
  const parentBatch = batches.find(
    (b) => b.batchNumber.toUpperCase() === roll.batchNumber.toUpperCase()
  );

  const txnId = `tx-out-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const txn: MatrixStockTransaction = {
    id: txnId,
    itemId: matchedItem ? matchedItem.id : `dyn-${roll.materialName}-${roll.size}`,
    materialName: roll.materialName,
    category: roll.category,
    variantSize: roll.size,
    rollLengthMtr: roll.rollLength,
    barcode: roll.rollBarcode,
    type: 'OUT',
    quantity: 1, // Barcode Stock OUT always represents quantity = 1 physical roll
    areaMtr2,
    stockBefore,
    stockAfter,
    unit: 'Rolls',
    date: cleanOutDate,
    invoiceNumber: cleanOutInvoice,
    batchNumber: roll.batchNumber,
    batchId: parentBatch?.id,
    createdAt: new Date().toISOString(),

    // Roll-level Stock OUT Audit Fields:
    inventoryRollId: roll.id,
    rollBarcode: roll.rollBarcode,
    stockOutInvoiceNumber: cleanOutInvoice,
    stockOutDate: cleanOutDate,
    originalStockInInvoiceNumber: roll.invoiceNumber,

    // Snake_case aliases:
    inventory_roll_id: roll.id,
    roll_barcode: roll.rollBarcode,
    batch_id: parentBatch?.id,
    batch_number: roll.batchNumber,
    material_id: matchedItem?.id,
    material_name_snapshot: roll.materialName,
    category_snapshot: roll.category,
    width: roll.size,
    roll_length: roll.rollLength,
    transaction_type: 'OUT',
    stock_out_invoice_number: cleanOutInvoice,
    stock_out_date: cleanOutDate,
    original_stock_in_invoice_number: roll.invoiceNumber,
    created_at: new Date().toISOString()
  };

  const updatedTxns = [txn, ...transactions];
  saveStoredMatrixTransactions(updatedTxns);

  // 5. Sync to Supabase if configured
  const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
  const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
  if (supabaseUrl && supabaseKey) {
    try {
      // Patch inventory_roll status to OUT
      await fetch(
        `${supabaseUrl.replace(/\/$/, '')}/rest/v1/inventory_rolls?roll_barcode=eq.${encodeURIComponent(roll.rollBarcode)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            status: 'CONSUMED',
            remaining_length: 0,
            updated_at: new Date().toISOString()
          })
        }
      );
    } catch (e) {
      console.warn('Failed to update roll status in Supabase:', e);
    }
  }

  return {
    success: true,
    roll: updatedRoll,
    transaction: txn,
    newBalance: stockAfter
  };
}

export interface AtomicRollDispatchResult {
  success: boolean;
  error?: string;
  isConflict?: boolean;
  conflictBarcode?: string;
  dispatchInvoiceNumber?: string;
  dispatchDate?: string;
  totalRolls?: number;
  dispatchedRolls?: InventoryRoll[];
  transactions?: MatrixStockTransaction[];
}

/**
 * ATOMIC MULTI-ROLL POS DISPATCH:
 * Client Requirement:
 * - When user clicks CONFIRM STOCK OUT, revalidate EVERY roll in database:
 *   - barcode exists
 *   - status still IN_STOCK
 *   - no duplicates
 *   - OUT invoice exists
 *   - OUT date valid
 * - Process entire dispatch atomically:
 *   If 10 rolls are in cart: either ALL 10 become OUT or NONE become OUT.
 *   No partial completion.
 * - Call Supabase RPC execute_roll_dispatch if connected.
 * - Local rollback guarantee: If any single roll is invalid or already OUT,
 *   zero rolls are modified.
 */
export async function executeAtomicRollDispatch(
  outInvoiceNumber: string,
  outDate: string,
  rollsOrBarcodes: (InventoryRoll | string)[]
): Promise<AtomicRollDispatchResult> {
  const cleanInvoice = (outInvoiceNumber || '').trim();
  if (!cleanInvoice) {
    return { success: false, error: 'Stock OUT Invoice Number is required.' };
  }

  const cleanDate = (outDate || '').trim() || new Date().toISOString().split('T')[0];
  if (!cleanDate) {
    return { success: false, error: 'Stock OUT Date is required.' };
  }

  if (!rollsOrBarcodes || rollsOrBarcodes.length === 0) {
    return { success: false, error: 'No physical rolls provided for dispatch.' };
  }

  // 1. Extract and normalize unique roll barcodes
  const barcodeList: string[] = [];
  const seenBarcodes = new Set<string>();

  for (const item of rollsOrBarcodes) {
    const raw = typeof item === 'string' ? item : item.rollBarcode;
    const code = extractRollBarcode(raw);
    if (!code) {
      return { success: false, error: 'Invalid roll barcode encountered in dispatch cart.' };
    }
    if (seenBarcodes.has(code.toUpperCase())) {
      return { success: false, error: `Roll already added to this Stock OUT list: ${code}` };
    }
    seenBarcodes.add(code.toUpperCase());
    barcodeList.push(code);
  }

  // 2. Validate against Database (Supabase RPC if available)
  const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
  const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
  const hasSupabase = isSupabaseConfigured();

  // PRODUCTION SAFETY RULE:
  // Supabase unavailable must NOT silently switch inventory operations to localStorage in production.
  if (isProductionEnvironment() && !hasSupabase) {
    return {
      success: false,
      error: 'DATABASE UNAVAILABLE: Supabase database connection is not configured. Stock OUT mutations are disabled in production to prevent warehouse stock divergence between devices.'
    };
  }

  if (hasSupabase && supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/execute_roll_dispatch`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_out_invoice: cleanInvoice,
          p_out_date: cleanDate,
          p_roll_barcodes: barcodeList
        })
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        const msg = errorJson.message || errorJson.error || 'Database transaction failed';
        return {
          success: false,
          error: `Supabase Atomic Dispatch Failed: ${msg}`
        };
      }
    } catch (e: any) {
      console.warn('Supabase RPC call failed:', e);
      if (isProductionEnvironment()) {
        return {
          success: false,
          error: `DATABASE UNAVAILABLE: Remote Supabase database is unreachable (${e?.message || 'Network error'}). Stock OUT mutations are disabled in production to prevent warehouse stock divergence between devices.`
        };
      }
      // In development/test mode, fallback to local atomic transaction
    }
  }

  // 3. Atomic Local Store Execution
  // All-or-nothing: Validate ALL rolls are currently IN_STOCK in local store
  const currentRolls = getStoredInventoryRolls();
  const rollMap = new Map<string, InventoryRoll>();
  currentRolls.forEach((r) => {
    rollMap.set(r.rollBarcode.toUpperCase(), r);
  });

  const rollsToDispatch: InventoryRoll[] = [];
  for (const code of barcodeList) {
    const match = rollMap.get(code.toUpperCase());
    if (!match) {
      return {
        success: false,
        error: `Roll barcode not found: ${code}. Entire dispatch cancelled.`
      };
    }
    if (match.status === 'OUT') {
      return {
        success: false,
        isConflict: true,
        conflictBarcode: code,
        error: `This roll has already been stocked out: ${code} (Previous OUT Invoice: ${match.stockOutInvoiceNumber || 'N/A'}, Date: ${match.stockOutDate || 'N/A'}). Entire dispatch cancelled.`
      };
    }
    if (!match.rollLength || match.rollLength <= 0) {
      return {
        success: false,
        error: `Roll ${code} has invalid roll length (${match.rollLength}M). Dispatch blocked.`
      };
    }
    rollsToDispatch.push(match);
  }

  // All rolls validated! Now perform atomic updates
  const nowIso = new Date().toISOString();
  const updatedRollMap = new Map<string, InventoryRoll>();

  const newlyDispatchedRolls = rollsToDispatch.map((orig) => {
    const updated: InventoryRoll = {
      ...orig,
      status: 'OUT',
      stockOutInvoiceNumber: cleanInvoice,
      stockOutDate: cleanDate,
      updatedAt: nowIso
    };
    updatedRollMap.set(orig.rollBarcode.toUpperCase(), updated);
    return updated;
  });

  // Update rolls pool
  const nextRolls = currentRolls.map((r) => updatedRollMap.get(r.rollBarcode.toUpperCase()) || r);
  saveStoredInventoryRolls(nextRolls);

  // Update batches: decrement remaining roll count for each dispatched roll
  const batches = getStoredMatrixBatches();
  const updatedBatches = batches.map((batch) => {
    const rollsForBatch = newlyDispatchedRolls.filter(
      (r) => r.batchNumber.toUpperCase() === batch.batchNumber.toUpperCase()
    );
    if (rollsForBatch.length === 0) return batch;

    let updatedItems = batch.items || [];
    if (updatedItems.length > 0) {
      updatedItems = updatedItems.map((it) => {
        const countForItem = rollsForBatch.filter(
          (r) =>
            r.materialName.toLowerCase() === it.materialNameSnapshot.toLowerCase() &&
            r.size.trim() === it.width.trim()
        ).length;
        if (countForItem > 0) {
          return {
            ...it,
            remainingRollQuantity: Math.max(0, it.remainingRollQuantity - countForItem)
          };
        }
        return it;
      });
    }

    const newRemaining = updatedItems.length > 0
      ? updatedItems.reduce((acc, it) => acc + it.remainingRollQuantity, 0)
      : Math.max(0, batch.currentRemainingRollQuantity - rollsForBatch.length);

    return {
      ...batch,
      items: updatedItems,
      currentRemainingRollQuantity: newRemaining
    };
  });
  saveStoredMatrixBatches(updatedBatches);

  // Create OUT transaction for each dispatched roll
  const items = getStoredMatrixItems();
  const currentTransactions = getStoredMatrixTransactions();
  const newTransactions: MatrixStockTransaction[] = [];

  newlyDispatchedRolls.forEach((r, idx) => {
    const matchedItem = items.find(
      (i) =>
        i.active &&
        i.materialName.toLowerCase() === r.materialName.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === normalizeNumericSize(r.size)
    );

    const widthNum = parseFloat(r.size) || 1.0;
    const areaMtr2 = Number((widthNum * r.rollLength).toFixed(2));

    const txnId = `tx-pos-out-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`;
    newTransactions.push({
      id: txnId,
      itemId: matchedItem ? matchedItem.id : `dyn-${r.materialName}-${r.size}`,
      materialName: r.materialName,
      category: r.category,
      variantSize: r.size,
      rollLengthMtr: r.rollLength,
      barcode: r.rollBarcode,
      type: 'OUT',
      quantity: 1,
      areaMtr2,
      stockBefore: 0,
      stockAfter: 0,
      unit: 'Rolls',
      date: cleanDate,
      invoiceNumber: cleanInvoice,
      batchNumber: r.batchNumber,
      createdAt: nowIso,
      inventoryRollId: r.id,
      rollBarcode: r.rollBarcode,
      stockOutInvoiceNumber: cleanInvoice,
      stockOutDate: cleanDate,
      originalStockInInvoiceNumber: r.invoiceNumber,
      inventory_roll_id: r.id,
      roll_barcode: r.rollBarcode,
      material_id: matchedItem?.id,
      material_name_snapshot: r.materialName,
      category_snapshot: r.category,
      width: r.size,
      roll_length: r.rollLength,
      transaction_type: 'OUT',
      stock_out_invoice_number: cleanInvoice,
      stock_out_date: cleanDate,
      original_stock_in_invoice_number: r.invoiceNumber,
      created_at: nowIso
    });
  });

  saveStoredMatrixTransactions([...newTransactions, ...currentTransactions]);

  return {
    success: true,
    dispatchInvoiceNumber: cleanInvoice,
    dispatchDate: cleanDate,
    totalRolls: newlyDispatchedRolls.length,
    dispatchedRolls: newlyDispatchedRolls,
    transactions: newTransactions
  };
}
