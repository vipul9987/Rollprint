import React, { useState } from 'react';
import { ShieldAlert, Database, CheckCircle2, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { createInventoryBackup, dismissDailyBackupForSession } from '../data/backupDatabase';
import { MatrixInventoryItem } from '../types/inventory';

interface DailyBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBackupSuccess: () => void;
  clientMaterials?: MatrixInventoryItem[];
  userEmail?: string;
}

export const DailyBackupModal: React.FC<DailyBackupModalProps> = ({
  isOpen,
  onClose,
  onBackupSuccess,
  clientMaterials,
  userEmail
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCreateBackup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createInventoryBackup('DAILY', clientMaterials, userEmail || 'STAFF');
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          onBackupSuccess();
          onClose();
        }, 1200);
      } else {
        setError(res.error || 'Backup failed. Inventory has not been backed up today.');
      }
    } catch (err: any) {
      setError(err?.message || 'Backup failed. Inventory has not been backed up today.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemindLater = () => {
    dismissDailyBackupForSession();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Decora Sales Gold Accents */}
        <div className="bg-gradient-to-r from-slate-950 via-zinc-900 to-slate-950 p-5 text-white flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#C59B3F]/20 text-[#D4A84B] rounded-xl border border-[#C59B3F]/40">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white uppercase flex items-center gap-1.5">
                <span>DAILY BACKUP</span>
                <span className="text-[10px] bg-[#C59B3F] text-slate-950 font-bold px-1.5 py-0.2 rounded-full">
                  REQUIRED
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">Inventory Protection System</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemindLater}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {error ? (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-start space-x-2.5 text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-xs">{error}</p>
                  <p className="text-[11px] text-rose-600 mt-0.5">
                    Please ensure database connectivity and retry to protect today's records.
                  </p>
                </div>
              </div>
            </div>
          ) : success ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-xs">Daily backup created successfully!</p>
                <p className="text-[11px] text-emerald-600">
                  All material master records, rolls, and transactions are securely preserved.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start space-x-2.5 text-amber-900">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-bold text-xs text-amber-950">
                    Today's inventory backup has not been created yet.
                  </p>
                  <p className="text-[11px] text-amber-800 mt-1">
                    To safeguard live inventory, physical roll barcodes, and ~100 Material Master records, creating a
                    daily backup is strongly recommended on the first login of every business day.
                  </p>
                </div>
              </div>

              {clientMaterials && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-slate-600">
                  <span className="text-[11px]">Material Master Records:</span>
                  <strong className="font-mono text-slate-900">{clientMaterials.length} items</strong>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2.5">
            {error ? (
              <>
                <button
                  type="button"
                  onClick={handleRemindLater}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Remind Me Later
                </button>
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={loading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow-sm transition-all"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>TRY AGAIN</span>
                </button>
              </>
            ) : success ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRemindLater}
                  disabled={loading}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  REMIND ME LATER
                </button>
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={loading}
                  className="px-4 py-2 bg-[#C59B3F] hover:bg-[#D4A84B] text-slate-950 rounded-xl font-black flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>CREATE BACKUP NOW</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
