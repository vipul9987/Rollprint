import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Camera,
  X,
  Search,
  AlertCircle,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  RefreshCw,
  Upload,
  ArrowUpFromLine,
  Minus,
  Plus,
  Box,
  Layers,
  FileText,
  RotateCcw
} from 'lucide-react';
import { MatrixBatch, MatrixItemWithStock } from '../types/inventory';
import { findBatchesByBatchOrBarcode } from '../data/inventoryStore';

interface BarcodeScannerViewProps {
  batches: MatrixBatch[];
  itemsWithStock: MatrixItemWithStock[];
  onExecuteStockOut: (batch: MatrixBatch, rollsOut: number) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const BarcodeScannerView: React.FC<BarcodeScannerViewProps> = ({
  batches,
  itemsWithStock,
  onExecuteStockOut,
  onClose,
  isModal = false
}) => {
  // Scanner phases: 'SCANNING' | 'NOT_FOUND' | 'FOUND' | 'STOCK_OUT_CONFIRM' | 'SUCCESS'
  const [phase, setPhase] = useState<'SCANNING' | 'NOT_FOUND' | 'FOUND' | 'STOCK_OUT_CONFIRM' | 'SUCCESS'>('SCANNING');
  
  // Barcode & Batch State
  const [scannedCode, setScannedCode] = useState<string>('');
  const [matchedBatch, setMatchedBatch] = useState<MatrixBatch | null>(null);
  const [matchedItem, setMatchedItem] = useState<MatrixItemWithStock | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string>('');
  
  // Manual Input Fallback
  const [manualInput, setManualInput] = useState<string>('');
  
  // Stock OUT state
  const [rollsOut, setRollsOut] = useState<number>(1);
  const [lastDispatchedCount, setLastDispatchedCount] = useState<number>(1);
  const [stockOutError, setStockOutError] = useState<string>('');

  // Camera & Stream State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zxingControlsRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [hasTorchSupport, setHasTorchSupport] = useState<boolean>(false);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastDetectTimestampRef = useRef<number>(0);

  // Sound & Vibration Feedback
  const triggerScanFeedback = useCallback(() => {
    // 1. Audio Beep using Web Audio API
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz (A5)
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {}

    // 2. Haptic Vibration
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([70, 40, 70]);
      }
    } catch {}
  }, []);

  // Stop active camera streams
  const stopCamera = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setHasTorchSupport(false);
  }, []);

  // Process decoded barcode value
  const handleBarcodeDecoded = useCallback(
    (rawCode: string) => {
      const clean = rawCode.trim().toUpperCase();
      if (!clean) return;

      setScannedCode(clean);
      stopCamera();
      triggerScanFeedback();

      // Query database for batch by batchNumber or barcodeValue
      const matches = findBatchesByBatchOrBarcode(batches, clean);

      if (matches.length > 0) {
        const found = matches[0];
        setMatchedBatch(found);
        setNotFoundCode('');
        
        // Lookup matching item
        const normSize = found.variantSize.trim();
        const item = itemsWithStock.find(
          (i) =>
            i.materialName.toLowerCase() === found.materialName.toLowerCase() &&
            i.variantSize.trim() === normSize
        );
        setMatchedItem(item || null);
        setRollsOut(Math.min(1, Math.max(1, found.currentRemainingRollQuantity)));
        setStockOutError('');
        setPhase('FOUND');
      } else {
        setMatchedBatch(null);
        setMatchedItem(null);
        setNotFoundCode(clean);
        setPhase('NOT_FOUND');
      }
    },
    [batches, itemsWithStock, stopCamera, triggerScanFeedback]
  );

  // Start Camera with Dual Engine: Native BarcodeDetector (Chrome Android) + ZXing Fallback
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError('');

    try {
      // 1. Acquire media stream with high resolution for linear barcode sharpness
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check flashlight / torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorchSupport(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);

        // 2. Engine 1: Native BarcodeDetector (hardware accelerated on Android Chrome)
        const hasNativeDetector = 'BarcodeDetector' in window;
        let nativeDetector: any = null;
        if (hasNativeDetector) {
          try {
            nativeDetector = new (window as any).BarcodeDetector({
              formats: ['code_128', 'code_39', 'ean_13', 'upc_a']
            });
          } catch (e) {
            nativeDetector = null;
          }
        }

        if (nativeDetector && videoRef.current) {
          const runNativeLoop = async (now: number) => {
            if (!streamRef.current || !videoRef.current) return;

            // Throttle detection loop to ~12 fps (every 80ms) for high performance without thermal throttling
            if (now - lastDetectTimestampRef.current > 80 && videoRef.current.readyState >= 2) {
              lastDetectTimestampRef.current = now;
              try {
                const barcodes = await nativeDetector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0) {
                  const detected = barcodes[0].rawValue;
                  if (detected && detected.trim()) {
                    handleBarcodeDecoded(detected);
                    return;
                  }
                }
              } catch {}
            }

            animationFrameIdRef.current = requestAnimationFrame(runNativeLoop);
          };

          animationFrameIdRef.current = requestAnimationFrame(runNativeLoop);
        }

        // 3. Engine 2: ZXing Reader running in parallel / fallback
        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, 180);
        const controls = await reader.decodeFromVideoElement(
          videoRef.current,
          (result, err) => {
            if (result) {
              const text = result.getText();
              if (text && text.trim()) {
                handleBarcodeDecoded(text);
              }
            }
          }
        );
        zxingControlsRef.current = controls;
      }
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      setIsCameraActive(false);
      setCameraError(
        'Could not access the camera. Please allow camera permissions in your browser or enter the Batch Number manually below.'
      );
    }
  }, [facingMode, handleBarcodeDecoded, stopCamera]);

  // Handle flashlight toggle
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as any]
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  // Flip camera between environment and user
  const switchCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Lifecycle: start camera when in SCANNING phase
  useEffect(() => {
    if (phase === 'SCANNING') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [phase, facingMode, startCamera, stopCamera]);

  // Handle Photo File Upload Scanner
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Try native BarcodeDetector on image bitmap
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['code_128', 'code_39', 'ean_13']
          });
          const bitmap = await createImageBitmap(file);
          const barcodes = await detector.detect(bitmap);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleBarcodeDecoded(barcodes[0].rawValue);
            return;
          }
        } catch {}
      }

      // 2. Fallback with ZXing image decode
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const imgUrl = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(imgUrl);
        if (result && result.getText()) {
          handleBarcodeDecoded(result.getText());
        } else {
          setNotFoundCode('Uploaded Image');
          setPhase('NOT_FOUND');
        }
      } finally {
        URL.revokeObjectURL(imgUrl);
      }
    } catch {
      setNotFoundCode('Uploaded Image');
      setPhase('NOT_FOUND');
    }
  };

  // Manual Lookup Handler
  const handleManualLookup = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualInput.trim().toUpperCase();
    if (!clean) return;
    handleBarcodeDecoded(clean);
  };

  // Confirm Stock OUT execution
  const handleConfirmStockOut = () => {
    if (!matchedBatch) return;

    if (rollsOut <= 0) {
      setStockOutError('Please enter at least 1 roll.');
      return;
    }

    if (rollsOut > matchedBatch.currentRemainingRollQuantity) {
      setStockOutError(
        `Cannot remove ${rollsOut} rolls. Only ${matchedBatch.currentRemainingRollQuantity} rolls are available in this batch.`
      );
      return;
    }

    setLastDispatchedCount(rollsOut);
    onExecuteStockOut(matchedBatch, rollsOut);
    setPhase('SUCCESS');
  };

  // Reset to scan next barcode
  const handleResetToScan = () => {
    setMatchedBatch(null);
    setMatchedItem(null);
    setNotFoundCode('');
    setManualInput('');
    setStockOutError('');
    setPhase('SCANNING');
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-2xl w-full mx-auto">
      {/* Top Header Bar */}
      <div className="p-4 bg-[#0A0A0C] text-white flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-[#27272A] text-[#D4A84B] border border-[#C59B3F]/40">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight text-white flex items-center space-x-2">
              <span>Scan Batch Barcode</span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#C59B3F]/20 text-[#D4A84B] border border-[#C59B3F]/40 rounded-full">
                CODE128
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Point phone camera at roll sticker to lookup batch &amp; dispatch stock
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Content Body */}
      <div className="p-4 sm:p-6 space-y-5">
        {/* ========================================================= */}
        {/* PHASE 1: SCANNING VIEW (CAMERA VIEWFINDER & MANUAL INPUT) */}
        {/* ========================================================= */}
        {phase === 'SCANNING' && (
          <div className="space-y-4">
            {/* Camera Viewfinder Box */}
            <div className="relative bg-[#0A0A0C] rounded-2xl overflow-hidden aspect-4/3 sm:aspect-16/10 border-2 border-zinc-800 shadow-inner flex items-center justify-center">
              {/* Video Stream Element */}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Viewfinder Target Reticle with Horizontal Laser Guide */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                {/* Horizontal Targeting Box for Linear Barcodes */}
                <div className="w-11/12 max-w-md h-28 sm:h-32 border-2 border-[#C59B3F]/80 rounded-xl relative shadow-2xl overflow-hidden backdrop-brightness-105">
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-[#D4A84B]" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-[#D4A84B]" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-[#D4A84B]" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-[#D4A84B]" />

                  {/* Pulsing Horizontal Red Laser Guideline */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center">
                    <div className="w-full h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />
                  </div>
                </div>

                <span className="mt-3 text-[11px] font-bold text-white/90 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10 tracking-wide text-center">
                  Align red laser horizontally across the CODE128 barcode
                </span>
              </div>

              {/* Viewfinder Controls Overlay */}
              <div className="absolute top-3 right-3 flex items-center space-x-2">
                {hasTorchSupport && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2 rounded-xl text-xs font-bold flex items-center space-x-1 shadow-md transition-all cursor-pointer ${
                      isTorchOn
                        ? 'bg-amber-400 text-slate-950 font-black'
                        : 'bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm border border-white/20'
                    }`}
                    title={isTorchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    {isTorchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={switchCameraFacing}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border border-white/20 text-xs font-bold shadow-md transition-all cursor-pointer"
                  title="Switch Camera"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Status Badge */}
              <div className="absolute bottom-3 left-3 flex items-center space-x-1.5 bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-lg backdrop-blur-sm border border-white/10 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Live Scanner Active</span>
              </div>
            </div>

            {/* Camera Error Alert if permissions failed */}
            {cameraError && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Camera Access Note:</p>
                  <p className="text-amber-800 mt-0.5">{cameraError}</p>
                </div>
              </div>
            )}

            {/* MANUAL FALLBACK: Enter Batch Number Manually */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <Search className="w-3.5 h-3.5 text-[#C59B3F]" />
                  <span>Enter Batch Number Manually</span>
                </label>
                <span className="text-[10px] text-slate-400 font-semibold">Fallback / Quick Entry</span>
              </div>

              <form onSubmit={handleManualLookup} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 101026GE23542..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="flex-1 p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#C59B3F] uppercase placeholder:normal-case placeholder:font-sans placeholder:font-normal"
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-[#C59B3F] hover:text-slate-950 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Lookup
                </button>
              </form>

              {/* Quick sample chips for testing */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                <span className="text-slate-400 font-medium">Test Barcodes:</span>
                <button
                  type="button"
                  onClick={() => handleBarcodeDecoded('101026GE23542')}
                  className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-mono font-bold border border-amber-300 transition-colors cursor-pointer"
                >
                  101026GE23542 (Hetax)
                </button>
                <button
                  type="button"
                  onClick={() => handleBarcodeDecoded('101026GT28728')}
                  className="px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 font-mono font-bold transition-colors cursor-pointer"
                >
                  101026GT28728
                </button>
              </div>

              {/* Photo Upload alternative */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Have a saved barcode photo?</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:text-slate-950 bg-white border border-slate-300 rounded-lg shadow-2xs hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Photo</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* PHASE 2: INVALID BARCODE / NOT FOUND ALERT                */}
        {/* ========================================================= */}
        {phase === 'NOT_FOUND' && (
          <div className="p-6 bg-red-50 border-2 border-red-300 rounded-2xl text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-red-950">
                Batch not found for barcode {notFoundCode}.
              </h3>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
                No received batch in the inventory matches barcode <strong>{notFoundCode}</strong>.
                Please ensure this batch was received via Stock IN or recheck the scanned code.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleResetToScan}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Scan Barcode Again</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setManualInput(notFoundCode);
                  setPhase('SCANNING');
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Edit &amp; Re-lookup
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* PHASE 3: BATCH FOUND — DISPLAY MATERIAL DETAILS CARD      */}
        {/* ========================================================= */}
        {(phase === 'FOUND' || phase === 'STOCK_OUT_CONFIRM') && matchedBatch && (
          <div className="space-y-4 animate-in fade-in">
            {/* Scanned verification banner */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>CODE128 Decoded:</span>
                <span className="font-mono bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 font-black">
                  {matchedBatch.batchNumber}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetToScan}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold underline cursor-pointer"
              >
                Scan Different Code
              </button>
            </div>

            {/* Exact Required Batch Details Card */}
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-4">
              {/* Header: Material & Category */}
              <div className="border-b border-slate-100 pb-3 flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Category: {matchedBatch.category || 'Roll'} &bull; Date: {matchedBatch.stockInDate}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                    {matchedBatch.materialName}
                  </h3>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Available in Batch</span>
                  <span className="font-mono text-base font-black text-emerald-700">
                    {matchedBatch.currentRemainingRollQuantity} {matchedBatch.currentRemainingRollQuantity === 1 ? 'Roll' : 'Rolls'}
                  </span>
                </div>
              </div>

              {/* Grid of parameters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">Size / Width</span>
                  <strong className="text-slate-900 text-sm">{matchedBatch.variantSize} M</strong>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">Roll Length</span>
                  <strong className="text-slate-900 text-sm">{matchedBatch.rollLengthMtr} M</strong>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">Invoice Number</span>
                  <strong className="text-slate-900 text-sm">{matchedBatch.invoiceNumber}</strong>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">Batch Number</span>
                  <strong className="text-amber-800 text-sm font-black">{matchedBatch.batchNumber}</strong>
                </div>
              </div>

              {/* Area summary */}
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 font-mono text-xs flex items-center justify-between text-slate-700">
                <span>Area Per Roll:</span>
                <strong>
                  {matchedBatch.variantSize} M &times; {matchedBatch.rollLengthMtr} M ={' '}
                  {Number((parseFloat(matchedBatch.variantSize) * matchedBatch.rollLengthMtr).toFixed(2))} m²
                </strong>
              </div>

              {/* PRIMARY ACTION BUTTON: STOCK OUT */}
              {phase === 'FOUND' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setPhase('STOCK_OUT_CONFIRM')}
                    className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-black flex items-center justify-center space-x-2 shadow-md transition-all active:scale-98 cursor-pointer"
                  >
                    <ArrowUpFromLine className="w-5 h-5 stroke-[2.5]" />
                    <span>STOCK OUT</span>
                  </button>
                </div>
              )}
            </div>

            {/* ======================================================= */}
            {/* STOCK OUT CONFIRMATION PANEL (When STOCK OUT is clicked) */}
            {/* ======================================================= */}
            {phase === 'STOCK_OUT_CONFIRM' && (
              <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-300 shadow-md space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                  <div className="flex items-center space-x-2 text-slate-900 font-black text-sm">
                    <ArrowUpFromLine className="w-4 h-4 text-amber-700" />
                    <span>Confirm Stock OUT</span>
                  </div>
                  <span className="text-xs font-mono text-amber-900 font-bold">
                    Batch: {matchedBatch.batchNumber}
                  </span>
                </div>

                {stockOutError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{stockOutError}</span>
                  </div>
                )}

                {/* Rolls OUT Stepper Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">Rolls OUT</label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setRollsOut((c) => Math.max(1, c - 1))}
                      className="p-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-amber-300 font-bold cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <input
                      type="number"
                      min="1"
                      max={matchedBatch.currentRemainingRollQuantity}
                      value={rollsOut}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setRollsOut(val);
                      }}
                      className="flex-1 p-2.5 bg-white border border-amber-300 rounded-xl text-center font-mono font-black text-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setRollsOut((c) =>
                          Math.min(matchedBatch.currentRemainingRollQuantity, c + 1)
                        )
                      }
                      className="p-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-amber-300 font-bold cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stock Transition Preview: Before -> After */}
                <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                  <div className="p-2.5 bg-white rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">Before</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {matchedBatch.currentRemainingRollQuantity} {matchedBatch.currentRemainingRollQuantity === 1 ? 'Roll' : 'Rolls'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-amber-200">
                    <span className="text-[10px] text-amber-700 font-sans block uppercase font-bold">Rolls OUT</span>
                    <span className="font-bold text-amber-700 text-sm">-{rollsOut} Rolls</span>
                  </div>

                  <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xs">
                    <span className="text-[10px] text-slate-300 font-sans block uppercase font-bold">After</span>
                    <span className="font-black text-white text-sm">
                      {Math.max(0, matchedBatch.currentRemainingRollQuantity - rollsOut)}{' '}
                      {Math.max(0, matchedBatch.currentRemainingRollQuantity - rollsOut) === 1 ? 'Roll' : 'Rolls'}
                    </span>
                  </div>
                </div>

                {/* Confirm Action Button */}
                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('FOUND')}
                    className="px-4 py-3 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmStockOut}
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRM STOCK OUT</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* PHASE 4: SUCCESS CONFIRMATION DISPLAY                     */}
        {/* ========================================================= */}
        {phase === 'SUCCESS' && matchedBatch && (
          <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
            </div>

            <div>
              <h3 className="text-base font-black text-emerald-950">
                Stock OUT Confirmed!
              </h3>
              <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
                Dispatched <strong>{lastDispatchedCount} Roll(s)</strong> of{' '}
                <strong>{matchedBatch.materialName}</strong> ({matchedBatch.variantSize}M &times; {matchedBatch.rollLengthMtr}M).
              </p>
            </div>

            <div className="p-3 bg-white rounded-xl border border-emerald-200 inline-block font-mono text-xs text-slate-700">
              <span>Batch {matchedBatch.batchNumber} Stock Remaining: </span>
              <strong className="text-emerald-800 text-sm">
                {Math.max(0, matchedBatch.currentRemainingRollQuantity - lastDispatchedCount)} Rolls
              </strong>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleResetToScan}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 shadow-md transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Next Barcode</span>
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Done / Close
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
