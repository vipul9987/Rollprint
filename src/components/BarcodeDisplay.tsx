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
  className?: string;
  onGenerated?: (success: boolean) => void;
  sanitizedInvoice?: string;
  dateValue?: string;
}

export const BarcodeDisplay: React.FC<BarcodeProps> = ({
  value,
  format = 'CODE128',
  width = 1.8,
  height = 50,
  displayValue = true,
  fontSize = 13,
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

      JsBarcode(svgRef.current, trimmed, {
        format,
        width,
        height,
        displayValue,
        fontSize,
        font: 'monospace',
        fontOptions: 'bold',
        textMargin: 4,
        margin: 8,
        background: '#ffffff',
        lineColor: '#0A192F', // Brand Navy
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
  }, [value, format, width, height, displayValue, fontSize, sanitizedInvoice, dateValue, onGenerated]);

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
    <div className={`flex flex-col items-center justify-center bg-white p-3 rounded-xl border border-slate-200 shadow-xs ${className}`}>
      <svg ref={svgRef} className="max-w-full h-auto" />
      {isRendered && (
        <div className="mt-1 flex items-center space-x-1.5 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>CODE128 Generated &bull; Ready to Save &amp; Print</span>
        </div>
      )}
    </div>
  );
};
