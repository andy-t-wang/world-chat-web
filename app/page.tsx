"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useQRXmtpClient } from "@/hooks/useQRXmtpClient";
import { RemoteSigner, generateSessionId } from "@/lib/signing-relay";
import { RefreshCw, Shield, Check } from "lucide-react";

const MINI_APP_ID =
  process.env.NEXT_PUBLIC_WORLD_MINI_APP_ID || "app_your_app_id";

type LoginState =
  | "initializing"
  | "waiting_for_scan"
  | "mobile_connected"
  | "authenticating"
  | "initializing_xmtp"
  | "signing"
  | "success"
  | "error";

// Subtle pulsing loader - Apple style
function PulseLoader() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-[#86868B]"
          style={{
            animation: "pulse-fade 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>("initializing");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false); // Only true once we know we need QR login
  const [showStagingWarning, setShowStagingWarning] = useState(false);
  const signerRef = useRef<RemoteSigner | null>(null);
  const { initializeWithRemoteSigner, restoreSession } = useQRXmtpClient();

  const qrUrl = sessionId
    ? `https://worldcoin.org/mini-app?app_id=${MINI_APP_ID}&path=${encodeURIComponent(
        `/sign?session=${sessionId}`
      )}`
    : null;

  const startSession = async (isInitial = false) => {
    signerRef.current?.cleanup();

    setError(null);
    setConnectedAddress(null);

    try {
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);

      const signer = new RemoteSigner(newSessionId, {
        onMobileConnected: (address) => {
          setConnectedAddress(address);
          setState("mobile_connected");
        },
        onAuthenticating: () => {
          setState("authenticating");
        },
        onAuthenticated: (address) => {
          setConnectedAddress(address);
        },
        onSigningRequest: () => {
          setState("signing");
        },
        onSigningComplete: () => {},
        onError: (err) => {
          setError(err.message);
          setState("error");
        },
      });

      signerRef.current = signer;
      setState("waiting_for_scan");

      // Only set ready (trigger animations) on initial load, not retries
      if (isInitial) {
        setIsReady(true);
      }

      await signer.connect();
      setState("initializing_xmtp");

      try {
        await initializeWithRemoteSigner(signer.getSigner());
        // Notify mobile that login is complete
        await signer.complete();
        setState("success");
        setTimeout(() => {
          router.push("/chat");
        }, 500);
      } catch (xmtpError) {
        console.error("XMTP initialization failed:", xmtpError);
        setError(
          xmtpError instanceof Error
            ? xmtpError.message
            : "Failed to initialize messaging"
        );
        setState("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setState("error");
    }
  };

  const handleRetry = () => {
    signerRef.current?.cleanup();
    startSession();
  };

  useEffect(() => {
    // Try to restore existing session first
    restoreSession()
      .then((restored) => {
        if (restored) {
          // Session restored, redirect to chat
          router.push("/chat");
        } else {
          // No session, start QR flow
          startSession(true);
        }
      })
      .catch((error) => {
        // Check if another tab has the session
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage === "TAB_LOCKED") {
          // Redirect to chat page which will show the "open in another tab" message
          router.push("/chat");
        } else {
          // Other error, start QR flow
          startSession(true);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show staging app warning after 10 seconds of waiting for scan
  useEffect(() => {
    if (state !== "waiting_for_scan") {
      setShowStagingWarning(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowStagingWarning(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, [state]);

  const getStatusText = () => {
    switch (state) {
      case "initializing":
        return ""; // Don't show text while checking session
      case "waiting_for_scan":
        return "Scan with your Phone Camera";
      case "mobile_connected":
        return "Connected";
      case "authenticating":
        return "Approve in World App";
      case "signing":
        return "Approve in World App";
      case "initializing_xmtp":
        return "Setting up...";
      case "success":
        return "Welcome";
      case "error":
        return error || "Something went wrong";
      default:
        return "";
    }
  };

  const isLoading = [
    "initializing",
    "mobile_connected",
    "authenticating",
    "signing",
    "initializing_xmtp",
  ].includes(state);

  const showQR = state === "waiting_for_scan" && qrUrl;

  // Show minimal loading while checking session
  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-6">
        <PulseLoader />
      </div>
    );
  }

  return (
    <>
      {/* Keyframe animations */}
      <style jsx global>{`
        @keyframes pulse-fade {
          0%,
          100% {
            opacity: 0.4;
            transform: scale(0.95);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes glow-pulse {
          0%,
          100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.02);
          }
        }
        @keyframes shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
        .animate-glow {
          animation: glow-pulse 3s ease-in-out infinite;
        }
        .stagger-1 {
          animation-delay: 0.1s;
          opacity: 0;
        }
        .stagger-2 {
          animation-delay: 0.2s;
          opacity: 0;
        }
        .stagger-3 {
          animation-delay: 0.3s;
          opacity: 0;
        }
        .stagger-4 {
          animation-delay: 0.5s;
          opacity: 0;
        }
      `}</style>

      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Subtle radial gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,122,255,0.03)_0%,_transparent_50%)]" />

        <div className="w-full max-w-sm flex flex-col items-center relative z-10">
          {/* Title with staggered animation */}
          <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-[-0.03em] mb-3 animate-fade-in">
            World Chat
          </h1>

          {/* E2EE Badge - Refined pill design */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#E8F5E9] border border-[#A5D6A7]/30 mb-10 animate-fade-in stagger-1">
            <Shield className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span className="text-[13px] font-medium text-[#2E7D32]">
              End-to-end encrypted
            </span>
          </div>

          {/* QR Code Card with glow effect */}
          <div className="relative mb-8 animate-fade-in stagger-2">
            {/* Animated glow ring - only when showing QR */}
            {showQR && (
              <div className="absolute -inset-3 rounded-[32px] bg-gradient-to-r from-[#007AFF]/20 via-[#34C759]/20 to-[#007AFF]/20 blur-xl animate-glow" />
            )}

            {/* Main card */}
            <div className="relative w-[280px] h-[280px] rounded-3xl flex items-center justify-center bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] border border-black/[0.04]">
              {showQR ? (
                <div className="relative animate-scale-in">
                  <QRCodeSVG
                    value={qrUrl}
                    size={220}
                    level="M"
                    includeMargin={false}
                    bgColor="transparent"
                    fgColor="#1D1D1F"
                  />
                </div>
              ) : state === "error" ? (
                <div className="animate-scale-in w-16 h-16 rounded-full bg-[#FF3B30]/10 flex items-center justify-center">
                  <svg
                    className="w-7 h-7 text-[#FF3B30]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              ) : state === "success" ? (
                <div className="animate-scale-in w-16 h-16 rounded-full bg-[#34C759]/10 flex items-center justify-center">
                  <Check className="w-7 h-7 text-[#34C759]" strokeWidth={2.5} />
                </div>
              ) : (
                <PulseLoader />
              )}
            </div>
          </div>

          {/* Status */}
          <p
            className={`text-[15px] font-medium mb-3 transition-all duration-200 animate-fade-in stagger-3 ${
              state === "error"
                ? "text-[#FF3B30]"
                : state === "success"
                ? "text-[#34C759]"
                : "text-[#1D1D1F]"
            }`}
          >
            {getStatusText()}
          </p>

          {/* Address */}
          {connectedAddress && state !== "error" && (
            <p className="text-[13px] text-[#86868B] font-mono mb-4 animate-fade-in">
              {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
            </p>
          )}

          {/* Retry */}
          {state === "error" && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-medium text-[#007AFF] hover:bg-[#007AFF]/5 active:bg-[#007AFF]/10 rounded-full transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          )}

          {/* Loading hint */}
          {isLoading && state !== "initializing" && (
            <p className="text-[13px] text-[#86868B] animate-fade-in">
              Keep World App open
            </p>
          )}

          {/* Staging app warning - shown after 10 seconds */}
          {showStagingWarning && state === "waiting_for_scan" && (
            <p className="text-[12px] text-[#FF9500] text-center max-w-[280px] animate-fade-in mt-2">
              If you have the staging World App installed, the deep link will
              not work. Make sure to delete it.
            </p>
          )}

          {/* Footer - Trust signals */}
          <div className="mt-16 text-center animate-fade-in stagger-4">
            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="flex items-center gap-1.5 text-[11px] text-[#86868B]">
                <div className="w-1 h-1 rounded-full bg-[#34C759]" />
                <span>Secured by XMTP</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#86868B]">
                <div className="w-1 h-1 rounded-full bg-[#007AFF]" />
                <span>World ID Verified</span>
              </div>
            </div>

            <p className="text-[11px] text-[#AEAEB2] leading-[1.6] max-w-[280px] mb-3">
              Messages stored locally only. Clearing browser data deletes
              history.
            </p>
            <a
              href="https://world.org/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[12px] font-medium text-[#007AFF] hover:text-[#0066CC] transition-colors duration-200"
            >
              Get World App →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
