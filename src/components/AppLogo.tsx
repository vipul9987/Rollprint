import React, { useState } from 'react';

const STORAGE_KEY_CUSTOM_LOGO = 'decora_sales_custom_logo_v1';
const LEGACY_STORAGE_KEY = 'rollprint_ims_custom_logo_v1';

export function AppLogo() {
  // Logo source priority:
  // 1. User uploaded in localStorage (persisted permanently)
  // 2. /logo.png placed in public/
  // 3. Fallback to vector medallion SVG
  const [customLogo, setCustomLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CUSTOM_LOGO) || localStorage.getItem(LEGACY_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const [staticLogoFailed, setStaticLogoFailed] = useState(false);
  const activeLogoSrc = customLogo || (!staticLogoFailed ? '/logo.png' : null);

  return (
    <div className="flex items-center space-x-3.5 select-none py-1">
      <div className="relative flex items-center justify-center shrink-0">
        {activeLogoSrc ? (
          /* Official Decora Sales Corporate Logo (Increased size) */
          <div className="relative flex items-center justify-center">
            <img
              src={activeLogoSrc}
              alt="Decora Sales Logo"
              onError={() => {
                if (customLogo) {
                  setCustomLogo(null);
                } else {
                  setStaticLogoFailed(true);
                }
              }}
              style={{ objectFit: 'contain' }}
              className="h-14 sm:h-16 w-auto max-w-[220px] drop-shadow-md transition-transform hover:scale-[1.02] duration-200"
            />
          </div>
        ) : (
          /* Official Decora Sales Circular Gold Medallion with Interlocking DS Monogram */
          <div className="relative flex items-center justify-center">
            <svg
              className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-sm transition-transform hover:scale-105 duration-200"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Decora Sales Warm Metallic Gold Medallion Gradient */}
                <linearGradient id="decoraMedallionGold" x1="15%" y1="10%" x2="85%" y2="90%">
                  <stop offset="0%" stopColor="#D4A84B" />
                  <stop offset="50%" stopColor="#C59B3F" />
                  <stop offset="100%" stopColor="#B3862E" />
                </linearGradient>
              </defs>

              {/* Circular Medallion Background */}
              <circle cx="50" cy="50" r="48" fill="url(#decoraMedallionGold)" />

              {/* Interlocking DS Monogram in Pure White */}
              <g fill="#FFFFFF" fillRule="evenodd">
                {/* 'D' Outer & Inner Counter */}
                <path
                  d="M 24 23
                     L 46 23
                     C 60 23, 68 31, 68 50
                     C 68 69, 60 77, 46 77
                     L 24 77
                     Z
                     M 34.5 33.5
                     L 34.5 66.5
                     L 45 66.5
                     C 53.5 66.5, 57.5 61, 57.5 50
                     C 57.5 39, 53.5 33.5, 45 33.5
                     Z"
                />

                {/* 'S' Intertwined Shape sweeping through D */}
                <path
                  d="M 68 32
                     C 62 25, 51 22, 43 24
                     C 39 25, 36 27, 34 30
                     L 42 36
                     C 44 34, 47 33, 51 33
                     C 56 33, 60 35, 60 38.5
                     C 60 41.5, 57 43.5, 49 46.5
                     C 38 50.5, 33 55, 33 63
                     C 33 72.5, 41 78, 54 78
                     C 63 78, 71 73, 76 65
                     L 68 59
                     C 65 64, 60 67.5, 54 67.5
                     C 48 67.5, 44 65, 44 61.5
                     C 44 58.5, 47 56.5, 54 53.5
                     C 66 49, 71 44.5, 71 37.5
                     C 71 35.5, 70 33.5, 68 32
                     Z"
                />
              </g>
            </svg>
          </div>
        )}
      </div>

      {/* Company Name & Tagline */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center space-x-2">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center space-x-1 leading-none">
            <span>Decora</span>
            <span className="text-[#D4A84B] font-extrabold">Sales</span>
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#C59B3F]/20 text-[#D4A84B] border border-[#C59B3F]/40 px-2.5 py-0.5 rounded-full">
            Verified
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 font-medium tracking-wide mt-1.5 leading-none">
          Roll &amp; Batch Inventory System
        </p>
      </div>
    </div>
  );
}
