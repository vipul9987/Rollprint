import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}

export const BarcodeDisplay: React.FC<BarcodeProps> = ({
  value,
  format = 'CODE128',
  width = 1.6,
  height = 45,
  displayValue = true,
  fontSize = 12,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          fontSize,
          font: 'monospace',
          textMargin: 3,
          margin: 8,
          background: '#ffffff',
          lineColor: '#0f172a',
        });
      } catch (err) {
        console.error(`Failed to generate CODE128 barcode for "${value}":`, err);
      }
    }
  }, [value, format, width, height, displayValue, fontSize]);

  if (!value) return null;

  return (
    <div className={`flex flex-col items-center justify-center bg-white p-2 rounded-lg border border-slate-200 ${className}`}>
      <svg ref={svgRef} className="max-w-full h-auto" />
    </div>
  );
};
