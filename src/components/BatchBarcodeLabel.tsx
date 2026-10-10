import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X, Plus, Minus, CheckCircle2 } from 'lucide-react';
import { MatrixBatch } from '../types/inventory';

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
  // Batch number is the sole barcode value and human-readable text
  const batchCode = (batch.batchNumber || batch.barcodeValue || '').trim();
  const defaultCopies = Math.max(1, rollCopies);
  const [copiesCount, setCopiesCount] = useState<number>(defaultCopies);

  const barcodeCanvasRefs = useRef<(SVGSVGElement | null)[]>([]);

  // Sync if rollCopies prop changes
  useEffect(() => {
    setCopiesCount(Math.max(1, rollCopies));
  }, [rollCopies]);

  const copiesArray = Array.from({ length: Math.max(1, copiesCount) }, (_, idx) => idx + 1);

  // Render CODE128 barcode onto each SVG ref
  useEffect(() => {
    if (!batchCode) return;

    copiesArray.forEach((_, idx) => {
      const svgEl = barcodeCanvasRefs.current[idx];
      if (svgEl) {
        try {
          while (svgEl.firstChild) {
            svgEl.removeChild(svgEl.firstChild);
          }
          JsBarcode(svgEl, batchCode, {
            format: 'CODE128',
            width: 2,
            height: 50,
            displayValue: true,
            font: 'monospace',
            fontOptions: 'bold',
            fontSize: 15,
            textMargin: 5,
            margin: 10,
            background: '#ffffff',
            lineColor: '#000000',
            text: batchCode
          });
        } catch (err) {
          console.error('JsBarcode label generation error:', err);
        }
      }
    });
  }, [batchCode, copiesCount]);

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
                Batch Roll Stickers
              </span>
              <span className="font-mono text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full">
                {batchCode}
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
            {/* Primary Action: Print All Labels for batch quantity */}
            <button
              type="button"
              onClick={handlePrintAll}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-md transition-all active:scale-98 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>
                Print {defaultCopies} {defaultCopies === 1 ? 'Label' : 'Labels'} (All {defaultCopies} Rolls)
              </span>
            </button>

            {/* Test / Sample Action: Print 1 Label */}
            <button
              type="button"
              onClick={handlePrintOne}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Print 1 Label (Test / Sample)</span>
            </button>

            {/* Custom Print Button if user customized the copiesCount */}
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

            {/* Quick preset chips */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setCopiesCount(1)}
                className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                  copiesCount === 1 ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                1
              </button>
              {defaultCopies > 1 && (
                <button
                  type="button"
                  onClick={() => setCopiesCount(defaultCopies)}
                  className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                    copiesCount === defaultCopies
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {defaultCopies}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Informational reassurance banner regarding minimal physical label */}
        <div className="flex items-center space-x-2 text-[11px] text-slate-300 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Minimal Roll Sticker:</strong> Physical printed labels contain <strong>ONLY</strong> the genuine CODE128 barcode and the batch number (<span className="font-mono text-amber-300">{batchCode}</span>). No material name, size, roll length, or invoice text is printed on the physical labels.
          </span>
        </div>
      </div>

      {/* Printable Labels Grid: Clean, compact roll stickers */}
      <div className="batch-sticker-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2 bg-slate-100 rounded-2xl border border-slate-200 print:bg-white print:border-none print:p-0 print:grid print:grid-cols-3 print:gap-3">
        {copiesArray.map((copyNum, idx) => (
          <div
            key={copyNum}
            className="batch-barcode-sticker bg-white border border-slate-300 rounded-lg p-2.5 flex flex-col items-center justify-center shadow-xs print:shadow-none print:border print:border-black/30 print:rounded-xs print:p-1.5 print:break-inside-avoid print:page-break-inside-avoid select-none"
            style={{ minWidth: '200px' }}
          >
            {/* ONLY the genuine CODE128 barcode with Batch Number centered below */}
            <svg
              ref={(el) => {
                barcodeCanvasRefs.current[idx] = el;
              }}
              className="max-w-full h-auto block mx-auto"
            />
          </div>
        ))}
      </div>
    </div>
  );
};
