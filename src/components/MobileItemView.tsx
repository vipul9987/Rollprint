import React, { useState } from 'react';
import { ArrowLeft, Plus, Minus, CheckCircle, AlertCircle } from 'lucide-react';
import { MatrixItemWithStock } from '../types/inventory';

interface MobileItemViewProps {
  item: MatrixItemWithStock;
  onStockChange: (itemId: string, type: 'IN' | 'OUT', quantity: number) => void;
  onBackToDashboard?: () => void;
  isModal?: boolean;
  onClose?: () => void;
}

export const MobileItemView: React.FC<MobileItemViewProps> = ({
  item,
  onStockChange,
  onBackToDashboard,
  isModal = false,
  onClose
}) => {
  const [mode, setMode] = useState<'VIEW' | 'IN' | 'OUT'>('VIEW');
  const [rollInput, setRollInput] = useState<string>('1');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const current = item.currentStock;
  const inputQty = parseInt(rollInput, 10) || 0;

  const width = parseFloat(item.variantSize) || 1.0;
  const length = item.rollLengthMtr || 70;
  const areaPerRoll = Number((width * length).toFixed(2));

  const afterStock = mode === 'IN' ? current + inputQty : Math.max(0, current - inputQty);
  const deltaArea = Number((inputQty * areaPerRoll).toFixed(2));
  const afterArea = Number((afterStock * areaPerRoll).toFixed(2));
  const isOutExceeded = mode === 'OUT' && inputQty > current;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (inputQty <= 0) {
      setErrorMsg('Please enter at least 1 roll.');
      return;
    }

    if (mode === 'OUT' && inputQty > current) {
      setErrorMsg(`Cannot remove ${inputQty} rolls. Only ${current} available.`);
      return;
    }

    onStockChange(item.id, mode === 'IN' ? 'IN' : 'OUT', inputQty);

    const actionText = mode === 'IN' ? `Added +${inputQty} rolls (+${deltaArea} m²)` : `Removed -${inputQty} rolls (-${deltaArea} m²)`;
    setSuccessMsg(`${actionText}! New balance: ${afterStock} Rolls (${afterArea} m²)`);
    setRollInput('1');
    setMode('VIEW');

    setTimeout(() => {
      setSuccessMsg(null);
    }, 4500);
  };

  return (
    <div className={`${isModal ? 'p-1' : 'min-h-screen bg-slate-100 p-4 sm:p-6'} flex flex-col justify-center items-center font-sans`}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {onBackToDashboard && !isModal && (
              <button
                onClick={onBackToDashboard}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Go to Full Dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                {item.category}
              </span>
              <span className="font-extrabold text-sm tracking-wide text-white">
                Roll Inventory Card
              </span>
            </div>
          </div>
          {isModal && onClose ? (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white font-bold text-sm px-2 py-1 rounded-md"
            >
              Close
            </button>
          ) : (
            onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 underline"
              >
                Dashboard
              </button>
            )
          )}
        </div>

        {/* Item Info Header */}
        <div className="p-6 text-center border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white space-y-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {item.materialName}
          </h1>

          <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold text-indigo-700">
            <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-full">
              Width: {item.variantSize} M
            </span>
            <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-full">
              Length: {item.rollLengthMtr || 70} M
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Area per roll: {item.variantSize} × {item.rollLengthMtr || 70} = <strong className="text-slate-700">{areaPerRoll} m²</strong>
          </div>

          {/* Current Stock Banner */}
          <div className="mt-4 p-5 bg-slate-900 rounded-2xl text-white shadow-inner">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Current In-Hand Rolls
            </span>
            <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono">
              {current}{' '}
              <span className="text-lg font-bold text-slate-400 tracking-normal">
                ROLLS
              </span>
            </div>
            <span className="text-xs text-indigo-300 font-mono block mt-1">
              Total Area: {Number((current * areaPerRoll).toFixed(2))} m²
            </span>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-900 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="p-6">
          {mode === 'VIEW' ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('IN');
                  setRollInput('1');
                  setErrorMsg(null);
                }}
                className="py-4 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-2xl shadow-md transition-all flex flex-col items-center justify-center space-y-1"
              >
                <Plus className="w-6 h-6 stroke-[3]" />
                <span className="text-sm font-black tracking-wide">+ STOCK IN</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('OUT');
                  setRollInput('1');
                  setErrorMsg(null);
                }}
                disabled={current <= 0}
                className="py-4 px-4 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white font-bold rounded-2xl shadow-md transition-all flex flex-col items-center justify-center space-y-1"
              >
                <Minus className="w-6 h-6 stroke-[3]" />
                <span className="text-sm font-black tracking-wide">- STOCK OUT</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div
                className={`p-3 rounded-xl border text-center font-bold text-xs ${
                  mode === 'IN'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                {mode === 'IN' ? 'Stock IN — Adding Full Rolls' : 'Stock OUT — Material Consumption'}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 text-center">
                  Number of Full Rolls
                </label>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(1, inputQty - 1);
                      setRollInput(val.toString());
                    }}
                    className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xl flex items-center justify-center"
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    autoFocus
                    required
                    value={rollInput}
                    onChange={(e) => setRollInput(e.target.value)}
                    className="w-28 py-2.5 text-center font-mono font-black text-2xl text-slate-900 bg-slate-50 border-2 border-slate-300 rounded-xl focus:outline-hidden focus:border-indigo-600"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const val = inputQty + 1;
                      setRollInput(val.toString());
                    }}
                    className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xl flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Dynamic Preview including Area */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-sans">Current Rolls</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {current} Rolls
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-sans">After Transaction</span>
                    <span
                      className={`font-black text-sm ${
                        isOutExceeded
                          ? 'text-red-600'
                          : mode === 'IN'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {afterStock} Rolls
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 text-center text-[11px] font-mono text-slate-600">
                  {mode === 'IN' ? 'Area Added: ' : 'Area Removed: '}
                  <strong className={mode === 'IN' ? 'text-emerald-700' : 'text-amber-700'}>
                    {inputQty} × {areaPerRoll} = {deltaArea} m²
                  </strong>
                </div>
              </div>

              {isOutExceeded && (
                <p className="text-xs text-red-600 font-bold text-center">
                  Cannot remove {inputQty} rolls. Only {current} available.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('VIEW');
                    setErrorMsg(null);
                  }}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isOutExceeded || inputQty <= 0}
                  className={`py-3 px-4 text-white font-bold rounded-xl text-xs shadow-md transition-colors disabled:opacity-40 ${
                    mode === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  Confirm {mode === 'IN' ? 'Stock IN' : 'Stock OUT'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 font-medium">
            Barcode: <span className="font-mono font-bold text-slate-700">{item.barcode}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
