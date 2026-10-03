import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  QrCode,
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
  Barcode as BarcodeIcon
} from 'lucide-react';
import {
  getStoredMatrixItems,
  saveStoredMatrixItems,
  getStoredMatrixTransactions,
  saveStoredMatrixTransactions,
  calculateMatrixWithStock,
  calculateMatrixDashboardMetrics,
  generateMatrixBarcode,
  getItemWebUrl,
  getItemSummaryGroup,
  FLEX_SUMMARY_WIDTHS,
  VINYL_SUMMARY_WIDTHS,
  PVC_SHEET_SIZES,
  PVC_THICKNESSES,
  CLIENT_FLEX_MATERIALS_ORDER,
  CLIENT_VINYL_MATERIALS_ORDER,
  INITIAL_MATRIX_ITEMS,
  INITIAL_MATRIX_TRANSACTIONS
} from './data/inventoryStore';
import { MatrixInventoryItem, MatrixStockTransaction, MatrixItemWithStock, InventorySummaryGroup } from './types/inventory';
import { QRCodeLabel } from './components/QRCodeLabel';
import { MobileItemView } from './components/MobileItemView';
import { CameraScannerModal } from './components/CameraScannerModal';

type TabType = 'dashboard' | 'materials' | 'stock-in' | 'stock-out' | 'transactions' | 'qr-labels';
type DashboardViewMode = 'matrix' | 'table';
type VerificationStatus = 'IDLE' | 'VERIFIED' | 'MISMATCH';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [dashboardViewMode, setDashboardViewMode] = useState<DashboardViewMode>('matrix');

  // Core Data State
  const [items, setItems] = useState<MatrixInventoryItem[]>(() => getStoredMatrixItems());
  const [transactions, setTransactions] = useState<MatrixStockTransaction[]>(() => getStoredMatrixTransactions());

  // Show inactive materials toggle in Material Master
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // Synchronize derived stock values & areas
  const itemsWithStock: MatrixItemWithStock[] = useMemo(() => {
    return calculateMatrixWithStock(items, transactions);
  }, [items, transactions]);

  // Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    return calculateMatrixDashboardMetrics(itemsWithStock, transactions);
  }, [itemsWithStock, transactions]);

  // Global Toast Notification State
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Distinct Material Names (displays ONLY material names in dropdowns)
  const uniqueMaterialNames = useMemo(() => {
    const set = new Set<string>();
    items.filter((i) => i.active).forEach((i) => set.add(i.materialName));
    return Array.from(set).sort();
  }, [items]);

  // -------------------------------------------------------------
  // MOBILE ITEM PAGE / QR DIRECT URL ROUTING
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
  // HELPER: BARCODE VERIFICATION MATCH
  // -------------------------------------------------------------
  const checkBarcodeMatch = (scannedCode: string, targetItem: MatrixItemWithStock | undefined): boolean => {
    if (!scannedCode.trim() || !targetItem) return false;
    const cleanCode = scannedCode.trim().toUpperCase();
    const cleanBarcode = targetItem.barcode.toUpperCase();
    const cleanId = targetItem.id.toUpperCase();

    // 1. Direct match with permanent barcode (e.g. ACTIVE-1.02-70M or BRIGHT-FL-26-1.63-50M)
    if (cleanCode === cleanBarcode) return true;

    // 2. Direct match with item ID (e.g. act-102 or bfl26-163)
    if (cleanCode === cleanId) return true;

    // 3. Match from scanned QR URL (e.g. https://domain.com/item/act-102)
    if (cleanCode.includes(`/ITEM/${cleanId}`)) return true;

    // 4. Normalized match (without hyphens or whitespace)
    const normCode = cleanCode.replace(/[^A-Z0-9]/g, '');
    const normBarcode = cleanBarcode.replace(/[^A-Z0-9]/g, '');
    if (normCode && normBarcode && normCode === normBarcode) return true;

    // 5. Match with Material + Size barcode without length suffix (e.g. BACKLIT-SUNLEX-1.32 or BRIGHT-FL-26-1.63)
    const baseCode = `${targetItem.materialName}-${targetItem.variantSize}`.toUpperCase();
    if (cleanCode === baseCode) return true;
    const normBase = baseCode.replace(/[^A-Z0-9]/g, '');
    if (normCode && normBase && normCode === normBase) return true;

    return false;
  };

  // -------------------------------------------------------------
  // STOCK IN FORM STATE (Exact Blueprint Order)
  // 1. Material Name
  // 2. Category (auto-populated)
  // 3. Size / Width
  // 4. Roll Length / Meter
  // 5. Roll Quantity
  // 6. Date
  // 7. Calculation / Stock Preview
  // 8. Barcode Scan / Verification
  // 9. Save
  // -------------------------------------------------------------
  const [stockInMaterial, setStockInMaterial] = useState<string>('');
  const [stockInVariantSize, setStockInVariantSize] = useState<string>('');
  const [stockInRollLength, setStockInRollLength] = useState<string>('70');
  const [stockInRolls, setStockInRolls] = useState<string>('');
  const [stockInDate, setStockInDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [stockInError, setStockInError] = useState<string>('');

  const [stockInBarcodeCode, setStockInBarcodeCode] = useState<string>('');
  const [stockInVerificationStatus, setStockInVerificationStatus] = useState<VerificationStatus>('IDLE');

  const stockInRollsInputRef = useRef<HTMLInputElement | null>(null);
  const stockInVerificationInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-populated Category for selected Material
  const stockInAutoCategory = useMemo(() => {
    if (!stockInMaterial) return '';
    const found = items.find((i) => i.materialName === stockInMaterial);
    return found?.category || 'Flex PVC';
  }, [items, stockInMaterial]);

  // Available Sizes for selected Stock IN material
  const stockInAvailableSizes = useMemo(() => {
    if (!stockInMaterial) return [];
    const set = new Set<string>();
    items
      .filter((i) => i.active && i.materialName === stockInMaterial)
      .forEach((i) => set.add(i.variantSize));
    return Array.from(set);
  }, [items, stockInMaterial]);

  // Find exact inventory item matching Stock IN inputs
  const matchedStockInItem: MatrixItemWithStock | undefined = useMemo(() => {
    if (!stockInMaterial || !stockInVariantSize) return undefined;
    const len = parseFloat(stockInRollLength) || 70;
    const exact = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName === stockInMaterial &&
        i.variantSize === stockInVariantSize &&
        i.rollLengthMtr === len
    );
    if (exact) return exact;

    const baseItem = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName === stockInMaterial &&
        i.variantSize === stockInVariantSize
    );
    if (baseItem) {
      const widthNum = parseFloat(baseItem.variantSize) || 1.0;
      const customAreaPerRoll = Number((widthNum * len).toFixed(2));
      return {
        ...baseItem,
        rollLengthMtr: len,
        areaPerRoll: customAreaPerRoll,
        totalAreaMtr2: Number((baseItem.currentStock * customAreaPerRoll).toFixed(2)),
        barcode: generateMatrixBarcode(baseItem.materialName, baseItem.variantSize, len)
      };
    }
    return undefined;
  }, [itemsWithStock, stockInMaterial, stockInVariantSize, stockInRollLength]);

  // Central roll count validation for Stock IN
  const stockInRollValidation = useMemo(() => {
    return parseFullRollCount(stockInRolls);
  }, [stockInRolls]);

  // All 6 conditions for enabling Save Stock IN button
  const isStockInSaveEnabled = useMemo(() => {
    const hasMaterial = Boolean(stockInMaterial.trim());
    const hasSize = Boolean(stockInVariantSize.trim());
    const hasLength = Boolean(stockInRollLength.trim()) && parseFloat(stockInRollLength) > 0;
    const hasValidRolls = stockInRollValidation.valid && stockInRollValidation.count > 0;
    const hasValidDate = Boolean(stockInDate.trim()) && !isNaN(new Date(stockInDate).getTime());
    const isVerified = stockInVerificationStatus === 'VERIFIED';
    const hasItem = Boolean(matchedStockInItem);

    return hasMaterial && hasSize && hasLength && hasValidRolls && hasValidDate && isVerified && hasItem;
  }, [
    stockInMaterial,
    stockInVariantSize,
    stockInRollLength,
    stockInRollValidation,
    stockInDate,
    stockInVerificationStatus,
    matchedStockInItem
  ]);

  const validateStockInBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setStockInVerificationStatus('IDLE');
      return;
    }
    if (!matchedStockInItem) {
      setStockInVerificationStatus('MISMATCH');
      return;
    }
    const isMatch = checkBarcodeMatch(trimmed, matchedStockInItem);
    setStockInVerificationStatus(isMatch ? 'VERIFIED' : 'MISMATCH');
  };

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

  const stockOutRollsInputRef = useRef<HTMLInputElement | null>(null);
  const stockOutVerificationInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-populated Category for selected Material
  const stockOutAutoCategory = useMemo(() => {
    if (!stockOutMaterial) return '';
    const found = items.find((i) => i.materialName === stockOutMaterial);
    return found?.category || 'Flex PVC';
  }, [items, stockOutMaterial]);

  // Available Sizes for selected Stock OUT material
  const stockOutAvailableSizes = useMemo(() => {
    if (!stockOutMaterial) return [];
    const set = new Set<string>();
    items
      .filter((i) => i.active && i.materialName === stockOutMaterial)
      .forEach((i) => set.add(i.variantSize));
    return Array.from(set);
  }, [items, stockOutMaterial]);

  // Find exact inventory item matching Stock OUT inputs
  const matchedStockOutItem: MatrixItemWithStock | undefined = useMemo(() => {
    if (!stockOutMaterial || !stockOutVariantSize) return undefined;
    const len = parseFloat(stockOutRollLength) || 70;
    const exact = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName === stockOutMaterial &&
        i.variantSize === stockOutVariantSize &&
        i.rollLengthMtr === len
    );
    if (exact) return exact;

    const baseItem = itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName === stockOutMaterial &&
        i.variantSize === stockOutVariantSize
    );
    if (baseItem) {
      const widthNum = parseFloat(baseItem.variantSize) || 1.0;
      const customAreaPerRoll = Number((widthNum * len).toFixed(2));
      return {
        ...baseItem,
        rollLengthMtr: len,
        areaPerRoll: customAreaPerRoll,
        totalAreaMtr2: Number((baseItem.currentStock * customAreaPerRoll).toFixed(2)),
        barcode: generateMatrixBarcode(baseItem.materialName, baseItem.variantSize, len)
      };
    }
    return undefined;
  }, [itemsWithStock, stockOutMaterial, stockOutVariantSize, stockOutRollLength]);

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
    const withinStock = Boolean(matchedStockOutItem && hasValidRolls && stockOutRollValidation.count <= matchedStockOutItem.currentStock);

    return hasMaterial && hasSize && hasLength && hasValidRolls && hasValidDate && isVerified && hasItem && withinStock;
  }, [
    stockOutMaterial,
    stockOutVariantSize,
    stockOutRollLength,
    stockOutRollValidation,
    stockOutDate,
    stockOutVerificationStatus,
    matchedStockOutItem
  ]);

  const validateStockOutBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setStockOutVerificationStatus('IDLE');
      return;
    }
    if (!matchedStockOutItem) {
      setStockOutVerificationStatus('MISMATCH');
      return;
    }
    const isMatch = checkBarcodeMatch(trimmed, matchedStockOutItem);
    setStockOutVerificationStatus(isMatch ? 'VERIFIED' : 'MISMATCH');
  };

  // Camera scan success handler
  const handleCameraScanSuccess = (decodedText: string) => {
    if (cameraScannerTarget === 'stock-in') {
      setStockInBarcodeCode(decodedText);
      validateStockInBarcode(decodedText);
    } else {
      setStockOutBarcodeCode(decodedText);
      validateStockOutBarcode(decodedText);
    }
  };

  // -------------------------------------------------------------
  // SHARED STOCK MUTATION HANDLER (Used by forms, mobile view, modal)
  // -------------------------------------------------------------
  const executeStockTransaction = (itemId: string, type: 'IN' | 'OUT', quantity: number, dateStr?: string) => {
    const targetItem = itemsWithStock.find((i) => i.id === itemId);
    if (!targetItem) {
      showNotification('Item not found in inventory.', 'error');
      return false;
    }

    if (quantity <= 0) {
      showNotification('Quantity must be at least 1 roll.', 'error');
      return false;
    }

    if (type === 'OUT' && quantity > targetItem.currentStock) {
      showNotification(
        `Cannot remove ${quantity} rolls. Only ${targetItem.currentStock} rolls available in stock.`,
        'error'
      );
      return false;
    }

    const stockBefore = targetItem.currentStock;
    const stockAfter = type === 'IN' ? stockBefore + quantity : stockBefore - quantity;
    const transactionDate = dateStr || new Date().toISOString().split('T')[0];

    const widthNum = parseFloat(targetItem.variantSize) || 1.0;
    const lengthNum = targetItem.rollLengthMtr || 70;
    const areaMtr2 = Number((quantity * widthNum * lengthNum).toFixed(2));

    const newTxn: MatrixStockTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      itemId: targetItem.id,
      materialName: targetItem.materialName,
      category: targetItem.category,
      variantSize: targetItem.variantSize,
      rollLengthMtr: lengthNum,
      secondaryVariant: targetItem.secondaryVariant,
      barcode: targetItem.barcode,
      type,
      quantity,
      areaMtr2,
      stockBefore,
      stockAfter,
      unit: targetItem.unit,
      date: transactionDate,
      createdAt: new Date().toISOString()
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    saveStoredMatrixTransactions(updatedTxns);

    showNotification(
      `${type === 'IN' ? 'Stock IN' : 'Stock OUT'} confirmed: ${quantity} Rolls (${areaMtr2} m²) for ${targetItem.materialName} (${targetItem.variantSize}M × ${lengthNum}M). New balance: ${stockAfter} Rolls.`,
      'success'
    );
    return true;
  };

  // Submit Stock IN Form
  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStockInError('');

    if (!matchedStockInItem) {
      setStockInError('Please select a valid material, size, and length configuration.');
      return;
    }

    if (stockInVerificationStatus !== 'VERIFIED') {
      setStockInError('Barcode verification is required. Please scan the matching barcode before saving.');
      return;
    }

    if (!stockInRollValidation.valid || stockInRollValidation.count <= 0) {
      setStockInError(stockInRollValidation.error || 'Please enter a valid positive number of rolls (minimum 1).');
      return;
    }

    const rollsToAdd = stockInRollValidation.count;
    const success = executeStockTransaction(
      matchedStockInItem.id,
      'IN',
      rollsToAdd,
      stockInDate
    );

    if (success) {
      setStockInRolls('');
      setStockInBarcodeCode('');
      setStockInVerificationStatus('IDLE');
      stockInRollsInputRef.current?.focus();
    }
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
    if (rollsToRemove > matchedStockOutItem.currentStock) {
      setStockOutError(
        `Cannot remove ${rollsToRemove} rolls. Only ${matchedStockOutItem.currentStock} rolls available in stock.`
      );
      return;
    }

    const success = executeStockTransaction(
      matchedStockOutItem.id,
      'OUT',
      rollsToRemove,
      stockOutDate
    );

    if (success) {
      setStockOutRolls('');
      setStockOutBarcodeCode('');
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
  const [itemFormSize, setItemFormSize] = useState<string>('');
  const [itemFormRollLength, setItemFormRollLength] = useState<string>('70');
  const [itemFormOpeningStock, setItemFormOpeningStock] = useState<string>('0');
  const [itemFormMinStock, setItemFormMinStock] = useState<string>('2');
  const [itemFormError, setItemFormError] = useState<string>('');

  const openAddModal = () => {
    setEditingItem(null);
    setItemFormMaterial('');
    setItemFormCategory('Flex PVC');
    setItemFormSize('');
    setItemFormRollLength('70');
    setItemFormOpeningStock('0');
    setItemFormMinStock('2');
    setItemFormError('');
    setIsItemModalOpen(true);
  };

  const openEditModal = (item: MatrixInventoryItem) => {
    setEditingItem(item);
    setItemFormMaterial(item.materialName);
    setItemFormCategory(item.category);
    setItemFormSize(item.variantSize);
    setItemFormRollLength((item.rollLengthMtr || 70).toString());
    setItemFormOpeningStock(item.openingStock.toString());
    setItemFormMinStock(item.minStock.toString());
    setItemFormError('');
    setIsItemModalOpen(true);
  };

  const handleSaveItemModal = (e: React.FormEvent) => {
    e.preventDefault();
    setItemFormError('');

    const trimMaterial = itemFormMaterial.trim();
    const trimSize = itemFormSize.trim();
    const lenVal = parseInt(itemFormRollLength, 10) || 70;

    if (!trimMaterial || !trimSize) {
      setItemFormError('Material name and width/size are required.');
      return;
    }

    const openingVal = parseInt(itemFormOpeningStock, 10);
    const minVal = parseInt(itemFormMinStock, 10);

    if (isNaN(openingVal) || openingVal < 0) {
      setItemFormError('Opening stock must be 0 or greater.');
      return;
    }

    if (isNaN(minVal) || minVal < 0) {
      setItemFormError('Minimum stock threshold must be 0 or greater.');
      return;
    }

    const barcode = generateMatrixBarcode(trimMaterial, trimSize, lenVal);

    const duplicate = items.find(
      (i) =>
        i.id !== editingItem?.id &&
        i.materialName.toLowerCase() === trimMaterial.toLowerCase() &&
        i.variantSize.toLowerCase() === trimSize.toLowerCase() &&
        (i.rollLengthMtr || 70) === lenVal
    );

    if (duplicate) {
      setItemFormError(`Combination "${trimMaterial} - ${trimSize}M (${lenVal}M)" already exists.`);
      return;
    }

    if (editingItem) {
      const updated = items.map((i) =>
        i.id === editingItem.id
          ? {
              ...i,
              materialName: trimMaterial,
              category: itemFormCategory,
              variantSize: trimSize,
              rollLengthMtr: lenVal,
              openingStock: openingVal,
              minStock: minVal,
              barcode
            }
          : i
      );
      setItems(updated);
      saveStoredMatrixItems(updated);
      showNotification(`Updated item "${trimMaterial} (${trimSize}M - ${lenVal}M)".`);
    } else {
      const newItem: MatrixInventoryItem = {
        id: `item-${Date.now()}`,
        materialName: trimMaterial,
        category: itemFormCategory,
        variantSize: trimSize,
        rollLengthMtr: lenVal,
        unit: 'Rolls',
        barcode,
        openingStock: openingVal,
        minStock: minVal,
        active: true,
        createdAt: new Date().toISOString().split('T')[0]
      };
      const updated = [newItem, ...items];
      setItems(updated);
      saveStoredMatrixItems(updated);
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
          showNotification(`Item deactivated.`);
        } else {
          const updated = items.filter((i) => i.id !== id);
          setItems(updated);
          saveStoredMatrixItems(updated);
          showNotification(`Item deleted.`);
        }
      }
    } else {
      const updated = items.map((i) => (i.id === id ? { ...i, active: true } : i));
      setItems(updated);
      saveStoredMatrixItems(updated);
      showNotification(`Item reactivated.`);
    }
  };

  // -------------------------------------------------------------
  // BARCODE LABELS PAGE STATE & PRINTING
  // -------------------------------------------------------------
  const [labelSearch, setLabelSearch] = useState<string>('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const filteredLabelItems = useMemo(() => {
    const q = labelSearch.trim().toLowerCase();
    return itemsWithStock.filter((i) => {
      if (!i.active) return false;
      if (!q) return true;
      return (
        i.materialName.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.variantSize.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q)
      );
    });
  }, [itemsWithStock, labelSearch]);

  const toggleSelectLabel = (itemId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAllLabels = () => {
    if (selectedLabelIds.length === filteredLabelItems.length) {
      setSelectedLabelIds([]);
    } else {
      setSelectedLabelIds(filteredLabelItems.map((i) => i.id));
    }
  };

  const printSingleLabel = (item: MatrixItemWithStock) => {
    setSelectedLabelIds([item.id]);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const printSelectedLabels = () => {
    if (selectedLabelIds.length === 0) {
      showNotification('Please select at least one label to print.', 'error');
      return;
    }
    window.print();
  };

  const printAllLabels = () => {
    setSelectedLabelIds(filteredLabelItems.map((i) => i.id));
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // -------------------------------------------------------------
  // SEARCH & FILTER STATE FOR MATERIALS & TRANSACTIONS
  // -------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [txnTypeFilter, setTxnTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  const displayedItems = useMemo(() => {
    return itemsWithStock.filter((i) => {
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
  }, [itemsWithStock, searchQuery, categoryFilter, showInactive, activeTab]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesType = txnTypeFilter === 'ALL' || t.type === txnTypeFilter;
      const matchesSearch =
        t.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.variantSize.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.barcode.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [transactions, txnTypeFilter, searchQuery]);

  // -------------------------------------------------------------
  // CLIENT MULTI-TABLE SUMMARY COMPUTATION
  // Table 1: Flex / Backlit Roll Stock (1.02, 1.32, 1.63, 1.93, 2.20, 2.54, 3.20)
  // Table 2: Vinyl / Lamination Roll Stock (0.94, 0.98, 1.02, 1.06, 1.27, 1.37, 1.52)
  // Table 3: PVC / Rigid Sheet Stock (Sizes: 8×4, 6×3, 5×10 | Thickness: 2mm, 3mm, 4mm, 5mm)
  // -------------------------------------------------------------
  const summaryTablesData = useMemo(() => {
    const activeItems = itemsWithStock.filter((i) => i.active);

    // 1. Flex / Backlit Roll Materials
    const flexItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'FLEX_ROLL');
    const rawFlexMaterials = Array.from(new Set(flexItems.map((i) => i.materialName)));
    const flexMaterials = rawFlexMaterials.sort((a, b) => {
      const idxA = CLIENT_FLEX_MATERIALS_ORDER.indexOf(a);
      const idxB = CLIENT_FLEX_MATERIALS_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const flexRows = flexMaterials.map((matName) => {
      const matItems = flexItems.filter((i) => i.materialName === matName);
      const cells: { [width: string]: MatrixItemWithStock | undefined } = {};
      matItems.forEach((i) => {
        cells[i.variantSize] = i;
      });
      const rowTotalRolls = matItems.reduce((sum, i) => sum + i.currentStock, 0);
      const rowTotalArea = Number(matItems.reduce((sum, i) => sum + i.totalAreaMtr2, 0).toFixed(2));
      return {
        materialName: matName,
        category: matItems[0]?.category || 'Flex PVC',
        cells,
        totalRolls: rowTotalRolls,
        totalAreaMtr2: rowTotalArea
      };
    });

    // Flex column totals
    const flexColTotals: { [width: string]: number } = {};
    FLEX_SUMMARY_WIDTHS.forEach((w) => {
      flexColTotals[w] = flexRows.reduce((sum, row) => sum + (row.cells[w]?.currentStock || 0), 0);
    });
    const flexGrandTotalRolls = flexRows.reduce((sum, r) => sum + r.totalRolls, 0);
    const flexGrandTotalArea = Number(flexRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    // 2. Vinyl / Lamination Roll Materials
    const vinylItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'VINYL_ROLL');
    const rawVinylMaterials = Array.from(new Set(vinylItems.map((i) => i.materialName)));
    // Ensure all standard vinyl materials are present even if 0 stock
    CLIENT_VINYL_MATERIALS_ORDER.forEach((m) => {
      if (!rawVinylMaterials.includes(m)) rawVinylMaterials.push(m);
    });
    const vinylMaterials = rawVinylMaterials.sort((a, b) => {
      const idxA = CLIENT_VINYL_MATERIALS_ORDER.indexOf(a);
      const idxB = CLIENT_VINYL_MATERIALS_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const vinylRows = vinylMaterials.map((matName) => {
      const matItems = vinylItems.filter((i) => i.materialName === matName);
      const cells: { [width: string]: MatrixItemWithStock | undefined } = {};
      matItems.forEach((i) => {
        cells[i.variantSize] = i;
      });
      const rowTotalRolls = matItems.reduce((sum, i) => sum + i.currentStock, 0);
      const rowTotalArea = Number(matItems.reduce((sum, i) => sum + i.totalAreaMtr2, 0).toFixed(2));
      return {
        materialName: matName,
        category: matItems[0]?.category || 'Self Adhesive Vinyl',
        cells,
        totalRolls: rowTotalRolls,
        totalAreaMtr2: rowTotalArea
      };
    });

    // Vinyl column totals
    const vinylColTotals: { [width: string]: number } = {};
    VINYL_SUMMARY_WIDTHS.forEach((w) => {
      vinylColTotals[w] = vinylRows.reduce((sum, row) => sum + (row.cells[w]?.currentStock || 0), 0);
    });
    const vinylGrandTotalRolls = vinylRows.reduce((sum, r) => sum + r.totalRolls, 0);
    const vinylGrandTotalArea = Number(vinylRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    // 3. PVC / Rigid Sheet Materials
    const pvcItems = activeItems.filter((i) => getItemSummaryGroup(i) === 'RIGID_PVC');
    const pvcRows = PVC_SHEET_SIZES.map((sheetSize) => {
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
    });

    // PVC column totals
    const pvcColTotals: { [thickness: string]: number } = {};
    PVC_THICKNESSES.forEach((th) => {
      pvcColTotals[th] = pvcRows.reduce((sum, row) => sum + (row.cells[th]?.currentStock || 0), 0);
    });
    const pvcGrandTotalSheets = pvcRows.reduce((sum, r) => sum + r.totalSheets, 0);
    const pvcGrandTotalArea = Number(pvcRows.reduce((sum, r) => sum + r.totalAreaMtr2, 0).toFixed(2));

    return {
      flexRows,
      flexColTotals,
      flexGrandTotalRolls,
      flexGrandTotalArea,
      vinylRows,
      vinylColTotals,
      vinylGrandTotalRolls,
      vinylGrandTotalArea,
      pvcRows,
      pvcColTotals,
      pvcGrandTotalSheets,
      pvcGrandTotalArea,
      hasPvc: pvcItems.length > 0
    };
  }, [itemsWithStock]);

  const handleResetSampleData = () => {
    if (window.confirm('Reset inventory and transaction history to the baseline client blueprint dataset?')) {
      setItems(INITIAL_MATRIX_ITEMS);
      setTransactions(INITIAL_MATRIX_TRANSACTIONS);
      saveStoredMatrixItems(INITIAL_MATRIX_ITEMS);
      saveStoredMatrixTransactions(INITIAL_MATRIX_TRANSACTIONS);
      showNotification('Restored baseline blueprint dataset.');
    }
  };

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

      {/* Quick Stock Update Modal from Matrix Click */}
      {modalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-150">
            <MobileItemView
              item={modalItem}
              isModal={true}
              onClose={() => setModalItem(null)}
              onStockChange={(itemId, type, qty) => {
                executeStockTransaction(itemId, type, qty);
                const refreshed = itemsWithStock.find((i) => i.id === itemId);
                if (refreshed) {
                  setModalItem({
                    ...refreshed,
                    currentStock:
                      type === 'IN' ? refreshed.currentStock + qty : Math.max(0, refreshed.currentStock - qty)
                  });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Printable Area for Barcode / QR Labels (@media print) */}
      <div className="hidden print:block print-label-grid">
        {(selectedLabelIds.length > 0
          ? itemsWithStock.filter((i) => selectedLabelIds.includes(i.id))
          : filteredLabelItems
        ).map((item) => (
          <div key={item.id} className="print-label-item">
            <QRCodeLabel item={item} itemUrl={getItemWebUrl(item.id)} />
          </div>
        ))}
      </div>

      {/* Main App Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600 rounded-xl shadow-inner text-white">
                <Box className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base font-black tracking-tight text-white">
                    RollPrint <span className="text-indigo-400 font-medium">IMS</span>
                  </h1>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full">
                    Blueprint Verified
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Full-Roll Inventory & Material Area Tracker
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard / Summary</span>
              </button>

              <button
                onClick={() => setActiveTab('materials')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'materials'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'stock-in'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-400 hover:text-white hover:bg-slate-800'
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'stock-out'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                <span>Stock OUT</span>
              </button>

              <button
                onClick={() => setActiveTab('transactions')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'transactions'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Transactions</span>
              </button>

              <button
                onClick={() => setActiveTab('qr-labels')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'qr-labels'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Barcode Labels</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 print:hidden">
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

              <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-xs bg-gradient-to-br from-white to-indigo-50/40">
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                  Current Stock in Hand
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-indigo-900 font-mono">
                      {dashboardMetrics.currentStock}
                    </span>
                    <span className="ml-1 text-xs font-bold text-indigo-700">Rolls</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-600">
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

                  <button
                    onClick={() => setActiveTab('stock-in')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors"
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
                        Width Columns: 1.02 &bull; 1.32 &bull; 1.63 &bull; 1.93 &bull; 2.20 &bull; 2.54 &bull; 3.20 M
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
                              {FLEX_SUMMARY_WIDTHS.map((width) => (
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
                            {summaryTablesData.flexRows.map((row) => (
                              <tr key={row.materialName} className="hover:bg-indigo-50/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                                  <div className="leading-tight">
                                    <span className="text-xs font-bold text-slate-900">{row.materialName}</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      {row.category}
                                    </span>
                                  </div>
                                </td>

                                {FLEX_SUMMARY_WIDTHS.map((width) => {
                                  const item = row.cells[width];
                                  if (!item) {
                                    return (
                                      <td
                                        key={width}
                                        className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 select-none"
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
                            ))}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                            <tr>
                              <td className="py-2.5 px-4 font-black text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-300 z-10 uppercase tracking-wider text-[11px]">
                                Total Rolls
                              </td>
                              {FLEX_SUMMARY_WIDTHS.map((width) => (
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

                  {/* TABLE 2: VINYL / LAMINATION MATERIALS */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          2. Vinyl / Lamination Roll Stock
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Width Columns: 0.94 &bull; 0.98 &bull; 1.02 &bull; 1.06 &bull; 1.27 &bull; 1.52 &bull; 1.37 M
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
                              {VINYL_SUMMARY_WIDTHS.map((width) => (
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
                            {summaryTablesData.vinylRows.map((row) => (
                              <tr key={row.materialName} className="hover:bg-emerald-50/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                                  <div className="leading-tight">
                                    <span className="text-xs font-bold text-slate-900">{row.materialName}</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      {row.category}
                                    </span>
                                  </div>
                                </td>

                                {VINYL_SUMMARY_WIDTHS.map((width) => {
                                  const item = row.cells[width];
                                  if (!item) {
                                    return (
                                      <td
                                        key={width}
                                        className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-mono bg-slate-50/40 select-none"
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
                            ))}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                            <tr>
                              <td className="py-2.5 px-4 font-black text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-300 z-10 uppercase tracking-wider text-[11px]">
                                Total Rolls
                              </td>
                              {VINYL_SUMMARY_WIDTHS.map((width) => (
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
                        {displayedItems.map((item) => (
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
                        ))}
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
                  Manage inventory materials, dimensions (Width × Length), barcodes, and opening stock.
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
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Width (M)</th>
                      <th className="py-3 px-4">Roll Length (M)</th>
                      <th className="py-3 px-4">Area / Roll</th>
                      <th className="py-3 px-4">Unique Barcode</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4 text-right">Min Stock</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedItems.map((item) => (
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
                        <td className="py-3 px-4 text-slate-600">{item.category}</td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">{item.variantSize} M</td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">{item.rollLengthMtr} M</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{item.areaPerRoll} m²</td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">{item.barcode}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {item.currentStock} Rolls
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                          {item.minStock} Rolls
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
                    ))}
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
                    Add full rolls into inventory balance according to blueprint.
                  </p>
                </div>
              </div>

              {stockInError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{stockInError}</span>
                </div>
              )}

              <form onSubmit={handleStockInSubmit} className="space-y-4 text-xs">
                {/* 1 & 2: Material Name & Auto-Populated Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      1. Material Name <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={stockInMaterial}
                      onChange={(e) => {
                        setStockInMaterial(e.target.value);
                        setStockInVariantSize('');
                        setStockInBarcodeCode('');
                        setStockInVerificationStatus('IDLE');
                        setStockInError('');
                      }}
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    >
                      <option value="">-- Select Material --</option>
                      {uniqueMaterialNames.map((mat) => (
                        <option key={mat} value={mat}>
                          {mat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      2. Category
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={stockInAutoCategory || '—'}
                      placeholder="Auto-populated"
                      className="w-full p-3 bg-slate-100 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* 3 & 4: Size / Width & Roll Length / Meter */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      3. Size / Width <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={stockInVariantSize}
                      disabled={!stockInMaterial}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStockInVariantSize(val);
                        const foundItem = items.find(
                          (i) => i.active && i.materialName === stockInMaterial && i.variantSize === val
                        );
                        if (foundItem) {
                          setStockInRollLength((foundItem.rollLengthMtr || 70).toString());
                        }
                        setStockInBarcodeCode('');
                        setStockInVerificationStatus('IDLE');
                        setStockInError('');
                      }}
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">
                        {stockInMaterial ? '-- Select Width --' : '-- Choose Material First --'}
                      </option>
                      {stockInAvailableSizes.map((size) => (
                        <option key={size} value={size}>
                          {size} M
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      4. Roll Length / Meter <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="e.g. 70"
                        value={stockInRollLength}
                        onChange={(e) => {
                          setStockInRollLength(e.target.value);
                          setStockInBarcodeCode('');
                          setStockInVerificationStatus('IDLE');
                          setStockInError('');
                        }}
                        className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                        M
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 & 6: Roll Count & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      5. Roll Count <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockInRollsInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      placeholder="e.g. 5"
                      value={stockInRolls}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Strictly digits only: disallow negative signs, dots, commas, decimals
                        if (val === '' || /^\d+$/.test(val)) {
                          setStockInRolls(val);
                          setStockInError('');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          stockInVerificationInputRef.current?.focus();
                        }
                      }}
                      className={`w-full p-3 bg-slate-50 border rounded-xl text-slate-900 font-mono text-base font-black focus:ring-2 focus:ring-emerald-500 focus:outline-hidden ${
                        stockInRolls && !stockInRollValidation.valid ? 'border-red-400 bg-red-50/40' : 'border-slate-300'
                      }`}
                    />
                    {stockInRolls && !stockInRollValidation.valid && (
                      <p className="mt-1 text-[11px] text-red-600 font-semibold flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{stockInRollValidation.error}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">6. Date</label>
                    <input
                      type="date"
                      value={stockInDate}
                      onChange={(e) => setStockInDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* 7. CALCULATION / STOCK PREVIEW */}
                {matchedStockInItem && (
                  (() => {
                    const current = matchedStockInItem.currentStock;
                    const rollsIn = stockInRollValidation.valid ? stockInRollValidation.count : 0;
                    const afterStock = current + rollsIn;
                    const widthNum = parseFloat(matchedStockInItem.variantSize) || 1.0;
                    const lengthNum = matchedStockInItem.rollLengthMtr || 70;
                    const areaPerRoll = Number((widthNum * lengthNum).toFixed(2));
                    const totalAreaAdded = Number((areaPerRoll * rollsIn).toFixed(2));

                    return (
                      <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-3">
                        <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                          <span>7. Calculation / Stock Preview</span>
                          <span className="font-mono text-slate-600 normal-case text-xs">
                            Expected: <strong>{matchedStockInItem.barcode}</strong>
                          </span>
                        </div>

                        {/* Roll Counts */}
                        <div className="grid grid-cols-3 gap-2 text-center font-mono">
                          <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                            <span className="text-[10px] text-slate-500 block uppercase font-sans font-semibold">
                              Current Stock
                            </span>
                            <span className="text-base font-bold text-slate-800">
                              {current} Rolls
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                            <span className="text-[10px] text-emerald-700 block uppercase font-sans font-semibold">
                              Rolls IN
                            </span>
                            <span className="text-base font-bold text-emerald-700">
                              {stockInRollValidation.valid ? `+${rollsIn} Rolls` : '—'}
                            </span>
                          </div>

                          <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-xs">
                            <span className="text-[10px] text-emerald-100 block uppercase font-sans font-semibold">
                              After Stock IN
                            </span>
                            <span className="text-base font-black text-white">
                              {stockInRollValidation.valid ? `${afterStock} Rolls` : `${current} Rolls`}
                            </span>
                          </div>
                        </div>

                        {/* Area Calculations as per blueprint: WIDTH × ROLL LENGTH */}
                        <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 font-mono text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Area Per Roll:</span>
                            <strong>{widthNum} M × {lengthNum} M = {areaPerRoll} m²</strong>
                          </div>
                          <div className="flex items-center justify-between text-emerald-800 border-t border-emerald-100 pt-1 font-bold">
                            <span>Total Area Added:</span>
                            <span>
                              {stockInRollValidation.valid
                                ? `${areaPerRoll} × ${rollsIn} = ${totalAreaAdded} m²`
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* 8. BARCODE SCAN / VERIFICATION */}
                <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                        <BarcodeIcon className="w-4 h-4 text-indigo-600" />
                        <span>8. Barcode Verification</span>
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Scan or enter barcode for {matchedStockInItem ? `${matchedStockInItem.materialName} / ${matchedStockInItem.variantSize}M / ${matchedStockInItem.rollLengthMtr}M` : 'selected item'}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCameraScannerTarget('stock-in');
                        setCameraScannerOpen(true);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-bold text-xs flex items-center space-x-1 shadow-xs"
                      title="Open phone camera scanner"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Camera</span>
                    </button>
                  </div>

                  {/* Input with auto-validation on Enter / rapid scanner typing */}
                  <div className="relative">
                    <input
                      ref={stockInVerificationInputRef}
                      type="text"
                      disabled={!matchedStockInItem}
                      placeholder={
                        matchedStockInItem
                          ? `Scan or enter barcode (e.g. ${matchedStockInItem.barcode})...`
                          : 'Select Material, Size & Length first'
                      }
                      value={stockInBarcodeCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStockInBarcodeCode(val);
                        if (val.trim()) {
                          validateStockInBarcode(val);
                        } else {
                          setStockInVerificationStatus('IDLE');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          validateStockInBarcode(stockInBarcodeCode);
                        }
                      }}
                      className={`w-full p-3 bg-white border-2 rounded-xl text-slate-900 font-mono text-sm font-bold placeholder:font-sans placeholder:font-normal focus:outline-hidden transition-colors ${
                        stockInVerificationStatus === 'VERIFIED'
                          ? 'border-emerald-500 ring-2 ring-emerald-200'
                          : stockInVerificationStatus === 'MISMATCH'
                          ? 'border-red-500 ring-2 ring-red-200'
                          : 'border-slate-300 focus:border-indigo-500'
                      }`}
                    />

                    {stockInBarcodeCode && (
                      <button
                        type="button"
                        onClick={() => {
                          setStockInBarcodeCode('');
                          setStockInVerificationStatus('IDLE');
                          stockInVerificationInputRef.current?.focus();
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Verification Status Feedback */}
                  {stockInVerificationStatus === 'VERIFIED' && matchedStockInItem && (
                    <div className="p-3 bg-emerald-100/80 border border-emerald-300 rounded-xl text-xs text-emerald-950 font-bold flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        ✓ Barcode Verified: {matchedStockInItem.materialName} — {matchedStockInItem.variantSize}M ({matchedStockInItem.rollLengthMtr}M)
                      </span>
                    </div>
                  )}

                  {stockInVerificationStatus === 'MISMATCH' && (
                    <div className="p-3 bg-red-100/80 border border-red-300 rounded-xl text-xs text-red-900 font-bold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                      <span>✕ Barcode does not match the selected material configuration.</span>
                    </div>
                  )}
                </div>

                {/* 9. SAVE STOCK IN (Enabled only when verified & valid count > 0) */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!isStockInSaveEnabled}
                    className={`w-full py-3.5 px-4 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 ${
                      isStockInSaveEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98 shadow-md'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                    }`}
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>
                      {isStockInSaveEnabled
                        ? `9. Save Stock IN (+${stockInRollValidation.count} Rolls)`
                        : stockInVerificationStatus !== 'VERIFIED'
                        ? 'Scan Barcode to Enable Save'
                        : !stockInRollValidation.valid
                        ? 'Enter Valid Roll Count (> 0)'
                        : 'Complete Required Fields to Save'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: STOCK OUT (Exact Blueprint Order) */}
        {/* ========================================================= */}
        {activeTab === 'stock-out' && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
                  <ArrowUpFromLine className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Stock OUT</h2>
                  <p className="text-xs text-slate-500">
                    Remove rolls from inventory balance according to blueprint.
                  </p>
                </div>
              </div>

              {stockOutError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{stockOutError}</span>
                </div>
              )}

              <form onSubmit={handleStockOutSubmit} className="space-y-4 text-xs">
                {/* 1 & 2: Material Name & Auto-Populated Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      1. Material Name <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={stockOutMaterial}
                      onChange={(e) => {
                        setStockOutMaterial(e.target.value);
                        setStockOutVariantSize('');
                        setStockOutBarcodeCode('');
                        setStockOutVerificationStatus('IDLE');
                        setStockOutError('');
                      }}
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    >
                      <option value="">-- Select Material --</option>
                      {uniqueMaterialNames.map((mat) => (
                        <option key={mat} value={mat}>
                          {mat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      2. Category
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={stockOutAutoCategory || '—'}
                      placeholder="Auto-populated"
                      className="w-full p-3 bg-slate-100 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* 3 & 4: Size / Width & Roll Length / Meter */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      3. Size / Width <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={stockOutVariantSize}
                      disabled={!stockOutMaterial}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStockOutVariantSize(val);
                        const foundItem = items.find(
                          (i) => i.active && i.materialName === stockOutMaterial && i.variantSize === val
                        );
                        if (foundItem) {
                          setStockOutRollLength((foundItem.rollLengthMtr || 70).toString());
                        }
                        setStockOutBarcodeCode('');
                        setStockOutVerificationStatus('IDLE');
                        setStockOutError('');
                      }}
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">
                        {stockOutMaterial ? '-- Select Width --' : '-- Choose Material First --'}
                      </option>
                      {stockOutAvailableSizes.map((size) => (
                        <option key={size} value={size}>
                          {size} M
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      4. Roll Length / Meter <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="e.g. 70"
                        value={stockOutRollLength}
                        onChange={(e) => {
                          setStockOutRollLength(e.target.value);
                          setStockOutBarcodeCode('');
                          setStockOutVerificationStatus('IDLE');
                          setStockOutError('');
                        }}
                        className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                        M
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 & 6: Roll Count OUT & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      5. Roll Count OUT <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockOutRollsInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      placeholder="e.g. 2"
                      value={stockOutRolls}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Strictly digits only: disallow negative signs, dots, commas, decimals
                        if (val === '' || /^\d+$/.test(val)) {
                          setStockOutRolls(val);
                          setStockOutError('');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          stockOutVerificationInputRef.current?.focus();
                        }
                      }}
                      className={`w-full p-3 bg-slate-50 border rounded-xl text-slate-900 font-mono text-base font-black focus:ring-2 focus:ring-amber-500 focus:outline-hidden ${
                        stockOutRolls && (!stockOutRollValidation.valid || (matchedStockOutItem && stockOutRollValidation.count > matchedStockOutItem.currentStock))
                          ? 'border-red-400 bg-red-50/40'
                          : 'border-slate-300'
                      }`}
                    />
                    {stockOutRolls && !stockOutRollValidation.valid && (
                      <p className="mt-1 text-[11px] text-red-600 font-semibold flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{stockOutRollValidation.error}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">6. Date</label>
                    <input
                      type="date"
                      value={stockOutDate}
                      onChange={(e) => setStockOutDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* 7. CALCULATION / STOCK PREVIEW */}
                {matchedStockOutItem && (
                  (() => {
                    const current = matchedStockOutItem.currentStock;
                    const rollsOut = stockOutRollValidation.valid ? stockOutRollValidation.count : 0;
                    const isExceeded = stockOutRollValidation.valid && rollsOut > current;
                    const afterStock = Math.max(0, current - rollsOut);
                    const widthNum = parseFloat(matchedStockOutItem.variantSize) || 1.0;
                    const lengthNum = matchedStockOutItem.rollLengthMtr || 70;
                    const areaPerRoll = Number((widthNum * lengthNum).toFixed(2));
                    const totalAreaOut = Number((areaPerRoll * rollsOut).toFixed(2));

                    return (
                      <div
                        className={`p-4 rounded-2xl border space-y-3 ${
                          isExceeded ? 'bg-red-50 border-red-200' : 'bg-amber-50/70 border-amber-200'
                        }`}
                      >
                        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span>7. Calculation / Stock Preview</span>
                          <span className="font-mono text-slate-600 normal-case text-xs">
                            Expected: <strong>{matchedStockOutItem.barcode}</strong>
                          </span>
                        </div>

                        {/* Roll Counts */}
                        <div className="grid grid-cols-3 gap-2 text-center font-mono">
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] text-slate-500 block uppercase font-sans font-semibold">
                              Current Stock
                            </span>
                            <span className="text-base font-bold text-slate-900">
                              {current} Rolls
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] text-amber-700 block uppercase font-sans font-semibold">
                              Rolls OUT
                            </span>
                            <span className="text-base font-bold text-amber-700">
                              {stockOutRollValidation.valid ? `-${rollsOut} Rolls` : '—'}
                            </span>
                          </div>

                          <div
                            className={`p-2.5 rounded-xl shadow-xs text-white ${
                              isExceeded ? 'bg-red-600' : 'bg-slate-900'
                            }`}
                          >
                            <span className="text-[10px] text-slate-300 block uppercase font-sans font-semibold">
                              After Stock OUT
                            </span>
                            <span className="text-base font-black text-white">
                              {stockOutRollValidation.valid && !isExceeded ? `${afterStock} Rolls` : `${current} Rolls`}
                            </span>
                          </div>
                        </div>

                        {/* Area Calculations as per blueprint */}
                        <div className="bg-white/80 p-3 rounded-xl border border-slate-200 font-mono text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Area Per Roll:</span>
                            <strong>{widthNum} M × {lengthNum} M = {areaPerRoll} m²</strong>
                          </div>
                          <div className="flex items-center justify-between text-amber-800 border-t border-slate-100 pt-1 font-bold">
                            <span>Total Area OUT:</span>
                            <span>
                              {stockOutRollValidation.valid
                                ? `${areaPerRoll} × ${rollsOut} = ${totalAreaOut} m²`
                                : '—'}
                            </span>
                          </div>
                        </div>

                        {isExceeded && (
                          <div className="text-xs text-red-700 font-bold flex items-center space-x-1.5 pt-1">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                            <span>
                              Requested rolls ({rollsOut}) exceeds current in-hand stock ({current} rolls).
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* 8. BARCODE SCAN / VERIFICATION */}
                <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                        <BarcodeIcon className="w-4 h-4 text-amber-600" />
                        <span>8. Barcode Verification</span>
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Scan or enter barcode for {matchedStockOutItem ? `${matchedStockOutItem.materialName} / ${matchedStockOutItem.variantSize}M / ${matchedStockOutItem.rollLengthMtr}M` : 'selected item'}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCameraScannerTarget('stock-out');
                        setCameraScannerOpen(true);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-bold text-xs flex items-center space-x-1 shadow-xs"
                      title="Open phone camera scanner"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-600" />
                      <span>Camera</span>
                    </button>
                  </div>

                  {/* Input with auto-validation on Enter / rapid scanner typing */}
                  <div className="relative">
                    <input
                      ref={stockOutVerificationInputRef}
                      type="text"
                      disabled={!matchedStockOutItem}
                      placeholder={
                        matchedStockOutItem
                          ? `Scan or enter barcode (e.g. ${matchedStockOutItem.barcode})...`
                          : 'Select Material, Size & Length first'
                      }
                      value={stockOutBarcodeCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStockOutBarcodeCode(val);
                        if (val.trim()) {
                          validateStockOutBarcode(val);
                        } else {
                          setStockOutVerificationStatus('IDLE');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          validateStockOutBarcode(stockOutBarcodeCode);
                        }
                      }}
                      className={`w-full p-3 bg-white border-2 rounded-xl text-slate-900 font-mono text-sm font-bold placeholder:font-sans placeholder:font-normal focus:outline-hidden transition-colors ${
                        stockOutVerificationStatus === 'VERIFIED'
                          ? 'border-emerald-500 ring-2 ring-emerald-200'
                          : stockOutVerificationStatus === 'MISMATCH'
                          ? 'border-red-500 ring-2 ring-red-200'
                          : 'border-slate-300 focus:border-amber-500'
                      }`}
                    />

                    {stockOutBarcodeCode && (
                      <button
                        type="button"
                        onClick={() => {
                          setStockOutBarcodeCode('');
                          setStockOutVerificationStatus('IDLE');
                          stockOutVerificationInputRef.current?.focus();
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Verification Status Feedback */}
                  {stockOutVerificationStatus === 'VERIFIED' && matchedStockOutItem && (
                    <div className="p-3 bg-emerald-100/80 border border-emerald-300 rounded-xl text-xs text-emerald-950 font-bold flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        ✓ Barcode Verified: {matchedStockOutItem.materialName} — {matchedStockOutItem.variantSize}M ({matchedStockOutItem.rollLengthMtr}M)
                      </span>
                    </div>
                  )}

                  {stockOutVerificationStatus === 'MISMATCH' && (
                    <div className="p-3 bg-red-100/80 border border-red-300 rounded-xl text-xs text-red-900 font-bold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                      <span>✕ Barcode does not match the selected material configuration.</span>
                    </div>
                  )}
                </div>

                {/* 9. SAVE STOCK OUT (Enabled only when verified & valid count <= current) */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!isStockOutSaveEnabled}
                    className={`w-full py-3.5 px-4 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 ${
                      isStockOutSaveEnabled
                        ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-98 shadow-md'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                    }`}
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    <span>
                      {isStockOutSaveEnabled
                        ? `9. Save Stock OUT (-${stockOutRollValidation.count} Rolls)`
                        : stockOutVerificationStatus !== 'VERIFIED'
                        ? 'Scan Barcode to Enable Save'
                        : !stockOutRollValidation.valid
                        ? 'Enter Valid Roll Count (> 0)'
                        : matchedStockOutItem && stockOutRollValidation.count > matchedStockOutItem.currentStock
                        ? 'Exceeds Current Stock'
                        : 'Complete Required Fields to Save'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
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

            {/* Search Input */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter transactions by material, category, width, or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Date / Time</th>
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
                        <td colSpan={10} className="py-8 text-center text-slate-400">
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
        {/* TAB 6: BARCODE LABELS */}
        {/* ========================================================= */}
        {activeTab === 'qr-labels' && (
          <div className="space-y-5">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Barcode Labels</h2>
                <p className="text-xs text-slate-500">
                  Each label encodes Material + Width + Roll Length. Scan with normal phone camera or USB/Bluetooth scanner.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={printSelectedLabels}
                  disabled={selectedLabelIds.length === 0}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Selected ({selectedLabelIds.length})</span>
                </button>

                <button
                  onClick={printAllLabels}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print All Labels</span>
                </button>
              </div>
            </div>

            {/* Search and Select All Bar */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search labels by material, category, width, or barcode..."
                  value={labelSearch}
                  onChange={(e) => setLabelSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <button
                  onClick={toggleSelectAllLabels}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  {selectedLabelIds.length === filteredLabelItems.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            {/* Labels Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredLabelItems.map((item) => (
                <QRCodeLabel
                  key={item.id}
                  item={item}
                  itemUrl={getItemWebUrl(item.id)}
                  selectable={true}
                  isSelected={selectedLabelIds.includes(item.id)}
                  onToggleSelect={toggleSelectLabel}
                  onPrintSingle={printSingleLabel}
                  onOpenMobileView={openMobileItemPage}
                />
              ))}
            </div>
          </div>
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
                  onChange={(e) => setItemFormMaterial(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category *</label>
                <select
                  value={itemFormCategory}
                  onChange={(e) => setItemFormCategory(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="Flex PVC">Flex PVC</option>
                  <option value="Backlit">Backlit</option>
                  <option value="Frontlit Flex">Frontlit Flex</option>
                  <option value="Self Adhesive Vinyl">Self Adhesive Vinyl</option>
                  <option value="Lamination Film">Lamination Film</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Size / Width (M) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1.02"
                    value={itemFormSize}
                    onChange={(e) => setItemFormSize(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Roll Length (M) *</label>
                  <select
                    value={itemFormRollLength}
                    onChange={(e) => setItemFormRollLength(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  >
                    <option value="50">50 M</option>
                    <option value="70">70 M</option>
                    <option value="100">100 M</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Opening Stock (Rolls)</label>
                  <input
                    type="number"
                    min="0"
                    value={itemFormOpeningStock}
                    onChange={(e) => setItemFormOpeningStock(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Min Stock Alert</label>
                  <input
                    type="number"
                    min="0"
                    value={itemFormMinStock}
                    onChange={(e) => setItemFormMinStock(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                </div>
              </div>

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
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* App Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            RollPrint IMS &copy; 2026 &mdash; Built to Client Handwritten Blueprint
          </span>
          <button
            onClick={handleResetSampleData}
            className="text-[11px] text-slate-400 hover:text-indigo-600 font-medium underline"
          >
            Reset Client Blueprint Sample Data
          </button>
        </div>
      </footer>
    </div>
  );
}
