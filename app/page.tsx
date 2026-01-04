"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useQRXmtpClient } from "@/hooks/useQRXmtpClient";
import { RemoteSigner, generateSessionId } from "@/lib/signing-relay";
import { RefreshCw } from "lucide-react";

const MINI_APP_ID =
  process.env.NEXT_PUBLIC_WORLD_MINI_APP_ID || "app_your_app_id";

type LoginState =
  | "checking_session"
  | "generating"
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
  const [state, setState] = useState<LoginState>("checking_session");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signerRef = useRef<RemoteSigner | null>(null);
  const { initializeWithRemoteSigner, restoreSession } = useQRXmtpClient();

  const qrUrl = sessionId
    ? `https://worldcoin.org/mini-app?app_id=${MINI_APP_ID}&path=${encodeURIComponent(
        `/sign?session=${sessionId}`
      )}`
    : null;

  const startSession = async () => {
    signerRef.current?.cleanup();

    setState("generating");
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
          startSession();
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
          startSession();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStatusText = () => {
    switch (state) {
      case "checking_session":
        return "Checking session...";
      case "generating":
        return "Preparing...";
      case "waiting_for_scan":
        return "Scan with Camera";
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
    "checking_session",
    "generating",
    "mobile_connected",
    "authenticating",
    "signing",
    "initializing_xmtp",
  ].includes(state);

  const showQR = state === "waiting_for_scan" && qrUrl;

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
          }
          to {
            opacity: 1;
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
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        .animate-scale-in {
          animation: scale-in 0.25s ease-out forwards;
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-b from-white via-white to-[#F5F5F7] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* Title */}
          <h1 className="text-[18px] font-bold text-[#1D1D1F] tracking-[-0.02em] mb-10">
            World Chat
          </h1>

          {/* QR Code Card - Frosted glass effect */}
          <div className="w-[280px] h-[280px] rounded-3xl flex items-center justify-center mb-8 bg-white/80 backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] border border-black/[0.04] transition-all duration-300">
            {showQR ? (
              <div className="animate-fade-in">
                <QRCodeSVG
                  value={qrUrl}
                  size={232}
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
                <svg
                  className="w-7 h-7 text-[#34C759]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            ) : (
              <PulseLoader />
            )}
          </div>

          {/* Status */}
          <p
            className={`text-[15px] mb-3 transition-all duration-200 ${
              state === "error"
                ? "text-[#FF3B30]"
                : state === "success"
                ? "text-[#34C759]"
                : "text-[#86868B]"
            }`}
          >
            {getStatusText()}
          </p>

          {/* Address */}
          {connectedAddress && state !== "error" && (
            <p className="text-[13px] text-[#AEAEB2] font-mono mb-4 animate-fade-in">
              {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
            </p>
          )}

          {/* Retry */}
          {state === "error" && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-5 py-2.5 text-[15px] text-[#0066CC] hover:bg-[#0066CC]/5 active:bg-[#0066CC]/10 rounded-full transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          )}

          {/* Loading hint */}
          {isLoading &&
            state !== "generating" &&
            state !== "checking_session" && (
              <p className="text-[13px] text-[#AEAEB2] animate-fade-in">
                Keep World App open
              </p>
            )}

          {/* Disclaimer */}
          <div className="mt-16 text-center">
            <p className="text-[12px] text-[#AEAEB2] leading-[1.6] max-w-[300px]">
              Messages stored locally only <br />
              Clearing browser data deletes history
            </p>
            <a
              href="https://world.org/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-[12px] text-[#0066CC] hover:text-[#0052A3] transition-colors duration-200"
            >
              Get World App
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
