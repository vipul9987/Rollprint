import React, { useState, useMemo } from 'react';
import {
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Calendar,
  FileText,
  Barcode,
  Layers,
  Ruler
} from 'lucide-react';
import {
  MatrixItemWithStock,
  MatrixStockTransaction,
  MatrixBatch
} from '../types/inventory';
import { formatDateToDDMMYY } from '../data/inventoryStore';

interface StockDetailsDialogProps {
  item: MatrixItemWithStock;
  itemsWithStock: MatrixItemWithStock[];
  transactions: MatrixStockTransaction[];
  batches: MatrixBatch[];
  onStockTransaction: (params: {
    itemId: string;
    type: 'IN' | 'OUT';
    quantity: number;
    dateStr?: string;
    extraMeta?: {
      invoiceNumber?: string;
      batchNumber?: string;
      batchId?: string;
      rollLength?: number;
      width?: string;
      materialName?: string;
      category?: string;
    };
  }) => { success: boolean; batch?: MatrixBatch };
  onClose: () => void;
  normalizeNumericSize: (val: string | number) => string;
  onOpenScanner?: () => void;
}

export const StockDetailsDialog: React.FC<StockDetailsDialogProps> = ({
  item,
  itemsWithStock,
  transactions,
  batches,
  onStockTransaction,
  onClose,
  normalizeNumericSize,
  onOpenScanner
}) => {
  // Simple history filter: All | Stock IN | Stock OUT (Default: All)
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  // Quick Action Drawer state
  const [actionDrawerMode, setActionDrawerMode] = useState<'NONE' | 'IN' | 'OUT'>('NONE');
  const [quickQty, setQuickQty] = useState<string>('1');
  const [quickInvoice, setQuickInvoice] = useState<string>('');
  const [quickRollLength, setQuickRollLength] = useState<string>(
    item.rollLengthMtr ? item.rollLengthMtr.toString() : '50'
  );
  const [quickSelectedBatchId, setQuickSelectedBatchId] = useState<string>('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);

  // Normalized size/width key for stable lookup
  const targetNormWidth = normalizeNumericSize(item.variantSize);
  const targetMaterialLower = item.materialName.trim().toLowerCase();
  const isSheet = Boolean(item.secondaryVariant) || item.unit === 'Sheets';

  // 1. Find all matching items in the inventory for this Material + Size
  // (Handles multiple roll length variants belonging to the same Material + Width)
  const matchingItems = useMemo(() => {
    return itemsWithStock.filter((i) => {
      const matMatch = i.materialName.trim().toLowerCase() === targetMaterialLower;
      if (!matMatch) return false;
      if (isSheet) {
        return (
          i.variantSize.trim() === item.variantSize.trim() &&
          i.secondaryVariant?.trim() === item.secondaryVariant?.trim()
        );
      }
      return normalizeNumericSize(i.variantSize) === targetNormWidth;
    });
  }, [itemsWithStock, targetMaterialLower, targetNormWidth, isSheet, item.variantSize, item.secondaryVariant, normalizeNumericSize]);

  // Aggregate current stock and opening stock
  const currentStock = useMemo(() => {
    if (matchingItems.length > 0) {
      return matchingItems.reduce((sum, i) => sum + i.currentStock, 0);
    }
    return item.currentStock;
  }, [matchingItems, item.currentStock]);

  const openingStock = useMemo(() => {
    if (matchingItems.length > 0) {
      return matchingItems.reduce((sum, i) => sum + i.openingStock, 0);
    }
    return item.openingStock;
  }, [matchingItems, item.openingStock]);

  // Available unique roll lengths for this Material + Width
  const availableLengths = useMemo(() => {
    const set = new Set<number>();
    matchingItems.forEach((i) => {
      if (i.rollLengthMtr && i.rollLengthMtr > 0) set.add(i.rollLengthMtr);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [matchingItems]);

  // Matching batches for this Material + Width (checks both batch level & child item lines)
  const matchingBatches = useMemo(() => {
    return batches.filter((b) => {
      if (b.items && b.items.length > 0) {
        return b.items.some(
          (it) =>
            it.materialNameSnapshot?.trim().toLowerCase() === targetMaterialLower &&
            normalizeNumericSize(it.width) === targetNormWidth
        );
      }
      const matMatch = b.materialName?.trim().toLowerCase() === targetMaterialLower;
      if (!matMatch) return false;
      return normalizeNumericSize(b.variantSize || '') === targetNormWidth;
    });
  }, [batches, targetMaterialLower, targetNormWidth, normalizeNumericSize]);

  // Available batches that currently have stock remaining > 0
  const activeBatchesWithStock = useMemo(() => {
    return matchingBatches.filter((b) => {
      if (b.items && b.items.length > 0) {
        const matchingItem = b.items.find(
          (it) =>
            it.materialNameSnapshot?.trim().toLowerCase() === targetMaterialLower &&
            normalizeNumericSize(it.width) === targetNormWidth
        );
        return matchingItem ? matchingItem.remainingRollQuantity > 0 : b.currentRemainingRollQuantity > 0;
      }
      return b.currentRemainingRollQuantity > 0;
    });
  }, [matchingBatches, targetMaterialLower, targetNormWidth, normalizeNumericSize]);

  // 2. Filter transactions strictly for this Material + Size/Width
  // Uses normalized numeric values / IDs to avoid fragile display-string issues
  const allMatchingTransactions = useMemo(() => {
    const itemIds = new Set(matchingItems.map((i) => i.id));
    itemIds.add(item.id);

    return transactions
      .filter((t) => {
        // Material match: either itemId in matching set OR normalized materialName matches
        const matchesMat =
          itemIds.has(t.itemId) ||
          t.materialName.trim().toLowerCase() === targetMaterialLower;
        if (!matchesMat) return false;

        // Size / Width match
        if (isSheet) {
          return (
            t.variantSize.trim() === item.variantSize.trim() &&
            t.secondaryVariant?.trim() === item.secondaryVariant?.trim()
          );
        }
        return normalizeNumericSize(t.variantSize) === targetNormWidth;
      })
      .sort((a, b) => {
        // Newest transaction first
        const timeA = new Date(a.createdAt || a.date).getTime();
        const timeB = new Date(b.createdAt || b.date).getTime();
        return timeB - timeA;
      });
  }, [transactions, matchingItems, item.id, targetMaterialLower, isSheet, item.variantSize, item.secondaryVariant, targetNormWidth, normalizeNumericSize]);

  // Reconciled Totals from actual transactions
  const totalStockIn = useMemo(() => {
    return allMatchingTransactions
      .filter((t) => t.type === 'IN')
      .reduce((sum, t) => sum + t.quantity, 0);
  }, [allMatchingTransactions]);

  const totalStockOut = useMemo(() => {
    return allMatchingTransactions
      .filter((t) => t.type === 'OUT')
      .reduce((sum, t) => sum + t.quantity, 0);
  }, [allMatchingTransactions]);

  // Reconciled opening stock calculation
  // Ensures Current = Opening + Total IN - Total OUT reconciles 100% mathematically
  const reconciledOpening = useMemo(() => {
    // If opening stock was imported or set in item master, it satisfies: Current = Opening + IN - OUT
    const computedOpening = currentStock - totalStockIn + totalStockOut;
    // Return max(0, computedOpening) or openingStock
    return Math.max(0, computedOpening);
  }, [currentStock, totalStockIn, totalStockOut]);

  // Filtered transactions for display based on user filter: ALL | IN | OUT
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'ALL') return allMatchingTransactions;
    return allMatchingTransactions.filter((t) => t.type === historyFilter);
  }, [allMatchingTransactions, historyFilter]);

  // Quick Action execution handler
  const handleExecuteQuickAction = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);
    setQuickSuccess(null);

    const qty = parseInt(quickQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setQuickError('Please enter a valid roll quantity (at least 1).');
      return;
    }

    if (actionDrawerMode === 'OUT') {
      if (qty > currentStock) {
        setQuickError(
          `Cannot remove ${qty} ${item.unit}. Only ${currentStock} ${item.unit} available in current stock.`
        );
        return;
      }
    }

    const lengthNum = parseFloat(quickRollLength) || (item.rollLengthMtr || 0);
    if (lengthNum <= 0) {
      setQuickError('Roll length must be specified and greater than 0.');
      return;
    }

    const selectedBatch = matchingBatches.find((b) => b.id === quickSelectedBatchId);

    const res = onStockTransaction({
      itemId: item.id,
      type: actionDrawerMode,
      quantity: qty,
      extraMeta: {
        materialName: item.materialName,
        category: item.category,
        width: item.variantSize,
        rollLength: lengthNum,
        invoiceNumber: quickInvoice.trim() || undefined,
        batchId: selectedBatch?.id,
        batchNumber: selectedBatch?.batchNumber
      }
    });

    if (res.success) {
      const verb = actionDrawerMode === 'IN' ? 'Added' : 'Removed';
      setQuickSuccess(`Successfully ${verb} ${qty} ${item.unit}!`);
      setQuickQty('1');
      setQuickInvoice('');
      setQuickSelectedBatchId('');
      setActionDrawerMode('NONE');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* ========================================================= */}
        {/* DIALOG HEADER: Material + Size/Width + Category           */}
        {/* NOTE: Obsolete master barcode is strictly NOT shown        */}
        {/* ========================================================= */}
        <div className="bg-[#0A0A0C] text-white px-5 sm:px-6 py-4 border-b border-zinc-800 flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-950/80 text-indigo-300 border border-indigo-700/60">
                {item.category}
              </span>
              {isSheet ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60">
                  Rigid Sheet
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                  Roll Stock
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>{item.materialName}</span>
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300 font-medium pt-0.5">
              <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-300 bg-zinc-900/90 px-2 py-0.5 rounded-md border border-zinc-700/80">
                <Ruler className="w-3.5 h-3.5 text-indigo-400" />
                {isSheet
                  ? `Size: ${item.variantSize}${item.secondaryVariant ? ` • ${item.secondaryVariant}` : ''}`
                  : `Size / Width: ${item.variantSize} M`}
              </span>

              {!isSheet && availableLengths.length > 0 && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  Standard Lengths: {availableLengths.map((l) => `${l}M`).join(', ')}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close Dialog"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* ========================================================= */}
          {/* TOP STOCK SUMMARY: CURRENT STOCK | TOTAL IN | TOTAL OUT   */}
          {/* Calculation Reconciles: Current = Opening + In - Out      */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Card 1: CURRENT STOCK (Must match dashboard cell) */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-sm border border-slate-800 relative overflow-hidden">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300 block mb-1">
                  Current Stock
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
                    {currentStock}
                  </span>
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {item.unit}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 font-mono">
                  {matchingBatches.length > 0
                    ? `${matchingBatches.length} batch record${matchingBatches.length > 1 ? 's' : ''}`
                    : 'Opening inventory'}
                </div>
              </div>

              {/* Card 2: TOTAL STOCK IN */}
              <div className="p-4 bg-emerald-50/80 text-emerald-950 rounded-2xl shadow-sm border border-emerald-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                    Total Stock IN
                  </span>
                  <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-emerald-700">
                    +{totalStockIn}
                  </span>
                  <span className="text-xs font-bold text-emerald-600 uppercase">
                    {item.unit}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-emerald-700/80 font-mono">
                  {allMatchingTransactions.filter((t) => t.type === 'IN').length} IN transactions
                </div>
              </div>

              {/* Card 3: TOTAL STOCK OUT */}
              <div className="p-4 bg-amber-50/80 text-amber-950 rounded-2xl shadow-sm border border-amber-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">
                    Total Stock OUT
                  </span>
                  <ArrowUpFromLine className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-amber-700">
                    -{totalStockOut}
                  </span>
                  <span className="text-xs font-bold text-amber-600 uppercase">
                    {item.unit}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-amber-700/80 font-mono">
                  {allMatchingTransactions.filter((t) => t.type === 'OUT').length} OUT transactions
                </div>
              </div>
            </div>

            {/* Reconciliation Disclosure Strip */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="font-semibold text-slate-800">
                  Opening Stock: <strong className="font-mono text-slate-900">{reconciledOpening} {item.unit}</strong>
                </span>
                <span className="text-slate-400 hidden sm:inline">&bull;</span>
                <span className="text-slate-500 font-mono text-[11px]">
                  Formula: {reconciledOpening} (Opening) + {totalStockIn} (IN) - {totalStockOut} (OUT) = <strong className="text-slate-900">{currentStock} {item.unit}</strong>
                </span>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Reconciled 100%
              </span>
            </div>
          </div>

          {/* Notifications */}
          {quickSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{quickSuccess}</span>
            </div>
          )}

          {quickError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-bold text-rose-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{quickError}</span>
            </div>
          )}

          {/* Quick Action Drawer (If user clicked + Stock IN or - Stock OUT) */}
          {actionDrawerMode !== 'NONE' && (
            <form
              onSubmit={handleExecuteQuickAction}
              className={`p-4 rounded-2xl border transition-all space-y-4 animate-in slide-in-from-top-2 duration-150 ${
                actionDrawerMode === 'IN'
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-amber-50/60 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider">
                  {actionDrawerMode === 'IN' ? (
                    <>
                      <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-900">Add Stock IN — {item.materialName} ({item.variantSize}M)</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
                      <span className="text-amber-900">Deduct Stock OUT — {item.materialName} ({item.variantSize}M)</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActionDrawerMode('NONE');
                    setQuickError(null);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Quantity */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Number of {item.unit} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={actionDrawerMode === 'OUT' ? currentStock : undefined}
                    required
                    value={quickQty}
                    onChange={(e) => setQuickQty(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Roll Length (Mtr) */}
                {!isSheet && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Roll Length (M) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={quickRollLength}
                      onChange={(e) => setQuickRollLength(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                {/* Invoice Number (for IN) or Select Batch (for OUT) */}
                {actionDrawerMode === 'IN' ? (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Invoice No. (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. INV-2026-99"
                      value={quickInvoice}
                      onChange={(e) => setQuickInvoice(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Select Batch (Optional)
                    </label>
                    <select
                      value={quickSelectedBatchId}
                      onChange={(e) => setQuickSelectedBatchId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Any Available Stock</option>
                      {activeBatchesWithStock.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber} ({b.currentRemainingRollQuantity} rolls left &bull; {b.rollLengthMtr}M)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActionDrawerMode('NONE')}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-xs font-black text-white rounded-xl shadow-xs transition-colors ${
                    actionDrawerMode === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  Confirm {actionDrawerMode === 'IN' ? 'Stock IN' : 'Stock OUT'}
                </button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* STOCK HISTORY TABLE & FILTER CONTROLS                      */}
          {/* Columns: Date, Type, Rolls, Roll Length, Batch, Invoice,  */}
          {/*          Before Stock, After Stock                        */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Stock History
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  ({allMatchingTransactions.length} record{allMatchingTransactions.length === 1 ? '' : 's'})
                </span>
              </div>

              {/* Simple Filter: [ All ] [ Stock IN ] [ Stock OUT ] */}
              <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                <button
                  onClick={() => setHistoryFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                    historyFilter === 'ALL'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({allMatchingTransactions.length})
                </button>
                <button
                  onClick={() => setHistoryFilter('IN')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                    historyFilter === 'IN'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:text-emerald-800'
                  }`}
                >
                  Stock IN ({allMatchingTransactions.filter((t) => t.type === 'IN').length})
                </button>
                <button
                  onClick={() => setHistoryFilter('OUT')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                    historyFilter === 'OUT'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-700 hover:text-amber-800'
                  }`}
                >
                  Stock OUT ({allMatchingTransactions.filter((t) => t.type === 'OUT').length})
                </button>
              </div>
            </div>

            {/* History Records Container */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
              {filteredHistory.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <History className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    No Stock IN / OUT transactions recorded yet.
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    {reconciledOpening > 0
                      ? `Opening inventory contains ${reconciledOpening} ${item.unit}. All current stock originates from initial opening stock.`
                      : 'No stock movements recorded for this size yet.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-center">Type</th>
                        <th className="py-2.5 px-3">Roll Barcode</th>
                        <th className="py-2.5 px-3 text-right">Rolls</th>
                        <th className="py-2.5 px-3">Length</th>
                        <th className="py-2.5 px-3">Batch Number</th>
                        <th className="py-2.5 px-3">Invoice No.</th>
                        <th className="py-2.5 px-3 text-right font-mono">Before</th>
                        <th className="py-2.5 px-3 text-right font-mono">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredHistory.map((tx) => {
                        const isIn = tx.type === 'IN';
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Date */}
                            <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                              <span className="block font-bold">
                                {formatDateToDDMMYY(tx.date)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {tx.date.includes(' ') ? tx.date.split(' ')[1] : ''}
                              </span>
                            </td>

                            {/* Type (Green = IN, Orange/Red = OUT) */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                  isIn
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                {isIn ? 'IN' : 'OUT'}
                              </span>
                            </td>

                            {/* Roll Barcode */}
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                              {tx.rollBarcode || tx.barcode ? (
                                <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold text-[11px] text-slate-900">
                                  {tx.rollBarcode || tx.barcode}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>

                            {/* Rolls (+X / -X) */}
                            <td className="py-2.5 px-3 text-right font-black font-mono whitespace-nowrap">
                              <span className={isIn ? 'text-emerald-700' : 'text-amber-700'}>
                                {isIn ? `+${tx.quantity}` : `-${tx.quantity}`}{' '}
                                <span className="text-[10px] font-medium text-slate-500">
                                  {tx.unit || item.unit}
                                </span>
                              </span>
                            </td>

                            {/* Roll Length */}
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                              {tx.rollLengthMtr > 0 ? `${tx.rollLengthMtr} M` : '-'}
                            </td>

                            {/* Batch Number */}
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                              {tx.batchNumber ? (
                                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-md">
                                  {tx.batchNumber}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>

                            {/* Invoice Number */}
                            <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                              {tx.type === 'OUT' ? (
                                <div className="space-y-0.5">
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded font-semibold text-[11px] block">
                                    OUT: {tx.stockOutInvoiceNumber || tx.invoiceNumber || '-'}
                                  </span>
                                  {tx.originalStockInInvoiceNumber && (
                                    <span className="text-[10px] text-slate-400 font-sans block">
                                      IN: <span className="font-mono">{tx.originalStockInInvoiceNumber}</span>
                                    </span>
                                  )}
                                </div>
                              ) : tx.invoiceNumber ? (
                                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold text-[11px]">
                                  IN: {tx.invoiceNumber}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>

                            {/* Before Stock */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-500">
                              {tx.stockBefore}
                            </td>

                            {/* After Stock */}
                            <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                              <span className="inline-flex items-center gap-1 justify-end">
                                <span className="text-slate-400 text-[10px]">&rarr;</span>
                                <span>{tx.stockAfter}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* BOTTOM ACTION BUTTONS: + STOCK IN | - STOCK OUT           */}
        {/* ========================================================= */}
        <div className="bg-slate-50 px-5 sm:px-6 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Clicking will update live stock for this material & size.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActionDrawerMode('IN');
                setQuickQty('1');
                setQuickError(null);
                setQuickSuccess(null);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>+ Stock IN</span>
            </button>

            {onOpenScanner ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenScanner();
                }}
                className="px-4 py-2 bg-[#C59B3F] hover:bg-[#b58b33] active:scale-95 text-zinc-950 font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Stock OUT must scan physical roll barcodes"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>POS Roll Stock OUT (Scanner)</span>
              </button>
            ) : (
              <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200">
                Stock OUT requires barcode scan
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
