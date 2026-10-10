import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Upload, X, RotateCcw, Check, Wand2 } from 'lucide-react';

const STORAGE_KEY_CUSTOM_LOGO = 'decora_sales_custom_logo_v1';
const LEGACY_STORAGE_KEY = 'rollprint_ims_custom_logo_v1';
const STORAGE_KEY_AUTO_REMOVE_BG = 'decora_sales_auto_remove_bg_v1';

// Helper to remove white/light background patch from uploaded logo image
function removeWhiteBackgroundFromImage(dataUrl: string, threshold: number = 225): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r >= threshold && g >= threshold && b >= threshold) {
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        console.warn('Canvas background removal skipped:', e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function AppLogo() {
  const [customLogo, setCustomLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CUSTOM_LOGO) || localStorage.getItem(LEGACY_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const [rawUploadedLogo, setRawUploadedLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CUSTOM_LOGO) || localStorage.getItem(LEGACY_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const [autoRemoveBg, setAutoRemoveBg] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem(STORAGE_KEY_AUTO_REMOVE_BG);
      return val !== null ? val === 'true' : true;
    } catch {
      return true;
    }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync favicon if custom logo exists
  useEffect(() => {
    if (customLogo) {
      try {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = customLogo;
      } catch (err) {
        console.error('Failed to set favicon', err);
      }
    }
  }, [customLogo]);

  const processAndSaveLogo = async (imgDataUrl: string, removePatch: boolean) => {
    setIsProcessing(true);
    let finalLogo = imgDataUrl;
    if (removePatch) {
      try {
        finalLogo = await removeWhiteBackgroundFromImage(imgDataUrl);
      } catch (err) {
        console.warn('Error removing background patch:', err);
      }
    }
    setCustomLogo(finalLogo);
    setRawUploadedLogo(imgDataUrl);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_LOGO, finalLogo);
      localStorage.setItem(STORAGE_KEY_AUTO_REMOVE_BG, removePatch ? 'true' : 'false');
    } catch (err) {
      console.error('Storage full', err);
    }
    setIsProcessing(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 5MB. Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      await processAndSaveLogo(result, autoRemoveBg);
      setIsModalOpen(false);
      setErrorMsg('');
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUrl = async () => {
    if (!urlInput.trim()) {
      setErrorMsg('Please enter an image URL.');
      return;
    }
    await processAndSaveLogo(urlInput.trim(), autoRemoveBg);
    setIsModalOpen(false);
    setUrlInput('');
    setErrorMsg('');
  };

  const handleToggleAutoRemoveBg = async () => {
    const nextVal = !autoRemoveBg;
    setAutoRemoveBg(nextVal);
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_REMOVE_BG, nextVal ? 'true' : 'false');
    } catch {}

    if (rawUploadedLogo) {
      await processAndSaveLogo(rawUploadedLogo, nextVal);
    }
  };

  const handleResetToDefault = () => {
    setCustomLogo(null);
    setRawUploadedLogo(null);
    try {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_LOGO);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
    setIsModalOpen(false);
    setErrorMsg('');
  };

  return (
    <>
      {/* Clickable Header Brand: Vertical alignment, no distortion, object-fit contain, zero background patch */}
      <div
        onClick={() => setIsModalOpen(true)}
        className="group flex items-center space-x-3.5 cursor-pointer select-none py-1"
        title="Click to customize Decora Sales logo"
      >
        {customLogo ? (
          /* Custom Logo: Preserves original aspect ratio, strictly object-contain, no background patch or distortion */
          <div className="relative flex items-center justify-center shrink-0">
            <img
              src={customLogo}
              alt="Decora Sales Logo"
              style={{ objectFit: 'contain' }}
              className="h-10 w-auto max-w-[180px] drop-shadow-xs transition-opacity group-hover:opacity-90"
            />
            <span className="absolute -bottom-1 -right-1 p-0.5 bg-amber-500 rounded-full text-[9px] text-slate-950 opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
              <Upload className="w-2.5 h-2.5" />
            </span>
          </div>
        ) : (
          /* Default Decora Sales Brand Mark: Warm Gold & Deep Navy palette, zero background patch */
          <div className="relative flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <svg
              className="w-9 h-9"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="decoraGoldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FDE68A" />
                  <stop offset="30%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
                <linearGradient id="decoraNavySpine" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="50%" stopColor="#0284C7" />
                  <stop offset="100%" stopColor="#0369A1" />
                </linearGradient>
                <linearGradient id="decoraRibbon" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#B45309" />
                </linearGradient>
              </defs>

              {/* Unrolling Cylinder / 'D' Monogram for Decora Sales */}
              {/* Roll Spine */}
              <rect x="4.5" y="4" width="4.5" height="28" rx="2.25" fill="url(#decoraNavySpine)" />

              {/* Decorative Unrolling Gold Ribbon forming 'D' */}
              <path
                d="M7 6C18 6 30.5 9 30.5 18C30.5 27 18 30 7 30"
                stroke="url(#decoraGoldGradient)"
                strokeWidth="3.6"
                strokeLinecap="round"
              />

              {/* Inner Media Core */}
              <ellipse cx="14.5" cy="18" rx="3.5" ry="7.5" fill="none" stroke="url(#decoraRibbon)" strokeWidth="2.2" />
              <ellipse cx="14.5" cy="18" rx="1.6" ry="3.2" fill="#F59E0B" />

              {/* Precision measurement/print tick marks */}
              <line x1="22" y1="12" x2="25" y2="12" stroke="#FEF3C7" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="24.5" y1="18" x2="28" y2="18" stroke="#FEF3C7" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="22" y1="24" x2="25" y2="24" stroke="#FEF3C7" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="absolute -bottom-1 -right-1 p-0.5 bg-[#0A192F] text-amber-400 border border-amber-500/40 rounded-full text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload className="w-2.5 h-2.5" />
            </span>
          </div>
        )}

        {/* Company Name & Tagline vertically aligned */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center space-x-2">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center space-x-1 leading-none">
              <span>Decora</span>
              <span className="text-amber-400 font-bold">Sales</span>
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
              Verified
            </span>
          </div>
          <p className="text-[11px] text-slate-300 font-medium tracking-wide mt-1 leading-none">
            Roll &amp; Batch Inventory System
          </p>
        </div>
      </div>

      {/* Modal: Customize / Replace Logo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0A192F]/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Customize Decora Sales Logo</h3>
                  <p className="text-[11px] text-slate-500">Upload or customize brand identity</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setErrorMsg('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {errorMsg}
              </div>
            )}

            {/* Current Header Preview (On Deep Navy background, zero patch) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="text-xs">
                <span className="text-slate-500 block text-[11px]">Header Preview:</span>
                <span className="font-bold text-slate-900">
                  {customLogo ? 'Custom Uploaded Logo' : 'Default Decora Sales Brand'}
                </span>
                <span className="text-[10px] text-emerald-600 block font-medium mt-0.5">
                  &bull; Background patch removed &bull; Aspect ratio preserved
                </span>
              </div>
              <div className="h-12 px-4 bg-[#0A192F] rounded-lg flex items-center justify-center border border-slate-800">
                {customLogo ? (
                  <img
                    src={customLogo}
                    alt="Preview"
                    style={{ objectFit: 'contain' }}
                    className="h-9 w-auto max-w-[130px]"
                  />
                ) : (
                  <div className="text-white text-xs font-black flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span>Decora Sales</span>
                  </div>
                )}
              </div>
            </div>

            {/* Background Patch Removal Toggle */}
            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wand2 className="w-4 h-4 text-amber-700" />
                <div>
                  <span className="text-xs font-bold text-amber-950 block">Transparent Logo / Remove White Box</span>
                  <span className="text-[10px] text-amber-800">Strips background patch from uploaded logo files</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleAutoRemoveBg}
                disabled={isProcessing}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  autoRemoveBg ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {autoRemoveBg ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {/* Upload Option 1: File Upload */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Option 1: Upload Image File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-3 px-4 border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/40 hover:bg-amber-50/80 rounded-xl text-xs font-bold text-amber-900 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-amber-600" />
                <span>{isProcessing ? 'Processing image...' : 'Choose Image File (PNG, JPG, SVG, WebP)'}</span>
              </button>
            </div>

            {/* Upload Option 2: Image URL */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Option 2: Paste Image URL</label>
              <div className="flex space-x-2">
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-[#0A192F] hover:bg-[#1E293B] text-amber-400 font-bold rounded-xl text-xs flex items-center space-x-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply</span>
                </button>
              </div>
            </div>

            {/* Actions: Reset / Close */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              {customLogo ? (
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to Default Decora Sales Logo</span>
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">Default Decora Sales brand active</span>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setErrorMsg('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
