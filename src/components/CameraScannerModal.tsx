import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, Upload, CheckCircle2 } from 'lucide-react';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  title?: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Scan Batch Barcode'
}) => {
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const elementId = 'html5-qr-reader';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage('');
    let isCancelled = false;

    // Small delay to allow modal DOM rendering
    const timer = setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el || isCancelled) return;

      try {
        const html5QrCode = new Html5Qrcode(elementId);
        scannerRef.current = html5QrCode;

        html5QrCode
          .start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 280, height: 140 },
              aspectRatio: 1.0
            },
            (decodedText) => {
              // Successfully decoded!
              try {
                if (html5QrCode.isScanning) {
                  html5QrCode.stop().catch(() => {});
                }
              } catch (e) {}
              onScanSuccess(decodedText);
              onClose();
            },
            () => {
              // Ignored during active frame hunting
            }
          )
          .then(() => {
            if (!isCancelled) {
              setIsScanning(true);
            }
          })
          .catch((err) => {
            if (!isCancelled) {
              console.warn('Camera stream error:', err);
              setErrorMessage(
                'Camera could not be started directly. Ensure camera permissions are granted, or upload a photo of the code below.'
              );
            }
          });
      } catch (e: any) {
        if (!isCancelled) {
          setErrorMessage(e?.message || 'Error initializing camera scanner.');
        }
      }
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch (e) {}
      }
    };
  }, [isOpen, onScanSuccess, onClose]);

  // Handle fallback file / photo capture
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErrorMessage('');
      const tempScanner = scannerRef.current || new Html5Qrcode(elementId);
      const decoded = await tempScanner.scanFile(file, true);
      onScanSuccess(decoded);
      onClose();
    } catch (err: any) {
      setErrorMessage('Could not detect a clear barcode in that photo. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <Camera className="w-5 h-5 text-amber-600" />
            <span>{title}</span>
          </div>
          <button
            onClick={() => {
              if (scannerRef.current?.isScanning) {
                scannerRef.current.stop().catch(() => {});
              }
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Box */}
        <div className="p-4 space-y-3">
          <div className="relative bg-slate-950 rounded-xl overflow-hidden min-h-[280px] flex items-center justify-center border border-slate-800">
            <div id={elementId} className="w-full h-full text-white" />

            {/* Target reticle guide - Horizontal for linear CODE128 barcode */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-32 border-2 border-amber-400/80 rounded-xl relative shadow-lg">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-300"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-300"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-300"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-300"></div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500">
            Point camera at the roll's CODE128 Batch Barcode sticker.
          </p>

          {/* Error Message & Photo upload fallback */}
          {errorMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Take or Choose Photo Instead</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileScan}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-slate-600 hover:text-slate-900 font-medium flex items-center space-x-1"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (scannerRef.current?.isScanning) {
                scannerRef.current.stop().catch(() => {});
              }
              onClose();
            }}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
