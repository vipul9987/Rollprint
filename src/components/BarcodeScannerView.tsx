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
  FileText,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  Check,
  Barcode as BarcodeIcon
} from 'lucide-react';
import { MatrixBatch, MatrixItemWithStock, InventoryRoll } from '../types/inventory';
import {
  extractRollBarcode,
  queryRollByExactBarcode,
  executeAtomicRollDispatch,
  AtomicRollDispatchResult,
  isProductionEnvironment,
  isSupabaseConfigured
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
  // DISPATCH HEADER INPUTS (Entered ONCE for the entire dispatch)
  // =========================================================================
  const [stockOutInvoice, setStockOutInvoice] = useState<string>('DS/26-27/1230');
  const [stockOutDate, setStockOutDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // =========================================================================
  // OUT STOCK LIST (TEMPORARY CART)
  // =========================================================================
  const [cartRolls, setCartRolls] = useState<InventoryRoll[]>([]);

  // Scan feedback alert message
  const [scanAlert, setScanAlert] = useState<ScanAlert | null>(null);

  // Manual Roll Barcode Input (USB gun / manual typing)
  const [manualInput, setManualInput] = useState<string>('');
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  // Submission / Dispatch state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dispatchError, setDispatchError] = useState<string>('');

  // Dispatch success report (Summary after confirmation)
  const [dispatchedReport, setDispatchedReport] = useState<{
    outInvoice: string;
    outDate: string;
    totalRolls: number;
    rolls: InventoryRoll[];
  } | null>(null);

  // Camera Scanner Modal State (Hidden by default, opens only on [Open Scanner])
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [modalFeedback, setModalFeedback] = useState<string>('');

  // Camera Hardware / Stream Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zxingControlsRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
          // Low buzz for duplicate / error
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

  // Stop camera stream cleanly
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
    setIsTorchOn(false);
    setHasTorchSupport(false);
  }, []);

  // =========================================================================
  // SCAN PROCESSING (ONE SCAN = ONE PHYSICAL ROLL)
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
      if (cartRolls.some((r) => r.rollBarcode.toUpperCase() === clean.toUpperCase())) {
        triggerScanAudio(false);
        const msg = 'Roll already added to this Stock OUT list.';
        setScanAlert({
          type: 'warning',
          title: msg,
          detail: `Roll ${clean} is already present in your OUT stock list.`,
          barcode: clean
        });
        setModalFeedback(`⚠️ ${clean} is already in the list`);
        return;
      }

      // 2. QUERY EXACT PHYSICAL ROLL FROM DATABASE
      const roll = await queryRollByExactBarcode(clean);

      if (!roll) {
        triggerScanAudio(false);
        const msg = 'Roll barcode not found.';
        setScanAlert({
          type: 'error',
          title: msg,
          detail: `No physical roll matches barcode "${clean}".`,
          barcode: clean
        });
        setModalFeedback(`❌ Barcode "${clean}" not found`);
        return;
      }

      // 3. ALREADY OUT PROTECTION
      if (roll.status === 'OUT') {
        triggerScanAudio(false);
        const msg = 'This roll has already been stocked out.';
        setScanAlert({
          type: 'error',
          title: msg,
          detail: 'This physical roll was previously dispatched and cannot be stocked out again.',
          barcode: roll.rollBarcode,
          previousOutInvoice: roll.stockOutInvoiceNumber || 'N/A',
          previousOutDate: roll.stockOutDate || 'N/A'
        });
        setModalFeedback(`❌ ${roll.rollBarcode} already OUT`);
        return;
      }

      // 4. VALID IN_STOCK PHYSICAL ROLL -> ADD TO OUT STOCK LIST
      triggerScanAudio(true);
      setCartRolls((prev) => [roll, ...prev]);
      setScanAlert({
        type: 'success',
        title: `Added: ${roll.materialName} (${roll.size}M × ${roll.rollLength}M)`,
        detail: `Batch: ${roll.batchNumber} • Roll Barcode: ${roll.rollBarcode}`,
        barcode: roll.rollBarcode
      });
      setModalFeedback(`✅ Added: ${roll.rollBarcode}`);

      // Clear & refocus manual input immediately for seamless USB gun workflow
      setManualInput('');
      setTimeout(() => manualInputRef.current?.focus(), 50);
    },
    [cartRolls, triggerScanAudio]
  );

  // Start Camera only when modal is open
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
      setCameraError(
        'Camera unavailable. Allow camera permission or enter/scan the Roll Barcode manually.'
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

  // Manage camera lifecycle strictly based on modal visibility
  useEffect(() => {
    if (isCameraModalOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isCameraModalOpen, facingMode, startCamera, stopCamera]);

  // Remove individual roll from OUT stock list
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

  // Handle Manual Input / USB scanner Submit
  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualInput.trim().toUpperCase();
    if (!clean) return;
    handleBarcodeDecoded(clean);
  };

  // Fallback photo file upload
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
        detail: 'Try entering the printed roll barcode number manually.'
      });
    }
  };

  // =========================================================================
  // ATOMIC CONFIRM STOCK OUT
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

    if (isProductionEnvironment() && !isSupabaseConfigured()) {
      setDispatchError(
        'DATABASE UNAVAILABLE: Remote Supabase database is not connected. Stock OUT mutations are locked in production to prevent device stock divergence.'
      );
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

      // Success Report view
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
      } max-w-3xl mx-auto space-y-5 font-sans antialiased`}
    >
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        {/* ========================================================= */}
        {/* HEADER: Decora Sales style                                 */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
              <ArrowUpFromLine className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Stock OUT</h2>
              <p className="text-xs text-slate-500">
                Dispatch physical rolls from warehouse inventory by roll barcode.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {cartRolls.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-xs font-mono border border-amber-300">
                {cartRolls.length} {cartRolls.length === 1 ? 'Roll' : 'Rolls'} in OUT List
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SUCCESS SUMMARY (When dispatch is confirmed)              */}
        {/* ========================================================= */}
        {dispatchedReport ? (
          <div className="p-6 space-y-6 bg-emerald-50/50 rounded-2xl border border-emerald-200 animate-in fade-in">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center mx-auto shadow-sm">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                STOCK OUT SUCCESSFUL
              </h3>
              <p className="text-xs text-emerald-800 font-medium">
                All physical rolls have been updated to OUT status in warehouse records.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md mx-auto pt-2">
                <div className="p-3 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">OUT Invoice</span>
                  <span className="font-mono font-black text-sm text-slate-900">{dispatchedReport.outInvoice}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">OUT Date</span>
                  <span className="font-mono font-black text-sm text-slate-900">{dispatchedReport.outDate}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Dispatched</span>
                  <span className="font-mono font-black text-sm text-emerald-700">{dispatchedReport.totalRolls} ROLLS</span>
                </div>
              </div>
            </div>

            {/* Dispatched rolls table */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Dispatched Physical Rolls ({dispatchedReport.rolls.length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Material</th>
                      <th className="py-2 px-3">Size</th>
                      <th className="py-2 px-3">Length</th>
                      <th className="py-2 px-3">Batch</th>
                      <th className="py-2 px-3">Roll Barcode</th>
                      <th className="py-2 px-3 text-right">Status</th>
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
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs flex items-center space-x-2 shadow-md transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#D4A84B]" />
                <span>Start Next Dispatch</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ========================================================= */}
            {/* COMPACT DATABASE CONNECTION GUARD ALERT                   */}
            {/* ========================================================= */}
            {isProductionEnvironment() && !isSupabaseConfigured() && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2.5 text-xs text-rose-800 font-medium">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Database unavailable. Remote Supabase connection is required in production to prevent inventory divergence.
                </span>
              </div>
            )}

            {/* ========================================================= */}
            {/* DISPATCH INFORMATION (OUT Invoice Number, OUT Date)       */}
            {/* ========================================================= */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#C59B3F]" />
                <span>Dispatch Information</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* OUT Invoice Number */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
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
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold uppercase placeholder:normal-case focus:ring-2 focus:ring-[#C59B3F] focus:outline-hidden"
                  />
                </div>

                {/* OUT Date */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    OUT Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={stockOutDate}
                    onChange={(e) => {
                      setStockOutDate(e.target.value);
                      setDispatchError('');
                    }}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#C59B3F] focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* SCAN ROLL BARCODE SECTION                                 */}
            {/* ========================================================= */}
            <div className="p-4 bg-gradient-to-r from-amber-50/70 to-orange-50/40 rounded-2xl border border-amber-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <BarcodeIcon className="w-4 h-4 text-amber-700" />
                  <span className="font-black text-slate-900 text-xs uppercase tracking-wide">
                    Scan Roll Barcode
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                  USB Gun or Camera Scanner
                </span>
              </div>

              {/* [ barcode input ] [ Add Roll ] [ Open Scanner ] */}
              <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={manualInputRef}
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Enter or scan Roll Barcode with USB gun (e.g. 121026AB12345-R01)..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm font-bold uppercase placeholder:normal-case focus:ring-2 focus:ring-[#C59B3F] focus:outline-hidden"
                  />
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={!manualInput.trim()}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Add Roll
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setModalFeedback('');
                      setIsCameraModalOpen(true);
                    }}
                    className="px-3.5 py-2.5 bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 font-bold text-xs rounded-xl shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-amber-600" />
                    <span>Open Scanner</span>
                  </button>
                </div>
              </form>

              {/* CAMERA ERROR NOTIFICATION (compact) */}
              {cameraError && (
                <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* REAL-TIME SCAN NOTIFICATION ALERT                         */}
            {/* ========================================================= */}
            {scanAlert && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start space-x-3 transition-all ${
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
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white/80 rounded border">
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
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ========================================================= */}
            {/* OUT STOCK LIST                                            */}
            {/* ========================================================= */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="w-4 h-4 text-slate-700" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
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
                    Enter or scan Roll Barcode with USB scanner, or click "Open Scanner" to scan roll labels with camera.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Material</th>
                          <th className="py-2.5 px-3">Size</th>
                          <th className="py-2.5 px-3">Length</th>
                          <th className="py-2.5 px-3">Batch</th>
                          <th className="py-2.5 px-3">Roll Barcode</th>
                          <th className="py-2.5 px-3 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cartRolls.map((roll, index) => (
                          <tr key={roll.rollBarcode} className="hover:bg-slate-50 font-medium">
                            <td className="py-2.5 px-3 font-bold text-slate-400">{index + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{roll.materialName}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{roll.size}M</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{roll.rollLength}M</td>
                            <td className="py-2.5 px-3 font-mono text-indigo-700">{roll.batchNumber}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">
                                {roll.rollBarcode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveRoll(roll.rollBarcode)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Remove roll from OUT list"
                                aria-label="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Dispatch Error Notification */}
            {dispatchError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{dispatchError}</span>
              </div>
            )}

            {/* ========================================================= */}
            {/* BOTTOM TOTALS & CONFIRM STOCK OUT                         */}
            {/* ========================================================= */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <span>Total Rolls OUT: </span>
                <strong className="text-slate-900 font-mono font-black text-sm">
                  {cartRolls.length}
                </strong>
                {cartRolls.length > 0 && (
                  <span className="text-slate-400 ml-2">
                    (Ready for atomic dispatch)
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={
                  cartRolls.length === 0 ||
                  isSubmitting ||
                  (isProductionEnvironment() && !isSupabaseConfigured())
                }
                onClick={handleConfirmStockOut}
                className="w-full sm:w-auto px-6 py-3 bg-[#C59B3F] hover:bg-[#b58b33] disabled:opacity-40 disabled:pointer-events-none text-zinc-950 font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Processing Stock OUT...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                    <span>CONFIRM STOCK OUT ({cartRolls.length})</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ========================================================= */}
      {/* CAMERA SCANNER MODAL (Opens only on [Open Scanner])        */}
      {/* ========================================================= */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Camera className="w-5 h-5 text-amber-600" />
                <span className="font-bold text-sm text-slate-900">Scan Roll Barcode</span>
                <span className="text-[11px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                  {cartRolls.length} in OUT list
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setIsCameraModalOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Close Scanner"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Video Viewport */}
            <div className="p-4 space-y-3">
              <div className="relative bg-slate-950 rounded-xl overflow-hidden min-h-[280px] max-h-[340px] flex items-center justify-center border border-slate-800">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* CODE128 Linear Reticle */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                  <div className="relative w-64 h-32 border-2 border-[#D4A84B]/70 rounded-xl flex items-center justify-center shadow-lg">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-[#D4A84B]" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-[#D4A84B]" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-[#D4A84B]" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-[#D4A84B]" />
                    {/* Animated laser guide */}
                    <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" />
                  </div>
                </div>

                {/* Camera stream controls overlay */}
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

                {/* Instant Scan Feedback Banner inside Modal */}
                {modalFeedback && (
                  <div className="absolute bottom-3 left-3 right-3 py-1.5 px-3 rounded-lg bg-black/80 backdrop-blur-md text-white font-mono font-bold text-xs text-center border border-white/20 animate-in fade-in">
                    {modalFeedback}
                  </div>
                )}

                {/* Camera Permission Error Overlay */}
                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/95 text-white p-5 flex flex-col items-center justify-center text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-400" />
                    <p className="text-xs text-slate-200 max-w-xs">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2 px-3 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100 flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Photo Instead</span>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-slate-500">
                Point camera at the physical roll's unique barcode sticker.
              </p>

              {/* Upload image alternative fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-slate-600 hover:text-slate-900 font-medium flex items-center space-x-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Photo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setIsCameraModalOpen(false);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors cursor-pointer"
              >
                Done Scanning ({cartRolls.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
