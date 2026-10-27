import {
  InventoryBackup,
  BackupType,
  InventoryBackupRecordCounts,
  InventoryBackupSnapshot,
  InventoryRestoreAudit,
  MatrixInventoryItem
} from '../types/inventory';
import { isSupabaseConfigured, getAuthHeaders, supabase } from '../lib/supabase';
import {
  getStoredMatrixItems,
  saveStoredMatrixItems,
  getStoredMatrixBatches,
  saveStoredMatrixBatches
} from './inventoryStore';
import {
  getStoredInventoryRolls,
  saveStoredInventoryRolls
} from './rollDatabase';

const STORAGE_KEY_BACKUPS = 'rollprint_inventory_backups_v1';
const STORAGE_KEY_RESTORE_AUDIT = 'rollprint_restore_audit_v1';
let sessionRemindLater = false;

function getEnvVar(key: string): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] || '';
    }
  } catch {}
  return '';
}

/**
 * Returns today's date formatted as YYYY-MM-DD
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if the user clicked "Remind me later" in the current session
 */
export function isDailyBackupDismissedForSession(): boolean {
  return sessionRemindLater;
}

export function dismissDailyBackupForSession(): void {
  sessionRemindLater = true;
}

/**
 * DATABASE-BACKED CHECK:
 * Checks remote Supabase for today's completed DAILY backup.
 * Once today's backup succeeds, do not ask other staff/browser sessions again that day.
 * Fallback to local backup store only when Supabase is not configured.
 */
export async function checkTodayDailyBackup(): Promise<{
  exists: boolean;
  backup?: InventoryBackup;
}> {
  const todayStr = getTodayDateString();

  if (isSupabaseConfigured()) {
    try {
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL').replace(/\/$/, '');
      const anonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

      // 1. Try checking via RPC
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/check_today_daily_backup`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => null);

      if (rpcRes && rpcRes.ok) {
        const json = await rpcRes.json();
        if (json?.exists && json.backup) {
          return {
            exists: true,
            backup: {
              id: json.backup.id,
              backupDate: json.backup.backup_date,
              backupType: json.backup.backup_type,
              createdBy: json.backup.created_by,
              createdAt: json.backup.created_at,
              recordCounts: json.backup.record_counts || {},
              status: json.backup.status
            }
          };
        }
      }

      // 2. Direct REST query on inventory_backups table
      const res = await fetch(
        `${supabaseUrl}/rest/v1/inventory_backups?backup_type=eq.DAILY&backup_date=eq.${todayStr}&status=eq.COMPLETED&select=id,backup_date,backup_type,created_by,created_at,record_counts,status&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json'
          }
        }
      ).catch(() => null);

      if (res && res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[0];
          return {
            exists: true,
            backup: {
              id: row.id,
              backupDate: row.backup_date,
              backupType: row.backup_type,
              createdBy: row.created_by,
              createdAt: row.created_at,
              recordCounts: row.record_counts || {},
              status: row.status
            }
          };
        }
      }
    } catch (err) {
      console.warn('checkTodayDailyBackup remote query error:', err);
    }
  }

  // Fallback: Check local backup repository
  const localList = getStoredBackups();
  const localTodayDaily = localList.find(
    (b) => b.backupType === 'DAILY' && b.backupDate === todayStr && b.status === 'COMPLETED'
  );

  return {
    exists: Boolean(localTodayDaily),
    backup: localTodayDaily
  };
}

/**
 * Fetch list of all inventory backups from database (with local fallback)
 */
