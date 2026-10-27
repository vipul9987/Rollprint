import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  History,
  FileCheck,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  InventoryBackup,
  MatrixInventoryItem
} from '../types/inventory';
import {
  listInventoryBackups,
  createInventoryBackup,
  executeRestoreOldData,
  checkTodayDailyBackup
} from '../data/backupDatabase';

interface BackupRestoreViewProps {
  clientMaterials?: MatrixInventoryItem[];
  userEmail?: string;
  onRestoreSuccess: () => void;
  showNotification: (msg: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({
  clientMaterials,
  userEmail,
  onRestoreSuccess,
  showNotification
}) => {
  const [backups, setBackups] = useState<InventoryBackup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [selectedBackup, setSelectedBackup] = useState<InventoryBackup | null>(null);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [restoring, setRestoring] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const reloadBackups = async () => {
    setLoading(true);
    try {
      const list = await listInventoryBackups();
      setBackups(list);
      if (list.length > 0 && !selectedBackup) {
        setSelectedBackup(list[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadBackups();
  }, []);

  const handleManualBackup = async () => {
    setCreating(true);
    try {
      const res = await createInventoryBackup('MANUAL', clientMaterials, userEmail || 'STAFF');
      if (res.success && res.backup) {
        showNotification(`Manual backup created successfully: ${res.backup.id}`, 'success');
        await reloadBackups();
        setSelectedBackup(res.backup);
      } else {
        showNotification(res.error || 'Failed to create backup.', 'error');
      }
    } catch (e: any) {
      showNotification(e?.message || 'Error creating manual backup', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleStartRestore = (backup: InventoryBackup) => {
    setSelectedBackup(backup);
    setConfirmInput('');
    setRestoreError(null);
    setIsRestoreModalOpen(true);
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackup) return;
    if (confirmInput.trim() !== 'RESTORE') {
      setRestoreError('Please type RESTORE exactly to confirm replacement of live data.');
      return;
    }

    setRestoring(true);
    setRestoreError(null);

    try {
      const res = await executeRestoreOldData(selectedBackup.id, userEmail || 'STAFF');
      if (res.success) {
        showNotification(
          `Inventory successfully restored from backup (${selectedBackup.backupDate}). Pre-restore safety backup created: ${res.preRestoreBackupId}`,
          'success'
        );
        setIsRestoreModalOpen(false);
        onRestoreSuccess();
        await reloadBackups();
      } else {
        setRestoreError(res.error || 'Restore failed. Current data remained untouched.');
      }
    } catch (err: any) {
      setRestoreError(err?.message || 'Restore error occurred. Aborted.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-zinc-900 to-slate-950 p-6 rounded-2xl border border-zinc-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-[#C59B3F]/20 text-[#D4A84B] rounded-xl border border-[#C59B3F]/30 shadow-sm">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-black tracking-wide uppercase text-white">
                Backup &amp; Restore
              </h2>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                Data Protection
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Securely preserve all ~100 Material Master records, physical rolls, batches, and transactions.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={reloadBackups}
            disabled={loading}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleManualBackup}
            disabled={creating}
            className="px-4 py-2 bg-[#C59B3F] hover:bg-[#D4A84B] text-slate-950 font-black rounded-xl text-xs flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
            <span>CREATE BACKUP NOW</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Backup List & Selected Backup Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Available Backups List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Available Backups ({backups.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Database &amp; Local Persistence
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#C59B3F]" />
                <p className="text-xs">Loading backup catalog...</p>
              </div>
            ) : backups.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <Database className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No inventory backups recorded yet.</p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Click [ CREATE BACKUP NOW ] above to generate the first comprehensive snapshot.
                </p>
              </div>
            ) : (
              backups.map((b) => {
                const isSelected = selectedBackup?.id === b.id;
                const formattedDate = new Date(b.createdAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                });
                const formattedTime = new Date(b.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBackup(b)}
                    className={`p-4 flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-slate-900">
                          {formattedDate} — {b.backupType === 'DAILY' ? 'Daily' : b.backupType === 'PRE_RESTORE' ? 'Pre-Restore Safety' : 'Manual'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            b.backupType === 'DAILY'
                              ? 'bg-blue-100 text-blue-800'
                              : b.backupType === 'PRE_RESTORE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {b.backupType}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formattedTime}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-500 font-mono">
                        <span>Materials: <strong>{b.recordCounts?.materialsCount ?? 0}</strong></span>
                        <span>•</span>
                        <span>Rolls: <strong>{b.recordCounts?.physicalRollsCount ?? 0}</strong></span>
                        <span>•</span>
                        <span>Txns: <strong>{b.recordCounts?.transactionsCount ?? 0}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRestore(b);
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Backup Details Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <FileCheck className="w-4 h-4 text-slate-500" />
              <span>Backup Details</span>
            </h3>
            {selectedBackup && (
              <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                {selectedBackup.id}
              </span>
            )}
          </div>

          {selectedBackup ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Backup Date</span>
                  <strong className="text-xs text-slate-800 font-mono">{selectedBackup.backupDate}</strong>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Type</span>
                  <strong className="text-xs text-slate-800 font-mono">{selectedBackup.backupType}</strong>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Created Info</span>
                <div className="text-[11px] text-slate-700 space-y-0.5">
                  <p>Timestamp: <strong className="font-mono">{new Date(selectedBackup.createdAt).toLocaleString()}</strong></p>
                  <p>Created By: <strong className="font-mono">{selectedBackup.createdBy}</strong></p>
                  <p>Status: <span className="font-bold text-emerald-600">COMPLETED</span></p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Verified Counts</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Materials:</span>
                    <strong>{selectedBackup.recordCounts?.materialsCount ?? 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Physical Rolls:</span>
                    <strong>{selectedBackup.recordCounts?.physicalRollsCount ?? 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">In Stock Rolls:</span>
                    <strong className="text-emerald-700">{selectedBackup.recordCounts?.inStockCount ?? 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Out Rolls:</span>
                    <strong className="text-slate-600">{selectedBackup.recordCounts?.outStockCount ?? 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Batches:</span>
                    <strong>{selectedBackup.recordCounts?.batchesCount ?? 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Transactions:</span>
                    <strong>{selectedBackup.recordCounts?.transactionsCount ?? 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dispatches:</span>
                    <strong>{selectedBackup.recordCounts?.dispatchesCount ?? 0}</strong>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleStartRestore(selectedBackup)}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESTORE OLD DATA</span>
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-1.5">
                  Restores this exact inventory snapshot after taking an automatic pre-restore safety backup.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Select a backup from the left to view details.
            </div>
          )}
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && selectedBackup && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-300 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-200" />
                <h3 className="text-sm font-black tracking-wide uppercase">
                  CONFIRM INVENTORY RESTORATION
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRestoreModalOpen(false)}
                className="text-rose-200 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
                <p className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>AUTOMATIC PRE-RESTORE SAFETY GUARANTEE</span>
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Before applying this restore, the system will automatically create a <strong>FULL BACKUP OF CURRENT LIVE STATE</strong>. If this safety backup fails, the restore is immediately aborted to protect current records.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <p className="font-bold text-slate-800">You are about to restore:</p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-700">
                  <p>Date: <strong>{selectedBackup.backupDate}</strong></p>
                  <p>Type: <strong>{selectedBackup.backupType}</strong></p>
                  <p>Materials: <strong>{selectedBackup.recordCounts?.materialsCount ?? 0}</strong></p>
                  <p>Physical Rolls: <strong>{selectedBackup.recordCounts?.physicalRollsCount ?? 0}</strong></p>
                  <p>Transactions: <strong>{selectedBackup.recordCounts?.transactionsCount ?? 0}</strong></p>
                  <p>Dispatches: <strong>{selectedBackup.recordCounts?.dispatchesCount ?? 0}</strong></p>
                </div>
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-rose-900">
                <p className="font-bold text-xs text-rose-950">
                  "You are about to replace the current inventory state with this backup."
                </p>
                <p className="text-[11px] text-rose-800">
                  Please type <strong className="font-mono bg-rose-100 px-1.5 py-0.5 rounded text-rose-950">RESTORE</strong> below to confirm.
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type RESTORE to confirm"
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {restoreError && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-lg text-red-800 text-[11px] font-semibold">
                  {restoreError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(false)}
                  disabled={restoring}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={confirmInput.trim() !== 'RESTORE' || restoring}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-black flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
                >
                  {restoring && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>CONFIRM &amp; RESTORE</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
