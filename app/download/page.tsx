"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Download, Apple } from "lucide-react";

const GITHUB_RELEASE_URL =
  "https://api.github.com/repos/andy-t-wang/world-chat-desktop/releases/latest";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

export default function DownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(GITHUB_RELEASE_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch release");
        return res.json();
      })
      .then((data) => {
        setRelease(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const dmgAsset = release?.assets.find((a) => a.name.endsWith(".dmg"));
  const version = release?.tag_name?.replace("v", "") || "";

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* App icon */}
        <Image
          src="/app-icon.png"
          alt="World Chat"
          width={80}
          height={80}
          className="mb-6"
        />

        {/* Title */}
        <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-[-0.02em] mb-2">
          World Chat for Mac
        </h1>

        {/* Version */}
        {version && (
          <p className="text-[15px] text-[#86868B] mb-8">Version {version}</p>
        )}

        {/* Download button */}
        {loading ? (
          <div className="flex items-center gap-2 text-[#86868B]">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        ) : error ? (
          <p className="text-[15px] text-[#FF3B30]">
            Failed to load download. Try again later.
          </p>
        ) : dmgAsset ? (
          <a
            href={dmgAsset.browser_download_url}
            className="flex items-center gap-3 px-6 py-3 bg-[#1D1D1F] text-white rounded-xl hover:bg-[#333] transition-colors"
          >
            <Apple className="w-5 h-5" />
            <div className="flex flex-col items-start">
              <span className="text-[15px] font-medium">Download for Mac</span>
              <span className="text-[12px] text-white/60">
                {formatSize(dmgAsset.size)} · Apple Silicon
              </span>
            </div>
            <Download className="w-4 h-4 ml-2" />
          </a>
        ) : (
          <p className="text-[15px] text-[#86868B]">No download available</p>
        )}

        {/* Requirements */}
        <div className="mt-12 text-center">
          <p className="text-[13px] text-[#86868B]">
            Requires macOS 11 Big Sur or later
          </p>
          <p className="text-[13px] text-[#86868B] mt-1">
            Apple Silicon (M1/M2/M3)
          </p>
        </div>
      </div>
    </div>
  );
}