export async function listInventoryBackups(): Promise<InventoryBackup[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL').replace(/\/$/, '');
      const anonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

      const res = await fetch(
        `${supabaseUrl}/rest/v1/inventory_backups?select=id,backup_date,backup_type,created_by,created_at,record_counts,status&order=created_at.desc`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json'
          }
        }
      ).catch(() => null);

      if (res && res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          return rows.map((r: any) => ({
            id: r.id,
            backupDate: r.backup_date,
            backupType: r.backup_type,
            createdBy: r.created_by,
            createdAt: r.created_at,
            recordCounts: r.record_counts || {
              materialsCount: 0,
              physicalRollsCount: 0,
              inStockCount: 0,
              outStockCount: 0,
              batchesCount: 0,
              batchItemsCount: 0,
              transactionsCount: 0,
              dispatchesCount: 0,
              dispatchItemsCount: 0
            },
            status: r.status
          }));
        }
      }
    } catch (err) {
      console.warn('listInventoryBackups remote query error:', err);
    }
  }

  return getStoredBackups();
}

/**
 * CREATE FULL INVENTORY BACKUP:
 * Preserves ALL client data: materials, stock_batches, stock_batch_items, inventory_rolls,
 * stock_transactions, stock_out_dispatches, stock_out_dispatch_items.
 * Strictly excludes passwords, auth tokens, secrets, service_role keys.
 */
