import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  showText?: boolean;
  className?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  size = 115,
  showText = true,
  className = ''
}) => {
  if (!value) return null;

  return (
    <div className={`flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs ${className}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin={true}
        fgColor="#0f172a"
        bgColor="#ffffff"
      />
      {showText && (
        <span className="mt-1 font-mono text-xs font-bold text-slate-800 tracking-wider">
          {value}
        </span>
      )}
    </div>
  );
};
