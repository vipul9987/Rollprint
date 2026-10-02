import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Barcode as BarcodeIcon,
  Search,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Printer,
  X,
  Filter,
  RefreshCw,
  QrCode,
  TrendingUp,
  TrendingDown,
  Box,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  getStoredMaterials,
  saveStoredMaterials,
  getStoredTransactions,
  saveStoredTransactions,
  calculateMaterialsWithStock,
  calculateDashboardMetrics,
  round2,
  INITIAL_MATERIALS,
  INITIAL_TRANSACTIONS
} from './data/inventoryStore';
import { MaterialItem, StockTransaction, MaterialWithStock } from './types/inventory';
import { BarcodeDisplay } from './components/BarcodeDisplay';

type TabType = 'dashboard' | 'materials' | 'stock-in' | 'stock-out' | 'transactions' | 'barcodes';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Core Data State
  const [materials, setMaterials] = useState<MaterialItem[]>(() => getStoredMaterials());
  const [transactions, setTransactions] = useState<StockTransaction[]>(() => getStoredTransactions());

  // Show inactive materials toggle in Material Master
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // Synchronize derived stock values
  const materialsWithStock: MaterialWithStock[] = useMemo(() => {
    return calculateMaterialsWithStock(materials, transactions);
  }, [materials, transactions]);

  // Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    return calculateDashboardMetrics(materialsWithStock, transactions);
  }, [materialsWithStock, transactions]);

  // Global Toast Notification State
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Stock IN Form State
  const [stockInMaterialId, setStockInMaterialId] = useState<string>('');
  const [stockInQty, setStockInQty] = useState<string>('');
  const [stockInDate, setStockInDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [stockInRef, setStockInRef] = useState<string>('');
  const [stockInError, setStockInError] = useState<string>('');
  const stockInQtyRef = useRef<HTMLInputElement | null>(null);

  // Stock OUT Form State
  const [stockOutMaterialId, setStockOutMaterialId] = useState<string>('');
  const [stockOutQty, setStockOutQty] = useState<string>('');
  const [stockOutDate, setStockOutDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [stockOutRef, setStockOutRef] = useState<string>('');
  const [stockOutError, setStockOutError] = useState<string>('');
  const stockOutQtyRef = useRef<HTMLInputElement | null>(null);

  // Material Modal State (Add / Edit)
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState<boolean>(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [matFormName, setMatFormName] = useState<string>('');
  const [matFormCategory, setMatFormCategory] = useState<string>('Flex Media');
  const [matFormSize, setMatFormSize] = useState<string>('3 FT');
  const [matFormRollLength, setMatFormRollLength] = useState<string>('50');
  const [matFormUnit, setMatFormUnit] = useState<string>('M');
  const [matFormItemCode, setMatFormItemCode] = useState<string>('');
  const [matFormOpening, setMatFormOpening] = useState<string>('0');
  const [matFormMinStock, setMatFormMinStock] = useState<string>('50');

  // Scanner State
  const [scannerQuery, setScannerQuery] = useState<string>('');
  const [scannedMaterial, setScannedMaterial] = useState<MaterialWithStock | null>(null);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('');
  const scannerInputRef = useRef<HTMLInputElement | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('ALL');

  // Distinct Categories across active materials
  const categories = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return Array.from(set);
  }, [materials]);

  // Focus scanner input whenever user navigates to barcodes tab
  useEffect(() => {
    if (activeTab === 'barcodes' && scannerInputRef.current) {
      scannerInputRef.current.focus();
    }
  }, [activeTab]);

  // Handle Save Stock IN
  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStockInError('');

    if (!stockInMaterialId) {
      setStockInError('Please select a material.');
      showNotification('Please select a material.', 'error');
      return;
    }

    const trimmedQty = stockInQty.trim();
    if (!trimmedQty) {
      setStockInError('Quantity cannot be empty.');
      showNotification('Quantity cannot be empty.', 'error');
      return;
    }

    const qty = parseFloat(trimmedQty);
    if (isNaN(qty) || !isFinite(qty)) {
      setStockInError('Please enter a valid numeric quantity.');
      showNotification('Please enter a valid numeric quantity.', 'error');
      return;
    }

    if (qty <= 0) {
      setStockInError('Quantity must be greater than zero.');
      showNotification('Quantity must be greater than zero.', 'error');
      return;
    }

    const targetMaterial = materialsWithStock.find((m) => m.id === stockInMaterialId);
    if (!targetMaterial) return;

    const roundedQty = round2(qty);
    const stockBefore = targetMaterial.currentStock;
    const stockAfter = round2(stockBefore + roundedQty);

    const newTxn: StockTransaction = {
      id: `txn-${Date.now()}`,
      materialId: targetMaterial.id,
      materialName: targetMaterial.name,
      size: targetMaterial.size,
      itemCode: targetMaterial.itemCode,
      type: 'IN',
      quantity: roundedQty,
      unit: targetMaterial.unit,
      stockBefore,
      stockAfter,
      date: stockInDate || new Date().toISOString().split('T')[0],
      reference: stockInRef.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    saveStoredTransactions(updatedTxns);

    showNotification(
      `Stock IN recorded: +${roundedQty} ${targetMaterial.unit} added to ${targetMaterial.name} (${targetMaterial.size}). New Stock: ${stockAfter} ${targetMaterial.unit}`
    );

    // Reset inputs
    setStockInQty('');
    setStockInRef('');
    setStockInError('');
  };

  // Handle Save Stock OUT
  const handleStockOutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStockOutError('');

    if (!stockOutMaterialId) {
      setStockOutError('Please select a material.');
      showNotification('Please select a material.', 'error');
      return;
    }

    const trimmedQty = stockOutQty.trim();
    if (!trimmedQty) {
      setStockOutError('Quantity cannot be empty.');
      showNotification('Quantity cannot be empty.', 'error');
      return;
    }

    const qty = parseFloat(trimmedQty);
    if (isNaN(qty) || !isFinite(qty)) {
      setStockOutError('Please enter a valid numeric quantity.');
      showNotification('Please enter a valid numeric quantity.', 'error');
      return;
    }

    if (qty <= 0) {
      setStockOutError('Quantity must be greater than zero.');
      showNotification('Quantity must be greater than zero.', 'error');
      return;
    }

    const targetMaterial = materialsWithStock.find((m) => m.id === stockOutMaterialId);
    if (!targetMaterial) return;

    const roundedQty = round2(qty);

    // Strict validation: cannot exceed available stock
    if (roundedQty > targetMaterial.currentStock) {
      const err = `Insufficient stock. Available stock: ${targetMaterial.currentStock} ${targetMaterial.unit}.`;
      setStockOutError(err);
      showNotification(err, 'error');
      return;
    }

    const stockBefore = targetMaterial.currentStock;
    const stockAfter = round2(stockBefore - roundedQty);

    const newTxn: StockTransaction = {
      id: `txn-${Date.now()}`,
      materialId: targetMaterial.id,
      materialName: targetMaterial.name,
      size: targetMaterial.size,
      itemCode: targetMaterial.itemCode,
      type: 'OUT',
      quantity: roundedQty,
      unit: targetMaterial.unit,
      stockBefore,
      stockAfter,
      date: stockOutDate || new Date().toISOString().split('T')[0],
      reference: stockOutRef.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    saveStoredTransactions(updatedTxns);

    showNotification(
      `Stock OUT recorded: -${roundedQty} ${targetMaterial.unit} from ${targetMaterial.name} (${targetMaterial.size}). Remaining Stock: ${stockAfter} ${targetMaterial.unit}`
    );

    // Reset inputs
    setStockOutQty('');
    setStockOutRef('');
    setStockOutError('');
  };

  // Open Add Material Modal
  const openAddModal = () => {
    setEditingMaterialId(null);
    setMatFormName('');
    setMatFormCategory('Flex Media');
    setMatFormSize('3 FT');
    setMatFormRollLength('50');
    setMatFormUnit('M');
    setMatFormItemCode('');
    setMatFormOpening('0');
    setMatFormMinStock('50');
    setIsMaterialModalOpen(true);
  };

  // Open Edit Material Modal
  const openEditModal = (mat: MaterialItem) => {
    setEditingMaterialId(mat.id);
    setMatFormName(mat.name);
    setMatFormCategory(mat.category);
    setMatFormSize(mat.size);
    setMatFormRollLength(mat.rollLength ? String(mat.rollLength) : '50');
    setMatFormUnit(mat.unit);
    setMatFormItemCode(mat.itemCode);
    setMatFormOpening(String(mat.openingStock));
    setMatFormMinStock(String(mat.minStock));
    setIsMaterialModalOpen(true);
  };

  // Save Material (Add / Update)
  const handleSaveMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matFormName.trim()) {
      showNotification('Material name is required.', 'error');
      return;
    }
    if (!matFormSize.trim()) {
      showNotification('Size is required.', 'error');
      return;
    }

    // Auto-generate SKU/Barcode if left empty
    let code = matFormItemCode.trim();
    if (!code) {
      const cleanName = matFormName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
      const cleanSize = matFormSize.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      code = `${cleanName}-${cleanSize}`;
    }

    // Check SKU uniqueness
    const existing = materials.find(
      (m) => m.itemCode.toUpperCase() === code.toUpperCase() && m.id !== editingMaterialId
    );
    if (existing) {
      showNotification(`Item Code "${code}" already exists for ${existing.name} (${existing.size}). Must be unique.`, 'error');
      return;
    }

    const opening = round2(parseFloat(matFormOpening) || 0);
    const minStock = round2(parseFloat(matFormMinStock) || 0);
    const rollLen = parseFloat(matFormRollLength) || 50;

    if (editingMaterialId) {
      // Edit existing
      const updated = materials.map((m) => {
        if (m.id === editingMaterialId) {
          return {
            ...m,
            name: matFormName.trim(),
            category: matFormCategory.trim() || 'General',
            size: matFormSize.trim(),
            rollLength: rollLen,
            unit: matFormUnit.trim() || 'M',
            itemCode: code,
            barcode: code,
            openingStock: opening,
            minStock
          };
        }
        return m;
      });
      setMaterials(updated);
      saveStoredMaterials(updated);
      showNotification('Material updated successfully.');
    } else {
      // Create new
      const newMat: MaterialItem = {
        id: `mat-${Date.now()}`,
        name: matFormName.trim(),
        category: matFormCategory.trim() || 'General',
        size: matFormSize.trim(),
        rollLength: rollLen,
        unit: matFormUnit.trim() || 'M',
        itemCode: code,
        barcode: code,
        openingStock: opening,
        minStock,
        active: true,
        createdAt: new Date().toISOString().split('T')[0]
      };
      const updated = [...materials, newMat];
      setMaterials(updated);
      saveStoredMaterials(updated);
      showNotification(`New SKU "${newMat.itemCode}" (${newMat.name} - ${newMat.size}) created.`);
    }

    setIsMaterialModalOpen(false);
  };

  // Safe Deactivation / Soft Delete Logic
  const handleToggleMaterialStatus = (id: string, name: string, currentActive: boolean) => {
    const hasTransactions = transactions.some((t) => t.materialId === id);

    if (currentActive) {
      if (hasTransactions) {
        // Material has transaction history: deactivate it safely
        if (
          window.confirm(
            `"${name}" has recorded transactions in history. To preserve audit integrity, it will be marked as INACTIVE (hidden from active stock but preserved in history). Continue?`
          )
        ) {
          const updated = materials.map((m) => (m.id === id ? { ...m, active: false } : m));
          setMaterials(updated);
          saveStoredMaterials(updated);
          showNotification(`Material "${name}" marked as Inactive.`);
        }
      } else {
        // No transactions: allow permanent deletion
        if (window.confirm(`Delete "${name}" permanently? (This item has no recorded transactions).`)) {
          const updated = materials.filter((m) => m.id !== id);
          setMaterials(updated);
          saveStoredMaterials(updated);
          showNotification(`Material "${name}" deleted.`);
        }
      }
    } else {
      // Reactivate
      const updated = materials.map((m) => (m.id === id ? { ...m, active: true } : m));
      setMaterials(updated);
      saveStoredMaterials(updated);
      showNotification(`Material "${name}" reactivated.`);
    }
  };

  // Barcode Scanner Lookup Logic
  const performBarcodeLookup = (codeToSearch: string) => {
    const trimmed = codeToSearch.trim().toUpperCase();
    if (!trimmed) {
      setScannedMaterial(null);
      setScanStatusMessage('');
      return;
    }

    // Direct exact match on barcode or itemCode
    const found = materialsWithStock.find(
      (m) =>
        m.barcode.toUpperCase() === trimmed ||
        m.itemCode.toUpperCase() === trimmed ||
        `${m.name} ${m.size}`.toUpperCase() === trimmed
    );

    if (found) {
      setScannedMaterial(found);
      setScanStatusMessage(`Found SKU: ${found.name} (${found.size}) - Available: ${found.currentStock} ${found.unit}`);
    } else {
      setScannedMaterial(null);
      setScanStatusMessage(`No inventory item matches barcode "${codeToSearch}".`);
    }
  };

  // Scanner Input Keydown Handler (standard USB barcode scanner sends Enter)
  const handleScannerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performBarcodeLookup(scannerQuery);
    }
  };

  // Quick Action: Pre-fill Stock IN from Scanner
  const quickStockInFromScanner = (mat: MaterialWithStock) => {
    setStockInMaterialId(mat.id);
    setActiveTab('stock-in');
    setTimeout(() => {
      stockInQtyRef.current?.focus();
    }, 100);
  };

  // Quick Action: Pre-fill Stock OUT from Scanner
  const quickStockOutFromScanner = (mat: MaterialWithStock) => {
    setStockOutMaterialId(mat.id);
    setActiveTab('stock-out');
    setTimeout(() => {
      stockOutQtyRef.current?.focus();
    }, 100);
  };

  // Filtered Materials for Dashboard & Material Master
  const displayedMaterials = useMemo(() => {
    return materialsWithStock.filter((m) => {
      if (!showInactive && !m.active && activeTab === 'materials') {
        return false;
      }
      if (!m.active && activeTab === 'dashboard') {
        return false;
      }

      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.size.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = categoryFilter === 'ALL' || m.category === categoryFilter;

      let matchesStatus = true;
      if (statusFilter === 'LOW_STOCK') {
        matchesStatus = m.status === 'LOW_STOCK';
      } else if (statusFilter === 'OUT_OF_STOCK') {
        matchesStatus = m.status === 'OUT_OF_STOCK';
      } else if (statusFilter === 'IN_STOCK') {
        matchesStatus = m.status === 'IN_STOCK';
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [materialsWithStock, searchQuery, categoryFilter, statusFilter, showInactive, activeTab]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesType = txnTypeFilter === 'ALL' || t.type === txnTypeFilter;
      const matchesSearch =
        t.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.size.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.reference && t.reference.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesType && matchesSearch;
    });
  }, [transactions, txnTypeFilter, searchQuery]);

  // Reset to default sample data
  const handleResetData = () => {
    if (window.confirm('Reset all inventory and transactions to standard verified sample dataset?')) {
      setMaterials(INITIAL_MATERIALS);
      saveStoredMaterials(INITIAL_MATERIALS);
      setTransactions(INITIAL_TRANSACTIONS);
      saveStoredTransactions(INITIAL_TRANSACTIONS);
      showNotification('Dataset restored to verified baseline.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-all duration-300 ${
            notification.type === 'error'
              ? 'bg-red-600 text-white shadow-red-500/20'
              : 'bg-emerald-600 text-white shadow-emerald-500/20'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">RollPrint IMS</h1>
              <p className="text-[11px] text-slate-500">Inventory Management System</p>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex items-center space-x-1 overflow-x-auto py-1">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('materials');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'materials'
                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Materials</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('stock-in');
                setStockInError('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'stock-in'
                  ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
              <span>Stock IN</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('stock-out');
                setStockOutError('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'stock-out'
                  ? 'bg-amber-50 text-amber-700 font-bold border border-amber-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
              <span>Stock OUT</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('transactions');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'transactions'
                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Transactions</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('barcodes');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'barcodes'
                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarcodeIcon className="w-4 h-4" />
              <span>Barcodes</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Body Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD */}
        {/* ========================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Cards: Active SKUs | Stock IN | Stock OUT | Current Stock */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Active SKUs
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {dashboardMetrics.activeSkus}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Inventory items / sizes</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider flex items-center space-x-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Stock IN</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {dashboardMetrics.totalStockIn.toLocaleString()} M
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Total received</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div className="text-xs font-medium text-amber-600 uppercase tracking-wider flex items-center space-x-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Stock OUT</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {dashboardMetrics.totalStockOut.toLocaleString()} M
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Total consumed</div>
              </div>

              <div className="bg-white p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/30 shadow-xs">
                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                  Current Stock
                </div>
                <div className="text-2xl font-extrabold text-indigo-900 mt-1">
                  {dashboardMetrics.currentStock.toLocaleString()} M
                </div>
                <div className="text-[11px] mt-0.5">
                  {dashboardMetrics.outOfStockCount > 0 || dashboardMetrics.lowStockCount > 0 ? (
                    <span className="text-amber-700 font-semibold">
                      ⚠️ {dashboardMetrics.outOfStockCount} out of stock, {dashboardMetrics.lowStockCount} low
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium">All items healthy</span>
                  )}
                </div>
              </div>
            </div>

            {/* Inventory Summary Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Current Inventory Summary</h2>
                  <p className="text-xs text-slate-500">
                    Formula: <span className="font-mono text-slate-700">Current = Opening + Total IN - Total OUT</span>
                  </p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search material, size, or SKU..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800 w-48 sm:w-56"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-hidden"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-hidden"
                  >
                    <option value="ALL">All Stock Status</option>
                    <option value="IN_STOCK">In Stock</option>
                    <option value="LOW_STOCK">Low Stock</option>
                    <option value="OUT_OF_STOCK">Out of Stock</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Material</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">SKU / Code</th>
                      <th className="py-3 px-4 text-right">Opening</th>
                      <th className="py-3 px-4 text-right text-emerald-600">Total IN</th>
                      <th className="py-3 px-4 text-right text-amber-600">Total OUT</th>
                      <th className="py-3 px-4 text-right font-bold text-slate-900">Current Stock</th>
                      <th className="py-3 px-4 text-center">Unit</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          No matching inventory items found.
                        </td>
                      </tr>
                    ) : (
                      displayedMaterials.map((mat) => (
                        <tr key={mat.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">{mat.name}</td>
                          <td className="py-3 px-4 font-medium text-slate-700">{mat.size}</td>
                          <td className="py-3 px-4 font-mono font-semibold text-indigo-700">
                            {mat.itemCode}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500 font-mono">
                            {mat.openingStock} {mat.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-emerald-600">
                            +{mat.totalIn} {mat.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-amber-600">
                            -{mat.totalOut} {mat.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900">
                            {mat.currentStock} {mat.unit}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500">{mat.unit}</td>
                          <td className="py-3 px-4 text-center">
                            {mat.status === 'IN_STOCK' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                In Stock
                              </span>
                            )}
                            {mat.status === 'LOW_STOCK' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Low Stock
                              </span>
                            )}
                            {mat.status === 'OUT_OF_STOCK' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                Out of Stock
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center space-x-1">
                              <button
                                onClick={() => {
                                  setStockInMaterialId(mat.id);
                                  setActiveTab('stock-in');
                                }}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded text-[11px] border border-emerald-200"
                                title="Stock IN"
                              >
                                + IN
                              </button>
                              <button
                                onClick={() => {
                                  setStockOutMaterialId(mat.id);
                                  setActiveTab('stock-out');
                                }}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium rounded text-[11px] border border-amber-200"
                                title="Stock OUT"
                              >
                                - OUT
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
        {/* TAB 2: MATERIAL MASTER */}
        {/* ========================================================= */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Material Master</h2>
                <p className="text-xs text-slate-500">
                  Manage materials, size specifications, unique SKUs, and stock alert levels.
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
                  <span>Add Material</span>
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, size, or item code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Materials Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Material Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Size / Width</th>
                      <th className="py-3 px-4">Roll Length</th>
                      <th className="py-3 px-4">Unique SKU / Barcode</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4 text-right">Min Stock</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedMaterials.map((mat) => (
                      <tr
                        key={mat.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          !mat.active ? 'bg-slate-50/60 opacity-65' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {mat.name}
                          {!mat.active && (
                            <span className="ml-2 text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                            {mat.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">{mat.size}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {mat.rollLength ? `${mat.rollLength} ${mat.unit}` : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-700">
                          {mat.itemCode}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {mat.currentStock} {mat.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                          {mat.minStock} {mat.unit}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {mat.active ? (
                            <span className="text-emerald-700 font-medium">Active</span>
                          ) : (
                            <span className="text-slate-400 font-medium">Deactivated</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center space-x-1.5">
                            <button
                              onClick={() => openEditModal(mat)}
                              className="p-1 text-slate-500 hover:text-indigo-600 rounded hover:bg-slate-100"
                              title="Edit Material"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleToggleMaterialStatus(
                                  mat.id,
                                  `${mat.name} (${mat.size})`,
                                  mat.active
                                )
                              }
                              className={`p-1 rounded hover:bg-slate-100 ${
                                mat.active
                                  ? 'text-slate-400 hover:text-red-600'
                                  : 'text-slate-400 hover:text-emerald-600'
                              }`}
                              title={mat.active ? 'Deactivate Material' : 'Reactivate Material'}
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
        {/* TAB 3: STOCK IN */}
        {/* ========================================================= */}
        {activeTab === 'stock-in' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Stock IN — Goods Receiving</h2>
                  <p className="text-xs text-slate-500">
                    Add incoming material stock. Current stock will update automatically.
                  </p>
                </div>
              </div>

              {stockInError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{stockInError}</span>
                </div>
              )}

              <form onSubmit={handleStockInSubmit} className="space-y-4 text-xs">
                {/* Select Material */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Select Material <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={stockInMaterialId}
                    onChange={(e) => {
                      setStockInMaterialId(e.target.value);
                      setStockInError('');
                    }}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="">-- Choose Material &amp; Size --</option>
                    {materialsWithStock
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.size} [SKU: {m.itemCode}] (Current: {m.currentStock} {m.unit})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Stock In Preview Card */}
                {stockInMaterialId && (
                  (() => {
                    const sel = materialsWithStock.find((m) => m.id === stockInMaterialId);
                    if (!sel) return null;
                    const addQty = parseFloat(stockInQty) || 0;
                    const newTotal = round2(sel.currentStock + addQty);
                    return (
                      <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-emerald-950">
                            {sel.name} - {sel.size}
                          </div>
                          <div className="text-emerald-700 text-[11px]">
                            Current Stock: <strong>{sel.currentStock} {sel.unit}</strong> • SKU: {sel.itemCode}
                          </div>
                        </div>
                        {addQty > 0 && (
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-emerald-700 font-bold block">
                              New Stock After IN:
                            </span>
                            <span className="text-sm font-bold text-emerald-900 font-mono">
                              {newTotal} {sel.unit}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Quantity & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Quantity to Add (Metres) <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockInQtyRef}
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 50 or 12.5"
                      value={stockInQty}
                      onChange={(e) => {
                        setStockInQty(e.target.value);
                        setStockInError('');
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Date</label>
                    <input
                      type="date"
                      value={stockInDate}
                      onChange={(e) => setStockInDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Reference / Note */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Reference / PO Note (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PO-8835 / Star Media Delivery"
                    value={stockInRef}
                    onChange={(e) => setStockInRef(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors text-xs flex items-center justify-center space-x-1.5"
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>Save Stock IN</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: STOCK OUT */}
        {/* ========================================================= */}
        {activeTab === 'stock-out' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                  <ArrowUpFromLine className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Stock OUT — Material Consumption</h2>
                  <p className="text-xs text-slate-500">
                    Record material consumption. Stock cannot fall below zero.
                  </p>
                </div>
              </div>

              {stockOutError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{stockOutError}</span>
                </div>
              )}

              <form onSubmit={handleStockOutSubmit} className="space-y-4 text-xs">
                {/* Select Material */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Select Material <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={stockOutMaterialId}
                    onChange={(e) => {
                      setStockOutMaterialId(e.target.value);
                      setStockOutError('');
                    }}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value="">-- Choose Material &amp; Size --</option>
                    {materialsWithStock
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.size} [SKU: {m.itemCode}] (Available: {m.currentStock} {m.unit})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Available Stock Warning Card */}
                {stockOutMaterialId && (
                  (() => {
                    const sel = materialsWithStock.find((m) => m.id === stockOutMaterialId);
                    if (!sel) return null;
                    const outQty = parseFloat(stockOutQty) || 0;
                    const newTotal = round2(sel.currentStock - outQty);
                    const isExceeded = outQty > sel.currentStock;

                    return (
                      <div
                        className={`p-3 rounded-lg border flex items-center justify-between ${
                          isExceeded
                            ? 'bg-red-50 border-red-200'
                            : 'bg-amber-50/60 border-amber-200'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {sel.name} - {sel.size}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Available Stock:{' '}
                            <strong className="font-mono text-slate-900">
                              {sel.currentStock} {sel.unit}
                            </strong>{' '}
                            • SKU: {sel.itemCode}
                          </div>
                        </div>

                        {outQty > 0 && (
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold block text-slate-500">
                              Remaining After OUT:
                            </span>
                            <span
                              className={`text-sm font-bold font-mono ${
                                isExceeded ? 'text-red-600' : 'text-slate-900'
                              }`}
                            >
                              {newTotal} {sel.unit}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Quantity & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Quantity to Issue (Metres) <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={stockOutQtyRef}
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 20 or 2.5"
                      value={stockOutQty}
                      onChange={(e) => {
                        setStockOutQty(e.target.value);
                        setStockOutError('');
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Date</label>
                    <input
                      type="date"
                      value={stockOutDate}
                      onChange={(e) => setStockOutDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Reference / Note */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Job / Project Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Job #401 - City Billboard Banner"
                    value={stockOutRef}
                    onChange={(e) => setStockOutRef(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm transition-colors text-xs flex items-center justify-center space-x-1.5"
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    <span>Save Stock OUT</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: TRANSACTION HISTORY */}
        {/* ========================================================= */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Transaction History</h2>
                <p className="text-xs text-slate-500">
                  Full auditable record of all Stock IN and Stock OUT movements.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={txnTypeFilter}
                  onChange={(e) => setTxnTypeFilter(e.target.value)}
                  className="py-1.5 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-hidden shadow-xs"
                >
                  <option value="ALL">All Types (IN &amp; OUT)</option>
                  <option value="IN">Only Stock IN</option>
                  <option value="OUT">Only Stock OUT</option>
                </select>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by material name, size, SKU, or reference..."
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
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Item Code / SKU</th>
                      <th className="py-3 px-4 text-center">Type</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4 text-right">Stock Before</th>
                      <th className="py-3 px-4 text-right">Stock After</th>
                      <th className="py-3 px-4">Reference / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          No transactions found.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600">
                            <div>{t.date}</div>
                            {t.createdAt && (
                              <div className="text-[10px] text-slate-400">
                                {new Date(t.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{t.materialName}</td>
                          <td className="py-3 px-4 font-medium text-slate-700">{t.size}</td>
                          <td className="py-3 px-4 font-mono font-semibold text-indigo-700">
                            {t.itemCode}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                t.type === 'IN'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold ${
                              t.type === 'IN' ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          >
                            {t.type === 'IN' ? '+' : '-'}
                            {t.quantity} {t.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500">
                            {t.stockBefore} {t.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {t.stockAfter} {t.unit}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                            {t.reference || '-'}
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
        {/* TAB 6: BARCODES */}
        {/* ========================================================= */}
        {activeTab === 'barcodes' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  CODE128 Barcodes &amp; Scanner
                </h2>
                <p className="text-xs text-slate-500">
                  Every unique SKU has one permanent machine-readable CODE128 barcode.
                </p>
              </div>

              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors self-start"
              >
                <Printer className="w-4 h-4" />
                <span>Print All Barcodes</span>
              </button>
            </div>

            {/* Quick Barcode Scanner Box */}
            <div className="bg-white p-5 rounded-xl border border-indigo-200 shadow-sm space-y-3">
              <div className="flex items-center space-x-2 text-indigo-900 font-bold text-sm">
                <QrCode className="w-5 h-5 text-indigo-600" />
                <span>USB / Bluetooth Barcode Scanner</span>
              </div>
              <p className="text-xs text-slate-500">
                Position your scanner cursor in the input box below. Scanning a barcode automatically
                resolves the item on <span className="font-semibold text-slate-700">Enter</span> without requiring any manual button click.
              </p>

              {/* Scanner Form */}
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-96">
                  <input
                    ref={scannerInputRef}
                    type="text"
                    placeholder="Scan or type barcode (e.g. PVC-FLEX-3FT)..."
                    value={scannerQuery}
                    onChange={(e) => {
                      setScannerQuery(e.target.value);
                      performBarcodeLookup(e.target.value);
                    }}
                    onKeyDown={handleScannerKeyDown}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  {scannerQuery && (
                    <button
                      onClick={() => {
                        setScannerQuery('');
                        setScannedMaterial(null);
                        setScanStatusMessage('');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => performBarcodeLookup(scannerQuery)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                >
                  Lookup
                </button>
              </div>

              {scanStatusMessage && !scannedMaterial && (
                <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  {scanStatusMessage}
                </div>
              )}

              {/* Scanned Material Found Result */}
              {scannedMaterial && (
                <div className="mt-3 p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900">
                        {scannedMaterial.name} ({scannedMaterial.size})
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-200 text-indigo-900 font-bold">
                        {scannedMaterial.itemCode}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Available Stock: <strong className="text-slate-900 font-mono text-sm">{scannedMaterial.currentStock} {scannedMaterial.unit}</strong> • Category: {scannedMaterial.category}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => quickStockInFromScanner(scannedMaterial)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-xs flex items-center space-x-1.5 transition-colors"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Stock IN</span>
                    </button>
                    <button
                      onClick={() => quickStockOutFromScanner(scannedMaterial)}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-xs flex items-center space-x-1.5 transition-colors"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      <span>Stock OUT</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Printable CODE128 Barcodes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {materialsWithStock
                .filter((m) => m.active)
                .map((mat) => (
                  <div
                    key={mat.id}
                    className="bg-white border-2 border-slate-300 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs hover:border-indigo-400 transition-colors"
                  >
                    <div className="border-b border-slate-100 pb-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        {mat.category}
                      </div>
                      <div className="text-sm font-bold text-slate-900 leading-tight">
                        {mat.name}
                      </div>
                      <div className="text-xs text-slate-600 font-medium">Size: {mat.size}</div>
                    </div>

                    {/* Machine Readable CODE128 Barcode via JsBarcode */}
                    <BarcodeDisplay
                      value={mat.barcode}
                      format="CODE128"
                      width={1.6}
                      height={46}
                      fontSize={11}
                      displayValue={true}
                    />

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <span>
                        Current:{' '}
                        <strong className="text-slate-800 font-mono">
                          {mat.currentStock} {mat.unit}
                        </strong>
                      </span>
                      <button
                        onClick={() => {
                          setScannerQuery(mat.barcode);
                          performBarcodeLookup(mat.barcode);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-indigo-600 font-semibold hover:underline"
                      >
                        Test Scan
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      {/* Add / Edit Material Modal */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingMaterialId ? 'Edit Material SKU' : 'Add New Material SKU'}
              </h3>
              <button
                onClick={() => setIsMaterialModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Material Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Active Flex N or PVC Flex"
                  value={matFormName}
                  onChange={(e) => setMatFormName(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Flex Media"
                    value={matFormCategory}
                    onChange={(e) => setMatFormCategory(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Size / Width <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 3 FT or 4 FT"
                    value={matFormSize}
                    onChange={(e) => setMatFormSize(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Unique Item Code (SKU)</label>
                  <input
                    type="text"
                    placeholder="e.g. AFN-3FT (Auto if empty)"
                    value={matFormItemCode}
                    onChange={(e) => setMatFormItemCode(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Standard Roll (M)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 50 or 70"
                    value={matFormRollLength}
                    onChange={(e) => setMatFormRollLength(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Opening Stock</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={matFormOpening}
                    onChange={(e) => setMatFormOpening(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Min Stock Alert</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="50"
                    value={matFormMinStock}
                    onChange={(e) => setMatFormMinStock(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMaterialModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs"
                >
                  {editingMaterialId ? 'Save Changes' : 'Create SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-xs text-slate-400 text-center flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>RollPrint IMS — Simple Printing Material &amp; Roll Inventory</span>
        <button
          onClick={handleResetData}
          className="text-slate-400 hover:text-slate-600 text-[11px] underline flex items-center space-x-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Reset Sample Data</span>
        </button>
      </footer>
    </div>
  );
}