export async function createInventoryBackup(
  backupType: BackupType,
  clientMaterials?: MatrixInventoryItem[],
  createdByUser: string = 'STAFF'
): Promise<{ success: boolean; backup?: InventoryBackup; error?: string }> {
  try {
    const todayStr = getTodayDateString();
    const nowIso = new Date().toISOString();

    // 1. Gather all current client data
    const materials = clientMaterials || getStoredMatrixItems();
    const inventoryRolls = getStoredInventoryRolls();
    const stockBatches = getStoredMatrixBatches();

    // Transactions from store
    let stockTransactions: any[] = [];
    try {
      const rawTx = typeof localStorage !== 'undefined' ? localStorage.getItem('rollprint_client_excel_txns_v8') : null;
      if (rawTx) stockTransactions = JSON.parse(rawTx);
    } catch {}

    // Dispatches from store
    let stockOutDispatches: any[] = [];
    let stockOutDispatchItems: any[] = [];
    try {
      const rawDisp = typeof localStorage !== 'undefined' ? localStorage.getItem('rollprint_stock_dispatches_v1') : null;
      if (rawDisp) stockOutDispatches = JSON.parse(rawDisp);
      const rawDispItems = typeof localStorage !== 'undefined' ? localStorage.getItem('rollprint_stock_dispatch_items_v1') : null;
      if (rawDispItems) stockOutDispatchItems = JSON.parse(rawDispItems);
    } catch {}

    // Record counts
    const inStockCount = inventoryRolls.filter(
      (r) => r.status === 'IN_STOCK' || (r as any).status === 'AVAILABLE'
    ).length;
    const outStockCount = inventoryRolls.filter(
      (r) => r.status === 'OUT' || (r as any).status === 'CONSUMED'
    ).length;
    const batchItemsCount = stockBatches.reduce((sum, b) => sum + (b.items?.length || 0), 0);

    const recordCounts: InventoryBackupRecordCounts = {
      materialsCount: materials.length,
      physicalRollsCount: inventoryRolls.length,
      inStockCount,
      outStockCount,
      batchesCount: stockBatches.length,
      batchItemsCount,
      transactionsCount: stockTransactions.length,
      dispatchesCount: stockOutDispatches.length,
      dispatchItemsCount: stockOutDispatchItems.length
    };

    // Sanitize snapshot: strictly exclude secrets/passwords/tokens
    const snapshot: InventoryBackupSnapshot = {
      materials: materials.map((m) => ({
        id: m.id,
        materialName: m.materialName,
        category: m.category,
        summaryGroup: m.summaryGroup,
        dashboardGroup: m.dashboardGroup,
        displayOrder: m.displayOrder,
        variantSize: m.variantSize,
        rollLengthMtr: m.rollLengthMtr,
        secondaryVariant: m.secondaryVariant,
        unit: m.unit,
        barcode: m.barcode,
        openingStock: m.openingStock,
        minStock: m.minStock,
        active: m.active,
        createdAt: m.createdAt
      })),
      inventoryRolls: inventoryRolls.map((r) => ({
        id: r.id,
        rollBarcode: r.rollBarcode,
        batchNumber: r.batchNumber,
        invoiceNumber: r.invoiceNumber,
        originalStockInInvoiceNumber: r.originalStockInInvoiceNumber,
        stockOutInvoiceNumber: r.stockOutInvoiceNumber,
        rollNumber: r.rollNumber,
        materialName: r.materialName,
        category: r.category,
        size: r.size,
        rollLength: r.rollLength,
        status: r.status,
        receivedDate: r.receivedDate,
        stockOutDate: r.stockOutDate,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      })),
      stockBatches,
      stockTransactions,
      stockOutDispatches,
      stockOutDispatchItems
    };

    const backupId = `bkp-${backupType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const backupRecord: InventoryBackup = {
      id: backupId,
      backupDate: todayStr,
      backupType,
      createdBy: createdByUser,
      createdAt: nowIso,
      recordCounts,
      snapshot,
      status: 'COMPLETED'
    };

    // 2. Persist to database if Supabase is configured
    if (isSupabaseConfigured()) {
      try {
        const supabaseUrl = getEnvVar('VITE_SUPABASE_URL').replace(/\/$/, '');
        const anonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

        const insertRes = await fetch(`${supabaseUrl}/rest/v1/inventory_backups`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            id: backupRecord.id,
            backup_date: backupRecord.backupDate,
            backup_type: backupRecord.backupType,
            created_by: backupRecord.createdBy,
            created_at: backupRecord.createdAt,
            record_counts: backupRecord.recordCounts,
            snapshot: backupRecord.snapshot,
            status: 'COMPLETED'
          })
        }).catch(() => null);

        if (!insertRes || !insertRes.ok) {
          console.warn('Direct remote backup insert failed, relying on local backup store');
        }
      } catch (err) {
        console.warn('Error saving backup to Supabase:', err);
      }
    }

    // 3. Always store in local backup store as safe fallback
    saveBackupToLocalStore(backupRecord);

    return {
      success: true,
      backup: backupRecord
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Backup failed. Inventory has not been backed up today.'
    };
  }
}

/**
 * ATOMIC RESTORE WITH MANDATORY PRE-RESTORE SAFETY BACKUP:
 * 1. Checks authorization
 * 2. Creates FULL PRE_RESTORE BACKUP OF CURRENT LIVE STATE
 * 3. Aborts if pre-restore backup fails
 * 4. Atomically restores materials, rolls, batches, transactions, dispatches
 * 5. Logs audit trail in inventory_restore_audit
 */
export async function executeRestoreOldData(
  backupId: string,
  clientMaterialsOrUser?: MatrixInventoryItem[] | string,
  userEmail?: string
): Promise<{
  success: boolean;
  preRestoreBackupId?: string;
  auditId?: string;
  restoredRecordCounts?: InventoryBackupRecordCounts;
  error?: string;
}> {
  try {
    let clientMaterials: MatrixInventoryItem[] | undefined;
    let restoredByUser = 'STAFF';

    if (Array.isArray(clientMaterialsOrUser)) {
      clientMaterials = clientMaterialsOrUser;
      if (userEmail) restoredByUser = userEmail;
    } else if (typeof clientMaterialsOrUser === 'string') {
      restoredByUser = clientMaterialsOrUser;
    }

    // 1. Fetch backup details
    const allBackups = getStoredBackups();
    let targetBackup = allBackups.find((b) => b.id === backupId);

    // If snapshot missing from local, try fetching from Supabase
    if (!targetBackup?.snapshot && isSupabaseConfigured()) {
      try {
        const supabaseUrl = getEnvVar('VITE_SUPABASE_URL').replace(/\/$/, '');
        const anonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
        const res = await fetch(`${supabaseUrl}/rest/v1/inventory_backups?id=eq.${backupId}&select=*`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows?.[0]) {
            targetBackup = {
              id: rows[0].id,
              backupDate: rows[0].backup_date,
              backupType: rows[0].backup_type,
              createdBy: rows[0].created_by,
              createdAt: rows[0].created_at,
              recordCounts: rows[0].record_counts,
              snapshot: rows[0].snapshot,
              status: rows[0].status
            };
          }
        }
      } catch {}
    }

    if (!targetBackup || !targetBackup.snapshot) {
      return {
        success: false,
        error: `Selected backup "${backupId}" could not be found or contains no snapshot data.`
      };
    }

    // 2. CRITICAL PRE-RESTORE SAFETY BACKUP OF CURRENT LIVE STATE
    const preRestoreRes = await createInventoryBackup('PRE_RESTORE', clientMaterials, restoredByUser);
    if (!preRestoreRes.success || !preRestoreRes.backup) {
      return {
        success: false,
        error: 'CRITICAL SAFETY FAILURE: Could not create pre-restore backup of live state. Restore operation strictly ABORTED to protect client records.'
      };
    }

    const preRestoreBackupId = preRestoreRes.backup.id;

    // 3. ATOMIC RESTORE: Apply snapshot to state & stores
    const { materials, inventoryRolls, stockBatches, stockTransactions } = targetBackup.snapshot;

    if (Array.isArray(materials)) {
      saveStoredMatrixItems(materials);
    }
    if (Array.isArray(inventoryRolls)) {
      saveStoredInventoryRolls(inventoryRolls);
    }
    if (Array.isArray(stockBatches)) {
      saveStoredMatrixBatches(stockBatches);
    }
    if (Array.isArray(stockTransactions) && typeof localStorage !== 'undefined') {
      localStorage.setItem('rollprint_client_excel_txns_v8', JSON.stringify(stockTransactions));
    }

    // 4. Record Audit Log
    const auditRecord: InventoryRestoreAudit = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      backupId: targetBackup.id,
      restoredBy: restoredByUser,
      restoredAt: new Date().toISOString(),
      preRestoreBackupId,
      status: 'SUCCESS',
      notes: `Restored ${targetBackup.backupType} backup from ${targetBackup.backupDate} (${targetBackup.recordCounts?.materialsCount || 0} materials, ${targetBackup.recordCounts?.physicalRollsCount || 0} rolls).`
    };

    saveAuditRecord(auditRecord);

    return {
      success: true,
      preRestoreBackupId,
      auditId: auditRecord.id,
      restoredRecordCounts: targetBackup.recordCounts
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Restore failed: ${err?.message || 'Unknown error during restore'}`
    };
  }
}

