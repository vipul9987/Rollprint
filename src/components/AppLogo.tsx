import React, { useState } from 'react';

export function AppLogo() {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center select-none py-1">
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
            <defs>
              <linearGradient id="decoraMedallionGold" x1="15%" y1="10%" x2="85%" y2="90%">
                <stop offset="0%" stopColor="#D4A84B" />
                <stop offset="50%" stopColor="#C59B3F" />
                <stop offset="100%" stopColor="#B3862E" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#decoraMedallionGold)" />
            <g fill="#FFFFFF" fillRule="evenodd">
              <path
                d="M 24 23 L 46 23 C 60 23, 68 31, 68 50 C 68 69, 60 77, 46 77 L 24 77 Z M 34.5 33.5 L 34.5 66.5 L 45 66.5 C 53.5 66.5, 57.5 61, 57.5 50 C 57.5 39, 53.5 33.5, 45 33.5 Z"
              />
              <path
                d="M 68 32 C 62 25, 51 22, 43 24 C 39 25, 36 27, 34 30 L 42 36 C 44 34, 47 33, 51 33 C 56 33, 60 35, 60 38.5 C 60 41.5, 57 43.5, 49 46.5 C 38 50.5, 33 55, 33 63 C 33 72.5, 41 78, 54 78 C 63 78, 71 73, 76 65 L 68 59 C 65 64, 60 67.5, 54 67.5 C 48 67.5, 44 65, 44 61.5 C 44 58.5, 47 56.5, 54 53.5 C 66 49, 71 44.5, 71 37.5 C 71 35.5, 70 33.5, 68 32 Z"
              />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
