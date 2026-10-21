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
  Trash2,
  Calendar,
  FileText,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  Check
} from 'lucide-react';
import { MatrixBatch, MatrixItemWithStock, InventoryRoll } from '../types/inventory';
import {
  extractRollBarcode,
  queryRollByExactBarcode,
  executeAtomicRollDispatch,
  AtomicRollDispatchResult
} from '../data/rollDatabase';

interface BarcodeScannerViewProps {
  batches?: MatrixBatch[];
  itemsWithStock?: MatrixItemWithStock[];
  onExecuteStockOut?: (batch: MatrixBatch, rollsOut: number, batchItemId?: string) => void;
  onRollStockOut?: (roll: InventoryRoll) => void;
  onDispatchComplete?: (result: AtomicRollDispatchResult) => void;
  onClose?: () => void;
  isModal?: boolean;
}

interface ScanAlert {
  type: 'success' | 'error' | 'warning';
  title: string;
  detail?: string;
  barcode?: string;
  previousOutInvoice?: string;
  previousOutDate?: string;
}

export const BarcodeScannerView: React.FC<BarcodeScannerViewProps> = ({
  batches = [],
  itemsWithStock = [],
  onExecuteStockOut,
  onRollStockOut,
  onDispatchComplete,
  onClose,
  isModal = false
}) => {
  // =========================================================================
  // TOP DISPATCH HEADER INPUTS (Entered ONCE for the entire dispatch)
  // =========================================================================
  const [stockOutInvoice, setStockOutInvoice] = useState<string>('DS/26-27/1230');
  const [stockOutDate, setStockOutDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // =========================================================================
  // POS TEMPORARY CART (OUT STOCK LIST)
  // =========================================================================
  const [cartRolls, setCartRolls] = useState<InventoryRoll[]>([]);

  // Scan feedback alert message
  const [scanAlert, setScanAlert] = useState<ScanAlert | null>(null);

  // Manual Roll Barcode Input
  const [manualInput, setManualInput] = useState<string>('');
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  // Submission / Dispatch state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dispatchError, setDispatchError] = useState<string>('');

  // Dispatch success report (Phase 10)
  const [dispatchedReport, setDispatchedReport] = useState<{
    outInvoice: string;
    outDate: string;
    totalRolls: number;
    rolls: InventoryRoll[];
  } | null>(null);

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

  // Anti-chatter throttle for continuous camera scanner
  const lastScannedCodeRef = useRef<string>('');
  const lastScanTimestampRef = useRef<number>(0);

  // =========================================================================
  // AUDIO & HAPTIC FEEDBACK (Fast, retail-grade feedback)
  // =========================================================================
  const triggerScanAudio = useCallback((isSuccess: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';

        if (isSuccess) {
          // Double chirp for success
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.06);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.14);
        } else {
          // Low buzzer for error / warning
          osc.frequency.setValueAtTime(240, ctx.currentTime);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.22);
        }
      }
    } catch {}

    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (isSuccess) {
          navigator.vibrate(60);
        } else {
          navigator.vibrate([80, 50, 80]);
        }
      }
    } catch {}
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setHasTorchSupport(false);
  }, []);

  // =========================================================================
  // CONTINUOUS SCANNING BEHAVIOR (ONE SCAN = ONE ROLL)
  // =========================================================================
  const handleBarcodeDecoded = useCallback(
    async (rawCode: string) => {
      const clean = extractRollBarcode(rawCode);
      if (!clean) return;

      // Throttle rapid repeated scan events of the exact same code within 1.2s
      const now = Date.now();
      if (lastScannedCodeRef.current === clean && now - lastScanTimestampRef.current < 1200) {
        return;
      }
      lastScannedCodeRef.current = clean;
      lastScanTimestampRef.current = now;

      // 1. DUPLICATE SCAN PROTECTION (Current Cart)
      // "If a roll is already present in current OUT cart: Reject second scan.
      // Show: 'Roll already added to this Stock OUT list.' Do NOT add duplicate."
      if (cartRolls.some((r) => r.rollBarcode.toUpperCase() === clean.toUpperCase())) {
        triggerScanAudio(false);
        setScanAlert({
          type: 'warning',
          title: 'Roll already added to this Stock OUT list.',
          detail: `Roll ${clean} is already present in your OUT stock list.`,
          barcode: clean
        });
        return;
      }

      // 2. QUERY EXACT PHYSICAL ROLL FROM DATABASE
      const roll = await queryRollByExactBarcode(clean);

      if (!roll) {
        // INVALID BARCODE: Show "Roll barcode not found." Do not add anything.
        triggerScanAudio(false);
        setScanAlert({
          type: 'error',
          title: 'Roll barcode not found.',
          detail: `No physical roll matches barcode "${clean}".`,
          barcode: clean
        });
        return;
      }

      // 3. ALREADY OUT PROTECTION
      // "If database says: status = OUT: Reject scan.
      // Show: 'This roll has already been stocked out.'
      // If available, show: Roll Barcode, Previous OUT Invoice, Previous OUT Date."
      if (roll.status === 'OUT') {
        triggerScanAudio(false);
        setScanAlert({
          type: 'error',
          title: 'This roll has already been stocked out.',
          detail: 'This physical roll was previously dispatched and cannot be stocked out again.',
          barcode: roll.rollBarcode,
          previousOutInvoice: roll.stockOutInvoiceNumber || 'N/A',
          previousOutDate: roll.stockOutDate || 'N/A'
        });
        return;
      }

      // 4. VALID IN_STOCK PHYSICAL ROLL -> ADD TO CART (Quantity = 1 physical roll)
      triggerScanAudio(true);
      setCartRolls((prev) => [roll, ...prev]);
      setScanAlert({
        type: 'success',
        title: `Added: ${roll.materialName} (${roll.size}M × ${roll.rollLength}M)`,
        detail: `Batch: ${roll.batchNumber} • IN Inv: ${roll.invoiceNumber}`,
        barcode: roll.rollBarcode
      });

      // Clear & refocus manual input immediately
      setManualInput('');
      setTimeout(() => manualInputRef.current?.focus(), 50);
    },
    [cartRolls, triggerScanAudio]
  );

  // Start Camera
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

        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
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
        'Could not access the camera. Please allow camera permissions or enter the Roll Barcode manually.'
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
    if (!dispatchedReport) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [dispatchedReport, facingMode, startCamera, stopCamera]);

  // Remove individual roll from temporary list
  const handleRemoveRoll = (barcode: string) => {
    setCartRolls((prev) => prev.filter((r) => r.rollBarcode.toUpperCase() !== barcode.toUpperCase()));
    setScanAlert({
      type: 'warning',
      title: `Roll removed from OUT list: ${barcode}`,
      detail: 'Inventory remains unchanged in the database.'
    });
  };

  // Clear entire cart
  const handleClearCart = () => {
    setCartRolls([]);
    setScanAlert(null);
    setDispatchError('');
  };

  // Handle Manual Input Submit
  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualInput.trim().toUpperCase();
    if (!clean) return;
    handleBarcodeDecoded(clean);
  };

  // Photo file upload fallback
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
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
          setScanAlert({
            type: 'error',
            title: 'Barcode not detected in image.',
            detail: 'Please ensure the roll CODE128 label is clear and well-lit.'
          });
        }
      } finally {
        URL.revokeObjectURL(imgUrl);
      }
    } catch {
      setScanAlert({
        type: 'error',
        title: 'Barcode decode failed from photo.',
        detail: 'Try typing the printed roll barcode number manually.'
      });
    }
  };

  // =========================================================================
  // ATOMIC CONFIRM STOCK OUT (PHASE 5)
  // Revalidates all rolls and commits transaction atomically
  // =========================================================================
  const handleConfirmStockOut = async () => {
    if (cartRolls.length === 0) return;

    const cleanInvoice = stockOutInvoice.trim();
    if (!cleanInvoice) {
      setDispatchError('OUT Invoice Number is required.');
      return;
    }

    const cleanDate = stockOutDate.trim();
    if (!cleanDate) {
      setDispatchError('OUT Date is required.');
      return;
    }

    setIsSubmitting(true);
    setDispatchError('');

    try {
      const result = await executeAtomicRollDispatch(cleanInvoice, cleanDate, cartRolls);

      if (!result.success) {
        setDispatchError(result.error || 'Failed to dispatch rolls.');
        setIsSubmitting(false);
        return;
      }

      if (onDispatchComplete) {
        onDispatchComplete(result);
      }

      // Success Report view (Phase 10)
      setDispatchedReport({
        outInvoice: cleanInvoice,
        outDate: cleanDate,
        totalRolls: result.totalRolls || cartRolls.length,
        rolls: result.dispatchedRolls || cartRolls
      });
      setCartRolls([]);
      setScanAlert(null);
    } catch (err: any) {
      setDispatchError(err?.message || 'Unexpected dispatch error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartNextDispatch = () => {
    setDispatchedReport(null);
    setCartRolls([]);
    setScanAlert(null);
    setDispatchError('');
    setStockOutInvoice('');
    setTimeout(() => {
      manualInputRef.current?.focus();
    }, 150);
  };

  return (
    <div
      className={`${
        isModal ? 'p-1' : 'w-full'
      } flex flex-col items-center justify-start font-sans antialiased`}
    >
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden space-y-0">
        {/* ========================================================= */}
        {/* TOP BAR / TITLE                                           */}
        {/* ========================================================= */}
        <div className="bg-[#0A0A0C] text-white px-6 py-4 flex items-center justify-between border-b border-[#27272A]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C59B3F]/20 border border-[#C59B3F]/40 flex items-center justify-center text-[#D4A84B]">
              <ArrowUpFromLine className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#D4A84B]">
                  Retail POS Mode
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400">Live Scanning</span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                POS Physical Roll Stock OUT
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {cartRolls.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-[#C59B3F] text-zinc-950 font-black text-xs font-mono">
                {cartRolls.length} {cartRolls.length === 1 ? 'Roll' : 'Rolls'} in Cart
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
                title="Close Scanner"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* PHASE 10: SUCCESS DISPATCH BANNER / SUMMARY               */}
        {/* ========================================================= */}
        {dispatchedReport ? (
          <div className="p-6 sm:p-8 space-y-6 bg-gradient-to-b from-emerald-50/50 to-white animate-in fade-in">
            <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 block">
                  Dispatch Complete
                </span>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  STOCK OUT SUCCESSFUL
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-2">
                <div className="p-3 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">OUT Invoice</span>
                  <span className="font-mono font-black text-sm text-slate-900">{dispatchedReport.outInvoice}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Date</span>
                  <span className="font-mono font-black text-sm text-slate-900">{dispatchedReport.outDate}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Rolls</span>
                  <span className="font-mono font-black text-sm text-emerald-700">{dispatchedReport.totalRolls} ROLLS</span>
                </div>
              </div>
            </div>

            {/* List of dispatched physical rolls */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                Dispatched Physical Rolls ({dispatchedReport.rolls.length})
              </h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Material</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Length</th>
                      <th className="py-2.5 px-3">Batch</th>
                      <th className="py-2.5 px-3">Roll Barcode</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatchedReport.rolls.map((r, i) => (
                      <tr key={r.id || r.rollBarcode} className="hover:bg-slate-50 font-medium">
                        <td className="py-2 px-3 text-slate-400 font-bold">{i + 1}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{r.materialName}</td>
                        <td className="py-2 px-3 font-mono">{r.size}M</td>
                        <td className="py-2 px-3 font-mono">{r.rollLength}M</td>
                        <td className="py-2 px-3 font-mono text-indigo-700">{r.batchNumber}</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-800">{r.rollBarcode}</td>
                        <td className="py-2 px-3 text-right">
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-black text-[10px]">
                            OUT
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={handleStartNextDispatch}
                className="px-6 py-3 bg-[#0A0A0C] hover:bg-slate-800 text-white rounded-2xl font-black text-sm flex items-center space-x-2 shadow-lg transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-[#D4A84B]" />
                <span>Start Next Dispatch</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-6">
            {/* ========================================================= */}
            {/* STEP 1: TOP DISPATCH HEADER INPUTS                        */}
            {/* Entered ONCE for the whole dispatch                       */}
            {/* ========================================================= */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#C59B3F]" />
                  <span>Dispatch Information (Entered Once)</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Applies to all scanned rolls below</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* OUT Invoice Number * */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    OUT Invoice Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={stockOutInvoice}
                    onChange={(e) => {
                      setStockOutInvoice(e.target.value);
                      setDispatchError('');
                    }}
                    placeholder="e.g. DS/26-27/1230"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900 focus:ring-2 focus:ring-[#C59B3F] focus:border-[#C59B3F] outline-none"
                  />
                </div>

                {/* OUT Date * */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    OUT Date <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={stockOutDate}
                      onChange={(e) => {
                        setStockOutDate(e.target.value);
                        setDispatchError('');
                      }}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900 focus:ring-2 focus:ring-[#C59B3F] focus:border-[#C59B3F] outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* STEP 2: SCANNER & BARCODE INPUT                           */}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Camera Scanner Viewport */}
              <div className="space-y-2">
                <div className="relative w-full aspect-4/3 sm:aspect-16/10 bg-[#0A0A0C] rounded-2xl overflow-hidden border border-[#27272A] shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* CODE128 Scanning Crosshairs & Laser Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                    <div className="relative w-4/5 h-28 border-2 border-[#D4A84B]/60 rounded-xl flex items-center justify-center">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-[#D4A84B]" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-[#D4A84B]" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-[#D4A84B]" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-[#D4A84B]" />

                      {/* Continuous animated laser line */}
                      <div className="w-full h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />

                      <span className="absolute bottom-2 text-[9px] font-mono text-[#D4A84B] font-bold tracking-widest uppercase bg-[#0A0A0C]/80 px-2 py-0.5 rounded-full">
                        SCAN PHYSICAL ROLL BARCODE
                      </span>
                    </div>
                  </div>

                  {/* Camera Controls Overlay */}
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
                    <div className="absolute inset-0 bg-slate-950/90 text-white p-4 flex flex-col items-center justify-center text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-amber-400" />
                      <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* USB Gun / Manual Roll Barcode Input */}
              <div className="flex flex-col justify-between space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      SCAN ROLL BARCODE
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">USB Gun / Manual Input</span>
                  </div>

                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        ref={manualInputRef}
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="Scan or enter unique roll barcode..."
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-[#C59B3F] focus:border-[#C59B3F] outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!manualInput.trim()}
                      className="px-4 py-2.5 bg-[#0A0A0C] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer shrink-0"
                    >
                      Add Roll
                    </button>
                  </form>

                  {/* Quick test barcodes */}
                  <div className="pt-1 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                      Click to Test Barcodes:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => handleBarcodeDecoded('121026AB12345-R01')}
                        className="px-2 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-mono font-bold text-[10px] border border-emerald-300 transition-colors"
                        title="Bright FL 26 Roll 1"
                      >
                        121026AB12345-R01 (Roll 1)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBarcodeDecoded('121026AB12345-R02')}
                        className="px-2 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-mono font-bold text-[10px] border border-emerald-300 transition-colors"
                        title="Bright FL 26 Roll 2"
                      >
                        121026AB12345-R02 (Roll 2)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBarcodeDecoded('101026GE23542-R01')}
                        className="px-2 py-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-mono font-bold text-[10px] border border-amber-300 transition-colors"
                        title="Hetax Roll 1"
                      >
                        101026GE23542-R01
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBarcodeDecoded('OP-BS-163-R01')}
                        className="px-2 py-1 rounded-md bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-mono font-bold text-[10px] border border-indigo-300 transition-colors"
                        title="Opening Sunlex Roll 1"
                      >
                        OP-BS-163-R01
                      </button>
                    </div>
                  </div>
                </div>

                {/* Upload Image alternative */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Scan label photo from gallery:</span>
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
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-2xs hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload Image</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* REAL-TIME SCAN NOTIFICATION ALERT                         */}
            {/* ========================================================= */}
            {scanAlert && (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-start space-x-3 transition-all ${
                  scanAlert.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : scanAlert.type === 'warning'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-red-50 border-red-300 text-red-950'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {scanAlert.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  {scanAlert.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600" />}
                  {scanAlert.type === 'error' && <ShieldAlert className="w-4 h-4 text-red-600" />}
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="font-bold flex items-center gap-2">
                    <span>{scanAlert.title}</span>
                    {scanAlert.barcode && (
                      <span className="font-mono text-[10px] px-1.5 py-0.2 bg-white/80 rounded border">
                        {scanAlert.barcode}
                      </span>
                    )}
                  </div>
                  {scanAlert.detail && <p className="text-[11px] opacity-90">{scanAlert.detail}</p>}
                  {scanAlert.previousOutInvoice && (
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-200">
                        Dispatched Under Invoice: {scanAlert.previousOutInvoice}
                      </span>
                      {scanAlert.previousOutDate && (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-200">
                          Date: {scanAlert.previousOutDate}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setScanAlert(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ========================================================= */}
            {/* STEP 3: OUT STOCK LIST (TEMPORARY CART)                   */}
            {/* ========================================================= */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="w-4 h-4 text-slate-700" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                    OUT STOCK LIST
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-mono font-bold text-xs">
                    {cartRolls.length}
                  </span>
                </div>

                {cartRolls.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearCart}
                    className="text-xs text-red-600 hover:text-red-700 font-bold hover:underline cursor-pointer"
                  >
                    Clear List
                  </button>
                )}
              </div>

              {cartRolls.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <ArrowUpFromLine className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    No physical rolls scanned into OUT list yet.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Point camera at roll barcode stickers or scan with USB gun. Rolls will appear in this list.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Material</th>
                        <th className="py-2.5 px-3">Size</th>
                        <th className="py-2.5 px-3">Length</th>
                        <th className="py-2.5 px-3">Batch</th>
                        <th className="py-2.5 px-3">Roll Barcode</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cartRolls.map((roll, index) => (
                        <tr key={roll.rollBarcode} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-400">{index + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{roll.materialName}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{roll.size}M</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{roll.rollLength}M</td>
                          <td className="py-2.5 px-3 font-mono text-indigo-700">{roll.batchNumber}</td>
                          <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">
                              {roll.rollBarcode}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveRoll(roll.rollBarcode)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove from temporary OUT list"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Error banner during dispatch */}
            {dispatchError && (
              <div className="p-3.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 flex items-center space-x-2 font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{dispatchError}</span>
              </div>
            )}

            {/* ========================================================= */}
            {/* STEP 4: BOTTOM TOTALS & CONFIRM STOCK OUT                 */}
            {/* ========================================================= */}
            <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <span>Total Rolls OUT: </span>
                <strong className="text-slate-900 font-mono font-black text-sm">
                  {cartRolls.length}
                </strong>
                {cartRolls.length > 0 && (
                  <span className="text-slate-400 ml-2">
                    (Stock OUT will commit {cartRolls.length} rolls atomically)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={cartRolls.length === 0 || isSubmitting}
                  onClick={handleConfirmStockOut}
                  className="w-full sm:w-auto px-6 py-3 bg-[#C59B3F] hover:bg-[#b58b33] disabled:opacity-40 disabled:pointer-events-none text-zinc-950 font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Processing Dispatch...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>CONFIRM STOCK OUT ({cartRolls.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
