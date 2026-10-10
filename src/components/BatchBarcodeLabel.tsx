import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';
import { MatrixBatch } from '../types/inventory';

interface BatchBarcodeLabelProps {
  batch: MatrixBatch;
  rollCopies?: number; // How many roll copies to print (e.g. 10 rolls = 10 labels)
  onClose?: () => void;
}

export const BatchBarcodeLabel: React.FC<BatchBarcodeLabelProps> = ({
  batch,
  rollCopies = 1,
  onClose
}) => {
  const barcodeCanvasRefs = useRef<(SVGSVGElement | null)[]>([]);

  // Copies array
  const copiesCount = Math.max(1, rollCopies);
  const copiesArray = Array.from({ length: copiesCount }, (_, idx) => idx + 1);

  useEffect(() => {
    copiesArray.forEach((_, idx) => {
      const svgEl = barcodeCanvasRefs.current[idx];
      if (svgEl && batch.barcodeValue) {
        try {
          JsBarcode(svgEl, batch.barcodeValue, {
            format: 'CODE128',
            width: 1.8,
            height: 52,
            displayValue: true,
            fontSize: 14,
            font: 'monospace',
            fontOptions: 'bold',
            textMargin: 3,
            margin: 6,
            background: '#ffffff',
            lineColor: '#000000'
          });
        } catch (err) {
          console.warn('JsBarcode render error:', err);
        }
      }
    });
  }, [batch, copiesCount]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Control bar (hidden during print) */}
      <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-xl print:hidden">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Batch Barcode Label Ready
          </span>
          <p className="text-[11px] text-slate-300">
            {batch.materialName} &bull; Batch: <span className="font-mono font-bold text-white">{batch.batchNumber}</span> &bull; {copiesCount} {copiesCount === 1 ? 'Roll Label' : 'Roll Labels (1 per roll)'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print {copiesCount} {copiesCount === 1 ? 'Label' : 'Labels'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Printable Labels Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print:grid print:grid-cols-2 print:gap-4 print:p-0">
        {copiesArray.map((copyNum, idx) => (
          <div
            key={copyNum}
            className="bg-white border-2 border-slate-900 rounded-xl p-4 flex flex-col justify-between shadow-xs print:shadow-none print:border-2 print:border-black print:rounded-lg print:break-inside-avoid print:page-break-inside-avoid text-slate-950 font-sans"
            style={{ minHeight: '260px' }}
          >
            {/* Header: Material Name + Category */}
            <div className="border-b-2 border-slate-900 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                  {batch.category || 'ROLL INVENTORY'}
                </span>
                <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300">
                  ROLL #{copyNum} / {copiesCount}
                </span>
              </div>
              <h2 className="text-base font-black tracking-tight text-slate-950 leading-tight mt-0.5 uppercase">
                {batch.materialName}
              </h2>
            </div>

            {/* Spec Grid: Size, Length, Invoice, Date */}
            <div className="grid grid-cols-2 gap-2 py-2 text-xs border-b border-slate-200 font-mono">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans block font-bold">
                  Size / Width
                </span>
                <span className="font-black text-sm text-slate-950">
                  {batch.variantSize} M
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans block font-bold">
                  Roll Length
                </span>
                <span className="font-black text-sm text-slate-950">
                  {batch.rollLengthMtr} M
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans block font-bold">
                  Invoice Number
                </span>
                <span className="font-bold text-xs text-slate-900 break-all">
                  {batch.invoiceNumber}
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans block font-bold">
                  Date
                </span>
                <span className="font-bold text-xs text-slate-900">
                  {batch.stockInDate}
                </span>
              </div>
            </div>

            {/* Batch Number & Linear Barcode (Code128) + QR Backup */}
            <div className="pt-2 flex flex-col items-center justify-center text-center">
              <div className="w-full flex items-center justify-between px-1">
                <div className="text-left font-mono">
                  <span className="text-[9px] uppercase font-sans font-bold text-slate-500 block">
                    Batch Number
                  </span>
                  <span className="text-sm font-black text-slate-950 tracking-wider">
                    {batch.batchNumber}
                  </span>
                </div>
                <div className="print:hidden">
                  <QRCodeSVG
                    value={batch.barcodeValue}
                    size={38}
                    level="M"
                    fgColor="#000000"
                    bgColor="#ffffff"
                  />
                </div>
              </div>

              {/* Code128 Barcode for standard scanners */}
              <div className="w-full flex items-center justify-center overflow-hidden my-1">
                <svg
                  ref={(el) => {
                    barcodeCanvasRefs.current[idx] = el;
                  }}
                  className="max-w-full h-auto"
                />
              </div>

              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                All {copiesCount} rolls in batch share barcode: {batch.barcodeValue}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
