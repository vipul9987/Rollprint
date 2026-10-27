import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Search,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Printer,
  X,
  TrendingUp,
  TrendingDown,
  Box,
  Eye,
  EyeOff,
  Grid,
  Table as TableIcon,
  Camera,
  Barcode as BarcodeIcon,
  Filter,
  Calendar,
  FileText,
  Ruler,
  RotateCcw,
  Download,
  FileSpreadsheet,
  Copy,
  LogOut,
  AlertTriangle,
  Database
} from 'lucide-react';
import { StaffLoginView } from './components/StaffLoginView';
import { getStaffSession, signOutStaff, onStaffAuthStateChange, isSupabaseConfigured } from './lib/supabase';
import {
  getStoredMatrixItems,
  saveStoredMatrixItems,
  getStoredMatrixTransactions,
  saveStoredMatrixTransactions,
  calculateMatrixWithStock,
  calculateMatrixDashboardMetrics,
  generateMatrixBarcode,
  getItemSummaryGroup,
  FLEX_SUMMARY_WIDTHS,
  STAR_SUMMARY_WIDTHS,
  VINYL_SUMMARY_WIDTHS,
  PVC_SHEET_SIZES,
  PVC_THICKNESSES,
  generateBatchNumber,
  formatDateToDDMMYY,
  normalizeInvoiceForBatch,
  getStoredMatrixBatches,
  saveStoredMatrixBatches,
  findBatchesByBatchOrBarcode,
  getMaterialRowDisplayOrder,
  normalizeSummaryGroup,
  fetchMaterialsFromSupabase,
  saveMaterialsToSupabase,
  isStarMaterialCategory,
  isValidStarMaterialSize,
  validateStarMaterial
} from './data/inventoryStore';
import {
  InventoryRoll,
  MatrixInventoryItem,
  MatrixStockTransaction,
  MatrixItemWithStock,
  InventorySummaryGroup,
  MatrixBatch,
  MatrixBatchItem,
  STAR_MATERIAL_CATEGORY,
  STAR_MATERIAL_INTERNAL,
  STAR_MATERIAL_ALLOWED_SIZES,
  STAR_MATERIAL_SIZE_ERROR
} from './types/inventory';
import {
  getStoredInventoryRolls,
  saveStoredInventoryRolls,
  createPhysicalRollRecords,
  queryRollByExactBarcode,
  executeRollStockOutTransaction,
  checkProductionDatabaseGuard,
  fetchRollsFromSupabase,
  fetchTransactionsFromSupabase,
  executeAtomicStockInRpc
} from './data/rollDatabase';
import { MobileItemView } from './components/MobileItemView';
import { CameraScannerModal } from './components/CameraScannerModal';
import { BatchBarcodeLabel } from './components/BatchBarcodeLabel';
import { AppLogo } from './components/AppLogo';
import { BarcodeDisplay } from './components/BarcodeDisplay';
import { BarcodeScannerView } from './components/BarcodeScannerView';
import { BatchDetailPage } from './components/BatchDetailPage';
import { StockDetailsDialog } from './components/StockDetailsDialog';
import { fetchBatchesFromSupabase } from './data/batchDatabase';
import { downloadSummaryCsvFile, copySummaryTsvForGoogleSheets } from './utils/summaryExport';
import { DailyBackupModal } from './components/DailyBackupModal';
import { BackupRestoreView } from './components/BackupRestoreView';
import { checkTodayDailyBackup, isDailyBackupDismissedForSession } from './data/backupDatabase';

type TabType = 'dashboard' | 'scan' | 'materials' | 'stock-in' | 'stock-out' | 'transactions' | 'qr-labels' | 'backup';
type DashboardViewMode = 'matrix' | 'table';
type VerificationStatus = 'IDLE' | 'VERIFIED' | 'MISMATCH';

export interface DraftBatchItem {
  id: string;
  materialName: string;
  category: string;
  width: string;
  rollLength: number;
  rollQuantity: number;
  areaM2: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [dashboardViewMode, setDashboardViewMode] = useState<DashboardViewMode>('matrix');

  const isSupabaseLive = isSupabaseConfigured();

  // Core Data State (In production with Supabase, remote DB is the only source of truth!)
  const [items, setItems] = useState<MatrixInventoryItem[]>(() => isSupabaseLive ? [] : getStoredMatrixItems());
  const [transactions, setTransactions] = useState<MatrixStockTransaction[]>(() => isSupabaseLive ? [] : getStoredMatrixTransactions());
  const [batches, setBatches] = useState<MatrixBatch[]>(() => isSupabaseLive ? [] : getStoredMatrixBatches());
  const [inventoryRolls, setInventoryRolls] = useState<InventoryRoll[]>(() => isSupabaseLive ? [] : getStoredInventoryRolls());

  // Inventory loading indicator (active until remote inventory is fetched from Supabase)
  const [isInventoryLoading, setIsInventoryLoading] = useState<boolean>(isSupabaseLive);

  // Active batch for barcode label printing modal
  const [activeBatchForPrint, setActiveBatchForPrint] = useState<{ batch: MatrixBatch; copies: number } | null>(null);

  // Show inactive materials toggle in Material Master
  const [showInactive, setShowInactive] = useState<boolean>(false);



  // Synchronize derived stock values & areas with physical roll source of truth
  const itemsWithStock: MatrixItemWithStock[] = useMemo(() => {
    return calculateMatrixWithStock(items, transactions, inventoryRolls);
  }, [items, transactions, inventoryRolls]);

  // Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    return calculateMatrixDashboardMetrics(itemsWithStock, transactions);
  }, [itemsWithStock, transactions]);

  // Global Toast Notification State
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Staff Authentication State (Supabase Auth)
  const [staffSession, setStaffSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured());

  // Daily Backup Modal State
  const [isDailyBackupModalOpen, setIsDailyBackupModalOpen] = useState<boolean>(false);

  // Check today's database-backed daily backup on successful staff login of business day
  useEffect(() => {
    if (staffSession && !isDailyBackupDismissedForSession()) {
      checkTodayDailyBackup().then((res) => {
        if (!res.exists) {
          setIsDailyBackupModalOpen(true);
        }
      });
    }
  }, [staffSession]);

  // Revalidate all operational inventory data from remote Supabase (Materials, Rolls, Batches, Transactions)
  const revalidateRemoteInventory = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsInventoryLoading(false);
      return;
    }
    try {
      const [remoteRolls, remoteTxns, remoteBatches, remoteMaterials] = await Promise.all([
        fetchRollsFromSupabase(),
        fetchTransactionsFromSupabase(),
        fetchBatchesFromSupabase(),
        fetchMaterialsFromSupabase()
      ]);
      if (remoteRolls !== null) {
        setInventoryRolls(remoteRolls);
        saveStoredInventoryRolls(remoteRolls);
      }
      if (remoteTxns !== null) {
        setTransactions(remoteTxns);
        saveStoredMatrixTransactions(remoteTxns);
      }
      if (remoteBatches !== null) {
        setBatches(remoteBatches);
        saveStoredMatrixBatches(remoteBatches);
      }
      if (remoteMaterials !== null) {
        setItems(remoteMaterials);
        saveStoredMatrixItems(remoteMaterials);
      }
    } finally {
      setIsInventoryLoading(false);
    }
  }, []);

  // Listen for Staff Auth changes
  useEffect(() => {
    if (isSupabaseConfigured()) {
      getStaffSession().then((sess) => {
        setStaffSession(sess);
        setAuthLoading(false);
      });
      const unsub = onStaffAuthStateChange((sess) => {
        setStaffSession(sess);
        setAuthLoading(false);
      });
      return () => unsub();
    } else {
      setAuthLoading(false);
      setIsInventoryLoading(false);
    }
  }, []);

  // Synchronize inventory from remote Supabase on initial load and when staff logs in
  useEffect(() => {
    if (staffSession || !isSupabaseConfigured()) {
      revalidateRemoteInventory();
    }
  }, [staffSession, revalidateRemoteInventory]);

  // Re-sync inventory when user opens Dashboard, Materials Master, or Transactions tab
  useEffect(() => {
    if (
      (activeTab === 'dashboard' || activeTab === 'materials' || activeTab === 'transactions') &&
      isSupabaseConfigured() &&
      staffSession
    ) {
      revalidateRemoteInventory();
    }
  }, [activeTab, staffSession, revalidateRemoteInventory]);

  // Cross-browser synchronization: Re-validate when user returns/focuses the window
  useEffect(() => {
    const handleFocus = () => {
      if (isSupabaseConfigured() && staffSession) {
        revalidateRemoteInventory();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [staffSession, revalidateRemoteInventory]);

  // Distinct Material Names (displays ONLY material names in dropdowns)
  const uniqueMaterialNames = useMemo(() => {
    const set = new Set<string>();
    items.filter((i) => i.active).forEach((i) => set.add(i.materialName));
    return Array.from(set).sort();
  }, [items]);

  // -------------------------------------------------------------
  // BATCH ROUTING (/b/:batchNumber)
  // Example: https://rollprint.vercel.app/b/101026GE23542
  // -------------------------------------------------------------
  const [selectedBatchNumber, setSelectedBatchNumber] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/\/b\/([^/?#]+)/);
    if (match && match[1]) return match[1];
    const q = new URLSearchParams(window.location.search).get('b') || new URLSearchParams(window.location.search).get('batch');
    if (q) return q;
    const h = window.location.hash.match(/\/b\/([^/?#]+)/);
    if (h && h[1]) return h[1];
    return null;
  });

  // -------------------------------------------------------------
  // MOBILE ITEM PAGE / QR DIRECT URL ROUTING (/item/:itemId)
  // -------------------------------------------------------------
  const [selectedMobileItemId, setSelectedMobileItemId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/\/item\/([^/?#]+)/);
    if (match && match[1]) return match[1];
    const q = new URLSearchParams(window.location.search).get('item');
    if (q) return q;
    const h = window.location.hash.match(/item\/([^/?#]+)/);
    if (h && h[1]) return h[1];
    return null;
  });

  useEffect(() => {
    const handlePopState = () => {
      // 1. Check Batch URL (/b/:batchNumber)
      const bMatch = window.location.pathname.match(/\/b\/([^/?#]+)/);
      const bParam = new URLSearchParams(window.location.search).get('b') || new URLSearchParams(window.location.search).get('batch');
      const bHash = window.location.hash.match(/\/b\/([^/?#]+)/);
      if (bMatch && bMatch[1]) {
        setSelectedBatchNumber(bMatch[1]);
      } else if (bParam) {
        setSelectedBatchNumber(bParam);
      } else if (bHash && bHash[1]) {
        setSelectedBatchNumber(bHash[1]);
      } else {
        setSelectedBatchNumber(null);
      }

      // 2. Check Item URL (/item/:itemId)
      const match = window.location.pathname.match(/\/item\/([^/?#]+)/);
      const q = new URLSearchParams(window.location.search).get('item');
      if (match && match[1]) {
        setSelectedMobileItemId(match[1]);
      } else if (q) {
        setSelectedMobileItemId(q);
      } else {
        setSelectedMobileItemId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openBatchPage = (batchNum: string) => {
    try {
      window.history.pushState({}, '', `/b/${batchNum}`);
    } catch {
      // ignore
    }
    setSelectedBatchNumber(batchNum);
  };

  const closeBatchPage = () => {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      // ignore
    }
    setSelectedBatchNumber(null);
    setItems(getStoredMatrixItems());
    setBatches(getStoredMatrixBatches());
    setTransactions(getStoredMatrixTransactions());
  };

  const openMobileItemPage = (itemId: string) => {
    try {
      window.history.pushState({}, '', `/item/${itemId}`);
    } catch {
      // ignore
    }
    setSelectedMobileItemId(itemId);
  };

  const closeMobileItemPage = () => {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      // ignore
    }
    setSelectedMobileItemId(null);
  };

  // Quick Stock Update Modal from Matrix Click
  const [modalItem, setModalItem] = useState<MatrixItemWithStock | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);

  // Camera Scanner Modal State
  const [cameraScannerOpen, setCameraScannerOpen] = useState<boolean>(false);
  const [cameraScannerTarget, setCameraScannerTarget] = useState<'stock-in' | 'stock-out'>('stock-in');

  // -------------------------------------------------------------
  // HELPER: PARSE & STRICTLY VALIDATE FULL ROLL COUNT
  // Rule: Must be a positive whole integer (> 0).
  // Disallow: 0, negative numbers, empty values, decimal roll counts.
  // -------------------------------------------------------------
  const parseFullRollCount = (val: string): { valid: boolean; count: number; error?: string } => {
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
  };

  // -------------------------------------------------------------
  // HELPER: NORMALIZE NUMERIC SIZE / WIDTH & ROLL LENGTH
  // Rule: e.g. 1.630 -> "1.63", 1.0 -> "1", 70.0 -> 70
  // Prevents duplicate variants caused by number formatting differences.
  // -------------------------------------------------------------
  const normalizeNumericSize = (val: string | number): string => {
    const str = (val ?? '').toString().trim();
    if (!str) return '';
    const num = parseFloat(str);
    if (isNaN(num) || num <= 0) return '';
    // Format up to 3 decimals without trailing zeroes
    return parseFloat(num.toFixed(3)).toString();
  };

  const normalizeNumericLength = (val: string | number): number => {
    const str = (val ?? '').toString().trim();
    if (!str) return 0;
    const num = parseFloat(str);
    if (isNaN(num) || num <= 0) return 0;
    return parseFloat(num.toFixed(2));
  };

  // -------------------------------------------------------------
  // HELPER: BARCODE VERIFICATION MATCH
  // Supports:
  // 1. Batch Number / Batch Barcode (e.g. 101026GT28728)
  // 2. Material Matrix Barcode (e.g. ECONOMY-1.63-69M)
  // 3. Item ID or direct mobile item URL
  // -------------------------------------------------------------
  const checkBarcodeMatch = (
    scannedCode: string,
    targetItem: MatrixItemWithStock | undefined,
    expectedBatchBarcode?: string
  ): boolean => {
    if (!scannedCode.trim()) return false;
    const cleanCode = scannedCode.trim().toUpperCase();

    // 0. Direct match with current expected Batch Barcode (e.g. 101026GT28728)
    if (expectedBatchBarcode && cleanCode === expectedBatchBarcode.trim().toUpperCase()) {
      return true;
    }
    const normCode = cleanCode.replace(/[^A-Z0-9]/g, '');
    if (expectedBatchBarcode) {
      const normExpectedBatch = expectedBatchBarcode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normCode && normExpectedBatch && normCode === normExpectedBatch) return true;
    }

    if (!targetItem) return false;
    const cleanBarcode = targetItem.barcode.toUpperCase();
    const cleanId = (targetItem.id || '').toUpperCase();

    // 1. Direct match with expected item barcode (e.g. ECONOMY-1.63-69M or ACTIVE-1.02-70M)
    if (cleanCode === cleanBarcode) return true;

    // 2. Direct match with item ID (if exists)
    if (cleanId && cleanCode === cleanId) return true;

    // 3. Match from scanned QR URL (e.g. https://domain.com/item/act-102)
    if (cleanId && cleanCode.includes(`/ITEM/${cleanId}`)) return true;

    // 4. Normalized match (without hyphens or whitespace)
    const normBarcode = cleanBarcode.replace(/[^A-Z0-9]/g, '');
    if (normCode && normBarcode && normCode === normBarcode) return true;

    // 5. Match with Material + Size barcode without length suffix (e.g. ECONOMY-1.63 or ACTIVE-1.02)
    const normSize = normalizeNumericSize(targetItem.variantSize);
    const baseCode = `${targetItem.materialName}-${normSize}`.toUpperCase();
    if (cleanCode === baseCode) return true;
    const normBase = baseCode.replace(/[^A-Z0-9]/g, '');
    if (normCode && normBase && normCode === normBase) return true;

    // 6. Check if scanned code matches any existing batch for this exact item
    const matchingBatch = batches.find(
      (b) =>
        b.materialName.toLowerCase() === targetItem.materialName.toLowerCase() &&
        normalizeNumericSize(b.variantSize) === normSize &&
        (b.batchNumber.toUpperCase() === cleanCode || b.barcodeValue.toUpperCase() === cleanCode)
    );
    if (matchingBatch) return true;

    return false;
  };

  // -------------------------------------------------------------
  // STOCK IN FORM STATE (Exact Client Structure)
  // 1. Material Name (Dropdown)
  // 2. Category (auto-populated)
  // 3. Size / Width (MANUAL numeric input)
  // 4. Roll Length / Meter (MANUAL numeric input)
  // 5. Roll Quantity (Manual positive whole-number input)
  // 6. Invoice Number (REQUIRED, e.g. GT28728)
  // 7. Date (REQUIRED, e.g. 10/10/2026)
  // 8. Batch Number (AUTO-GENERATED, READ ONLY, DDMMYY + INVOICE)
  // 9. Calculation / Stock Preview
  // 10. Generate / Verify Batch Barcode
  // 11. Save Stock IN
  // -------------------------------------------------------------
  // STOCK IN MULTI-ITEM BATCH STATE (Client Tally Blueprint)
  // One Invoice / Batch = Multiple Batch Items
  // -------------------------------------------------------------
  const [draftBatchItems, setDraftBatchItems] = useState<DraftBatchItem[]>([]);
  const [editingDraftItemId, setEditingDraftItemId] = useState<string | null>(null);

  const [stockInMaterial, setStockInMaterial] = useState<string>('');
  const [stockInVariantSize, setStockInVariantSize] = useState<string>('');
  const [stockInRollLength, setStockInRollLength] = useState<string>('70');
  const [stockInRolls, setStockInRolls] = useState<string>('');
  const [stockInInvoiceNumber, setStockInInvoiceNumber] = useState<string>('');
  const [stockInDate, setStockInDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [stockInError, setStockInError] = useState<string>('');

  // Auto-generated Read-Only Batch Number: DDMMYY + CLEANED_INVOICE (Max 15 characters)
  // Deterministic rule: depends strictly on Date + Normalized Invoice
  const stockInGeneratedBatchNumber = useMemo(() => {
    return generateBatchNumber(stockInDate, stockInInvoiceNumber);
  }, [stockInDate, stockInInvoiceNumber]);

  // Track if CODE128 barcode successfully rendered
  const [stockInBarcodeRenderSuccess, setStockInBarcodeRenderSuccess] = useState<boolean>(false);

  const stockInRollsInputRef = useRef<HTMLInputElement | null>(null);
  const stockInInvoiceInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-populated Category for selected Material
  const stockInAutoCategory = useMemo(() => {
    if (!stockInMaterial) return '';
    const found = items.find((i) => i.materialName === stockInMaterial);
    return found?.category || 'Flex PVC';
  }, [items, stockInMaterial]);

  // Previously used / available sizes for autocomplete suggestions (does not restrict manual input)
  const stockInSuggestedSizes = useMemo(() => {
    if (!stockInMaterial) {
      return Array.from(new Set(items.filter((i) => i.active).map((i) => normalizeNumericSize(i.variantSize))));
    }
    const set = new Set<string>();
    items
      .filter((i) => i.active && i.materialName === stockInMaterial)
      .forEach((i) => {
        const norm = normalizeNumericSize(i.variantSize);
        if (norm) set.add(norm);
      });
    return Array.from(set);
  }, [items, stockInMaterial]);

  // Find or construct inventory item matching Stock IN inputs
  // If the exact combination exists, loads its current stock.
  // If it does not exist yet during Stock IN, treats it as a new inventory variant with current stock 0.
  const matchedStockInItem: MatrixItemWithStock | undefined = useMemo(() => {
    if (!stockInMaterial.trim()) return undefined;
    const rawSize = stockInVariantSize.trim();
    if (!rawSize) return undefined;
    const normSize = normalizeNumericSize(rawSize);
    const parsedWidth = parseFloat(normSize);
    if (isNaN(parsedWidth) || parsedWidth <= 0) return undefined;

    const normLength = normalizeNumericLength(stockInRollLength);
    if (normLength <= 0) return undefined;

    // 1. Exact match by normalized size and length
    const exact = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName.toLowerCase() === stockInMaterial.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === normSize &&
        normalizeNumericLength(i.rollLengthMtr) === normLength
    );
    if (exact) return exact;

    // 2. Base item of same material & normalized size with different roll length
    const baseSameSize = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName.toLowerCase() === stockInMaterial.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === normSize
    );
    if (baseSameSize) {
      const areaPerRoll = Number((parsedWidth * normLength).toFixed(2));
      return {
        ...baseSameSize,
        variantSize: normSize,
        rollLengthMtr: normLength,
        areaPerRoll,
        totalAreaMtr2: Number((baseSameSize.currentStock * areaPerRoll).toFixed(2)),
        barcode: generateMatrixBarcode(baseSameSize.materialName, normSize, normLength)
      };
    }

    // 3. New variant for this material (Current Stock = 0)
    const baseMat = items.find((i) => i.materialName.toLowerCase() === stockInMaterial.toLowerCase());
    const category = baseMat?.category || stockInAutoCategory || 'Flex PVC';
    const summaryGroup = baseMat?.summaryGroup || getItemSummaryGroup({ category, materialName: stockInMaterial });
    const areaPerRoll = Number((parsedWidth * normLength).toFixed(2));
    const generatedBarcode = generateMatrixBarcode(stockInMaterial, normSize, normLength);

    const newItem: MatrixItemWithStock = {
      id: `dyn-${stockInMaterial.toLowerCase().replace(/[^a-z0-9]/g, '')}-${normSize.replace('.', '_')}-${normLength}`,
      materialName: stockInMaterial,
      category,
      summaryGroup,
      variantSize: normSize,
      rollLengthMtr: normLength,
      unit: 'Rolls',
      barcode: generatedBarcode,
      openingStock: 0,
      minStock: 2,
      active: true,
      createdAt: new Date().toISOString().split('T')[0],
      totalIn: 0,
      totalOut: 0,
      currentStock: 0,
      areaPerRoll,
      totalAreaMtr2: 0,
      status: 'OUT_OF_STOCK'
    };
    return newItem;
  }, [items, itemsWithStock, stockInMaterial, stockInVariantSize, stockInRollLength, stockInAutoCategory]);

  // Central roll count validation for Stock IN
  const stockInRollValidation = useMemo(() => {
    return parseFullRollCount(stockInRolls);
  }, [stockInRolls]);

  // Check if current item inputs are valid to add to batch
  const isAddItemEnabled = useMemo(() => {
    if (!stockInMaterial.trim()) return false;
    const rawSize = stockInVariantSize.trim();
    const parsedWidth = parseFloat(rawSize);
    if (!rawSize || isNaN(parsedWidth) || parsedWidth <= 0) return false;
    const rawLength = stockInRollLength.trim();
    const parsedLength = parseFloat(rawLength);
    if (!rawLength || isNaN(parsedLength) || parsedLength <= 0) return false;
    if (!stockInRolls.trim()) return false;
    if (!stockInRollValidation.valid || stockInRollValidation.count <= 0) return false;
    return true;
  }, [stockInMaterial, stockInVariantSize, stockInRollLength, stockInRolls, stockInRollValidation]);

  // Computed reason if Save Stock IN is disabled
  const stockInDisabledReason = useMemo((): string | null => {
    if (!stockInInvoiceNumber.trim()) {
      return 'Enter Invoice Number to continue';
    }
    if (!stockInDate.trim() || isNaN(new Date(stockInDate).getTime())) {
      return 'Select a valid Date to proceed';
    }
    if (!stockInGeneratedBatchNumber) {
      return 'Unable to generate batch number. Check Date & Invoice';
    }
    if (draftBatchItems.length === 0 && !isAddItemEnabled) {
      return 'Add at least one item line to this batch using [+ ADD TO BATCH]';
    }
    return null;
  }, [
    stockInInvoiceNumber,
    stockInDate,
    stockInGeneratedBatchNumber,
    draftBatchItems.length,
    isAddItemEnabled
  ]);

  const isStockInSaveEnabled = stockInDisabledReason === null;

  // -------------------------------------------------------------
  // STOCK OUT FORM STATE (Exact Blueprint Order)
  // 1. Material Name
  // 2. Category (auto-populated)
  // 3. Size / Width
  // 4. Roll Length / Meter
  // 5. Roll Quantity OUT
  // 6. Date
  // 7. Calculation / Stock Preview
  // 8. Barcode Verification
  // 9. Save Stock OUT
  // -------------------------------------------------------------
  const [stockOutMaterial, setStockOutMaterial] = useState<string>('');
  const [stockOutVariantSize, setStockOutVariantSize] = useState<string>('');
  const [stockOutRollLength, setStockOutRollLength] = useState<string>('70');
  const [stockOutRolls, setStockOutRolls] = useState<string>('');
  const [stockOutDate, setStockOutDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [stockOutError, setStockOutError] = useState<string>('');

  const [stockOutBarcodeCode, setStockOutBarcodeCode] = useState<string>('');
  const [stockOutVerificationStatus, setStockOutVerificationStatus] = useState<VerificationStatus>('IDLE');
  const [stockOutSelectedBatchId, setStockOutSelectedBatchId] = useState<string>('');
  const [stockOutBatchSearchInput, setStockOutBatchSearchInput] = useState<string>('');

  const stockOutRollsInputRef = useRef<HTMLInputElement | null>(null);
  const stockOutVerificationInputRef = useRef<HTMLInputElement | null>(null);

  // Selected batch object
  const selectedStockOutBatch = useMemo(() => {
    if (!stockOutSelectedBatchId) return undefined;
    return batches.find((b) => b.id === stockOutSelectedBatchId);
  }, [batches, stockOutSelectedBatchId]);

  // Auto-populated Category for selected Material
  const stockOutAutoCategory = useMemo(() => {
    if (!stockOutMaterial) return '';
    const found = items.find((i) => i.materialName === stockOutMaterial);
    return found?.category || 'Flex PVC';
  }, [items, stockOutMaterial]);

  // Previously used / available sizes for autocomplete suggestions on Stock OUT
  const stockOutSuggestedSizes = useMemo(() => {
    if (!stockOutMaterial) {
      return Array.from(new Set(items.filter((i) => i.active).map((i) => normalizeNumericSize(i.variantSize))));
    }
    const set = new Set<string>();
    items
      .filter((i) => i.active && i.materialName === stockOutMaterial)
      .forEach((i) => {
        const norm = normalizeNumericSize(i.variantSize);
        if (norm) set.add(norm);
      });
    return Array.from(set);
  }, [items, stockOutMaterial]);

  // Find exact inventory item matching Stock OUT inputs
  // For Stock OUT: the Material + Size + Roll Length combination MUST already exist in inventory!
  const matchedStockOutItem: MatrixItemWithStock | undefined = useMemo(() => {
    if (!stockOutMaterial.trim()) return undefined;
    const rawSize = stockOutVariantSize.trim();
    if (!rawSize) return undefined;
    const normSize = normalizeNumericSize(rawSize);
    const parsedWidth = parseFloat(normSize);
    if (isNaN(parsedWidth) || parsedWidth <= 0) return undefined;

    const normLength = normalizeNumericLength(stockOutRollLength);
    if (normLength <= 0) return undefined;

    // 1. Exact match by normalized size and length
    const exact = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName.toLowerCase() === stockOutMaterial.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === normSize &&
        normalizeNumericLength(i.rollLengthMtr) === normLength
    );
    if (exact) return exact;

    // 2. Base item of same material & normalized size
    const baseItem = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName.toLowerCase() === stockOutMaterial.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === normSize
    );
    if (baseItem) {
      const areaPerRoll = Number((parsedWidth * normLength).toFixed(2));
      return {
        ...baseItem,
        variantSize: normSize,
        rollLengthMtr: normLength,
        areaPerRoll,
        totalAreaMtr2: Number((baseItem.currentStock * areaPerRoll).toFixed(2)),
        barcode: generateMatrixBarcode(baseItem.materialName, normSize, normLength)
      };
    }
    return undefined;
  }, [itemsWithStock, stockOutMaterial, stockOutVariantSize, stockOutRollLength]);

  // Available batches for current material + size + length with remaining rolls
  const availableBatchesForCurrentStockOut = useMemo(() => {
    if (!stockOutMaterial || !stockOutVariantSize) return [];
    const normSize = normalizeNumericSize(stockOutVariantSize);
    const normLen = normalizeNumericLength(stockOutRollLength);
    return batches.filter(
      (b) =>
        b.materialName.toLowerCase() === stockOutMaterial.toLowerCase() &&
        normalizeNumericSize(b.variantSize) === normSize &&
        normalizeNumericLength(b.rollLengthMtr) === normLen &&
        b.currentRemainingRollQuantity > 0
    );
  }, [batches, stockOutMaterial, stockOutVariantSize, stockOutRollLength]);

  const [duplicateBatchMatches, setDuplicateBatchMatches] = useState<MatrixBatch[]>([]);

  const [stockOutSelectedBatchItemId, setStockOutSelectedBatchItemId] = useState<string>('');

  const selectSingleStockOutBatch = (found: MatrixBatch, specificItemId?: string) => {
    setDuplicateBatchMatches([]);
    setStockOutSelectedBatchId(found.id);
    setStockOutBarcodeCode(found.batchNumber);
    setStockOutBatchSearchInput(found.batchNumber);
    setStockOutVerificationStatus('VERIFIED');
    setStockOutError('');

    const items = found.items || [];
    const targetItem = specificItemId
      ? items.find((it) => it.id === specificItemId)
      : items.find((it) => it.remainingRollQuantity > 0) || items[0];

    if (targetItem) {
      setStockOutSelectedBatchItemId(targetItem.id);
      setStockOutMaterial(targetItem.materialNameSnapshot);
      setStockOutVariantSize(targetItem.width);
      setStockOutRollLength(targetItem.rollLength.toString());
      setStockOutRolls('1');
    } else {
      setStockOutSelectedBatchItemId('');
      setStockOutMaterial(found.materialName);
      setStockOutVariantSize(found.variantSize);
      setStockOutRollLength(found.rollLengthMtr.toString());
      setStockOutRolls('1');
    }

    showNotification(
      `Batch ${found.batchNumber} linked (${found.currentRemainingRollQuantity} rolls across ${items.length || 1} items)`,
      'success'
    );
    setTimeout(() => stockOutRollsInputRef.current?.focus(), 100);
  };

  // Scan or select a batch directly by batch number / barcode
  const handleBatchSelectOrScan = (batchCodeOrId: string, specificItemId?: string): boolean => {
    const clean = batchCodeOrId.trim().toUpperCase();
    if (!clean) {
      setDuplicateBatchMatches([]);
      setStockOutSelectedBatchId('');
      setStockOutSelectedBatchItemId('');
      return false;
    }

    const matches = findBatchesByBatchOrBarcode(batches, clean);

    if (matches.length === 0) {
      const direct = batches.find((b) => b.id === batchCodeOrId);
      if (direct) {
        selectSingleStockOutBatch(direct, specificItemId);
        return true;
      }
      return false;
    }

    if (matches.length === 1) {
      selectSingleStockOutBatch(matches[0], specificItemId);
      return true;
    }

    // DUPLICATE BATCH CASE: Multiple material lines under same Date + Invoice
    setDuplicateBatchMatches(matches);
    setStockOutError(
      `Multiple material lines found for Batch ${matches[0].batchNumber} (Invoice ${matches[0].invoiceNumber}). Please select the material line below.`
    );
    return true;
  };

  // Central roll count validation for Stock OUT
  const stockOutRollValidation = useMemo(() => {
    return parseFullRollCount(stockOutRolls);
  }, [stockOutRolls]);

  // All conditions for enabling Save Stock OUT button
  const isStockOutSaveEnabled = useMemo(() => {
    const hasMaterial = Boolean(stockOutMaterial.trim());
    const hasSize = Boolean(stockOutVariantSize.trim());
    const hasLength = Boolean(stockOutRollLength.trim()) && parseFloat(stockOutRollLength) > 0;
    const hasValidRolls = stockOutRollValidation.valid && stockOutRollValidation.count > 0;
    const hasValidDate = Boolean(stockOutDate.trim()) && !isNaN(new Date(stockOutDate).getTime());
    const isVerified = stockOutVerificationStatus === 'VERIFIED';
    const hasItem = Boolean(matchedStockOutItem);

    // Validation: if a batch is selected, roll count cannot exceed batch stock
    const withinBatchStock =
      !selectedStockOutBatch ||
      (hasValidRolls && stockOutRollValidation.count <= selectedStockOutBatch.currentRemainingRollQuantity);

    const withinStock = Boolean(
      matchedStockOutItem &&
      hasValidRolls &&
      stockOutRollValidation.count <= matchedStockOutItem.currentStock &&
      withinBatchStock
    );

    return hasMaterial && hasSize && hasLength && hasValidRolls && hasValidDate && isVerified && hasItem && withinStock;
  }, [
    stockOutMaterial,
    stockOutVariantSize,
    stockOutRollLength,
    stockOutRollValidation,
    stockOutDate,
    stockOutVerificationStatus,
    matchedStockOutItem,
    selectedStockOutBatch
  ]);

  const validateStockOutBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setStockOutVerificationStatus('IDLE');
      return;
    }

    // Try matching as batch first
    const isBatchMatched = handleBatchSelectOrScan(trimmed);
    if (isBatchMatched) return;

    if (!matchedStockOutItem) {
      setStockOutVerificationStatus('MISMATCH');
      return;
    }
    const isMatch = checkBarcodeMatch(trimmed, matchedStockOutItem);
    setStockOutVerificationStatus(isMatch ? 'VERIFIED' : 'MISMATCH');
  };

  // Camera scan success handler
  const handleCameraScanSuccess = (decodedText: string) => {
    const clean = decodedText.trim();
    if (cameraScannerTarget === 'stock-in') {
      setStockInInvoiceNumber(clean);
      showNotification(`Scanned invoice: ${clean}`, 'success');
    } else {
      setStockOutBarcodeCode(clean);
      setStockOutBatchSearchInput(clean);
      const isBatch = handleBatchSelectOrScan(clean);
      if (isBatch) {
        showNotification(`Batch ${clean} found! Displaying batch items.`, 'success');
      } else {
        validateStockOutBarcode(clean);
      }
    }
  };

  // -------------------------------------------------------------
  // SHARED STOCK MUTATION HANDLER (Used by forms, mobile view, modal)
  // -------------------------------------------------------------
  const executeStockTransaction = (
    itemId: string,
    type: 'IN' | 'OUT',
    quantity: number,
    dateStr?: string,
    fallbackItem?: MatrixItemWithStock,
    extraMeta?: {
      invoiceNumber?: string;
      batchNumber?: string;
      batchId?: string;
      batchItemId?: string;
      width?: string;
      rollLength?: number;
      materialName?: string;
      category?: string;
    }
  ): { success: boolean; batch?: MatrixBatch } => {
    let targetItem = itemsWithStock.find((i) => i.id === itemId);

    // If item is a newly created variant during Stock IN
    if (!targetItem && fallbackItem && type === 'IN') {
      const normalizedSize = normalizeNumericSize(fallbackItem.variantSize);
      const normalizedLength = normalizeNumericLength(fallbackItem.rollLengthMtr);
      const newInventoryItem: MatrixInventoryItem = {
        id: fallbackItem.id,
        materialName: fallbackItem.materialName,
        category: fallbackItem.category,
        summaryGroup: fallbackItem.summaryGroup,
        variantSize: normalizedSize,
        rollLengthMtr: normalizedLength,
        unit: fallbackItem.unit || 'Rolls',
        barcode: fallbackItem.barcode,
        openingStock: 0,
        minStock: 2,
        active: true,
        createdAt: new Date().toISOString().split('T')[0]
      };
      const updatedItems = [...items, newInventoryItem];
      setItems(updatedItems);
      saveStoredMatrixItems(updatedItems);

      targetItem = {
        ...newInventoryItem,
        totalIn: 0,
        totalOut: 0,
        currentStock: 0,
        areaPerRoll: fallbackItem.areaPerRoll,
        totalAreaMtr2: 0,
        status: 'OUT_OF_STOCK'
      };
    }

    if (!targetItem) {
      showNotification('Item not found in inventory.', 'error');
      return { success: false };
    }

    if (quantity <= 0) {
      showNotification('Quantity must be at least 1 roll.', 'error');
      return { success: false };
    }

    if (type === 'OUT' && quantity > targetItem.currentStock) {
      showNotification(
        `Cannot remove ${quantity} rolls. Only ${targetItem.currentStock} rolls available in stock.`,
        'error'
      );
      return { success: false };
    }

    const stockBefore = targetItem.currentStock;
    const stockAfter = type === 'IN' ? stockBefore + quantity : stockBefore - quantity;
    const transactionDate = dateStr || new Date().toISOString().split('T')[0];

    // ONE SOURCE OF TRUTH: If explicit width or rollLength is passed from form payload or batch, USE IT DIRECTLY!
    const effectiveWidthStr = extraMeta?.width ? normalizeNumericSize(extraMeta.width) : targetItem.variantSize;
    const widthNum = parseFloat(effectiveWidthStr);
    if (isNaN(widthNum) || widthNum <= 0) {
      showNotification('Invalid Size / Width value for transaction.', 'error');
      return { success: false };
    }

    const lengthNum = (extraMeta?.rollLength !== undefined && extraMeta.rollLength > 0)
      ? extraMeta.rollLength
      : targetItem.rollLengthMtr;

    if (!lengthNum || lengthNum <= 0) {
      showNotification('Invalid Roll Length for transaction. Please enter a valid positive number.', 'error');
      return { success: false };
    }

    const effectiveMaterialName = extraMeta?.materialName || targetItem.materialName;
    const effectiveCategory = extraMeta?.category || targetItem.category;

    const areaMtr2 = Number((quantity * widthNum * lengthNum).toFixed(2));

    // Client Requirement: Every Stock IN creates ONE batch record with its own batch number
    let createdBatch: MatrixBatch | undefined = undefined;
    let batchNumber = extraMeta?.batchNumber;
    const invoiceNumber = extraMeta?.invoiceNumber;

    if (type === 'IN') {
      const generatedBatchNum = batchNumber || generateBatchNumber(transactionDate, invoiceNumber || '');
      const batchId = `bat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

      createdBatch = {
        id: batchId,
        batchNumber: generatedBatchNum,
        materialName: effectiveMaterialName,
        category: effectiveCategory,
        variantSize: effectiveWidthStr,
        rollLengthMtr: lengthNum,
        initialRollQuantity: quantity,
        currentRemainingRollQuantity: quantity,
        invoiceNumber: invoiceNumber || '',
        stockInDate: transactionDate,
        barcodeValue: generatedBatchNum,
        createdAt: new Date().toISOString()
      };

      const updatedBatches = [createdBatch, ...batches];
      setBatches(updatedBatches);
      saveStoredMatrixBatches(updatedBatches);
      batchNumber = generatedBatchNum;
    } else if (type === 'OUT' && extraMeta?.batchId) {
      // Deduct from specific batch and item line
      const targetBatch = batches.find((b) => b.id === extraMeta.batchId);
      if (targetBatch) {
        const targetItemId = extraMeta.batchItemId;
        const updatedBatches = batches.map((b) => {
          if (b.id !== extraMeta.batchId) return b;
          let updatedItems = b.items;
          if (Array.isArray(b.items) && b.items.length > 0) {
            let deducted = false;
            updatedItems = b.items.map((it) => {
              if (
                (!deducted && targetItemId && it.id === targetItemId) ||
                (!deducted && !targetItemId && it.materialNameSnapshot === effectiveMaterialName && it.width === effectiveWidthStr)
              ) {
                deducted = true;
                return {
                  ...it,
                  remainingRollQuantity: Math.max(0, it.remainingRollQuantity - quantity)
                };
              }
              return it;
            });
          }
          const totalRemaining = updatedItems && updatedItems.length > 0
            ? updatedItems.reduce((s, it) => s + (it.remainingRollQuantity || 0), 0)
            : Math.max(0, b.currentRemainingRollQuantity - quantity);

          return {
            ...b,
            items: updatedItems,
            currentRemainingRollQuantity: totalRemaining
          };
        });
        setBatches(updatedBatches);
        saveStoredMatrixBatches(updatedBatches);
        batchNumber = targetBatch.batchNumber;
      }
    }

    const newTxn: MatrixStockTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      itemId: targetItem.id,
      materialName: effectiveMaterialName,
      category: effectiveCategory,
      variantSize: effectiveWidthStr,
      rollLengthMtr: lengthNum,
      secondaryVariant: targetItem.secondaryVariant,
      barcode: batchNumber || targetItem.barcode,
      type,
      quantity,
      areaMtr2,
      stockBefore,
      stockAfter,
      unit: targetItem.unit,
      date: transactionDate,
      invoiceNumber: invoiceNumber || undefined,
      batchNumber: batchNumber || undefined,
      batchId: createdBatch?.id || extraMeta?.batchId,
      createdAt: new Date().toISOString()
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    saveStoredMatrixTransactions(updatedTxns);

    showNotification(
      `${type === 'IN' ? 'Stock IN' : 'Stock OUT'} confirmed: ${quantity} Rolls (${areaMtr2} m²) for ${effectiveMaterialName} (${effectiveWidthStr}M × ${lengthNum}M).${batchNumber ? ` Batch: ${batchNumber}.` : ''} New balance: ${stockAfter} Rolls.`,
      'success'
    );
    return { success: true, batch: createdBatch };
  };

  // Handler for direct Stock OUT executed from live Barcode Scanner (Parent-Child Batch Items)
  const handleScannerStockOut = (batch: MatrixBatch, rollsOutQty: number, batchItemId?: string) => {
    let targetItemLine: MatrixBatchItem | undefined;
    if (batch.items && batch.items.length > 0) {
      if (batchItemId) {
        targetItemLine = batch.items.find((it) => it.id === batchItemId);
      }
      if (!targetItemLine) {
        targetItemLine = batch.items.find((it) => it.remainingRollQuantity >= rollsOutQty) || batch.items[0];
      }
    }

    const effectiveMatName = targetItemLine?.materialNameSnapshot || batch.materialName || '';
    const effectiveSize = targetItemLine?.width || batch.variantSize || '';
    const effectiveLength = targetItemLine?.rollLength || batch.rollLengthMtr || 0;
    const effectiveCategory = targetItemLine?.categorySnapshot || batch.category || 'Flex PVC';

    const normSize = normalizeNumericSize(effectiveSize);

    // Update batch remaining quantities
    const updatedBatches = batches.map((b) => {
      if (b.id !== batch.id && b.batchNumber !== batch.batchNumber) return b;

      let updatedItems = b.items;
      if (b.items && b.items.length > 0) {
        updatedItems = b.items.map((it) => {
          if (targetItemLine && it.id === targetItemLine.id) {
            return {
              ...it,
              remainingRollQuantity: Math.max(0, it.remainingRollQuantity - rollsOutQty)
            };
          }
          return it;
        });
      }

      const totalRemaining = updatedItems && updatedItems.length > 0
        ? updatedItems.reduce((acc, it) => acc + it.remainingRollQuantity, 0)
        : Math.max(0, b.currentRemainingRollQuantity - rollsOutQty);

      return {
        ...b,
        items: updatedItems,
        currentRemainingRollQuantity: totalRemaining
      };
    });

    setBatches(updatedBatches);
    saveStoredMatrixBatches(updatedBatches);

    let matched = itemsWithStock.find(
      (i) =>
        i.materialName.toLowerCase() === effectiveMatName.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === normSize
    );

    if (!matched) {
      matched = itemsWithStock.find(
        (i) => i.materialName.toLowerCase() === effectiveMatName.toLowerCase()
      );
    }

    if (matched) {
      if (matched.currentStock < rollsOutQty) {
        const diff = rollsOutQty - matched.currentStock;
        const updatedItems = items.map((it) =>
          it.id === matched!.id ? { ...it, openingStock: it.openingStock + diff } : it
        );
        setItems(updatedItems);
        saveStoredMatrixItems(updatedItems);
      }

      const widthNum = parseFloat(normSize) || 1.0;
      const areaMtr2 = Number((rollsOutQty * widthNum * effectiveLength).toFixed(2));
      const stockBefore = matched.currentStock;
      const stockAfter = Math.max(0, stockBefore - rollsOutQty);

      const newTxn: MatrixStockTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        itemId: matched.id,
        materialName: effectiveMatName,
        category: effectiveCategory,
        variantSize: normSize,
        rollLengthMtr: effectiveLength,
        barcode: batch.batchNumber,
        type: 'OUT',
        quantity: rollsOutQty,
        areaMtr2,
        stockBefore,
        stockAfter,
        unit: matched.unit || 'Rolls',
        date: new Date().toISOString().split('T')[0],
        invoiceNumber: batch.invoiceNumber,
        batchNumber: batch.batchNumber,
        batchId: batch.id,
        batchItemId: targetItemLine?.id,
        createdAt: new Date().toISOString()
      };

      const updatedTxns = [newTxn, ...transactions];
      setTransactions(updatedTxns);
      saveStoredMatrixTransactions(updatedTxns);

      showNotification(
        `Dispatched ${rollsOutQty} Roll(s) of ${effectiveMatName} (${normSize}M × ${effectiveLength}M) from Batch ${batch.batchNumber}`,
        'success'
      );
    } else {
      showNotification(
        `Dispatched ${rollsOutQty} Roll(s) from Batch ${batch.batchNumber}`,
        'success'
      );
    }
  };

  // Handler for individual physical roll Stock OUT
  const handleRollStockOut = async (roll: InventoryRoll) => {
    await revalidateRemoteInventory();
    showNotification(
      `Dispatched 1 Roll of ${roll.materialName} (${roll.size}M × ${roll.rollLength}M) • Barcode: ${roll.rollBarcode}`,
      'success'
    );
  };

  // Handler for atomic multi-roll POS dispatch
  const handleDispatchComplete = async (result: any) => {
    await revalidateRemoteInventory();
    showNotification(
      `Stock OUT Complete: ${result.totalRolls || 0} rolls dispatched under Invoice ${result.dispatchInvoiceNumber || ''}`,
      'success'
    );
  };

  // Add Item to Current Draft Batch
  const handleAddOrUpdateItemToBatch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStockInError('');

    if (!stockInMaterial.trim()) {
      setStockInError('Please select a Material Name.');
      return;
    }

    const normWidth = normalizeNumericSize(stockInVariantSize);
    const parsedWidth = parseFloat(normWidth);
    if (!normWidth || isNaN(parsedWidth) || parsedWidth <= 0) {
      setStockInError('Please enter a valid Size / Width (> 0).');
      return;
    }

    const normLength = normalizeNumericLength(stockInRollLength);
    if (normLength <= 0) {
      setStockInError('Please enter a valid Roll Length (> 0).');
      return;
    }

    if (!stockInRollValidation.valid || stockInRollValidation.count <= 0) {
      setStockInError(stockInRollValidation.error || 'Please enter a valid positive whole number of rolls.');
      stockInRollsInputRef.current?.focus();
      return;
    }

    const qty = stockInRollValidation.count;
    const areaM2 = Number((parsedWidth * normLength * qty).toFixed(2));
    const category = stockInAutoCategory || 'Flex PVC';

    if (isStarMaterialCategory(category)) {
      if (!isValidStarMaterialSize(normWidth)) {
        setStockInError(STAR_MATERIAL_SIZE_ERROR);
        return;
      }
    }

    if (editingDraftItemId) {
      setDraftBatchItems((prev) =>
        prev.map((item) =>
          item.id === editingDraftItemId
            ? {
                ...item,
                materialName: stockInMaterial.trim(),
                category,
                width: normWidth,
                rollLength: normLength,
                rollQuantity: qty,
                areaM2
              }
            : item
        )
      );
      setEditingDraftItemId(null);
      showNotification(`Updated item line: ${stockInMaterial.trim()} (${normWidth}M × ${normLength}M, ${qty} Rolls)`, 'success');
    } else {
      const newItem: DraftBatchItem = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        materialName: stockInMaterial.trim(),
        category,
        width: normWidth,
        rollLength: normLength,
        rollQuantity: qty,
        areaM2
      };
      setDraftBatchItems((prev) => [...prev, newItem]);
      showNotification(`Added to batch: ${stockInMaterial.trim()} (${normWidth}M × ${normLength}M, ${qty} Rolls)`, 'success');
    }

    // Clear item inputs for next item
    setStockInVariantSize('');
    setStockInRolls('');
    setStockInError('');
  };

  // Edit draft line
  const handleEditDraftItem = (draft: DraftBatchItem) => {
    setStockInMaterial(draft.materialName);
    setStockInVariantSize(draft.width);
    setStockInRollLength(draft.rollLength.toString());
    setStockInRolls(draft.rollQuantity.toString());
    setEditingDraftItemId(draft.id);
    setStockInError('');
  };

  // Remove draft line
  const handleRemoveDraftItem = (id: string) => {
    setDraftBatchItems((prev) => prev.filter((it) => it.id !== id));
    if (editingDraftItemId === id) {
      setEditingDraftItemId(null);
      setStockInRolls('');
      setStockInVariantSize('');
    }
  };

  // Save Complete Stock IN Batch (Creates 1 Batch, Multiple Batch Items, and IN Transactions)
  const handleSaveStockInBatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStockInError('');

    const rawInvoice = stockInInvoiceNumber.trim();
    if (!rawInvoice) {
      setStockInError('Invoice Number is required for Stock IN.');
      stockInInvoiceInputRef.current?.focus();
      return;
    }

    const dbGuard = checkProductionDatabaseGuard();
    if (!dbGuard.allowed) {
      setStockInError(dbGuard.error || 'DATABASE UNAVAILABLE: Stock IN is disabled in production to prevent device stock divergence.');
      return;
    }

    if (!stockInDate) {
      setStockInError('Date is required for Stock IN.');
      return;
    }

    if (!stockInGeneratedBatchNumber) {
      setStockInError('Unable to generate Batch Number. Check Invoice Number and Date.');
      return;
    }

    // Auto-add current input if valid and draft is empty
    let linesToSave = [...draftBatchItems];
    if (linesToSave.length === 0) {
      if (!isAddItemEnabled) {
        setStockInError('Please add at least one item line to this batch using [+ ADD TO BATCH].');
        return;
      }
      const normWidth = normalizeNumericSize(stockInVariantSize);
      const parsedWidth = parseFloat(normWidth);
      const normLength = normalizeNumericLength(stockInRollLength);
      const qty = stockInRollValidation.count;
      const areaM2 = Number((parsedWidth * normLength * qty).toFixed(2));
      linesToSave.push({
        id: `draft-${Date.now()}`,
        materialName: stockInMaterial.trim(),
        category: stockInAutoCategory || 'Flex PVC',
        width: normWidth,
        rollLength: normLength,
        rollQuantity: qty,
        areaM2
      });
    }

    for (const line of linesToSave) {
      if (isStarMaterialCategory(line.category)) {
        if (!isValidStarMaterialSize(line.width)) {
          setStockInError(STAR_MATERIAL_SIZE_ERROR);
          return;
        }
      }
    }

    // Phase 7: Atomic Stock IN RPC Execution on Supabase
    if (isSupabaseConfigured()) {
      const rpcResult = await executeAtomicStockInRpc(rawInvoice.toUpperCase(), stockInDate, linesToSave);
      if (!rpcResult.success) {
        setStockInError(rpcResult.error || 'Stock IN failed in database.');
        return;
      }
    }

    const batchId = `bat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const batchItems: MatrixBatchItem[] = linesToSave.map((line, idx) => ({
      id: `sbi-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      batchId,
      materialNameSnapshot: line.materialName,
      categorySnapshot: line.category,
      width: line.width,
      rollLength: line.rollLength,
      initialRollQuantity: line.rollQuantity,
      remainingRollQuantity: line.rollQuantity,
      areaM2: line.areaM2,
      createdAt: new Date().toISOString()
    }));

    const totalInitial = linesToSave.reduce((sum, it) => sum + it.rollQuantity, 0);

    const newBatch: MatrixBatch = {
      id: batchId,
      batchNumber: stockInGeneratedBatchNumber,
      invoiceNumber: rawInvoice.toUpperCase(),
      stockInDate,
      barcodeValue: stockInGeneratedBatchNumber,
      items: batchItems,
      initialRollQuantity: totalInitial,
      currentRemainingRollQuantity: totalInitial,
      materialName: linesToSave[0]?.materialName,
      category: linesToSave[0]?.category,
      variantSize: linesToSave[0]?.width,
      rollLengthMtr: linesToSave[0]?.rollLength,
      createdAt: new Date().toISOString()
    };

    let currentItemsPool = [...items];
    const newTxns: MatrixStockTransaction[] = [];

    linesToSave.forEach((line, idx) => {
      const normSize = normalizeNumericSize(line.width);
      let matched = currentItemsPool.find(
        (i) =>
          i.active &&
          i.materialName.toLowerCase() === line.materialName.toLowerCase() &&
          normalizeNumericSize(i.variantSize) === normSize
      );

      if (!matched) {
        const newItem: MatrixInventoryItem = {
          id: `dyn-${line.materialName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${normSize.replace('.', '_')}-${line.rollLength}`,
          materialName: line.materialName,
          category: line.category,
          summaryGroup: getItemSummaryGroup({ category: line.category, materialName: line.materialName }),
          variantSize: normSize,
          rollLengthMtr: line.rollLength,
          unit: 'Rolls',
          barcode: generateMatrixBarcode(line.materialName, normSize, line.rollLength),
          openingStock: 0,
          minStock: 2,
          active: true,
          createdAt: stockInDate
        };
        currentItemsPool.push(newItem);
        matched = newItem;
      }

      const itemTxns = transactions.filter((t) => t.itemId === matched!.id);
      const curIn = itemTxns.filter((t) => t.type === 'IN').reduce((s, t) => s + t.quantity, 0);
      const curOut = itemTxns.filter((t) => t.type === 'OUT').reduce((s, t) => s + t.quantity, 0);
      const stockBefore = matched.openingStock + curIn - curOut;
      const stockAfter = stockBefore + line.rollQuantity;

      const txn: MatrixStockTransaction = {
        id: `tx-in-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        itemId: matched.id,
        materialName: line.materialName,
        category: line.category,
        variantSize: normSize,
        rollLengthMtr: line.rollLength,
        barcode: stockInGeneratedBatchNumber,
        type: 'IN',
        quantity: line.rollQuantity,
        areaMtr2: line.areaM2,
        stockBefore,
        stockAfter,
        unit: matched.unit || 'Rolls',
        date: stockInDate,
        invoiceNumber: rawInvoice.toUpperCase(),
        batchNumber: stockInGeneratedBatchNumber,
        batchId,
        batchItemId: batchItems[idx].id,
        createdAt: new Date().toISOString()
      };
      newTxns.push(txn);
    });

    setItems(currentItemsPool);
    saveStoredMatrixItems(currentItemsPool);

    const updatedBatches = [newBatch, ...batches];
    setBatches(updatedBatches);
    saveStoredMatrixBatches(updatedBatches);

    const updatedTxns = [...newTxns, ...transactions];
    setTransactions(updatedTxns);
    saveStoredMatrixTransactions(updatedTxns);

    if (isSupabaseConfigured() && staffSession) {
      await revalidateRemoteInventory();
    } else {
      // Offline / Local dev / test mode: create physical roll records locally
      linesToSave.forEach((line, idx) => {
        const normSize = normalizeNumericSize(line.width);
        createPhysicalRollRecords(
          stockInGeneratedBatchNumber,
          rawInvoice.toUpperCase(),
          line.materialName,
          line.category,
          normSize,
          line.rollLength,
          line.rollQuantity,
          stockInDate,
          linesToSave.length > 1 ? idx + 1 : undefined
        );
      });
      setInventoryRolls(getStoredInventoryRolls());
    }

    // Prompt/Open Batch Barcode Label print modal
    setActiveBatchForPrint({
      batch: newBatch,
      copies: totalInitial
    });

    setDraftBatchItems([]);
    setEditingDraftItemId(null);
    setStockInInvoiceNumber('');
    setStockInMaterial('');
    setStockInVariantSize('');
    setStockInRolls('');
    setStockInError('');
    showNotification(
      `Saved Batch ${stockInGeneratedBatchNumber}: ${linesToSave.length} item lines, ${totalInitial} rolls received!`,
      'success'
    );
  };

  // Submit Stock IN Form Wrapper
  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSaveStockInBatch();
  };

  // Submit Stock OUT Form
  const handleStockOutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStockOutError('');

    if (!matchedStockOutItem) {
      setStockOutError('Please select a valid material, size, and length configuration.');
      return;
    }

    if (stockOutVerificationStatus !== 'VERIFIED') {
      setStockOutError('Barcode verification is required. Please scan the matching barcode before saving.');
      return;
    }

    if (!stockOutRollValidation.valid || stockOutRollValidation.count <= 0) {
      setStockOutError(stockOutRollValidation.error || 'Please enter a valid positive number of rolls (minimum 1).');
      return;
    }

    const rollsToRemove = stockOutRollValidation.count;

    // Batch-level stock validation as per client specification
    if (selectedStockOutBatch && rollsToRemove > selectedStockOutBatch.currentRemainingRollQuantity) {
      setStockOutError(
        `Insufficient stock in this batch. Only ${selectedStockOutBatch.currentRemainingRollQuantity} rolls are available.`
      );
      return;
    }

    if (rollsToRemove > matchedStockOutItem.currentStock) {
      setStockOutError(
        `Cannot remove ${rollsToRemove} rolls. Only ${matchedStockOutItem.currentStock} rolls available in stock.`
      );
      return;
    }

    const normalizedWidth = normalizeNumericSize(stockOutVariantSize);
    const normalizedRollLength = normalizeNumericLength(stockOutRollLength);

    const result = executeStockTransaction(
      matchedStockOutItem.id,
      'OUT',
      rollsToRemove,
      stockOutDate,
      undefined,
      selectedStockOutBatch
        ? {
            batchId: selectedStockOutBatch.id,
            batchItemId: stockOutSelectedBatchItemId,
            batchNumber: selectedStockOutBatch.batchNumber,
            invoiceNumber: selectedStockOutBatch.invoiceNumber,
            width: stockOutVariantSize,
            rollLength: Number(stockOutRollLength),
            materialName: stockOutMaterial,
            category: stockOutAutoCategory
          }
        : {
            width: normalizedWidth,
            rollLength: normalizedRollLength,
            materialName: stockOutMaterial,
            category: stockOutAutoCategory
          }
    );

    if (result.success) {
      setStockOutRolls('');
      setStockOutBarcodeCode('');
      setStockOutSelectedBatchId('');
      setStockOutBatchSearchInput('');
      setStockOutVerificationStatus('IDLE');
      stockOutRollsInputRef.current?.focus();
    }
  };

  // -------------------------------------------------------------
  // MATERIAL MASTER MODAL & HANDLERS
  // -------------------------------------------------------------
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MatrixInventoryItem | null>(null);
  const [itemFormMaterial, setItemFormMaterial] = useState<string>('');
  const [itemFormCategory, setItemFormCategory] = useState<string>('Flex PVC');
  const [itemFormGroup, setItemFormGroup] = useState<InventorySummaryGroup>('FLEX_ROLL');
  const [itemFormDisplayOrder, setItemFormDisplayOrder] = useState<string>('100');
  const [itemFormSize, setItemFormSize] = useState<string>('');
  const [itemFormRollLength, setItemFormRollLength] = useState<string>('70');
  const [itemFormError, setItemFormError] = useState<string>('');

  const openAddModal = () => {
    setEditingItem(null);
    setItemFormMaterial('');
    setItemFormCategory('Flex PVC');
    setItemFormGroup('FLEX_ROLL');
    // Calculate default display order: highest order in FLEX_ROLL + 10, or 100
    const flexOrders = items
      .filter((i) => getItemSummaryGroup(i) === 'FLEX_ROLL' && typeof i.displayOrder === 'number')
      .map((i) => i.displayOrder as number);
    const maxOrder = flexOrders.length > 0 ? Math.max(...flexOrders) : 90;
    setItemFormDisplayOrder(String(maxOrder + 10));
    setItemFormSize('');
    setItemFormRollLength('70');
    setItemFormError('');
    setIsItemModalOpen(true);
  };

  const openEditModal = (item: MatrixInventoryItem) => {
    setEditingItem(item);
    setItemFormMaterial(item.materialName);
    setItemFormCategory(item.category);
    const group = item.summaryGroup || getItemSummaryGroup(item);
    setItemFormGroup(group);
    const order =
      item.displayOrder !== undefined
        ? item.displayOrder
        : getMaterialRowDisplayOrder(item.materialName, items, group);
    setItemFormDisplayOrder(String(order));
    setItemFormSize(item.variantSize);
    setItemFormRollLength(item.rollLengthMtr ? item.rollLengthMtr.toString() : '');
    setItemFormError('');
    setIsItemModalOpen(true);
  };

  const handleMaterialNameInputChange = (val: string) => {
    setItemFormMaterial(val);
    if (!editingItem && val.trim()) {
      const match = items.find(
        (i) => i.materialName.trim().toLowerCase() === val.trim().toLowerCase()
      );
      if (match) {
        setItemFormCategory(match.category);
        const g = match.summaryGroup || getItemSummaryGroup(match);
        setItemFormGroup(g);
        if (typeof match.displayOrder === 'number') {
          setItemFormDisplayOrder(String(match.displayOrder));
        }
      }
    }
  };

  const handleCategoryInputChange = (cat: string) => {
    setItemFormCategory(cat);
    const g = normalizeSummaryGroup(undefined, cat);
    setItemFormGroup(g);
  };

  const handleSaveItemModal = (e: React.FormEvent) => {
    e.preventDefault();
    setItemFormError('');

    const trimMaterial = itemFormMaterial.trim();
    const trimSize = normalizeNumericSize(itemFormSize.trim());
    const lenVal = normalizeNumericLength(itemFormRollLength);
    const orderVal = parseInt(itemFormDisplayOrder, 10) || 100;
    const groupVal = itemFormGroup || normalizeSummaryGroup(undefined, itemFormCategory);

    if (!trimMaterial || !trimSize) {
      setItemFormError('Material name and width/size are required.');
      return;
    }

    if (isStarMaterialCategory(itemFormCategory)) {
      if (!isValidStarMaterialSize(trimSize)) {
        setItemFormError(STAR_MATERIAL_SIZE_ERROR);
        return;
      }
    }

    if (!lenVal || lenVal <= 0) {
      setItemFormError('Roll length must be a valid positive number in meters.');
      return;
    }

    const barcode = generateMatrixBarcode(trimMaterial, trimSize, lenVal);

    const duplicate = items.find(
      (i) =>
        i.id !== editingItem?.id &&
        i.materialName.toLowerCase() === trimMaterial.toLowerCase() &&
        normalizeNumericSize(i.variantSize) === trimSize &&
        (i.rollLengthMtr || 0) === lenVal
    );

    if (duplicate) {
      setItemFormError(`Combination "${trimMaterial} - ${trimSize}M (${lenVal}M)" already exists.`);
      return;
    }

    if (editingItem) {
      const oldMaterialName = editingItem.materialName.trim().toLowerCase();
      const updated = items.map((i) => {
        if (i.id === editingItem.id) {
          return {
            ...i,
            materialName: trimMaterial,
            category: itemFormCategory,
            summaryGroup: groupVal,
            dashboardGroup: groupVal,
            displayOrder: orderVal,
            variantSize: trimSize,
            rollLengthMtr: lenVal,
            barcode
          };
        }
        // Synchronize all existing variants of this material when name, category, displayOrder, or group changes
        if (i.materialName.trim().toLowerCase() === oldMaterialName) {
          return {
            ...i,
            materialName: trimMaterial,
            category: itemFormCategory,
            summaryGroup: groupVal,
            dashboardGroup: groupVal,
            displayOrder: orderVal
          };
        }
        return i;
      });
      setItems(updated);
      saveStoredMatrixItems(updated);
      saveMaterialsToSupabase(updated);
      showNotification(`Updated item "${trimMaterial} (${trimSize}M - ${lenVal}M)".`);
    } else {
      const existingSameMat = items.filter(
        (i) => i.materialName.trim().toLowerCase() === trimMaterial.toLowerCase()
      );
      const finalOrder = itemFormDisplayOrder.trim()
        ? orderVal
        : existingSameMat.length > 0 && typeof existingSameMat[0].displayOrder === 'number'
        ? existingSameMat[0].displayOrder
        : getMaterialRowDisplayOrder(trimMaterial, items, groupVal);

      const newItem: MatrixInventoryItem = {
        id: `item-${Date.now()}`,
        materialName: trimMaterial,
        category: itemFormCategory,
        summaryGroup: groupVal,
        dashboardGroup: groupVal,
        displayOrder: finalOrder,
        variantSize: trimSize,
        rollLengthMtr: lenVal,
        unit: groupVal === 'RIGID_PVC' ? 'Sheets' : 'Rolls',
        barcode,
        openingStock: 0,
        minStock: 0,
        active: true,
        createdAt: new Date().toISOString().split('T')[0]
      };
      // Synchronize displayOrder and group across all variants of this material
      const updated = [
        newItem,
        ...items.map((i) => {
          if (i.materialName.trim().toLowerCase() === trimMaterial.toLowerCase()) {
            return {
              ...i,
              category: itemFormCategory,
              summaryGroup: groupVal,
              dashboardGroup: groupVal,
              displayOrder: finalOrder
            };
          }
          return i;
        })
      ];
      setItems(updated);
      saveStoredMatrixItems(updated);
      saveMaterialsToSupabase(updated);
      showNotification(`Added new item "${trimMaterial} (${trimSize}M - ${lenVal}M)".`);
    }

    setIsItemModalOpen(false);
  };

  const handleToggleItemStatus = (id: string, name: string, currentStatus: boolean) => {
    if (currentStatus) {
      if (window.confirm(`Deactivate "${name}"? It will be hidden from daily operations.`)) {
        const hasTxns = transactions.some((t) => t.itemId === id);
        if (hasTxns) {
          const updated = items.map((i) => (i.id === id ? { ...i, active: false } : i));
          setItems(updated);
          saveStoredMatrixItems(updated);
          saveMaterialsToSupabase(updated);
          showNotification(`Item deactivated.`);
        } else {
          const updated = items.filter((i) => i.id !== id);
          setItems(updated);
          saveStoredMatrixItems(updated);
          saveMaterialsToSupabase(updated);
          showNotification(`Item deleted.`);
        }
      }
    } else {
      const updated = items.map((i) => (i.id === id ? { ...i, active: true } : i));
      setItems(updated);
      saveStoredMatrixItems(updated);
      saveMaterialsToSupabase(updated);
      showNotification(`Item reactivated.`);
    }
  };

  const handleWipeAllMaterials = async () => {
    if (window.confirm('Are you sure you want to wipe all materials? The catalog will be completely emptied so the client can create materials from scratch.')) {
      setItems([]);
      saveStoredMatrixItems([]);
      await saveMaterialsToSupabase([]);
      showNotification('All materials wiped. Catalog is now empty.');
    }
  };

  // -------------------------------------------------------------
  // BARCODE LABELS PAGE STATE (BATCH-BASED CODE128 BARCODES ONLY)
  // -------------------------------------------------------------
  const [batchSearch, setBatchSearch] = useState<string>('');

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) =>
      (b.batchNumber || '').toLowerCase().includes(q) ||
      (b.invoiceNumber || '').toLowerCase().includes(q) ||
      (b.materialName || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q)
    );
  }, [batches, batchSearch]);  // -------------------------------------------------------------
  // SEARCH & FILTER STATE FOR MATERIALS & TRANSACTIONS
  // -------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [txnTypeFilter, setTxnTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  // Dedicated filters for Transaction History (Date, Invoice No, Item, Size, Length)
  const [txnDateFilter, setTxnDateFilter] = useState<string>('');
  const [txnInvoiceFilter, setTxnInvoiceFilter] = useState<string>('');
  const [txnItemFilter, setTxnItemFilter] = useState<string>('ALL');
  const [txnSizeFilter, setTxnSizeFilter] = useState<string>('ALL');
  const [txnLengthFilter, setTxnLengthFilter] = useState<string>('ALL');

  const uniqueTxnMaterials = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.materialName) set.add(t.materialName);
    });
    items.forEach((i) => set.add(i.materialName));
    return Array.from(set).sort();
  }, [transactions, items]);

  const uniqueTxnSizes = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.variantSize) set.add(t.variantSize.trim());
    });
    return Array.from(set).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  }, [transactions]);

  const uniqueTxnLengths = useMemo(() => {
    const set = new Set<number>();
    transactions.forEach((t) => {
      if (t.rollLengthMtr) set.add(t.rollLengthMtr);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [transactions]);

  const hasActiveTxnFilters = Boolean(
    txnDateFilter ||
    txnInvoiceFilter ||
    txnItemFilter !== 'ALL' ||
    txnSizeFilter !== 'ALL' ||
    txnLengthFilter !== 'ALL' ||
    txnTypeFilter !== 'ALL'
  );

  const resetTxnFilters = () => {
    setTxnDateFilter('');
    setTxnInvoiceFilter('');
    setTxnItemFilter('ALL');
    setTxnSizeFilter('ALL');
    setTxnLengthFilter('ALL');
    setTxnTypeFilter('ALL');
  };

  const displayedItems = useMemo(() => {
    const filtered = itemsWithStock.filter((i) => {
      if (!showInactive && !i.active && activeTab === 'materials') {
        return false;
      }
      if (!i.active && activeTab === 'dashboard') {
        return false;
      }
      const matchesSearch =
        i.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.variantSize.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.barcode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = categoryFilter === 'ALL' || i.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const groupA = getItemSummaryGroup(a);
      const groupB = getItemSummaryGroup(b);
      const groupPriority: Record<string, number> = { FLEX_ROLL: 1, VINYL_ROLL: 2, RIGID_PVC: 3 };
      const gOrder = (groupPriority[groupA] || 99) - (groupPriority[groupB] || 99);
      if (gOrder !== 0) return gOrder;

      const orderA = a.displayOrder ?? getMaterialRowDisplayOrder(a.materialName, items, groupA);
      const orderB = b.displayOrder ?? getMaterialRowDisplayOrder(b.materialName, items, groupB);
      if (orderA !== orderB) return orderA - orderB;

      const nameDiff = a.materialName.localeCompare(b.materialName);
      if (nameDiff !== 0) return nameDiff;

      return (
        (parseFloat(normalizeNumericSize(a.variantSize)) || 0) -
        (parseFloat(normalizeNumericSize(b.variantSize)) || 0)
      );
    });
  }, [itemsWithStock, items, searchQuery, categoryFilter, showInactive, activeTab]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 1. Transaction Type (ALL / IN / OUT)
      if (txnTypeFilter !== 'ALL' && t.type !== txnTypeFilter) {
        return false;
      }

      // 2. Date Filter
      if (txnDateFilter.trim()) {
        const queryDate = txnDateFilter.trim();
        const txnDate = (t.date || '').trim();
        const matchesDate =
          txnDate.includes(queryDate) ||
          (t.createdAt && t.createdAt.startsWith(queryDate)) ||
          formatDateToDDMMYY(txnDate) === formatDateToDDMMYY(queryDate);
        if (!matchesDate) return false;
      }

      // 3. Invoice No Filter (matches standard invoice, stock OUT invoice, or original stock IN invoice)
      if (txnInvoiceFilter.trim()) {
        const queryInv = txnInvoiceFilter.trim().toLowerCase();
        const txnInv = (t.invoiceNumber || '').toLowerCase();
        const outInv = (t.stockOutInvoiceNumber || '').toLowerCase();
        const origInInv = (t.originalStockInInvoiceNumber || '').toLowerCase();
        if (!txnInv.includes(queryInv) && !outInv.includes(queryInv) && !origInInv.includes(queryInv)) {
          return false;
        }
      }

      // 4. Item / Material Filter
      if (txnItemFilter !== 'ALL') {
        if (t.materialName.toLowerCase() !== txnItemFilter.toLowerCase()) {
          return false;
        }
      }

      // 5. Size / Width Filter
      if (txnSizeFilter !== 'ALL') {
        if (t.variantSize.trim() !== txnSizeFilter.trim()) {
          return false;
        }
      }

      // 6. Length Filter
      if (txnLengthFilter !== 'ALL') {
        const targetLen = parseFloat(txnLengthFilter);
        if (!isNaN(targetLen) && t.rollLengthMtr !== targetLen) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, txnTypeFilter, txnDateFilter, txnInvoiceFilter, txnItemFilter, txnSizeFilter, txnLengthFilter]);

  // -------------------------------------------------------------
  // CLIENT MULTI-TABLE SUMMARY COMPUTATION
  // Table 1: Flex / Backlit Roll Stock (1.02, 1.32, 1.63, 1.93, 2.20, 2.54, 3.20)
  // Table 2: Vinyl / Lamination Roll Stock (0.94, 0.98, 1.02, 1.06, 1.27, 1.37, 1.52)
  // Table 3: PVC / Rigid Sheet Stock (Sizes: 8×4, 6×3, 5×10 | Thickness: 2mm, 3mm, 4mm, 5mm)
  // -------------------------------------------------------------
  const summaryTablesData = useMemo(() => {
    const activeItems = itemsWithStock.filter((i) => i.active);

    // 1. Flex / Backlit Roll Materials (1.02, 1.32, 1.63, 1.93, 2.54, 3.20)
    const flexItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'FLEX_ROLL');
    const flexMaterials = Array.from(new Set(flexItems.map((i) => i.materialName))).sort((a, b) => {
      const orderA = getMaterialRowDisplayOrder(a, items, 'FLEX_ROLL');
      const orderB = getMaterialRowDisplayOrder(b, items, 'FLEX_ROLL');
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });

    const flexWidths = FLEX_SUMMARY_WIDTHS; // ['1.02', '1.32', '1.63', '1.93', '2.54', '3.20']

    const flexRows = flexMaterials.map((matName) => {
      const matItems = flexItems.filter((i) => i.materialName === matName);
      const cells: { [width: string]: MatrixItemWithStock | undefined } = {};
      matItems.forEach((i) => {
        cells[normalizeNumericSize(i.variantSize)] = i;
        cells[i.variantSize.trim()] = i;
      });
      flexWidths.forEach((w) => {
        if (!cells[w]) {
          const targetNum = parseFloat(w);
          const matched = matItems.find((i) => {
            const itemNum = parseFloat(i.variantSize);
            return (!isNaN(targetNum) && !isNaN(itemNum) && Math.abs(itemNum - targetNum) < 0.005) ||
              normalizeNumericSize(i.variantSize) === normalizeNumericSize(w) ||
              i.variantSize.trim() === w.trim();
          });
          if (matched) {
            cells[w] = matched;
          }
        }
      });
      // Calculate row total ONLY from the visible columns
      const rowTotalRolls = flexWidths.reduce((sum, w) => sum + (cells[w]?.currentStock || 0), 0);
      const rowTotalArea = Number(flexWidths.reduce((sum, w) => sum + (cells[w]?.totalAreaMtr2 || 0), 0).toFixed(2));
      return {
        materialName: matName,
        category: matItems[0]?.category || 'Flex PVC',
        displayOrder: getMaterialRowDisplayOrder(matName, items, 'FLEX_ROLL'),
        cells,
        totalRolls: rowTotalRolls,
        totalAreaMtr2: rowTotalArea
      };
    });

    // Flex column totals
    const flexColTotals: { [width: string]: number } = {};
    flexWidths.forEach((w) => {
      flexColTotals[w] = flexRows.reduce((sum, row) => sum + (row.cells[w]?.currentStock || 0), 0);
    });
    const flexGrandTotalRolls = flexRows.reduce((sum, r) => sum + r.totalRolls, 0);
    const flexGrandTotalArea = Number(flexRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    // 2. Star Material Roll Stock (Controlled Sizes: 1.02, 1.30, 1.60, 1.90, 2.54, 3.20)
    const starItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'STAR_MATERIAL');
    const starMaterials = Array.from(new Set(starItems.map((i) => i.materialName))).sort((a, b) => {
      const orderA = getMaterialRowDisplayOrder(a, items, 'STAR_MATERIAL');
      const orderB = getMaterialRowDisplayOrder(b, items, 'STAR_MATERIAL');
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });

    const starWidths = STAR_SUMMARY_WIDTHS; // ['1.02', '1.30', '1.60', '1.90', '2.54', '3.20']

    const starRows = starMaterials.map((matName) => {
      const matItems = starItems.filter((i) => i.materialName === matName);
      const cells: { [width: string]: MatrixItemWithStock | undefined } = {};
      matItems.forEach((i) => {
        cells[normalizeNumericSize(i.variantSize)] = i;
        cells[i.variantSize.trim()] = i;
      });
      starWidths.forEach((w) => {
        if (!cells[w]) {
          const targetNum = parseFloat(w);
          const matched = matItems.find((i) => {
            const itemNum = parseFloat(i.variantSize);
            return (
              (!isNaN(targetNum) && !isNaN(itemNum) && Math.abs(itemNum - targetNum) < 0.005) ||
              normalizeNumericSize(i.variantSize) === normalizeNumericSize(w) ||
              i.variantSize.trim() === w.trim()
            );
          });
          if (matched) {
            cells[w] = matched;
          }
        }
      });
      const rowTotalRolls = starWidths.reduce((sum, w) => sum + (cells[w]?.currentStock || 0), 0);
      const rowTotalArea = Number(starWidths.reduce((sum, w) => sum + (cells[w]?.totalAreaMtr2 || 0), 0).toFixed(2));
      return {
        materialName: matName,
        category: matItems[0]?.category || 'Star Material',
        displayOrder: getMaterialRowDisplayOrder(matName, items, 'STAR_MATERIAL'),
        cells,
        totalRolls: rowTotalRolls,
        totalAreaMtr2: rowTotalArea
      };
    });

    // Star column totals
    const starColTotals: { [width: string]: number } = {};
    starWidths.forEach((w) => {
      starColTotals[w] = starRows.reduce((sum, row) => sum + (row.cells[w]?.currentStock || 0), 0);
    });
    const starGrandTotalRolls = starRows.reduce((sum, r) => sum + r.totalRolls, 0);
    const starGrandTotalArea = Number(starRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    // 3. Vinyl / Lamination Roll Materials
    const vinylItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'VINYL_ROLL');
    const vinylMaterials = Array.from(new Set(vinylItems.map((i) => i.materialName))).sort((a, b) => {
      const orderA = getMaterialRowDisplayOrder(a, items, 'VINYL_ROLL');
      const orderB = getMaterialRowDisplayOrder(b, items, 'VINYL_ROLL');
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });

    const vinylWidths = VINYL_SUMMARY_WIDTHS;

    const vinylRows = vinylMaterials.map((matName) => {
      const matItems = vinylItems.filter((i) => i.materialName === matName);
      const cells: { [width: string]: MatrixItemWithStock | undefined } = {};
      matItems.forEach((i) => {
        cells[normalizeNumericSize(i.variantSize)] = i;
        cells[i.variantSize.trim()] = i;
      });
      vinylWidths.forEach((w) => {
        if (!cells[w]) {
          const targetNum = parseFloat(w);
          const matched = matItems.find((i) => {
            const itemNum = parseFloat(i.variantSize);
            return (!isNaN(targetNum) && !isNaN(itemNum) && Math.abs(itemNum - targetNum) < 0.005) ||
              normalizeNumericSize(i.variantSize) === normalizeNumericSize(w) ||
              i.variantSize.trim() === w.trim();
          });
          if (matched) {
            cells[w] = matched;
          }
        }
      });
      const rowTotalRolls = vinylWidths.reduce((sum, w) => sum + (cells[w]?.currentStock || 0), 0);
      const rowTotalArea = Number(vinylWidths.reduce((sum, w) => sum + (cells[w]?.totalAreaMtr2 || 0), 0).toFixed(2));
      return {
        materialName: matName,
        category: matItems[0]?.category || 'Self Adhesive Vinyl',
        displayOrder: getMaterialRowDisplayOrder(matName, items, 'VINYL_ROLL'),
        cells,
        totalRolls: rowTotalRolls,
        totalAreaMtr2: rowTotalArea
      };
    });

    // Vinyl column totals
    const vinylColTotals: { [width: string]: number } = {};
    vinylWidths.forEach((w) => {
      vinylColTotals[w] = vinylRows.reduce((sum, row) => sum + (row.cells[w]?.currentStock || 0), 0);
    });
    const vinylGrandTotalRolls = vinylRows.reduce((sum, r) => sum + r.totalRolls, 0);
    const vinylGrandTotalArea = Number(vinylRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    // 4. PVC / Rigid Sheet Materials
    const pvcItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'RIGID_PVC');
    const pvcRows = pvcItems.length > 0 ? PVC_SHEET_SIZES.map((sheetSize) => {
      const sizeItems = pvcItems.filter((i) => i.variantSize === sheetSize);
      const cells: { [thickness: string]: MatrixItemWithStock | undefined } = {};
      sizeItems.forEach((i) => {
        if (i.secondaryVariant) {
          cells[i.secondaryVariant] = i;
        }
      });
      const rowTotalSheets = sizeItems.reduce((sum, i) => sum + i.currentStock, 0);
      const rowTotalArea = Number(sizeItems.reduce((sum, i) => sum + i.totalAreaMtr2, 0).toFixed(2));
      return {
        sheetSize,
        materialName: sizeItems[0]?.materialName || 'PVC Foam Sheet',
        cells,
        totalSheets: rowTotalSheets,
        totalAreaMtr2: rowTotalArea
      };
    }) : [];

    // PVC column totals
    const pvcColTotals: { [thickness: string]: number } = {};
    PVC_THICKNESSES.forEach((th) => {
      pvcColTotals[th] = pvcRows.reduce((sum, row) => sum + (row.cells[th]?.currentStock || 0), 0);
    });
    const pvcGrandTotalSheets = pvcRows.reduce((sum, r) => sum + r.totalSheets, 0);
    const pvcGrandTotalArea = Number(pvcRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    return {
      flexRows,
      flexWidths,
      flexColTotals,
      flexGrandTotalRolls,
      flexGrandTotalArea,
      starRows,
      starWidths,
      starColTotals,
      starGrandTotalRolls,
      starGrandTotalArea,
      vinylRows,
      vinylWidths,
      vinylColTotals,
      vinylGrandTotalRolls,
      vinylGrandTotalArea,
      pvcRows,
      pvcColTotals,
      pvcGrandTotalSheets,
      pvcGrandTotalArea,
      hasPvc: pvcItems.length > 0
    };
  }, [itemsWithStock, items]);



  // -------------------------------------------------------------
  // AUTHENTICATION GATE (Phase 1 & Phase 12 Security Rule)
  // When Supabase is configured:
  // Unauthenticated users are strictly barred from all views/routes.
  // Must authenticate with valid staff credentials.
  // -------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3 shadow-lg shadow-amber-500/20" />
        <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold font-mono">
          Verifying warehouse staff credentials...
        </p>
      </div>
    );
  }

  if (isSupabaseConfigured() && !staffSession) {
    return (
      <StaffLoginView
        onLoginSuccess={() => {
          getStaffSession().then((sess) => setStaffSession(sess));
        }}
      />
    );
  }

  if (isSupabaseConfigured() && isInventoryLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="text-white font-bold text-base">Loading inventory...</h3>
            <p className="text-slate-400 text-xs">Fetching live physical rolls from database</p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STANDALONE BATCH VIEW (If URL is /b/:batchNumber)
  // Example: https://rollprint.vercel.app/b/101026GE23542
  // -------------------------------------------------------------
  if (selectedBatchNumber) {
    return (
      <BatchDetailPage
        batchNumber={selectedBatchNumber}
        onNavigateHome={closeBatchPage}
        onNavigateToScanner={() => {
          closeBatchPage();
          setActiveTab('scan');
        }}
        onStockUpdated={() => {
          setItems(getStoredMatrixItems());
          setBatches(getStoredMatrixBatches());
          setTransactions(getStoredMatrixTransactions());
        }}
      />
    );
  }

  // -------------------------------------------------------------
  // STANDALONE MOBILE ITEM VIEW (If URL is /item/:id)
  // -------------------------------------------------------------
  if (selectedMobileItemId) {
    const targetItem = itemsWithStock.find((i) => i.id === selectedMobileItemId);
    if (targetItem) {
      return (
        <MobileItemView
          item={targetItem}
          onStockChange={(itemId, type, qty) => executeStockTransaction(itemId, type, qty)}
          onBackToDashboard={closeMobileItemPage}
        />
      );
    } else {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200 max-w-sm w-full text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900">Item Not Found</h2>
            <p className="text-xs text-slate-500">
              The scanned item code ({selectedMobileItemId}) does not exist or may have been deleted.
            </p>
            <button
              onClick={closeMobileItemPage}
              className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800"
            >
              Go to Full Dashboard
            </button>
          </div>
        </div>
      );
    }
  }

  // -------------------------------------------------------------
  // MAIN VIEW
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 transition-all max-w-md print:hidden">
          <div
            className={`p-3.5 rounded-xl shadow-lg border flex items-center space-x-2 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-900 text-white border-emerald-800'
                : 'bg-red-900 text-white border-red-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
            )}
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-auto pl-2 text-slate-300 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal */}
      <CameraScannerModal
        isOpen={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
        title={cameraScannerTarget === 'stock-in' ? 'Scan Barcode for Stock IN' : 'Scan Barcode for Stock OUT'}
      />

      {/* Stock Details & Complete IN/OUT History Dialog from Matrix Cell Click */}
      {modalItem && (
        <StockDetailsDialog
          item={modalItem}
          itemsWithStock={itemsWithStock}
          transactions={transactions}
          batches={batches}
          onStockTransaction={({ itemId, type, quantity, dateStr, extraMeta }) => {
            const res = executeStockTransaction(itemId, type, quantity, dateStr, undefined, extraMeta);
            if (res.success) {
              const refreshed = itemsWithStock.find((i) => i.id === itemId);
              if (refreshed) {
                setModalItem({
                  ...refreshed,
                  currentStock:
                    type === 'IN' ? refreshed.currentStock + quantity : Math.max(0, refreshed.currentStock - quantity)
                });
              }
            }
            return res;
          }}
          onClose={() => setModalItem(null)}
          normalizeNumericSize={normalizeNumericSize}
          onOpenScanner={() => setActiveTab('stock-out')}
        />
      )}


      {/* Main App Header */}
      <header className="bg-[#0A0A0C] text-white border-b border-zinc-800/80 sticky top-0 z-40 print:hidden backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between min-h-[5.25rem] py-2 md:py-1 gap-3">
            {/* Logo & Mobile Quick Scan Action */}
            <div className="flex items-center justify-between w-full md:w-auto">
              <AppLogo />
              <button
                onClick={() => setActiveTab('scan')}
                className="md:hidden px-3.5 py-1.5 bg-[#C59B3F] hover:bg-[#D4A84B] text-slate-950 font-black rounded-full text-xs flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan Barcode</span>
              </button>
            </div>

            {/* Navigation Tabs - Pill design inspired by Airbnb with Decora Sales Gold Palette */}
            <nav className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto py-1 scrollbar-none bg-[#141416]/90 p-1.5 rounded-full border border-zinc-800">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-[#27272A] text-[#D4A84B] border border-[#C59B3F]/50 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard / Summary</span>
              </button>

              {/* Dedicated Scan Barcode Navigation Button */}
              <button
                onClick={() => setActiveTab('scan')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'scan'
                    ? 'bg-[#C59B3F] text-slate-950 shadow-md ring-2 ring-[#C59B3F]/40'
                    : 'bg-[#1C1917] text-[#D4A84B] border border-[#C59B3F]/50 hover:bg-[#C59B3F]/20 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan Barcode</span>
              </button>

              <button
                onClick={() => setActiveTab('materials')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'materials'
                    ? 'bg-[#27272A] text-[#D4A84B] border border-[#C59B3F]/50 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Materials</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('stock-in');
                  setTimeout(() => stockInRollsInputRef.current?.focus(), 100);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'stock-in'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-emerald-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>Stock IN</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('stock-out');
                  setTimeout(() => stockOutRollsInputRef.current?.focus(), 100);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'stock-out'
                    ? 'bg-[#C59B3F] text-zinc-950 font-bold shadow-xs'
                    : 'text-[#D4A84B] hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                <span>Stock OUT</span>
              </button>

              <button
                onClick={() => setActiveTab('transactions')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'transactions'
                    ? 'bg-[#27272A] text-[#D4A84B] border border-[#C59B3F]/50 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Transactions</span>
              </button>

              <button
                onClick={() => setActiveTab('qr-labels')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'qr-labels'
                    ? 'bg-[#27272A] text-[#D4A84B] border border-[#C59B3F]/50 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <BarcodeIcon className="w-3.5 h-3.5" />
                <span>Roll Barcode Labels</span>
              </button>

              <button
                onClick={() => setActiveTab('backup')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'backup'
                    ? 'bg-[#27272A] text-[#D4A84B] border border-[#C59B3F]/50 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Backup &amp; Restore</span>
              </button>
            </nav>

            {/* Staff User & Logout Action */}
            {staffSession && (
              <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                <span className="text-xs text-zinc-400 font-mono hidden xl:inline max-w-[150px] truncate">
                  {staffSession.user?.email}
                </span>

                <button
                  id="staff-logout-btn"
                  onClick={async () => {
                    await signOutStaff();
                    setStaffSession(null);
                    showNotification('Staff logged out successfully.', 'success');
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all text-zinc-300 hover:text-rose-300 hover:bg-rose-950/40 border border-zinc-700 hover:border-rose-500/40 cursor-pointer shadow-sm"
                  title="Logout from RollPrint"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 print:hidden">
        {/* ========================================================= */}
        {/* TAB: SCAN BARCODE (LIVE CODE128 CAMERA SCANNER & STOCK OUT) */}
        {/* ========================================================= */}
        {activeTab === 'scan' && (
          <div className="space-y-6">
            <BarcodeScannerView
              batches={batches}
              itemsWithStock={itemsWithStock}
              onExecuteStockOut={handleScannerStockOut}
              onRollStockOut={handleRollStockOut}
              onDispatchComplete={handleDispatchComplete}
            />
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD / SUMMARY (Client Handwritten Matrix) */}
        {/* ========================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Summary Cards: Rolls & Area */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Active Items
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
                    {dashboardMetrics.totalItems}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">Variants</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs bg-gradient-to-br from-white to-amber-50/40">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
                  Current Stock in Hand
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-[#0A192F] font-mono">
                      {dashboardMetrics.currentStock}
                    </span>
                    <span className="ml-1 text-xs font-bold text-amber-700">Rolls</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-700">
                    {dashboardMetrics.totalAreaMtr2.toLocaleString()} m²
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center space-x-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Total Stock IN</span>
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                      +{dashboardMetrics.totalStockIn}
                    </span>
                    <span className="ml-1 text-xs font-semibold text-emerald-600">Rolls</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600">
                    +{dashboardMetrics.totalInAreaMtr2.toLocaleString()} m²
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block flex items-center space-x-1">
                  <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                  <span>Total Stock OUT</span>
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-amber-700 font-mono">
                      -{dashboardMetrics.totalStockOut}
                    </span>
                    <span className="ml-1 text-xs font-semibold text-amber-600">Rolls</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-600">
                    -{dashboardMetrics.totalOutAreaMtr2.toLocaleString()} m²
                  </span>
                </div>
              </div>
            </div>

            {/* Multi-Table Summary Container */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                      CURRENT STOCK SUMMARY
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Click any cell to update stock
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Categorized into distinct summary tables matching the client's original Excel sheets. Cells show live in-hand roll/sheet count.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      onClick={() => setDashboardViewMode('matrix')}
                      className={`px-3 py-1 rounded-md text-xs font-bold flex items-center space-x-1 transition-colors ${
                        dashboardViewMode === 'matrix'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                      <span>Summary Matrices</span>
                    </button>
                    <button
                      onClick={() => setDashboardViewMode('table')}
                      className={`px-3 py-1 rounded-md text-xs font-bold flex items-center space-x-1 transition-colors ${
                        dashboardViewMode === 'table'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>Table List</span>
                    </button>
                  </div>

                  {/* Export Summary Table to Excel / Google Sheets */}
                  <div className="relative inline-block text-left">
                    <button
                      type="button"
                      onClick={() => setExportMenuOpen(!exportMenuOpen)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                      title="Export Summary Table to Excel or Google Sheets"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export Summary</span>
                    </button>

                    {exportMenuOpen && (
                      <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 text-xs animate-in fade-in duration-100">
                        <button
                          type="button"
                          onClick={() => {
                            downloadSummaryCsvFile(summaryTablesData);
                            setExportMenuOpen(false);
                            showNotification('Downloaded RollPrint_Summary_Stock.csv for Excel / Google Sheets!', 'success');
                          }}
                          className="w-full px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="block font-bold text-slate-900">Download Excel / CSV (.csv)</span>
                            <span className="text-[10px] text-slate-500">Opens in Excel & Google Sheets</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            copySummaryTsvForGoogleSheets(summaryTablesData)
                              .then(() => {
                                setExportMenuOpen(false);
                                showNotification('Summary table copied! Press Ctrl+V (or Cmd+V) to paste into Google Sheets.', 'success');
                              })
                              .catch(() => {
                                showNotification('Failed to copy to clipboard.', 'error');
                              });
                          }}
                          className="w-full px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100 cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-indigo-600 shrink-0" />
                          <div>
                            <span className="block font-bold text-slate-900">Copy for Google Sheets</span>
                            <span className="text-[10px] text-slate-500">Paste directly with rows & columns</span>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setActiveTab('stock-in')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    <span>+ Stock IN</span>
                  </button>
                </div>
              </div>

              {/* VIEW 1: SEPARATE CLIENT SUMMARY MATRICES */}
              {dashboardViewMode === 'matrix' && (
                <div className="space-y-8">
                  {/* TABLE 1: FLEX / BACKLIT / SIMILAR ROLL MATERIALS */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          1. Flex / Backlit Roll Stock
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Width Columns: {summaryTablesData.flexWidths.join(' • ')} M
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 text-white font-bold text-center">
                              <th className="py-2.5 px-4 text-left font-black tracking-wide text-xs w-52 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                                Material
                              </th>
                              {summaryTablesData.flexWidths.map((width) => (
                                <th
                                  key={width}
                                  className="py-2.5 px-3 min-w-[65px] border-r border-slate-800 font-mono text-indigo-200"
                                >
                                  {width}
                                </th>
                              ))}
                              <th className="py-2.5 px-4 bg-slate-950 font-black text-white min-w-[85px] border-r border-slate-800">
                                Total
                              </th>
                              <th className="py-2.5 px-4 bg-indigo-950 font-black text-indigo-200 min-w-[95px]">
                                Total (m²)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {summaryTablesData.flexRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={summaryTablesData.flexWidths.length + 3}
                                  className="py-10 text-center text-slate-500 font-medium bg-slate-50/50"
                                >
                                  <div className="flex flex-col items-center justify-center space-y-2">
                                    <p className="text-xs font-semibold text-slate-600">No Flex / Backlit materials added yet.</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('materials');
                                        openAddModal();
                                      }}
                                      className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                    >
                                      + Add Material
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              summaryTablesData.flexRows.map((row) => (
                                <tr key={row.materialName} className="hover:bg-indigo-50/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                                  <div className="leading-tight">
                                    <span className="text-xs font-bold text-slate-900">{row.materialName}</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      {row.category}
                                    </span>
                                  </div>
                                </td>

                                {summaryTablesData.flexWidths.map((width) => {
                                  const existingItem = row.cells[width];
                                  const item = existingItem || {
                                    id: `flex-${row.materialName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${width}`,
                                    materialName: row.materialName,
                                    category: row.category,
                                    variantSize: width,
                                    rollLengthMtr: 50,
                                    unit: 'Rolls',
                                    barcode: `${row.materialName}-${width}`,
                                    openingStock: 0,
                                    minStock: 2,
                                    active: true,
                                    createdAt: '2026-09-01',
                                    totalIn: 0,
                                    totalOut: 0,
                                    currentStock: 0,
                                    areaPerRoll: Number((parseFloat(width) * 50).toFixed(2)),
                                    totalAreaMtr2: 0,
                                    status: 'OUT_OF_STOCK' as const
                                  };
                                  if (!existingItem) {
                                    return (
                                      <td
                                        key={width}
                                        onClick={() => setModalItem(item)}
                                        className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 select-none cursor-pointer hover:bg-slate-100"
                                        title={`Click to view stock details for ${row.materialName} (${width}M) - Current: 0 Rolls`}
                                      >
                                        -
                                      </td>
                                    );
                                  }

                                  const qty = item.currentStock;
                                  const isOutOfStock = qty <= 0;
                                  const isLowStock = qty > 0 && qty <= item.minStock;

                                  return (
                                    <td
                                      key={width}
                                      onClick={() => setModalItem(item)}
                                      className={`py-2.5 px-3 text-center border-r border-slate-100 font-mono font-bold cursor-pointer transition-all hover:scale-105 select-none ${
                                        isOutOfStock
                                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                          : isLowStock
                                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                          : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                                      }`}
                                      title={`Click to update ${item.materialName} (${item.variantSize}M) - Current: ${qty} Rolls`}
                                    >
                                      <span className="text-xs">{qty}</span>
                                    </td>
                                  );
                                })}

                                <td className="py-2.5 px-4 text-center font-mono font-black text-slate-900 bg-slate-50 border-r border-slate-200">
                                  {row.totalRolls}
                                </td>
                                <td className="py-2.5 px-4 text-center font-mono font-black text-indigo-700 bg-indigo-50/40">
                                  {row.totalAreaMtr2.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                            <tr>
                              <td className="py-2.5 px-4 font-black text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-300 z-10 uppercase tracking-wider text-[11px]">
                                Total Rolls
                              </td>
                              {summaryTablesData.flexWidths.map((width) => (
                                <td
                                  key={width}
                                  className="py-2.5 px-3 text-center font-mono font-black text-indigo-950 border-r border-slate-300 bg-indigo-50/50"
                                >
                                  {summaryTablesData.flexColTotals[width] ?? 0}
                                </td>
                              ))}
                              <td className="py-2.5 px-4 text-center font-mono font-black text-white bg-slate-950 border-r border-slate-800">
                                {summaryTablesData.flexGrandTotalRolls}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-black text-indigo-900 bg-indigo-100">
                                {summaryTablesData.flexGrandTotalArea.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* ------------------------------------------------------------- */}
                  {/* TABLE 2: STAR MATERIAL ROLL STOCK                             */}
                  {/* ------------------------------------------------------------- */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          2. Star Material Roll Stock
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Controlled Sizes: {summaryTablesData.starWidths.join(' • ')} M
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 text-white font-bold text-center">
                              <th className="py-2.5 px-4 text-left font-black tracking-wide text-xs w-52 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                                Material
                              </th>
                              {summaryTablesData.starWidths.map((width) => (
                                <th
                                  key={width}
                                  className="py-2.5 px-3 min-w-[65px] border-r border-slate-800 font-mono text-amber-200"
                                >
                                  {width}
                                </th>
                              ))}
                              <th className="py-2.5 px-4 bg-slate-950 font-black text-white min-w-[85px] border-r border-slate-800">
                                Total
                              </th>
                              <th className="py-2.5 px-4 bg-amber-950 font-black text-amber-200 min-w-[95px]">
                                Total (m²)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {summaryTablesData.starRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={summaryTablesData.starWidths.length + 3}
                                  className="py-10 text-center text-slate-500 font-medium bg-slate-50/50"
                                >
                                  <div className="flex flex-col items-center justify-center space-y-2">
                                    <p className="text-xs font-semibold text-slate-600">No Star Material rolls added yet.</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('materials');
                                        openAddModal();
                                      }}
                                      className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                    >
                                      + Add Material
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              summaryTablesData.starRows.map((row) => (
                                <tr key={row.materialName} className="hover:bg-amber-50/40 transition-colors">
                                  <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                                    <div className="leading-tight">
                                      <span className="text-xs font-bold text-slate-900">{row.materialName}</span>
                                      <span className="block text-[10px] text-slate-400 font-normal">
                                        {row.category}
                                      </span>
                                    </div>
                                  </td>

                                  {summaryTablesData.starWidths.map((width) => {
                                    const existingItem = row.cells[width];
                                    const item = existingItem || {
                                      id: `star-${row.materialName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${width}`,
                                      materialName: row.materialName,
                                      category: row.category,
                                      variantSize: width,
                                      rollLengthMtr: 50,
                                      unit: 'Rolls',
                                      barcode: `${row.materialName}-${width}`,
                                      openingStock: 0,
                                      minStock: 2,
                                      active: true,
                                      createdAt: '2026-09-01',
                                      totalIn: 0,
                                      totalOut: 0,
                                      currentStock: 0,
                                      areaPerRoll: Number((parseFloat(width) * 50).toFixed(2)),
                                      totalAreaMtr2: 0,
                                      status: 'OUT_OF_STOCK' as const
                                    };
                                    if (!existingItem) {
                                      return (
                                        <td
                                          key={width}
                                          onClick={() => setModalItem(item)}
                                          className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 select-none cursor-pointer hover:bg-slate-100"
                                          title={`Click to view stock details for ${row.materialName} (${width}M) - Current: 0 Rolls`}
                                        >
                                          -
                                        </td>
                                      );
                                    }

                                    const qty = item.currentStock;
                                    const isOutOfStock = qty <= 0;
                                    const isLowStock = qty > 0 && qty <= item.minStock;

                                    return (
                                      <td
                                        key={width}
                                        onClick={() => setModalItem(item)}
                                        className={`py-2.5 px-3 text-center border-r border-slate-100 font-mono font-bold cursor-pointer transition-all hover:scale-105 select-none ${
                                          isOutOfStock
                                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                            : isLowStock
                                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                            : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                                        }`}
                                        title={`Click to update ${item.materialName} (${item.variantSize}M) - Current: ${qty} Rolls`}
                                      >
                                        <span className="text-xs">{qty}</span>
                                      </td>
                                    );
                                  })}

                                  <td className="py-2.5 px-4 text-center font-mono font-black text-slate-900 bg-slate-50 border-r border-slate-200">
                                    {row.totalRolls}
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-mono font-black text-amber-700 bg-amber-50/40">
                                    {row.totalAreaMtr2.toLocaleString()}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                            <tr>
                              <td className="py-2.5 px-4 font-black text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-300 z-10 uppercase tracking-wider text-[11px]">
                                Total Rolls
                              </td>
                              {summaryTablesData.starWidths.map((width) => (
                                <td
                                  key={width}
                                  className="py-2.5 px-3 text-center font-mono font-black text-slate-900 border-r border-slate-200"
                                >
                                  {summaryTablesData.starColTotals[width] || 0}
                                </td>
                              ))}
                              <td className="py-2.5 px-4 text-center font-mono font-black text-slate-950 bg-slate-200 border-r border-slate-300">
                                {summaryTablesData.starGrandTotalRolls}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-black text-amber-900 bg-amber-100">
                                {summaryTablesData.starGrandTotalArea.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* TABLE 3: VINYL / LAMINATION MATERIALS */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          3. Vinyl / Lamination Roll Stock
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Width Columns: {summaryTablesData.vinylWidths.join(' • ')} M
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 text-white font-bold text-center">
                              <th className="py-2.5 px-4 text-left font-black tracking-wide text-xs w-52 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                                Material
                              </th>
                              {summaryTablesData.vinylWidths.map((width) => (
                                <th
                                  key={width}
                                  className="py-2.5 px-3 min-w-[65px] border-r border-slate-800 font-mono text-emerald-200"
                                >
                                  {width}
                                </th>
                              ))}
                              <th className="py-2.5 px-4 bg-slate-950 font-black text-white min-w-[85px] border-r border-slate-800">
                                Total
                              </th>
                              <th className="py-2.5 px-4 bg-emerald-950 font-black text-emerald-200 min-w-[95px]">
                                Total (m²)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {summaryTablesData.vinylRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={summaryTablesData.vinylWidths.length + 3}
                                  className="py-10 text-center text-slate-500 font-medium bg-slate-50/50"
                                >
                                  <div className="flex flex-col items-center justify-center space-y-2">
                                    <p className="text-xs font-semibold text-slate-600">No Vinyl / Lamination materials added yet.</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('materials');
                                        openAddModal();
                                      }}
                                      className="inline-flex items-center text-xs font-bold text-emerald-600 hover:text-emerald-800 underline cursor-pointer"
                                    >
                                      + Add Material
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              summaryTablesData.vinylRows.map((row) => (
                                <tr key={row.materialName} className="hover:bg-emerald-50/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                                  <div className="leading-tight">
                                    <span className="text-xs font-bold text-slate-900">{row.materialName}</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      {row.category}
                                    </span>
                                  </div>
                                </td>

                                {summaryTablesData.vinylWidths.map((width) => {
                                  const existingItem = row.cells[width];
                                  const item = existingItem || {
                                    id: `vinyl-${row.materialName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${width}`,
                                    materialName: row.materialName,
                                    category: row.category,
                                    variantSize: width,
                                    rollLengthMtr: 50,
                                    unit: 'Rolls',
                                    barcode: `${row.materialName}-${width}`,
                                    openingStock: 0,
                                    minStock: 2,
                                    active: true,
                                    createdAt: '2026-09-01',
                                    totalIn: 0,
                                    totalOut: 0,
                                    currentStock: 0,
                                    areaPerRoll: Number((parseFloat(width) * 50).toFixed(2)),
                                    totalAreaMtr2: 0,
                                    status: 'OUT_OF_STOCK' as const
                                  };
                                  if (!existingItem) {
                                    return (
                                      <td
                                        key={width}
                                        onClick={() => setModalItem(item)}
                                        className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 select-none cursor-pointer hover:bg-slate-100"
                                        title={`Click to view stock details for ${row.materialName} (${width}M) - Current: 0 Rolls`}
                                      >
                                        -
                                      </td>
                                    );
                                  }

                                  const qty = item.currentStock;
                                  // Clean formatting for Premium One Way with 0 stock
                                  if (row.materialName === 'Premium One Way' && qty === 0) {
                                    return (
                                      <td
                                        key={width}
                                        onClick={() => setModalItem(item)}
                                        className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 cursor-pointer hover:bg-slate-100 select-none"
                                        title={`Click to update ${item.materialName} (${item.variantSize}M) - Current: 0 Rolls`}
                                      >
                                        -
                                      </td>
                                    );
                                  }

                                  const isOutOfStock = qty <= 0;
                                  const isLowStock = qty > 0 && qty <= item.minStock;

                                  return (
                                    <td
                                      key={width}
                                      onClick={() => setModalItem(item)}
                                      className={`py-2.5 px-3 text-center border-r border-slate-100 font-mono font-bold cursor-pointer transition-all hover:scale-105 select-none ${
                                        isOutOfStock
                                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                          : isLowStock
                                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                          : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                                      }`}
                                      title={`Click to update ${item.materialName} (${item.variantSize}M) - Current: ${qty} Rolls`}
                                    >
                                      <span className="text-xs">{qty}</span>
                                    </td>
                                  );
                                })}

                                <td className="py-2.5 px-4 text-center font-mono font-black text-slate-900 bg-slate-50 border-r border-slate-200">
                                  {row.totalRolls}
                                </td>
                                <td className="py-2.5 px-4 text-center font-mono font-black text-emerald-700 bg-emerald-50/40">
                                  {row.totalAreaMtr2.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                            <tr>
                              <td className="py-2.5 px-4 font-black text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-300 z-10 uppercase tracking-wider text-[11px]">
                                Total Rolls
                              </td>
                              {summaryTablesData.vinylWidths.map((width) => (
                                <td
                                  key={width}
                                  className="py-2.5 px-3 text-center font-mono font-black text-emerald-950 border-r border-slate-300 bg-emerald-50/50"
                                >
                                  {summaryTablesData.vinylColTotals[width] ?? 0}
                                </td>
                              ))}
                              <td className="py-2.5 px-4 text-center font-mono font-black text-white bg-slate-950 border-r border-slate-800">
                                {summaryTablesData.vinylGrandTotalRolls}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-black text-emerald-900 bg-emerald-100">
                                {summaryTablesData.vinylGrandTotalArea.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* TABLE 3: PVC / RIGID SHEET STOCK */}
                  {summaryTablesData.hasPvc && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                            3. PVC / Rigid Sheet Stock
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Sheet Sizes: 8×4 &bull; 6×3 &bull; 5×10 | Thicknesses: 2mm &bull; 3mm &bull; 4mm &bull; 5mm
                        </span>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-900 text-white font-bold text-center">
                                <th className="py-2.5 px-4 text-left font-black tracking-wide text-xs w-52 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                                  Sheet Size
                                </th>
                                {PVC_THICKNESSES.map((thick) => (
                                  <th
                                    key={thick}
                                    className="py-2.5 px-4 min-w-[75px] border-r border-slate-800 font-mono text-amber-200"
                                  >
                                    {thick}
                                  </th>
                                ))}
                                <th className="py-2.5 px-4 bg-slate-950 font-black text-white min-w-[85px] border-r border-slate-800">
                                  Total Sheets
                                </th>
                                <th className="py-2.5 px-4 bg-amber-950 font-black text-amber-200 min-w-[95px]">
                                  Total (m²)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {summaryTablesData.pvcRows.map((row) => (
                                <tr key={row.sheetSize} className="hover:bg-amber-50/40 transition-colors">
                                  <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                                    <div className="leading-tight">
                                      <span className="text-xs font-bold text-slate-900">{row.sheetSize}</span>
                                      <span className="block text-[10px] text-slate-400 font-normal">
                                        {row.materialName}
                                      </span>
                                    </div>
                                  </td>

                                  {PVC_THICKNESSES.map((thick) => {
                                    const item = row.cells[thick];
                                    if (!item) {
                                      return (
                                        <td
                                          key={thick}
                                          className="py-2.5 px-4 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 select-none"
                                        >
                                          -
                                        </td>
                                      );
                                    }

                                    const qty = item.currentStock;
                                    const isOutOfStock = qty <= 0;
                                    const isLowStock = qty > 0 && qty <= item.minStock;

                                    return (
                                      <td
                                        key={thick}
                                        onClick={() => setModalItem(item)}
                                        className={`py-2.5 px-4 text-center border-r border-slate-100 font-mono font-bold cursor-pointer transition-all hover:scale-105 select-none ${
                                          isOutOfStock
                                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                            : isLowStock
                                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                            : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                                        }`}
                                        title={`Click to update ${item.materialName} (${item.variantSize} - ${thick}) - Current: ${qty} Sheets`}
                                      >
                                        <span className="text-xs">{qty}</span>
                                      </td>
                                    );
                                  })}

                                  <td className="py-2.5 px-4 text-center font-mono font-black text-slate-900 bg-slate-50 border-r border-slate-200">
                                    {row.totalSheets}
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-mono font-black text-amber-700 bg-amber-50/40">
                                    {row.totalAreaMtr2.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                              <tr>
                                <td className="py-2.5 px-4 font-black text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-300 z-10 uppercase tracking-wider text-[11px]">
                                  Total Sheets
                                </td>
                                {PVC_THICKNESSES.map((thick) => (
                                  <td
                                    key={thick}
                                    className="py-2.5 px-4 text-center font-mono font-black text-amber-950 border-r border-slate-300 bg-amber-50/50"
                                  >
                                    {summaryTablesData.pvcColTotals[thick] ?? 0}
                                  </td>
                                ))}
                                <td className="py-2.5 px-4 text-center font-mono font-black text-white bg-slate-950 border-r border-slate-800">
                                  {summaryTablesData.pvcGrandTotalSheets}
                                </td>
                                <td className="py-2.5 px-4 text-center font-mono font-black text-amber-900 bg-amber-100">
                                  {summaryTablesData.pvcGrandTotalArea.toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: TABLE LIST VIEW */}
              {dashboardViewMode === 'table' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                          <th className="py-3 px-4">Material Name</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Width (M)</th>
                          <th className="py-3 px-4">Roll Length (M)</th>
                          <th className="py-3 px-4 text-right">Area / Roll</th>
                          <th className="py-3 px-4 text-right">Current Stock</th>
                          <th className="py-3 px-4 text-right">Total Area (m²)</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedItems.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-12 text-center text-slate-500">
                              <p className="text-sm font-semibold text-slate-700 mb-2">No materials added yet.</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('materials');
                                  openAddModal();
                                }}
                                className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                              >
                                + Add Material
                              </button>
                            </td>
                          </tr>
                        ) : (
                          displayedItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-900">{item.materialName}</td>
                              <td className="py-3 px-4 text-slate-600">{item.category}</td>
                              <td className="py-3 px-4 font-mono font-medium text-slate-800">{item.variantSize} M</td>
                              <td className="py-3 px-4 font-mono font-medium text-slate-800">{item.rollLengthMtr} M</td>
                              <td className="py-3 px-4 text-right font-mono text-slate-600">{item.areaPerRoll} m²</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                {item.currentStock} Rolls
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-indigo-700">
                                {item.totalAreaMtr2.toLocaleString()} m²
                              </td>
                              <td className="py-3 px-4 text-center">
                                {item.status === 'IN_STOCK' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    In Stock
                                  </span>
                                )}
                                {item.status === 'LOW_STOCK' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Low Stock
                                  </span>
                                )}
                                {item.status === 'OUT_OF_STOCK' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                    Out of Stock
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => setModalItem(item)}
                                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-md text-[11px] border border-indigo-200"
                                >
                                  Update Stock
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MATERIALS MASTER */}
        {/* ========================================================= */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Materials Master</h2>
                <p className="text-xs text-slate-500">
                  Manage inventory materials, dimensions (Width × Length), and barcodes.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowInactive(!showInactive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 border transition-colors ${
                    showInactive
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {showInactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showInactive ? 'Hide Inactive' : 'Show Inactive'}</span>
                </button>

                <button
                  onClick={openAddModal}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Material Item</span>
                </button>

                {items.length > 0 && (
                  <button
                    onClick={handleWipeAllMaterials}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors"
                    title="Wipe all materials from catalog"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Wipe All</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by Material Name, Category, Size, or Barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Materials Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Material Name</th>
                      <th className="py-3 px-3">Group</th>
                      <th className="py-3 px-2 text-center">Order</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Width (M)</th>
                      <th className="py-3 px-4">Roll Length (M)</th>
                      <th className="py-3 px-4">Area / Roll</th>
                      <th className="py-3 px-4">Material Code / SKU</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedItems.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <Layers className="w-6 h-6" />
                            </div>
                            <p className="text-base font-bold text-slate-700">No materials added yet.</p>
                            <p className="text-xs text-slate-500 max-w-sm">
                              Get started by adding your first material specification. All dimensions and roll lengths will be tracked live.
                            </p>
                            <button
                              type="button"
                              onClick={openAddModal}
                              className="mt-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition cursor-pointer"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add Material
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          !item.active ? 'bg-slate-50/60 opacity-65' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {item.materialName}
                          {!item.active && (
                            <span className="ml-2 text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                              (item.dashboardGroup || getItemSummaryGroup(item)) === 'FLEX_ROLL'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : (item.dashboardGroup || getItemSummaryGroup(item)) === 'VINYL_ROLL'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {(item.dashboardGroup || getItemSummaryGroup(item)) === 'FLEX_ROLL'
                              ? 'Flex/Backlit'
                              : (item.dashboardGroup || getItemSummaryGroup(item)) === 'VINYL_ROLL'
                              ? 'Vinyl/Lam'
                              : 'PVC/Rigid'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-indigo-600">
                          {item.displayOrder ??
                            getMaterialRowDisplayOrder(
                              item.materialName,
                              items,
                              item.dashboardGroup || getItemSummaryGroup(item)
                            )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{item.category}</td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">{item.variantSize} M</td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">{item.rollLengthMtr} M</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{item.areaPerRoll} m²</td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">{item.barcode}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {item.currentStock} Rolls
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.active ? (
                            <span className="text-emerald-700 font-medium">Active</span>
                          ) : (
                            <span className="text-slate-400 font-medium">Deactivated</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center space-x-1.5">
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1 text-slate-500 hover:text-indigo-600 rounded hover:bg-slate-100"
                              title="Edit Item"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleToggleItemStatus(
                                  item.id,
                                  `${item.materialName} (${item.variantSize}M - ${item.rollLengthMtr}M)`,
                                  item.active
                                )
                              }
                              className={`p-1 rounded hover:bg-slate-100 ${
                                item.active ? 'text-slate-400 hover:text-red-600' : 'text-slate-400 hover:text-emerald-600'
                              }`}
                              title={item.active ? 'Deactivate' : 'Reactivate'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: STOCK IN (Exact Blueprint Order) */}
        {/* 1. Material Name */}
        {/* 2. Category (auto-populated) */}
        {/* 3. Size / Width */}
        {/* 4. Roll Length / Meter */}
        {/* 5. Roll Quantity */}
        {/* 6. Date */}
        {/* 7. Calculation / Stock Preview */}
        {/* 8. Barcode Scan / Verification */}
        {/* 9. Save */}
        {/* ========================================================= */}
        {/* ========================================================= */}
        {/* TAB 3: STOCK IN (One Batch = Multiple Items Blueprint)     */}
        {/* ========================================================= */}
        {activeTab === 'stock-in' && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                  <ArrowDownToLine className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Stock IN</h2>
                  <p className="text-xs text-slate-500">
                    One Invoice / Batch can receive multiple item lines under the same Batch Barcode.
                  </p>
                </div>
              </div>

              {stockInError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{stockInError}</span>
                </div>
              )}

              {/* TOP FIELDS: Invoice Number, Date, Auto-Generated Batch Number */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Batch &amp; Invoice Information
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* Invoice Number */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Invoice Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockInInvoiceInputRef}
                      type="text"
                      required
                      placeholder="e.g. GT28728"
                      value={stockInInvoiceNumber}
                      onChange={(e) => {
                        setStockInInvoiceNumber(e.target.value);
                        setStockInError('');
                      }}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold uppercase placeholder:normal-case focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={stockInDate}
                      onChange={(e) => {
                        setStockInDate(e.target.value);
                        setStockInError('');
                      }}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Auto Generated Batch Number */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Auto-Generated Batch Number
                    </label>
                    <span className="text-[10px] text-emerald-700 font-mono font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      DDMMYY + INVOICE
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={stockInGeneratedBatchNumber || '—'}
                      placeholder="e.g. 101026GT28728"
                      className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-black cursor-not-allowed tracking-wider"
                    />
                    {stockInGeneratedBatchNumber && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {stockInGeneratedBatchNumber.length}/15 chars
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION: ADD ITEM */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                    {editingDraftItemId ? 'Edit Item Line' : 'Add Item'}
                  </span>
                  {editingDraftItemId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDraftItemId(null);
                        setStockInVariantSize('');
                        setStockInRolls('');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="space-y-4 text-xs">
                  {/* Material & Category */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Material <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={stockInMaterial}
                        onChange={(e) => {
                          setStockInMaterial(e.target.value);
                          setStockInVariantSize('');
                          setStockInError('');
                        }}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      >
                        <option value="">
                          {uniqueMaterialNames.length === 0 ? '-- No materials created yet --' : '-- Select Material --'}
                        </option>
                        {uniqueMaterialNames.map((mat) => (
                          <option key={mat} value={mat}>
                            {mat}
                          </option>
                        ))}
                      </select>
                      {uniqueMaterialNames.length === 0 && (
                        <p className="mt-1.5 text-[11px] text-amber-700 font-medium flex items-center gap-1">
                          <span>⚠️ No materials found. Please</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('materials');
                              openAddModal();
                            }}
                            className="text-indigo-600 font-bold underline hover:text-indigo-800 cursor-pointer"
                          >
                            create a material in Material Master
                          </button>
                          <span>first.</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Category
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={stockInAutoCategory || '—'}
                        placeholder="Auto-populated"
                        className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-600 text-sm font-medium cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Size / Width & Roll Length */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-700 font-bold">
                          Size / Width <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">Metres</span>
                      </div>
                      {isStarMaterialCategory(stockInAutoCategory) ? (
                        <select
                          value={stockInVariantSize}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStockInVariantSize(val);
                            const norm = normalizeNumericSize(val);
                            const foundItem = items.find(
                              (i) => i.active && i.materialName === stockInMaterial && normalizeNumericSize(i.variantSize) === norm
                            );
                            if (foundItem && foundItem.rollLengthMtr) {
                              setStockInRollLength(foundItem.rollLengthMtr.toString());
                            }
                            setStockInError('');
                          }}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        >
                          <option value="">-- Select Star Material Width --</option>
                          {STAR_MATERIAL_ALLOWED_SIZES.map((sz) => (
                            <option key={sz} value={sz}>{sz} M</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <div className="relative">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              list="stock-in-size-suggestions"
                              placeholder="e.g. 1.32 or 1.93"
                              value={stockInVariantSize}
                              onChange={(e) => {
                                const val = e.target.value;
                                setStockInVariantSize(val);
                                const norm = normalizeNumericSize(val);
                                const foundItem = items.find(
                                  (i) => i.active && i.materialName === stockInMaterial && normalizeNumericSize(i.variantSize) === norm
                                );
                                if (foundItem && foundItem.rollLengthMtr) {
                                  setStockInRollLength(foundItem.rollLengthMtr.toString());
                                }
                                setStockInError('');
                              }}
                              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                              M
                            </span>
                          </div>
                          <datalist id="stock-in-size-suggestions">
                            {stockInSuggestedSizes.map((size) => (
                              <option key={size} value={size} />
                            ))}
                          </datalist>
                          {stockInSuggestedSizes.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {stockInSuggestedSizes.slice(0, 6).map((s) => (
                                <button
                                  type="button"
                                  key={s}
                                  onClick={() => {
                                    setStockInVariantSize(s);
                                    const foundItem = items.find(
                                      (i) => i.active && i.materialName === stockInMaterial && normalizeNumericSize(i.variantSize) === s
                                    );
                                    if (foundItem && foundItem.rollLengthMtr) {
                                      setStockInRollLength(foundItem.rollLengthMtr.toString());
                                    }
                                    setStockInError('');
                                  }}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white hover:bg-emerald-100 hover:text-emerald-800 text-slate-600 border border-slate-200 transition-colors"
                                >
                                  {s}M
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-700 font-bold">
                          Roll Length <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">Metres</span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          step="any"
                          placeholder="e.g. 70, 50, 45"
                          value={stockInRollLength}
                          onChange={(e) => {
                            setStockInRollLength(e.target.value);
                            setStockInError('');
                          }}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                          M
                        </span>
                      </div>
                      <div className="mt-1 flex items-center space-x-1">
                        {['70', '50', '45'].map((len) => (
                          <button
                            type="button"
                            key={len}
                            onClick={() => {
                              setStockInRollLength(len);
                              setStockInError('');
                            }}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                              stockInRollLength === len ? 'bg-emerald-600 text-white font-bold' : 'bg-white hover:bg-emerald-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {len}M
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Roll Quantity & Add Button */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Roll Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        ref={stockInRollsInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="e.g. 1, 2, 3"
                        value={stockInRolls}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setStockInRolls(val);
                            setStockInError('');
                          }
                        }}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-base font-black focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleAddOrUpdateItemToBatch()}
                        disabled={!isAddItemEnabled}
                        className={`w-full py-2.5 px-4 font-bold rounded-xl shadow-xs transition-all text-sm flex items-center justify-center space-x-2 ${
                          isAddItemEnabled
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>{editingDraftItemId ? 'UPDATE ITEM' : '+ ADD TO BATCH'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: CURRENT BATCH ITEMS */}
              {draftBatchItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                      CURRENT BATCH ITEMS ({draftBatchItems.length} {draftBatchItems.length === 1 ? 'Line' : 'Lines'})
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-800">
                      Total Rolls: {draftBatchItems.reduce((s, it) => s + it.rollQuantity, 0)}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs divide-y divide-slate-100">
                    {draftBatchItems.map((item, idx) => (
                      <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors">
                        <div className="flex items-start space-x-2.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{item.materialName}</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Size: <strong>{item.width}M</strong> &bull; Length: <strong>{item.rollLength}M</strong> &bull; Rolls: <strong className="text-emerald-700">{item.rollQuantity}</strong> &bull; Area: {item.areaM2} m²
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditDraftItem(item)}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Item"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BATCH BARCODE DISPLAY */}
              <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                      <BarcodeIcon className="w-4 h-4 text-emerald-600" />
                      <span>Batch Barcode (Shared Across All Items)</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Batch: <strong className="font-mono text-slate-900">{stockInGeneratedBatchNumber || 'Enter Invoice Number'}</strong>
                    </p>
                  </div>

                  {stockInGeneratedBatchNumber && (
                    <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                      CODE128 &bull; {stockInGeneratedBatchNumber.length}/15 chars
                    </span>
                  )}
                </div>

                <BarcodeDisplay
                  value={stockInGeneratedBatchNumber}
                  sanitizedInvoice={normalizeInvoiceForBatch(stockInInvoiceNumber)}
                  dateValue={stockInDate}
                  onGenerated={(success) => setStockInBarcodeRenderSuccess(success)}
                />
              </div>

              {/* FINAL SAVE STOCK IN BUTTON */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => handleSaveStockInBatch()}
                  disabled={!isStockInSaveEnabled}
                  className={`w-full py-3.5 px-4 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 ${
                    isStockInSaveEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98 shadow-md'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed opacity-80'
                  }`}
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  <span>
                    {isStockInSaveEnabled
                      ? `SAVE STOCK IN (${
                          draftBatchItems.length > 0
                            ? `${draftBatchItems.reduce((s, it) => s + it.rollQuantity, 0)} Rolls across ${draftBatchItems.length} Items`
                            : `+${stockInRollValidation.count} Rolls & Create Batch`
                        })`
                      : stockInDisabledReason}
                  </span>
                </button>

                <p className="text-[11px] text-center text-slate-500 font-medium">
                  After saving, batch barcode label printer prompt will appear automatically for all rolls in this batch.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: STOCK OUT (Retail POS Continuous Scanner Cart)     */}
        {/* ========================================================= */}
        {activeTab === 'stock-out' && (
          <div className="space-y-6">
            <BarcodeScannerView
              batches={batches}
              itemsWithStock={itemsWithStock}
              onExecuteStockOut={handleScannerStockOut}
              onRollStockOut={handleRollStockOut}
              onDispatchComplete={handleDispatchComplete}
            />
          </div>
        )}
        {/* ========================================================= */}
        {/* TAB 5: TRANSACTIONS (Blueprint Spec) */}
        {/* ========================================================= */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Transaction History</h2>
                <p className="text-xs text-slate-500">
                  Full audit trail: Date, Material, Category, Width, Length, Type, Quantity, Area (m²), and Balance.
                </p>
              </div>

              {/* Filter Pills */}
              <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 border border-slate-300">
                <button
                  onClick={() => setTxnTypeFilter('ALL')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    txnTypeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  All ({transactions.length})
                </button>
                <button
                  onClick={() => setTxnTypeFilter('IN')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    txnTypeFilter === 'IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700'
                  }`}
                >
                  Stock IN
                </button>
                <button
                  onClick={() => setTxnTypeFilter('OUT')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    txnTypeFilter === 'OUT' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-700'
                  }`}
                >
                  Stock OUT
                </button>
              </div>
            </div>

            {/* Dedicated Transaction Filters: Date, Invoice No, Item, Size, Length */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Filter className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Filter Transactions</span>
                  {hasActiveTxnFilters && (
                    <span className="ml-1 px-2 py-0.5 text-[10px] bg-indigo-50 text-indigo-700 font-semibold rounded-full border border-indigo-200">
                      Active
                    </span>
                  )}
                </div>
                {hasActiveTxnFilters && (
                  <button
                    onClick={resetTxnFilters}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* 1. Date Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Date</span>
                  </label>
                  <input
                    type="date"
                    value={txnDateFilter}
                    onChange={(e) => setTxnDateFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* 2. Invoice No Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    <span>Invoice No.</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GE23542"
                    value={txnInvoiceFilter}
                    onChange={(e) => setTxnInvoiceFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                  />
                </div>

                {/* 3. Item (Material) Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Box className="w-3 h-3 text-slate-400" />
                    <span>Item</span>
                  </label>
                  <select
                    value={txnItemFilter}
                    onChange={(e) => setTxnItemFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Items</option>
                    {uniqueTxnMaterials.map((mat) => (
                      <option key={mat} value={mat}>
                        {mat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Size (Width) Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Ruler className="w-3 h-3 text-slate-400" />
                    <span>Size / Width</span>
                  </label>
                  <select
                    value={txnSizeFilter}
                    onChange={(e) => setTxnSizeFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Sizes</option>
                    {uniqueTxnSizes.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Length Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Ruler className="w-3 h-3 text-slate-400" />
                    <span>Length</span>
                  </label>
                  <select
                    value={txnLengthFilter}
                    onChange={(e) => setTxnLengthFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Lengths</option>
                    {uniqueTxnLengths.map((len) => (
                      <option key={len} value={String(len)}>
                        {len} M
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Date / Time</th>
                      <th className="py-3 px-4">Invoice No.</th>
                      <th className="py-3 px-4">Batch / Barcode</th>
                      <th className="py-3 px-4">Material</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Width</th>
                      <th className="py-3 px-4">Length</th>
                      <th className="py-3 px-4 text-center">Type</th>
                      <th className="py-3 px-4 text-right">Roll Quantity</th>
                      <th className="py-3 px-4 text-right">Area (m²)</th>
                      <th className="py-3 px-4 text-right font-mono">Before</th>
                      <th className="py-3 px-4 text-right font-mono">After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-slate-400">
                          No transactions found.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            {tx.date}
                            <span className="block text-[10px] text-slate-400">
                              {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {tx.type === 'OUT' ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[11px]">
                                  OUT: {tx.stockOutInvoiceNumber || tx.invoiceNumber || '—'}
                                </span>
                                {tx.originalStockInInvoiceNumber && (
                                  <span className="block text-[10px] text-slate-500 font-medium font-sans">
                                    IN: <span className="font-mono">{tx.originalStockInInvoiceNumber}</span>
                                  </span>
                                )}
                              </div>
                            ) : tx.invoiceNumber ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px]">
                                IN: {tx.invoiceNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {tx.rollBarcode ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 text-[11px]">
                                  Roll: {tx.rollBarcode}
                                </span>
                                {tx.batchNumber && (
                                  <span className="block text-[10px] text-slate-500 font-medium font-sans">
                                    Batch: <span className="font-mono">{tx.batchNumber}</span>
                                  </span>
                                )}
                              </div>
                            ) : tx.batchNumber ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px]">
                                {tx.batchNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">{tx.barcode}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">{tx.materialName}</td>
                          <td className="py-3 px-4 text-slate-600">{tx.category}</td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">{tx.variantSize} M</td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">{tx.rollLengthMtr} M</td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                tx.type === 'IN'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-black text-sm ${
                              tx.type === 'IN' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {tx.type === 'IN' ? '+' : '-'}
                            {tx.quantity} Rolls
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-indigo-700">
                            {tx.areaMtr2} m²
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500 font-semibold">
                            {tx.stockBefore}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-900 font-black">
                            {tx.stockAfter}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: BARCODE LABELS (BATCH-BASED CODE128 BARCODES ONLY) */}
        {/* ========================================================= */}
        {activeTab === 'qr-labels' && (
          <div className="space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Roll Barcode Labels</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    CODE128 Linear
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unique physical roll stickers. Every received roll in the warehouse receives its own unique CODE128 label.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
                  Total Batches: <strong className="text-slate-900">{batches.length}</strong>
                </span>
              </div>
            </div>

            {/* Search Bar (Search by Batch Number, Invoice Number, Material) */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search batches by Batch Number, Invoice Number, or Material..."
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-medium placeholder:text-slate-400"
                />
                {batchSearch && (
                  <button
                    type="button"
                    onClick={() => setBatchSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {batchSearch && (
                <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">
                  Found: <strong className="text-slate-900">{filteredBatches.length}</strong>
                </span>
              )}
            </div>

            {/* Batches Grid */}
            {filteredBatches.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <BarcodeIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {batchSearch ? 'No matching batches found' : 'No Stock IN batches yet'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {batchSearch
                    ? `No batch matches "${batchSearch}". Try searching by Batch Number, Invoice, or Material.`
                    : 'Batches are automatically created when you receive stock in the Stock IN tab.'}
                </p>
                {batchSearch ? (
                  <button
                    type="button"
                    onClick={() => setBatchSearch('')}
                    className="text-xs text-amber-700 font-bold hover:underline"
                  >
                    Clear Search
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('stock-in')}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Go to Stock IN</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBatches.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all flex flex-col justify-between space-y-3"
                  >
                    {/* Header: Material Name, Category, Date */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {b.category || 'Roll'} &bull; {b.stockInDate}
                        </span>
                        <h4 className="font-black text-base text-slate-900 leading-tight mt-0.5">
                          {b.materialName}
                        </h4>
                        <span className="text-xs font-mono text-slate-600 font-semibold mt-0.5 block">
                          Width: {b.variantSize}M &bull; Length: {b.rollLengthMtr}M
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-900 font-mono text-xs font-black rounded-lg border border-amber-200 shrink-0">
                        {b.initialRollQuantity} Rolls
                      </span>
                    </div>

                    {/* Batch Details block */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 font-mono text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-sans uppercase font-bold">
                          Batch:
                        </span>
                        <strong className="text-slate-900 font-bold tracking-wide">
                          {b.batchNumber}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-sans uppercase font-bold">
                          Invoice:
                        </span>
                        <span className="text-slate-800 font-semibold">{b.invoiceNumber}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-[10px] text-slate-500 font-sans uppercase font-bold">
                          Received:
                        </span>
                        <span className="text-slate-800 font-bold">{b.initialRollQuantity} Rolls</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-sans uppercase font-bold">
                          Remaining:
                        </span>
                        <strong
                          className={
                            b.currentRemainingRollQuantity > 0
                              ? 'text-emerald-700 font-black'
                              : 'text-slate-400 font-medium'
                          }
                        >
                          {b.currentRemainingRollQuantity} Rolls
                        </strong>
                      </div>
                    </div>

                    {/* Print Actions: Print Batch Labels (N) and Reprint 1 */}
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveBatchForPrint({
                            batch: b,
                            copies: b.initialRollQuantity
                          })
                        }
                        className="w-full py-2.5 bg-slate-900 hover:bg-[#C59B3F] hover:text-slate-950 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all shadow-xs cursor-pointer active:scale-98"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Batch Labels ({b.initialRollQuantity})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveBatchForPrint({
                            batch: b,
                            copies: 1
                          })
                        }
                        className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3 text-slate-400" />
                        <span>Reprint 1 Label (Sample / Replacement)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 8: BACKUP & RESTORE                                  */}
        {/* ========================================================= */}
        {activeTab === 'backup' && (
          <BackupRestoreView
            clientMaterials={items}
            userEmail={staffSession?.user?.email}
            showNotification={showNotification}
            onRestoreSuccess={() => {
              if (isSupabaseLive) {
                fetchMaterialsFromSupabase().then((m) => m && setItems(m));
                fetchRollsFromSupabase().then((r) => r && setInventoryRolls(r));
                fetchTransactionsFromSupabase().then((t) => t && setTransactions(t));
                fetchBatchesFromSupabase().then((b) => b && setBatches(b));
              }
            }}
          />
        )}
      </main>

      {/* Item Modal (Add / Edit Material) */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingItem ? 'Edit Material Item' : 'Add New Material Item'}
              </h3>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {itemFormError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {itemFormError}
              </div>
            )}

            <form onSubmit={handleSaveItemModal} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Active"
                  value={itemFormMaterial}
                  onChange={(e) => handleMaterialNameInputChange(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category *</label>
                <select
                  value={itemFormCategory}
                  onChange={(e) => handleCategoryInputChange(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="Flex PVC">Flex PVC</option>
                  <option value="Backlit">Backlit</option>
                  <option value="Frontlit Flex">Frontlit Flex</option>
                  <option value="Star Material">Star Material</option>
                  <option value="Self Adhesive Vinyl">Self Adhesive Vinyl</option>
                  <option value="Lamination Film">Lamination Film</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dashboard Group *</label>
                  <select
                    value={itemFormGroup}
                    onChange={(e) => setItemFormGroup(e.target.value as InventorySummaryGroup)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold text-xs"
                  >
                    <option value="FLEX_ROLL">1. Flex / Backlit</option>
                    <option value="STAR_MATERIAL">2. Star Material</option>
                    <option value="VINYL_ROLL">3. Vinyl / Lamination</option>
                    <option value="RIGID_PVC">4. PVC / Rigid Sheet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Display Order *</label>
                  <input
                    type="number"
                    step="1"
                    required
                    placeholder="e.g. 10, 20, 35"
                    value={itemFormDisplayOrder}
                    onChange={(e) => setItemFormDisplayOrder(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold text-xs"
                  />
                  <span className="text-[10px] text-slate-400">Controls row position (e.g. 10, 15, 20)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Size / Width (M) *</label>
                  {isStarMaterialCategory(itemFormCategory) ? (
                    <select
                      value={itemFormSize}
                      onChange={(e) => setItemFormSize(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="">-- Select Star Material Width --</option>
                      {!STAR_MATERIAL_ALLOWED_SIZES.includes(itemFormSize as any) && itemFormSize ? (
                        <option value={itemFormSize}>{itemFormSize} M (Invalid for Star Material)</option>
                      ) : null}
                      {STAR_MATERIAL_ALLOWED_SIZES.map((sz) => (
                        <option key={sz} value={sz}>{sz} M</option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="e.g. 1.02, 1.40, 1.63"
                        value={itemFormSize}
                        onChange={(e) => setItemFormSize(e.target.value)}
                        className="w-full p-2 pr-7 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                        M
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Roll Length (M) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="e.g. 50, 69, 70"
                      value={itemFormRollLength}
                      onChange={(e) => setItemFormRollLength(e.target.value)}
                      className="w-full p-2 pr-7 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                      M
                    </span>
                  </div>
                  {/* Variable Roll Length Quick Helper Buttons */}
                  <div className="mt-1 flex items-center space-x-1">
                    <span className="text-[10px] text-slate-400">Quick:</span>
                    {['50', '69', '70', '100'].map((len) => (
                      <button
                        key={len}
                        type="button"
                        onClick={() => setItemFormRollLength(len)}
                        className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                          itemFormRollLength === len
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {len}M
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic Calculation Preview */}
              {itemFormMaterial.trim() && itemFormSize.trim() && (
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-500 font-sans">Area Per Roll:</span>
                    <strong>
                      {parseFloat(itemFormSize) || 0}M × {parseFloat(itemFormRollLength) || 0}M = {
                        Number(((parseFloat(itemFormSize) || 0) * (parseFloat(itemFormRollLength) || 0)).toFixed(2))
                      } m²
                    </strong>
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs"
                >
                  {editingItem ? 'Save Changes' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Barcode Label Print Modal / Dialog (Prompted after Stock IN or opened manually) */}
      {activeBatchForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:static print:bg-white print:z-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 print:p-0 print:border-none print:shadow-none print:max-w-none print:max-h-none">
            <BatchBarcodeLabel
              batch={activeBatchForPrint.batch}
              rollCopies={activeBatchForPrint.copies}
              onClose={() => setActiveBatchForPrint(null)}
            />
          </div>
        </div>
      )}



      {/* Daily Inventory Backup Prompt Modal */}
      <DailyBackupModal
        isOpen={isDailyBackupModalOpen}
        clientMaterials={items}
        userEmail={staffSession?.user?.email}
        onClose={() => setIsDailyBackupModalOpen(false)}
        onBackupSuccess={() => {
          setIsDailyBackupModalOpen(false);
          showNotification("Today's inventory backup created successfully.", 'success');
        }}
      />

      {/* App Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Decora Sales &copy; 2026 &mdash; Built to Client Handwritten Blueprint
          </span>
        </div>
      </footer>
    </div>
  );
}
