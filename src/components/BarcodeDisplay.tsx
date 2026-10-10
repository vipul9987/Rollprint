import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface BarcodeProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  textMargin?: number;
  margin?: number;
  className?: string;
  onGenerated?: (success: boolean) => void;
  sanitizedInvoice?: string;
  dateValue?: string;
}

export const BarcodeDisplay: React.FC<BarcodeProps> = ({
  value,
  format = 'CODE128',
  width = 2,
  height = 70,
  displayValue = true,
  fontSize = 18,
  textMargin = 6,
  margin = 12,
  className = '',
  onGenerated,
  sanitizedInvoice,
  dateValue
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendered, setIsRendered] = useState<boolean>(false);

  useEffect(() => {
    const trimmed = (value || '').trim();

    if (!trimmed) {
      setError(null);
      setIsRendered(false);
      onGenerated?.(false);
      return;
    }

    if (!svgRef.current) {
      return;
    }

    try {
      // Clear previous SVG children to avoid artifacts
      while (svgRef.current.firstChild) {
        svgRef.current.removeChild(svgRef.current.firstChild);
      }

      // CODE128 encodes ONLY the Batch Number (e.g. 121026AB12345)
      const batchCode = trimmed;

      JsBarcode(svgRef.current, batchCode, {
        format,
        width,
        height,
        displayValue,
        fontSize,
        font: 'monospace',
        fontOptions: 'bold',
        textMargin,
        margin,
        background: '#ffffff',
        lineColor: '#000000',
        text: batchCode
      });

      setError(null);
      setIsRendered(true);
      onGenerated?.(true);
    } catch (err: any) {
      const errorMsg = err?.message || 'Barcode could not be generated.';
      console.error('Barcode Generation Error:', {
        barcodeValue: trimmed,
        sanitizedInvoice: sanitizedInvoice || 'N/A',
        dateValue: dateValue || 'N/A',
        exception: err
      });
      setError(errorMsg);
      setIsRendered(false);
      onGenerated?.(false);
    }
  }, [value, format, width, height, displayValue, fontSize, textMargin, margin, sanitizedInvoice, dateValue, onGenerated]);

  if (!value || !value.trim()) {
    return (
      <div className={`p-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500 font-medium ${className}`}>
        Enter Invoice Number &amp; Date to generate Batch Barcode
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-3 bg-red-50 border border-red-200 rounded-xl text-center text-xs text-red-700 font-bold space-y-1 ${className}`}>
        <div className="flex items-center justify-center space-x-1.5 text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>Barcode could not be generated.</span>
        </div>
        <p className="font-mono text-[11px] text-red-600 font-normal">Value: {value}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs overflow-x-auto ${className}`}>
      {/* SVG rendered at natural aspect ratio without horizontal stretching */}
      <svg
        ref={svgRef}
        style={{
          display: 'block',
          maxWidth: 'none',
          height: 'auto',
          backgroundColor: '#ffffff'
        }}
      />
      {isRendered && (
        <div className="mt-2 flex items-center space-x-1.5 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>CODE128 Batch Barcode &bull; Ready to Save &amp; Print</span>
        </div>
      )}
    </div>
  );
};
