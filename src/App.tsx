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
  INITIAL_MATRIX_ITEMS,
  INITIAL_MATRIX_TRANSACTIONS
} from './data/inventoryStore';
import { MatrixInventoryItem, MatrixStockTransaction, MatrixItemWithStock } from './types/inventory';
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
  // HELPER: BARCODE VERIFICATION MATCH
  // -------------------------------------------------------------
  const checkBarcodeMatch = (scannedCode: string, targetItem: MatrixItemWithStock | undefined): boolean => {
    if (!scannedCode.trim() || !targetItem) return false;
    const cleanCode = scannedCode.trim().toUpperCase();
    const cleanBarcode = targetItem.barcode.toUpperCase();
    const cleanId = targetItem.id.toUpperCase();

    // 1. Direct match with permanent barcode (e.g. ACTIVE-1.02-70M)
    if (cleanCode === cleanBarcode) return true;

    // 2. Direct match with item ID (e.g. act-102-70)
    if (cleanCode === cleanId) return true;

    // 3. Match from scanned QR URL (e.g. https://domain.com/item/act-102-70)
    if (cleanCode.includes(`/ITEM/${cleanId}`)) return true;

    // 4. Normalized match (without hyphens or whitespace)
    const normCode = cleanCode.replace(/[^A-Z0-9]/g, '');
    const normBarcode = cleanBarcode.replace(/[^A-Z0-9]/g, '');
    if (normCode && normBarcode && normCode === normBarcode) return true;

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

  // Available Roll Lengths for selected Material + Size
  const stockInAvailableLengths = useMemo(() => {
    if (!stockInMaterial || !stockInVariantSize) return [50, 70];
    const set = new Set<number>();
    items
      .filter(
        (i) =>
          i.active &&
          i.materialName === stockInMaterial &&
          i.variantSize === stockInVariantSize
      )
      .forEach((i) => set.add(i.rollLengthMtr || 70));
    return Array.from(set).sort((a, b) => a - b);
  }, [items, stockInMaterial, stockInVariantSize]);

  // Find exact inventory item matching Stock IN inputs
  const matchedStockInItem: MatrixItemWithStock | undefined = useMemo(() => {
    if (!stockInMaterial || !stockInVariantSize) return undefined;
    const len = parseInt(stockInRollLength, 10) || 70;
    return itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName === stockInMaterial &&
        i.variantSize === stockInVariantSize &&
        (i.rollLengthMtr === len || stockInAvailableLengths.length === 1)
    );
  }, [itemsWithStock, stockInMaterial, stockInVariantSize, stockInRollLength, stockInAvailableLengths]);

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

  // Available Roll Lengths for selected Material + Size
  const stockOutAvailableLengths = useMemo(() => {
    if (!stockOutMaterial || !stockOutVariantSize) return [50, 70];
    const set = new Set<number>();
    items
      .filter(
        (i) =>
          i.active &&
          i.materialName === stockOutMaterial &&
          i.variantSize === stockOutVariantSize
      )
      .forEach((i) => set.add(i.rollLengthMtr || 70));
    return Array.from(set).sort((a, b) => a - b);
  }, [items, stockOutMaterial, stockOutVariantSize]);

  // Find exact inventory item matching Stock OUT inputs
  const matchedStockOutItem: MatrixItemWithStock | undefined = useMemo(() => {
    if (!stockOutMaterial || !stockOutVariantSize) return undefined;
    const len = parseInt(stockOutRollLength, 10) || 70;
    return itemsWithStock.find(
      (i) =>
        i.active &&
        i.materialName === stockOutMaterial &&
        i.variantSize === stockOutVariantSize &&
        (i.rollLengthMtr === len || stockOutAvailableLengths.length === 1)
    );
  }, [itemsWithStock, stockOutMaterial, stockOutVariantSize, stockOutRollLength, stockOutAvailableLengths]);

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

    const rollsToAdd = parseInt(stockInRolls, 10);
    if (isNaN(rollsToAdd) || rollsToAdd <= 0) {
      setStockInError('Please enter a valid number of rolls to add (minimum 1).');
      return;
    }

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

    const rollsToRemove = parseInt(stockOutRolls, 10);
    if (isNaN(rollsToRemove) || rollsToRemove <= 0) {
      setStockOutError('Please enter a valid number of rolls to remove (minimum 1).');
      return;
    }

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
  // CLIENT HANDWRITTEN BLUEPRINT MATRIX COMPUTATION
  // Rows: Material Names
  // Columns: Size / Width values
  // Cells: Current FULL ROLLS in hand
  // Calculated Columns: Total Rolls, Total Area (m²)
  // -------------------------------------------------------------
  const matrixData = useMemo(() => {
    const activeItems = itemsWithStock.filter((i) => i.active);

    // Standard width columns in ascending order
    const rollSizes = Array.from(new Set(activeItems.map((i) => i.variantSize))).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    const rollMaterials = Array.from(new Set(activeItems.map((i) => i.materialName))).sort();

    const rollMatrixRows = rollMaterials.map((matName) => {
      const matItems = activeItems.filter((i) => i.materialName === matName);
      const rowRollTotal = matItems.reduce((sum, i) => sum + i.currentStock, 0);
      const rowAreaTotal = Number(matItems.reduce((sum, i) => sum + i.totalAreaMtr2, 0).toFixed(2));
      const cells: { [size: string]: MatrixItemWithStock | undefined } = {};
      matItems.forEach((i) => {
        cells[i.variantSize] = i;
      });
      return {
        materialName: matName,
        category: matItems[0]?.category || 'Flex PVC',
        cells,
        totalRolls: rowRollTotal,
        totalAreaMtr2: rowAreaTotal
      };
    });

    return {
      rollSizes,
      rollMatrixRows
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

            {/* Matrix Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                      Client Stock Summary Matrix
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Click any cell to update stock
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rows: Material Names | Columns: Size / Width values | Cell: Current full rolls in hand. Total Rolls and Area (m²) calculated automatically.
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
                      <span>Matrix View</span>
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

              {/* VIEW 1: EXCEL MATRIX VIEW */}
              {dashboardViewMode === 'matrix' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs pt-1">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold text-center">
                          <th className="py-3 px-4 text-left font-black tracking-wide text-xs w-52 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                            Material Name
                          </th>
                          {matrixData.rollSizes.map((size) => (
                            <th
                              key={size}
                              className="py-3 px-3 min-w-[70px] border-r border-slate-800 font-mono text-indigo-200"
                            >
                              {size} M
                            </th>
                          ))}
                          <th className="py-3 px-4 bg-slate-950 font-black text-white min-w-[90px] border-r border-slate-800">
                            Total Rolls
                          </th>
                          <th className="py-3 px-4 bg-indigo-950 font-black text-indigo-200 min-w-[100px]">
                            Total Area (m²)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {matrixData.rollMatrixRows.map((row) => (
                          <tr key={row.materialName} className="hover:bg-indigo-50/40 transition-colors">
                            {/* Row Header (Material Name + Category) */}
                            <td className="py-3 px-4 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 shadow-xs z-10">
                              <div className="leading-tight">
                                <span className="text-sm font-extrabold">{row.materialName}</span>
                                <span className="block text-[10px] text-slate-400 font-normal">
                                  {row.category}
                                </span>
                              </div>
                            </td>

                            {/* Size Columns */}
                            {matrixData.rollSizes.map((size) => {
                              const item = row.cells[size];
                              if (!item) {
                                return (
                                  <td
                                    key={size}
                                    className="py-3 px-3 text-center text-slate-300 border-r border-slate-100 font-mono bg-slate-50/50"
                                  >
                                    —
                                  </td>
                                );
                              }

                              const qty = item.currentStock;
                              const isOutOfStock = qty <= 0;
                              const isLowStock = qty > 0 && qty <= item.minStock;

                              return (
                                <td
                                  key={size}
                                  onClick={() => setModalItem(item)}
                                  className={`py-3 px-3 text-center border-r border-slate-100 font-mono font-bold cursor-pointer transition-all hover:scale-105 select-none ${
                                    isOutOfStock
                                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                      : isLowStock
                                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                      : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                                  }`}
                                  title={`Click to update ${item.materialName} (${item.variantSize}M × ${item.rollLengthMtr}M) - Current: ${qty} Rolls (${item.totalAreaMtr2} m²)`}
                                >
                                  <span className="text-sm">{qty}</span>
                                </td>
                              );
                            })}

                            {/* Calculated Total Rolls Column */}
                            <td className="py-3 px-4 text-center font-mono font-black text-slate-900 bg-slate-50 border-r border-slate-200">
                              {row.totalRolls}
                            </td>

                            {/* Calculated Total Area (m²) Column */}
                            <td className="py-3 px-4 text-center font-mono font-black text-indigo-700 bg-indigo-50/50">
                              {row.totalAreaMtr2.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                        setStockInVariantSize(e.target.value);
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
                    <select
                      value={stockInRollLength}
                      disabled={!stockInVariantSize}
                      onChange={(e) => {
                        setStockInRollLength(e.target.value);
                        setStockInBarcodeCode('');
                        setStockInVerificationStatus('IDLE');
                        setStockInError('');
                      }}
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {stockInAvailableLengths.map((len) => (
                        <option key={len} value={len}>
                          {len} M
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 5 & 6: Roll Quantity & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      5. Roll Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockInRollsInputRef}
                      type="number"
                      min="1"
                      step="1"
                      required
                      placeholder="e.g. 5"
                      value={stockInRolls}
                      onChange={(e) => {
                        setStockInRolls(e.target.value);
                        setStockInError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          stockInVerificationInputRef.current?.focus();
                        }
                      }}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-base font-black focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
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
                    const rollsIn = parseInt(stockInRolls, 10) || 0;
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
                              +{rollsIn} Rolls
                            </span>
                          </div>

                          <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-xs">
                            <span className="text-[10px] text-emerald-100 block uppercase font-sans font-semibold">
                              After Stock IN
                            </span>
                            <span className="text-base font-black text-white">
                              {afterStock} Rolls
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
                            <span>{areaPerRoll} × {rollsIn} = {totalAreaAdded} m²</span>
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

                {/* 9. SAVE STOCK IN (Enabled only when verified) */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={
                      !matchedStockInItem ||
                      stockInVerificationStatus !== 'VERIFIED' ||
                      !stockInRolls ||
                      parseInt(stockInRolls, 10) <= 0
                    }
                    className={`w-full py-3.5 px-4 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 ${
                      stockInVerificationStatus === 'VERIFIED' && matchedStockInItem && parseInt(stockInRolls, 10) > 0
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                    }`}
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>
                      {stockInVerificationStatus === 'VERIFIED'
                        ? '9. Save Stock IN'
                        : 'Scan Barcode to Enable Save'}
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
                        setStockOutVariantSize(e.target.value);
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
                    <select
                      value={stockOutRollLength}
                      disabled={!stockOutVariantSize}
                      onChange={(e) => {
                        setStockOutRollLength(e.target.value);
                        setStockOutBarcodeCode('');
                        setStockOutVerificationStatus('IDLE');
                        setStockOutError('');
                      }}
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {stockOutAvailableLengths.map((len) => (
                        <option key={len} value={len}>
                          {len} M
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 5 & 6: Roll Quantity OUT & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      5. Roll Quantity OUT <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockOutRollsInputRef}
                      type="number"
                      min="1"
                      step="1"
                      required
                      placeholder="e.g. 2"
                      value={stockOutRolls}
                      onChange={(e) => {
                        setStockOutRolls(e.target.value);
                        setStockOutError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          stockOutVerificationInputRef.current?.focus();
                        }
                      }}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-base font-black focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
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
                    const rollsOut = parseInt(stockOutRolls, 10) || 0;
                    const isExceeded = rollsOut > current;
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
                              -{rollsOut} Rolls
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
                              {afterStock} Rolls
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
                            <span>{areaPerRoll} × {rollsOut} = {totalAreaOut} m²</span>
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

                {/* 9. SAVE STOCK OUT (Enabled only when verified & rolls <= current) */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={
                      !matchedStockOutItem ||
                      stockOutVerificationStatus !== 'VERIFIED' ||
                      !stockOutRolls ||
                      parseInt(stockOutRolls, 10) <= 0 ||
                      (parseInt(stockOutRolls, 10) || 0) > (matchedStockOutItem?.currentStock || 0)
                    }
                    className={`w-full py-3.5 px-4 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 ${
                      stockOutVerificationStatus === 'VERIFIED' &&
                      matchedStockOutItem &&
                      parseInt(stockOutRolls, 10) > 0 &&
                      (parseInt(stockOutRolls, 10) || 0) <= matchedStockOutItem.currentStock
                        ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-98'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                    }`}
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    <span>
                      {stockOutVerificationStatus === 'VERIFIED'
                        ? '9. Save Stock OUT'
                        : 'Scan Barcode to Enable Save'}
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