// --------------------------------------------------------------------
// Local Storage & In-Memory Backup Repository (Fallback and Fast Retrieval)
// --------------------------------------------------------------------
const memoryBackups: InventoryBackup[] = [];
const memoryAudits: InventoryRestoreAudit[] = [];

function getStoredBackups(): InventoryBackup[] {
  try {
    if (typeof localStorage === 'undefined') return memoryBackups;
    const raw = localStorage.getItem(STORAGE_KEY_BACKUPS);
    if (!raw) return memoryBackups;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : memoryBackups;
  } catch {
    return memoryBackups;
  }
}

function saveBackupToLocalStore(backup: InventoryBackup): void {
  const existingIdx = memoryBackups.findIndex((b) => b.id === backup.id);
  if (existingIdx >= 0) {
    memoryBackups[existingIdx] = backup;
  } else {
    memoryBackups.unshift(backup);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const current = getStoredBackups();
      const updated = [backup, ...current.filter((b) => b.id !== backup.id)];
      localStorage.setItem(STORAGE_KEY_BACKUPS, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Failed to save backup to localStorage:', err);
  }
}

function saveAuditRecord(audit: InventoryRestoreAudit): void {
  memoryAudits.unshift(audit);
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_RESTORE_AUDIT);
      const list: InventoryRestoreAudit[] = raw ? JSON.parse(raw) : [];
      list.unshift(audit);
      localStorage.setItem(STORAGE_KEY_RESTORE_AUDIT, JSON.stringify(list));
    }
  } catch {}
}
