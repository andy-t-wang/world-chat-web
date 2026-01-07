'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdateInfo {
  version: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    // Only run in Electron
    if (typeof window === 'undefined') return;
    const electronAPI = (window as { electronAPI?: {
      isElectron?: boolean;
      onUpdateAvailable?: (cb: (info: UpdateInfo) => void) => void;
      onUpdateProgress?: (cb: (progress: DownloadProgress) => void) => void;
      onUpdateDownloaded?: (cb: (info: UpdateInfo) => void) => void;
      onUpdateError?: (cb: (error: string) => void) => void;
      downloadUpdate?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
    } }).electronAPI;

    if (!electronAPI?.isElectron) return;

    // Listen for update events
    electronAPI.onUpdateAvailable?.((info) => {
      setStatus('available');
      setUpdateInfo(info);
      // Auto-start download
      electronAPI.downloadUpdate?.();
      setStatus('downloading');
    });

    electronAPI.onUpdateProgress?.((prog) => {
      setProgress(prog);
    });

    electronAPI.onUpdateDownloaded?.((info) => {
      setStatus('ready');
      setUpdateInfo(info);
    });

    electronAPI.onUpdateError?.(() => {
      setStatus('error');
      // Reset after a few seconds
      setTimeout(() => setStatus('idle'), 5000);
    });
  }, []);

  const handleInstall = () => {
    const electronAPI = (window as { electronAPI?: { installUpdate?: () => Promise<void> } }).electronAPI;
    electronAPI?.installUpdate?.();
  };

  // Don't render anything if no update or not in Electron
  if (status === 'idle' || status === 'error') {
    return null;
  }

  return (
    <div className="mx-3 mb-3">
      {status === 'downloading' && (
        <div className="bg-[#F2F2F7] rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-[#007AFF] flex items-center justify-center">
              <ArrowUp className="w-3 h-3 text-white" />
            </div>
            <span className="text-[13px] text-[#1D1D1F]">
              Downloading update... {Math.round(progress?.percent || 0)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#E5E5EA] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#007AFF] rounded-full transition-all duration-300"
              style={{ width: `${progress?.percent || 0}%` }}
            />
          </div>
        </div>
      )}

      {status === 'ready' && (
        <button
          onClick={handleInstall}
          className="w-full flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#0066DD] text-white rounded-xl py-3 px-4 transition-colors"
        >
          <ArrowUp className="w-4 h-4" />
          <span className="text-[14px] font-medium">
            Update World Chat {updateInfo?.version ? `to ${updateInfo.version}` : ''}
          </span>
        </button>
      )}

      {status === 'available' && (
        <div className="bg-[#F2F2F7] rounded-xl p-3 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#007AFF] flex items-center justify-center">
            <ArrowUp className="w-3 h-3 text-white" />
          </div>
          <span className="text-[13px] text-[#1D1D1F]">
            Update available...
          </span>
        </div>
      )}
    </div>
  );
}
