'use client';

import { useState, useEffect } from 'react';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    // Only run in Electron
    if (typeof window === 'undefined') return;
    const electronAPI = (window as { electronAPI?: {
      isElectron?: boolean;
      onUpdateAvailable?: (cb: () => void) => void;
      onUpdateProgress?: (cb: (progress: DownloadProgress) => void) => void;
      onUpdateDownloaded?: (cb: () => void) => void;
      onUpdateError?: (cb: (error: string) => void) => void;
    } }).electronAPI;

    if (!electronAPI?.isElectron) return;

    // Listen for update events - don't auto-download, wait for user
    electronAPI.onUpdateAvailable?.(() => {
      setStatus('available');
    });

    electronAPI.onUpdateProgress?.((prog) => {
      setProgress(prog);
    });

    electronAPI.onUpdateDownloaded?.(() => {
      setStatus('ready');
    });

    electronAPI.onUpdateError?.(() => {
      setStatus('error');
      // Reset after a few seconds
      setTimeout(() => setStatus('idle'), 5000);
    });
  }, []);

  const handleDownload = () => {
    const electronAPI = (window as { electronAPI?: { downloadUpdate?: () => Promise<void> } }).electronAPI;
    electronAPI?.downloadUpdate?.();
    setStatus('downloading');
  };

  const handleInstall = () => {
    const electronAPI = (window as { electronAPI?: { installUpdate?: () => Promise<void> } }).electronAPI;
    electronAPI?.installUpdate?.();
  };

  // Don't render anything if no update or not in Electron
  if (status === 'idle' || status === 'error') {
    return null;
  }

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50">
      {status === 'available' && (
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066DD] active:scale-95 text-white rounded-full py-2.5 px-5 shadow-lg transition-all"
        >
          <span className="text-[14px] font-medium">Update World Chat</span>
        </button>
      )}

      {status === 'downloading' && (
        <div className="flex items-center gap-2 bg-[#007AFF] text-white rounded-full py-2.5 px-5 shadow-lg">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-[14px] font-medium">
            Downloading... {Math.round(progress?.percent || 0)}%
          </span>
        </div>
      )}

      {status === 'ready' && (
        <button
          onClick={handleInstall}
          className="flex items-center gap-2 bg-[#00C230] hover:bg-[#00A828] active:scale-95 text-white rounded-full py-2.5 px-5 shadow-lg transition-all"
        >
          <span className="text-[14px] font-medium">Restart to Update</span>
        </button>
      )}
    </div>
  );
}
