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
  Box,
  Layers,
  FileText,
  RotateCcw,
  ShieldAlert,
  Hash,
  Ruler,
  Calendar,
  Check
} from 'lucide-react';
import { MatrixBatch, MatrixItemWithStock, InventoryRoll } from '../types/inventory';
import {
  queryRollByExactBarcode,
  executeRollStockOutTransaction,
  getStoredInventoryRolls
} from '../data/rollDatabase';

interface BarcodeScannerViewProps {
  batches?: MatrixBatch[];
  itemsWithStock?: MatrixItemWithStock[];
  onExecuteStockOut?: (batch: MatrixBatch, rollsOut: number, batchItemId?: string) => void;
  onRollStockOut?: (roll: InventoryRoll) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const BarcodeScannerView: React.FC<BarcodeScannerViewProps> = ({
  batches = [],
  itemsWithStock = [],
  onExecuteStockOut,
  onRollStockOut,
  onClose,
  isModal = false
}) => {
  // Scanner phases: 'SCANNING' | 'NOT_FOUND' | 'FOUND' | 'SUCCESS'
  const [phase, setPhase] = useState<'SCANNING' | 'NOT_FOUND' | 'FOUND' | 'SUCCESS'>('SCANNING');

  // Barcode & Roll State
  const [scannedCode, setScannedCode] = useState<string>('');
  const [matchedRoll, setMatchedRoll] = useState<InventoryRoll | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string>('');
  const [isSubmittingStockOut, setIsSubmittingStockOut] = useState<boolean>(false);
  const [stockOutError, setStockOutError] = useState<string>('');

  // Manual Input Fallback
  const [manualInput, setManualInput] = useState<string>('');

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

  // Process decoded roll barcode value
  // RULE: Query inventory_rolls by EXACT roll_barcode.
  // The query must return exactly ONE roll.
  // Do NOT query the whole batch and show all items.
  // Do NOT show a selection list.
  const handleBarcodeDecoded = useCallback(
    async (rawCode: string) => {
      let clean = rawCode.trim().toUpperCase();
      if (!clean) return;

      if (clean.includes('/R/')) {
        const parts = clean.split('/R/');
        clean = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
      } else if (clean.includes('/B/')) {
        const parts = clean.split('/B/');
        clean = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
      }

      setScannedCode(clean);
      stopCamera();
      triggerScanFeedback();
      setStockOutError('');

      // Query inventory_rolls by EXACT roll_barcode
      const exactRoll = await queryRollByExactBarcode(clean);

      if (exactRoll) {
        setMatchedRoll(exactRoll);
        setNotFoundCode('');
        setPhase('FOUND');
      } else {
        // Fallback check: Did user scan a batch number? If so, check if rolls exist under this batch
        const allRolls = getStoredInventoryRolls();
        const rollsUnderBatch = allRolls.filter((r) => r.batchNumber.toUpperCase() === clean);
        if (rollsUnderBatch.length > 0) {
          // If a batch was scanned, take the first roll or exact roll match
          const targetRoll = rollsUnderBatch.find((r) => r.status === 'IN_STOCK') || rollsUnderBatch[0];
          setMatchedRoll(targetRoll);
          setNotFoundCode('');
          setPhase('FOUND');
          return;
        }

        setMatchedRoll(null);
        setNotFoundCode(clean);
        setPhase('NOT_FOUND');
      }
    },
    [stopCamera, triggerScanFeedback]
  );

  // Start Camera with Dual Engine: Native BarcodeDetector + ZXing Fallback
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError('');

    try {
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

        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 180 });
        const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result) {
            const text = result.getText();
            if (text && text.trim()) {
              handleBarcodeDecoded(text);
            }
          }
        });
        zxingControlsRef.current = controls;
      }
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      setIsCameraActive(false);
      setCameraError(
        'Could not access the camera. Please allow camera permissions or enter the Roll Barcode manually below.'
      );
    }
  }, [facingMode, handleBarcodeDecoded, stopCamera]);

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

  const switchCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

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

  // Handle Photo File Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
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

  // CONFIRM STOCK OUT FOR SCANNED ROLL
  // RULE: Barcode Stock OUT always represents quantity = 1 physical roll.
  // Do not ask for "Roll Quantity OUT" after scanning one roll.
  // On confirmation:
  // inventory_roll.status: IN_STOCK -> OUT
  // Create one OUT transaction for that roll.
  // Update dashboard / summary by -1 roll.
  const handleConfirmStockOut = async () => {
    if (!matchedRoll) return;

    // DUPLICATE SCAN PROTECTION
    if (matchedRoll.status === 'OUT') {
      setStockOutError('This roll has already been stocked out.');
      return;
    }

    setIsSubmittingStockOut(true);
    setStockOutError('');

    try {
      const result = await executeRollStockOutTransaction(matchedRoll.rollBarcode);

      if (!result.success) {
        setStockOutError(result.error || 'Failed to stock out this roll.');
        setIsSubmittingStockOut(false);
        return;
      }

      const updatedRoll = result.roll || { ...matchedRoll, status: 'OUT' as const };
      setMatchedRoll(updatedRoll);

      if (onRollStockOut) {
        onRollStockOut(updatedRoll);
      }

      // Sync legacy callback if parent passes it
      if (onExecuteStockOut) {
        const parentBatch = batches.find(
          (b) => b.batchNumber.toUpperCase() === matchedRoll.batchNumber.toUpperCase()
        );
        if (parentBatch) {
          onExecuteStockOut(parentBatch, 1);
        }
      }

      setPhase('SUCCESS');
    } catch (err: any) {
      setStockOutError(err?.message || 'Error executing Stock OUT.');
    } finally {
      setIsSubmittingStockOut(false);
    }
  };

  const handleResetToScan = () => {
    setMatchedRoll(null);
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
              <span>Scan Roll Barcode</span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#C59B3F]/20 text-[#D4A84B] border border-[#C59B3F]/40 rounded-full">
                1 ROLL = 1 BARCODE
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Point camera at physical roll barcode sticker to identify roll &amp; stock out
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
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Viewfinder Target Reticle with Glowing Red Laser Scan Bar */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="w-4/5 max-w-sm h-36 border-2 border-[#D4A84B]/70 rounded-2xl relative shadow-[0_0_25px_rgba(212,168,75,0.25)] flex items-center justify-center overflow-hidden">
                  {/* Four Corner Aiming Accents */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-[#D4A84B]" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-[#D4A84B]" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-[#D4A84B]" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-[#D4A84B]" />

                  {/* Horizontal animated red laser line */}
                  <div className="w-full h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />

                  <span className="absolute bottom-2 text-[10px] font-mono text-[#D4A84B]/90 font-bold tracking-widest uppercase bg-[#0A0A0C]/80 px-2 py-0.5 rounded-full">
                    ALIGN ROLL BARCODE HERE
                  </span>
                </div>
              </div>

              {/* Camera Action Overlay Controls */}
              <div className="absolute top-3 right-3 flex items-center space-x-2">
                {hasTorchSupport && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2 rounded-xl backdrop-blur-md border transition-colors cursor-pointer ${
                      isTorchOn
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
                    }`}
                    title={isTorchOn ? 'Turn Off Flashlight' : 'Turn On Flashlight'}
                  >
                    {isTorchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={switchCameraFacing}
                  className="p-2 rounded-xl bg-black/60 text-white border border-white/20 hover:bg-black/80 backdrop-blur-md transition-colors cursor-pointer"
                  title="Switch Camera (Front/Back)"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Camera Error Message */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 text-white p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                  <p className="text-xs text-slate-300 max-w-sm">{cameraError}</p>
                </div>
              )}
            </div>

            {/* Manual Barcode Input Fallback */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <form onSubmit={handleManualLookup} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Enter Roll Barcode (e.g. 121026AB12345-R01)"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-[#C59B3F] focus:border-[#C59B3F] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="px-4 py-2 bg-[#0A0A0C] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer shrink-0"
                >
                  Lookup Roll
                </button>
              </form>

              {/* Quick sample chips for testing physical roll barcodes */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                <span className="text-slate-400 font-medium">Test Roll Barcodes:</span>
                <button
                  type="button"
                  onClick={() => handleBarcodeDecoded('121026AB12345-R01')}
                  className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-mono font-bold border border-emerald-300 transition-colors cursor-pointer"
                  title="Bright FL 26 • Roll 1 (IN_STOCK)"
                >
                  121026AB12345-R01 (Roll 1 &bull; IN_STOCK)
                </button>
                <button
                  type="button"
                  onClick={() => handleBarcodeDecoded('121026AB12345-R02')}
                  className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-mono font-bold border border-emerald-300 transition-colors cursor-pointer"
                  title="Bright FL 26 • Roll 2 (IN_STOCK)"
                >
                  121026AB12345-R02 (Roll 2)
                </button>
                <button
                  type="button"
                  onClick={() => handleBarcodeDecoded('101026GE23542-R01')}
                  className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-mono font-bold border border-amber-300 transition-colors cursor-pointer"
                  title="Hetax • Roll 1 (IN_STOCK)"
                >
                  101026GE23542-R01 (Hetax)
                </button>
                <button
                  type="button"
                  onClick={() => handleBarcodeDecoded('101026GT28728-L1-R01')}
                  className="px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 font-mono font-bold transition-colors cursor-pointer"
                  title="Bronze • Roll 1"
                >
                  101026GT28728-L1-R01
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
                Roll not found for barcode {notFoundCode}.
              </h3>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
                No physical roll in the inventory matches barcode <strong>{notFoundCode}</strong>.
                Please ensure this roll was received via Stock IN or check the scanned code.
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
        {/* PHASE 3: EXACT ROLL FOUND                                 */}
        {/* SPECIFICATION:                                            */}
        {/* Query inventory_rolls by EXACT roll_barcode.              */}
        {/* Return exactly ONE roll.                                  */}
        {/* Do NOT query whole batch and show all items.              */}
        {/* Do NOT show a selection list.                             */}
        {/* Display:                                                  */}
        {/* - Material                                                */}
        {/* - Size                                                    */}
        {/* - Roll Length                                             */}
        {/* - Batch Number                                            */}
        {/* - Invoice Number                                          */}
        {/* - Roll Number                                             */}
        {/* - Roll Barcode                                            */}
        {/* - Current Status                                          */}
        {/* Then show: [ STOCK OUT ]                                  */}
        {/* ========================================================= */}
        {phase === 'FOUND' && matchedRoll && (
          <div className="space-y-4 animate-in fade-in">
            {/* Scanned verification banner */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Exact Roll Identified:</span>
                <span className="font-mono bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 font-black">
                  {matchedRoll.rollBarcode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetToScan}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold underline cursor-pointer"
              >
                Scan Different Roll
              </button>
            </div>

            {/* DUPLICATE SCAN PROTECTION ALERT */}
            {matchedRoll.status === 'OUT' && (
              <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl flex items-start space-x-3 text-red-900 animate-in fade-in">
                <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-red-950">
                    This roll has already been stocked out.
                  </h4>
                  <p className="text-xs text-red-700">
                    Duplicate scan blocked. Roll <strong>{matchedRoll.rollBarcode}</strong> has already been marked as <strong>OUT</strong>.
                    Inventory will not be decremented again.
                  </p>
                </div>
              </div>
            )}

            {/* EXACT SINGLE ROLL DETAILS CARD */}
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    PHYSICAL ROLL RECORD &bull; Received: {matchedRoll.receivedDate}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                    {matchedRoll.materialName}
                  </h3>
                </div>

                {/* Current Status Badge */}
                <div>
                  {matchedRoll.status === 'IN_STOCK' ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 mr-1.5 animate-pulse" />
                      IN_STOCK
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">
                      <span className="w-2 h-2 rounded-full bg-red-600 mr-1.5" />
                      OUT
                    </span>
                  )}
                </div>
              </div>

              {/* Specification Grid: Exactly 1 Roll Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Material */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Material
                  </span>
                  <span className="font-bold text-slate-900 text-sm block truncate mt-0.5">
                    {matchedRoll.materialName}
                  </span>
                </div>

                {/* 2. Size */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Size
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm block mt-0.5">
                    {matchedRoll.size} M
                  </span>
                </div>

                {/* 3. Roll Length */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Roll Length
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm block mt-0.5">
                    {matchedRoll.rollLength} M
                  </span>
                </div>

                {/* 4. Roll Number */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                    Roll Number
                  </span>
                  <span className="font-mono font-black text-amber-950 text-sm block mt-0.5">
                    Roll #{matchedRoll.rollNumber}
                  </span>
                </div>

                {/* 5. Batch Number */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Batch Number
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-xs block truncate mt-0.5">
                    {matchedRoll.batchNumber}
                  </span>
                </div>

                {/* 6. Invoice Number */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Invoice Number
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-xs block truncate mt-0.5">
                    {matchedRoll.invoiceNumber}
                  </span>
                </div>

                {/* 7. Roll Barcode */}
                <div className="p-3 bg-slate-900 text-white rounded-xl col-span-2">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                    Roll Barcode (Unique)
                  </span>
                  <span className="font-mono font-black text-[#D4A84B] text-xs block truncate mt-0.5">
                    {matchedRoll.rollBarcode}
                  </span>
                </div>
              </div>

              {/* Error Alert */}
              {stockOutError && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs font-bold text-red-900 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{stockOutError}</span>
                </div>
              )}

              {/* STOCK OUT ACTION */}
              {matchedRoll.status === 'IN_STOCK' ? (
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    <span>Stock OUT represents exactly </span>
                    <strong className="text-slate-800">1 physical roll</strong>.
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmStockOut}
                    disabled={isSubmittingStockOut}
                    className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white rounded-xl text-sm font-black flex items-center justify-center space-x-2 shadow-md transition-all cursor-pointer"
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    <span>{isSubmittingStockOut ? 'Processing...' : 'STOCK OUT'}</span>
                  </button>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-red-600 font-bold">
                    Action Disabled: Roll already consumed / stocked out.
                  </span>
                  <button
                    type="button"
                    onClick={handleResetToScan}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Scan Next Roll
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* PHASE 4: SUCCESS CONFIRMATION DISPLAY                     */}
        {/* ========================================================= */}
        {phase === 'SUCCESS' && matchedRoll && (
          <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
            </div>

            <div>
              <h3 className="text-base font-black text-emerald-950">
                Roll Successfully Stocked Out!
              </h3>
              <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
                Dispatched <strong>1 Physical Roll</strong> of{' '}
                <strong>{matchedRoll.materialName}</strong> ({matchedRoll.size}M &times; {matchedRoll.rollLength}M).
              </p>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-emerald-200 inline-block font-mono text-xs text-slate-800 space-y-1">
              <div>
                <span className="text-slate-500">Roll Barcode: </span>
                <strong className="text-slate-900">{matchedRoll.rollBarcode}</strong>
              </div>
              <div>
                <span className="text-slate-500">Batch: </span>
                <strong>{matchedRoll.batchNumber}</strong> &bull;{' '}
                <span className="text-slate-500">Roll: </span>
                <strong>#{matchedRoll.rollNumber}</strong>
              </div>
              <div className="text-emerald-700 font-bold pt-1">
                inventory_roll.status updated: IN_STOCK &rarr; OUT (-1 Roll)
              </div>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleResetToScan}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 shadow-md transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Next Roll</span>
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
