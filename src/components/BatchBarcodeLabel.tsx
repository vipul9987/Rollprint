import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X, Plus, Minus, CheckCircle2 } from 'lucide-react';
import { MatrixBatch } from '../types/inventory';
import { getStoredInventoryRolls, generateRollBarcode } from '../data/rollDatabase';

interface BatchBarcodeLabelProps {
  batch: MatrixBatch;
  rollCopies?: number; // How many roll copies received (e.g. 10 rolls = 10 labels)
  onClose?: () => void;
}

export const BatchBarcodeLabel: React.FC<BatchBarcodeLabelProps> = ({
  batch,
  rollCopies = 1,
  onClose
}) => {
  const batchCode = (batch.batchNumber || batch.barcodeValue || '').trim();
  const defaultCopies = Math.max(1, rollCopies);
  const [copiesCount, setCopiesCount] = useState<number>(defaultCopies);

  const barcodeCanvasRefs = useRef<(SVGSVGElement | null)[]>([]);

  // Sync if rollCopies prop changes
  useEffect(() => {
    setCopiesCount(Math.max(1, rollCopies));
  }, [rollCopies]);

  // Retrieve actual physical rolls for this batch
  const existingRolls = getStoredInventoryRolls().filter(
    (r) => r.batchNumber.toUpperCase() === batchCode.toUpperCase()
  );

  const copiesArray = Array.from({ length: Math.max(1, copiesCount) }, (_, idx) => {
    const rollIndex = idx + 1;
    const existingRoll = existingRolls[idx];
    const uniqueRollBarcode = existingRoll
      ? existingRoll.rollBarcode
      : generateRollBarcode(batchCode, rollIndex);

    return {
      copyNum: rollIndex,
      rollBarcode: uniqueRollBarcode
    };
  });

  // Render CODE128 barcode onto each SVG ref
  // CRITICAL RULE: Every physical roll has its OWN unique barcode!
  useEffect(() => {
    if (!batchCode) return;

    copiesArray.forEach((item, idx) => {
      const svgEl = barcodeCanvasRefs.current[idx];
      if (svgEl) {
        try {
          while (svgEl.firstChild) {
            svgEl.removeChild(svgEl.firstChild);
          }
          JsBarcode(svgEl, item.rollBarcode, {
            format: 'CODE128',
            width: 1,
            height: 22,
            margin: 2,
            displayValue: true,
            text: item.rollBarcode,
            fontSize: 8.5,
            textMargin: 1,
            background: '#ffffff',
            lineColor: '#000000',
            font: 'monospace',
            fontOptions: 'bold'
          });
        } catch (err) {
          console.error('JsBarcode roll label generation error:', err);
        }
      }
    });
  }, [batchCode, copiesCount, copiesArray.map((c) => c.rollBarcode).join(',')]);

  // Print all roll copies in batch (e.g. 10 labels for 10 rolls)
  const handlePrintAll = () => {
    setCopiesCount(defaultCopies);
    setTimeout(() => {
      window.print();
    }, 60);
  };

  // Print 1 label for testing / single roll reprinting
  const handlePrintOne = () => {
    setCopiesCount(1);
    setTimeout(() => {
      window.print();
    }, 60);
  };

  // Print current selected copies
  const handlePrintCurrent = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Control bar & print actions (strictly hidden during actual print) */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg print:hidden space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                Individual Roll Barcode Stickers
              </span>
              <span className="font-mono text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full">
                Batch: {batchCode}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {batch.materialName} &bull; {batch.variantSize}M &times; {batch.rollLengthMtr}M &bull; Inv: {batch.invoiceNumber}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons: Print All (e.g. 10 Labels) & Print 1 Label (Testing) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintAll}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-md transition-all active:scale-98 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>
                Print {defaultCopies} Unique {defaultCopies === 1 ? 'Label' : 'Labels'} (All {defaultCopies} Rolls)
              </span>
            </button>

            <button
              type="button"
              onClick={handlePrintOne}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Print Roll 1 Label (Sample)</span>
            </button>

            {copiesCount !== defaultCopies && copiesCount !== 1 && (
              <button
                type="button"
                onClick={handlePrintCurrent}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print {copiesCount} Labels</span>
              </button>
            )}
          </div>

          {/* Stepper to adjust copies if required */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 font-medium">Copies:</span>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setCopiesCount((c) => Math.max(1, c - 1))}
                className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                title="Decrease"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="px-3 py-1 font-mono font-bold text-white text-xs min-w-[2.5rem] text-center">
                {copiesCount}
              </span>
              <button
                type="button"
                onClick={() => setCopiesCount((c) => c + 1)}
                className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                title="Increase"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Informational reassurance banner regarding minimal physical label */}
        <div className="flex items-center space-x-2 text-[11px] text-slate-300 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Unique Physical Roll Barcodes (46 &times; 11 mm Standard):</strong> Every physical roll in this batch receives its <strong>OWN UNIQUE BARCODE</strong>. One barcode never represents multiple rolls.
          </span>
        </div>
      </div>

      {/* Printable Labels Grid: Clean 46mm × 11mm roll stickers */}
      <div className="batch-sticker-grid flex flex-wrap items-center justify-center gap-3 p-4 bg-slate-100 rounded-2xl border border-slate-200 overflow-x-auto print:bg-white print:border-none print:p-0">
        {copiesArray.map((item, idx) => (
          <div
            key={item.copyNum}
            className="batch-barcode-sticker bg-white border border-slate-300 rounded-xs flex flex-col items-center justify-center shadow-xs select-none"
            style={{
              width: '46mm',
              height: '11mm',
              minWidth: '46mm',
              maxWidth: '46mm',
              minHeight: '11mm',
              maxHeight: '11mm',
              padding: '0.5mm 1mm',
              boxSizing: 'border-box',
              overflow: 'hidden',
              backgroundColor: '#ffffff'
            }}
          >
            {/* ONLY the genuine CODE128 barcode with unique Roll Barcode centered below */}
            <svg
              ref={(el) => {
                barcodeCanvasRefs.current[idx] = el;
              }}
              style={{
                display: 'block',
                maxWidth: '44mm',
                maxHeight: '10mm',
                width: 'auto',
                height: 'auto',
                backgroundColor: '#ffffff'
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
