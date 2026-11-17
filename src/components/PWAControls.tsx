import React, { useState } from 'react';
import { Download, RefreshCw, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        Install Offline App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Install on iPhone / iPad
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong> for full offline access.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-lg bg-slate-900 dark:bg-sky-600 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-sky-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

interface OfflineBarProps {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  onSyncNow: () => void;
}

export const OfflineStatusBar: React.FC<OfflineBarProps> = ({
  isOnline,
  pendingCount,
  syncing,
  onSyncNow,
}) => {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`border-b px-4 sm:px-6 py-2 text-xs ${
        !isOnline
          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200'
          : 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-900 text-sky-950 dark:text-sky-200'
      }`}
    >
      <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
          )}
          <span>
            {!isOnline
              ? 'Offline Mode — Cached exams, Physics Lab, Scientific Calculator, Library PDFs, and local ACSEE marking remain available.'
              : `${pendingCount} offline action(s) queued for server sync.`}
          </span>
          {!isOnline && pendingCount > 0 && (
            <span className="font-mono font-semibold tabular-nums">
              · {pendingCount} queued
            </span>
          )}
        </div>

        {isOnline && pendingCount > 0 && (
          <button
            onClick={onSyncNow}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-sky-700 text-white rounded-md hover:bg-sky-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Queued Work'}
          </button>
        )}
      </div>
    </div>
  );
};
