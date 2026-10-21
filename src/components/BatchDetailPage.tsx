import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Layers,
  ArrowUpFromLine,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Plus,
  Minus,
  Sparkles,
  Barcode,
  ExternalLink,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { MatrixBatch, MatrixItemWithStock } from '../types/inventory';
import { queryBatchFromDatabase, executeStockOutTransaction, extractBatchCode } from '../data/batchDatabase';
import { AppLogo } from './AppLogo';

interface BatchDetailPageProps {
  batchNumber: string;
  onNavigateHome?: () => void;
  onNavigateToScanner?: () => void;
  onStockUpdated?: () => void;
}

export const BatchDetailPage: React.FC<BatchDetailPageProps> = ({
  batchNumber: rawBatchNumber,
  onNavigateHome,
  onNavigateToScanner,
  onStockUpdated
}) => {
  const batchCode = extractBatchCode(rawBatchNumber);

  const [loading, setLoading] = useState<boolean>(true);
  const [batch, setBatch] = useState<MatrixBatch | null>(null);
  const [item, setItem] = useState<MatrixItemWithStock | null>(null);
  const [liveStock, setLiveStock] = useState<number>(0);
  const [overallItemStock, setOverallItemStock] = useState<number>(0);
  const [notFound, setNotFound] = useState<boolean>(false);

  // Selected item line inside multi-item batch
  const [selectedBatchItemId, setSelectedBatchItemId] = useState<string>('');

  // Stock OUT state
  const [isStockOutOpen, setIsStockOutOpen] = useState<boolean>(false);
  const [rollsOut, setRollsOut] = useState<number>(1);
  const [stockOutSubmitting, setStockOutSubmitting] = useState<boolean>(false);
  const [stockOutError, setStockOutError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Load batch details from database
  const loadBatchData = useCallback(async () => {
    if (!batchCode) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setStockOutError('');

    try {
      const result = await queryBatchFromDatabase(batchCode);
      if (result) {
        setBatch(result.batch);
        setItem(result.item);
        setLiveStock(result.liveBatchStock);
        setOverallItemStock(result.overallItemStock);
        setNotFound(false);

        // Auto-select first available item line
        const items = result.batch.items || [];
        const firstAvailable = items.find((it) => it.remainingRollQuantity > 0) || items[0];
        if (firstAvailable) {
          setSelectedBatchItemId(firstAvailable.id);
          setRollsOut(Math.min(1, Math.max(1, firstAvailable.remainingRollQuantity)));
        } else {
          setRollsOut(1);
        }
      } else {
        setBatch(null);
        setItem(null);
        setNotFound(true);
      }
    } catch (err) {
      console.error('Failed to query batch database:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [batchCode]);

  useEffect(() => {
    loadBatchData();
  }, [loadBatchData]);

  // Derived selected item line
  const itemsList = batch?.items && batch.items.length > 0
    ? batch.items
    : (batch ? [
        {
          id: `item-${batch.id}`,
          batchId: batch.id,
          materialNameSnapshot: batch.materialName || 'Material',
          categorySnapshot: batch.category || 'Roll Material',
          width: batch.variantSize || '1.02',
          rollLength: batch.rollLengthMtr || 0,
          initialRollQuantity: batch.initialRollQuantity || 1,
          remainingRollQuantity: batch.currentRemainingRollQuantity || 0,
          areaM2: Number(((parseFloat(batch.variantSize || '1.02') || 1) * (batch.rollLengthMtr || 0) * (batch.initialRollQuantity || 1)).toFixed(2)),
          createdAt: batch.createdAt
        }
      ] : []);

  const selectedItem = itemsList.find((it) => it.id === selectedBatchItemId) || itemsList[0];
  const targetStock = selectedItem ? selectedItem.remainingRollQuantity : liveStock;
  const afterStock = Math.max(0, targetStock - rollsOut);

  // Handle Stock OUT confirmation
  const handleConfirmStockOut = async () => {
    if (!batch) return;

    if (rollsOut <= 0) {
      setStockOutError('Please select at least 1 roll to stock out.');
      return;
    }

    if (rollsOut > targetStock) {
      setStockOutError(`Cannot stock out ${rollsOut} rolls. Only ${targetStock} rolls available for this item.`);
      return;
    }

    setStockOutSubmitting(true);
    setStockOutError('');

    try {
      const response = await executeStockOutTransaction(batch.batchNumber, rollsOut, selectedItem?.id);

      if (response.success && response.updatedBatch) {
        setBatch(response.updatedBatch);
        const newTotal = response.updatedBatch.currentRemainingRollQuantity ?? (liveStock - rollsOut);
        setLiveStock(newTotal);
        const itemName = selectedItem ? selectedItem.materialNameSnapshot : batch.materialName;
        setSuccessMessage(`Stock OUT Confirmed! -${rollsOut} ${rollsOut === 1 ? 'Roll' : 'Rolls'} dispatched for ${itemName}.`);
        setIsStockOutOpen(false);

        // Notify parent to refresh background state if mounted
        onStockUpdated?.();

        // Refresh latest database status
        await loadBatchData();

        setTimeout(() => {
          setSuccessMessage('');
        }, 5000);
      } else {
        setStockOutError(response.error || 'Failed to confirm Stock OUT.');
      }
    } catch (err: any) {
      setStockOutError(err?.message || 'Database error processing Stock OUT.');
    } finally {
      setStockOutSubmitting(false);
    }
  };

  const handleGoHome = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/';
    }
  };

  // 1. Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 select-none">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mb-4 animate-pulse">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
        </div>
        <h2 className="text-xl font-black text-white tracking-wide">Querying Central Database</h2>
        <p className="font-mono text-xs text-amber-400 mt-2 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
          Batch: {batchCode || 'Unknown'}
        </p>
        <p className="text-xs text-slate-400 mt-3 text-center max-w-xs">
          Connecting to inventory database to retrieve live roll stock...
        </p>
      </div>
    );
  }

  // 2. Invalid Batch State
  if (notFound || !batch) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800/90 border border-red-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-md text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto shadow-inner">
            <AlertCircle className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Batch not found.</h1>
            <p className="text-sm text-slate-300">
              The batch code <span className="font-mono font-bold text-amber-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">{batchCode || rawBatchNumber}</span> does not exist in the central database.
            </p>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-700/60 text-xs text-slate-400 text-left space-y-1.5">
            <div className="flex items-center text-slate-300 font-semibold space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Database Query Verification</span>
            </div>
            <p>
              Scanned URL: <span className="font-mono text-[11px] text-slate-300 break-all">{window.location.href}</span>
            </p>
            <p className="text-[11px] text-slate-400">
              Please verify that this roll has been received via Stock IN and that the batch sticker belongs to RollPrint IMS.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleGoHome}
              className="w-full sm:w-auto px-5 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-sm transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to Inventory Dashboard</span>
            </button>
            {onNavigateToScanner && (
              <button
                type="button"
                onClick={onNavigateToScanner}
                className="w-full sm:w-auto px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-sm transition-all active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
              >
                <Barcode className="w-4 h-4 text-amber-400" />
                <span>Scan Another Barcode</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Live Batch Found State
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AppLogo className="h-8 w-auto" />
          <div className="hidden sm:block">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">RollPrint Live</div>
            <div className="text-xs font-semibold text-slate-300">Central Inventory Database</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoHome}
          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 active:scale-98 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
          <span>Dashboard</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Success Alert Banner */}
        {successMessage && (
          <div className="p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl text-emerald-300 flex items-start space-x-3 shadow-lg animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <span className="font-bold text-sm text-emerald-200">Transaction Confirmed</span>
              <p>{successMessage}</p>
            </div>
          </div>
        )}

        {/* Primary Batch Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-0">
          {/* Card Title Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h1 className="text-xs font-black uppercase tracking-widest text-amber-400">BATCH DETAILS</h1>
            </div>
            <span className="font-mono text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full">
              LIVE DATABASE
            </span>
          </div>

          <div className="p-6 space-y-5">
            {/* Top Batch Info: Batch Number, Invoice, Date, Total Rolls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Batch Number
                </span>
                <div className="font-mono text-sm font-black text-amber-400 truncate" title={batch.batchNumber}>
                  {batch.batchNumber}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Invoice
                </span>
                <div className="font-mono text-sm font-black text-slate-200 truncate" title={batch.invoiceNumber}>
                  {batch.invoiceNumber}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Date
                </span>
                <div className="font-mono text-sm font-bold text-slate-200">
                  {batch.stockInDate || '—'}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Available Rolls
                </span>
                <div className="font-mono text-base font-black text-emerald-400">
                  {liveStock} Rolls
                </div>
              </div>
            </div>

            {/* ITEMS IN THIS BATCH (Table as per Client Specification) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  ITEMS IN THIS BATCH ({itemsList.length} Lines)
                </span>
                <span className="text-[11px] text-slate-400">
                  Select an item line below to Stock OUT
                </span>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 shadow-inner">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">Material</th>
                        <th className="py-2.5 px-3">Size</th>
                        <th className="py-2.5 px-3">Length</th>
                        <th className="py-2.5 px-3 text-right">Available</th>
                        <th className="py-2.5 px-3">Barcode</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {itemsList.map((line) => {
                        const isSelected = selectedBatchItemId === line.id;
                        const isDepleted = line.remainingRollQuantity <= 0;

                        return (
                          <tr
                            key={line.id}
                            onClick={() => {
                              if (!isDepleted) {
                                setSelectedBatchItemId(line.id);
                                setRollsOut(1);
                                setIsStockOutOpen(true);
                              }
                            }}
                            className={`transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-amber-400/10 font-bold'
                                : isDepleted
                                ? 'opacity-40 bg-slate-900/40 cursor-not-allowed'
                                : 'hover:bg-slate-800/40 text-slate-300'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                              <div className="font-bold">{line.materialNameSnapshot}</div>
                              {line.categorySnapshot && (
                                <div className="text-[10px] text-slate-500 font-sans">{line.categorySnapshot}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">{line.width}M</td>
                            <td className="py-2.5 px-3 text-slate-300">{line.rollLength}M</td>
                            <td className="py-2.5 px-3 text-right font-black">
                              <span
                                className={`px-2 py-0.5 rounded ${
                                  line.remainingRollQuantity > 0
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {line.remainingRollQuantity} {line.remainingRollQuantity === 1 ? 'Roll' : 'Rolls'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-amber-400 font-bold text-[11px]">
                              {batch.batchNumber}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                disabled={isDepleted}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isDepleted) {
                                    setSelectedBatchItemId(line.id);
                                    setRollsOut(1);
                                    setIsStockOutOpen(true);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-sans font-bold transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                                    : isDepleted
                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                    : 'bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-slate-300'
                                }`}
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Primary Stock OUT Trigger Button */}
            {!isStockOutOpen && (
              <div>
                {targetStock > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToScanner) {
                        onNavigateToScanner();
                      } else {
                        window.location.href = '/?tab=stock-out';
                      }
                    }}
                    className="w-full py-3.5 bg-[#C59B3F] hover:bg-[#b58b33] text-zinc-950 rounded-2xl font-black text-sm tracking-wide flex items-center justify-center space-x-2 shadow-lg transition-all active:scale-98 cursor-pointer"
                  >
                    <ArrowUpFromLine className="w-4 h-4 stroke-[2.5]" />
                    <span>POS STOCK OUT: SCAN PHYSICAL ROLLS</span>
                  </button>
                ) : (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-center text-xs text-red-300 font-bold">
                    This item is fully consumed (0 Rolls remaining).
                  </div>
                )}
              </div>
            )}

            {/* Stock OUT Workflow Panel */}
            {isStockOutOpen && selectedItem && (
              <div className="bg-slate-950/90 border-2 border-amber-400/50 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                        Stock OUT &bull; {selectedItem.materialNameSnapshot}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Size: <strong className="text-slate-200">{selectedItem.width}M</strong> &bull; Length: <strong className="text-slate-200">{selectedItem.rollLength}M</strong> &bull; Available: <strong className="text-emerald-400">{targetStock} Rolls</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsStockOutOpen(false)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {stockOutError && (
                  <div className="p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{stockOutError}</span>
                  </div>
                )}

                {/* Rolls OUT Input / Stepper */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    Rolls OUT
                  </label>
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded-2xl p-1.5">
                    <button
                      type="button"
                      onClick={() => setRollsOut((r) => Math.max(1, r - 1))}
                      disabled={rollsOut <= 1}
                      className="w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded-xl transition-colors cursor-pointer"
                    >
                      <Minus className="w-5 h-5" />
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={targetStock}
                      value={rollsOut}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setRollsOut(Math.min(targetStock, Math.max(1, val)));
                        }
                      }}
                      className="flex-1 bg-transparent text-center font-mono font-black text-2xl text-white outline-none focus:ring-0"
                    />

                    <button
                      type="button"
                      onClick={() => setRollsOut((r) => Math.min(targetStock, r + 1))}
                      disabled={rollsOut >= targetStock}
                      className="w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded-xl transition-colors cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Before / After Calculation Display */}
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 font-mono">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-sans">
                      Before:
                    </span>
                    <div className="text-base font-black text-slate-200">
                      {targetStock} Rolls
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block font-sans">
                      After:
                    </span>
                    <div className="text-base font-black text-emerald-400">
                      {afterStock} Rolls
                    </div>
                  </div>
                </div>

                {/* Confirm Stock OUT Button */}
                <button
                  type="button"
                  onClick={handleConfirmStockOut}
                  disabled={stockOutSubmitting || rollsOut <= 0 || rollsOut > targetStock}
                  className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 rounded-xl font-black text-sm tracking-wide flex items-center justify-center space-x-2 shadow-lg transition-all active:scale-98 cursor-pointer"
                >
                  {stockOutSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>CONFIRM STOCK OUT (-{rollsOut} {rollsOut === 1 ? 'Roll' : 'Rolls'})</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Footer Links */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-2 py-1">
          <button
            type="button"
            onClick={loadBatchData}
            className="flex items-center space-x-1.5 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Requery Live Stock</span>
          </button>

          <button
            type="button"
            onClick={handleGoHome}
            className="flex items-center space-x-1.5 hover:text-white transition-colors cursor-pointer"
          >
            <span>Open RollPrint</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="p-4 text-center text-[11px] text-slate-400 border-t border-slate-900 bg-slate-950">
        RollPrint &bull; Decora Sales Inventory &bull; Batch Verification System
      </footer>
    </div>
  );
};
