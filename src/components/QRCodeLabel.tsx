import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MatrixItemWithStock } from '../types/inventory';
import { ExternalLink, Printer } from 'lucide-react';

interface QRCodeLabelProps {
  item: MatrixItemWithStock;
  itemUrl: string;
  onPrintSingle?: (item: MatrixItemWithStock) => void;
  onOpenMobileView?: (itemId: string) => void;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (itemId: string) => void;
}

export const QRCodeLabel: React.FC<QRCodeLabelProps> = ({
  item,
  itemUrl,
  onPrintSingle,
  onOpenMobileView,
  selectable = false,
  isSelected = false,
  onToggleSelect
}) => {
  return (
    <div
      className={`bg-white rounded-2xl border-2 transition-all p-4 flex flex-col items-center justify-between text-center relative group ${
        isSelected ? 'border-indigo-600 shadow-md ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300 shadow-xs'
      }`}
    >
      {/* Selection checkbox */}
      {selectable && onToggleSelect && (
        <div className="absolute top-3 left-3 print:hidden">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.id)}
            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
          />
        </div>
      )}

      {/* Quick Action Buttons on hover */}
      <div className="absolute top-3 right-3 flex items-center space-x-1 print:hidden">
        {onOpenMobileView && (
          <button
            onClick={() => onOpenMobileView(item.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
            title="Open Mobile Item Page"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
        {onPrintSingle && (
          <button
            onClick={() => onPrintSingle(item)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Print This Label"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Label Content Header */}
      <div className="w-full pt-1 pb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
          {item.category}
        </span>
        <h3 className="font-black text-base text-slate-900 leading-snug line-clamp-1">
          {item.materialName}
        </h3>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-indigo-700">
          <span>Width: {item.variantSize}M</span>
          <span>&bull;</span>
          <span>Length: {item.rollLengthMtr || 70}M</span>
        </div>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
          Area: {item.areaPerRoll} m² / roll
        </p>
      </div>

      {/* Real QR Code encoding the direct HTTPS URL */}
      <div className="p-2.5 bg-white border border-slate-100 rounded-xl my-2 shadow-inner">
        <QRCodeSVG
          value={itemUrl}
          size={135}
          level="M"
          includeMargin={true}
          fgColor="#0f172a"
          bgColor="#ffffff"
        />
      </div>

      {/* Bottom Label Instruction */}
      <div className="w-full pt-1 pb-1">
        <p className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">
          Scan to View / Update Stock
        </p>
        <p className="text-[10px] text-slate-600 font-mono font-bold tracking-wider mt-0.5 bg-slate-50 py-0.5 px-2 rounded-md inline-block border border-slate-200">
          {item.barcode}
        </p>
      </div>
    </div>
  );
};
