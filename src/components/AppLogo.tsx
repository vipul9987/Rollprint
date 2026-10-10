import React, { useState } from 'react';

interface AppLogoProps {
  className?: string;
}

export function AppLogo({ className }: AppLogoProps = {}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`flex items-center select-none py-1 ${className || ''}`}>
      <div className="relative flex items-center justify-center shrink-0">
        {!imgError ? (
          /* Official Decora Sales Logo from public folder (Prominent & enlarged) */
          <img
            src="/logo.png"
            alt="Decora Sales"
            onError={() => setImgError(true)}
            style={{ objectFit: 'contain' }}
            className="h-16 sm:h-20 w-auto max-w-[260px] drop-shadow-md transition-transform hover:scale-[1.02] duration-200"
          />
        ) : (
          /* Fallback Decora Sales Circular Gold Medallion */
          <svg
            className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-sm transition-transform hover:scale-105 duration-200"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="50" r="48" fill="#0A192F" stroke="#E6AF2E" strokeWidth="3" />
            <circle cx="50" cy="50" r="41" stroke="#E6AF2E" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx="50" cy="50" r="33" fill="#0D233A" stroke="#E6AF2E" strokeWidth="1.5" />
            <text
              x="50"
              y="44"
              textAnchor="middle"
              fill="#E6AF2E"
              fontFamily="system-ui, sans-serif"
              fontWeight="900"
              fontSize="20"
              letterSpacing="2"
            >
              DS
            </text>
            <path d="M26 53 L74 53" stroke="#E6AF2E" strokeWidth="1" opacity="0.8" />
            <text
              x="50"
              y="63"
              textAnchor="middle"
              fill="#F5D77F"
              fontFamily="system-ui, sans-serif"
              fontWeight="700"
              fontSize="7.5"
              letterSpacing="2.5"
            >
              DECORA
            </text>
            <text
              x="50"
              y="72"
              textAnchor="middle"
              fill="#E6AF2E"
              fontFamily="system-ui, sans-serif"
              fontWeight="600"
              fontSize="6"
              letterSpacing="3"
              opacity="0.9"
            >
              SALES
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}
