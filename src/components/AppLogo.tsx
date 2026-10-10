import React from 'react';

const STORAGE_KEY_CUSTOM_LOGO = 'decora_sales_custom_logo_v1';
const LEGACY_STORAGE_KEY = 'rollprint_ims_custom_logo_v1';

export function AppLogo() {
  // If a permanent corporate logo was provisioned, render it; otherwise render the official vector mark
  const customLogo = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CUSTOM_LOGO) || localStorage.getItem(LEGACY_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex items-center space-x-3.5 select-none py-1">
      {customLogo ? (
        /* Corporate Logo: Original aspect ratio preserved, strictly object-contain, zero background patch */
        <div className="relative flex items-center justify-center shrink-0">
          <img
            src={customLogo}
            alt="Decora Sales Logo"
            style={{ objectFit: 'contain' }}
            className="h-10 w-auto max-w-[180px] drop-shadow-xs"
          />
        </div>
      ) : (
        /* Official Decora Sales Brand Mark: Warm Gold & Deep Navy palette, zero background patch */
        <div className="relative flex items-center justify-center shrink-0">
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
        </div>
      )}

      {/* Company Name & Tagline: Fixed, permanent corporate branding */}
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
  );
}
