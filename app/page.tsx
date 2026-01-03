"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useQRXmtpClient } from "@/hooks/useQRXmtpClient";
import { RemoteSigner, generateSessionId } from "@/lib/signing-relay";
import { Loader2, X, RefreshCw } from "lucide-react";

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
    restoreSession().then((restored) => {
      if (restored) {
        // Session restored, redirect to chat
        router.push("/chat");
      } else {
        // No session, start QR flow
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
        return "Generating QR code...";
      case "waiting_for_scan":
        return "Scan with Camera";
      case "mobile_connected":
        return "Connected!";
      case "authenticating":
        return "Approve in World App...";
      case "signing":
        return "Approve in World App...";
      case "initializing_xmtp":
        return "Setting up messaging...";
      case "success":
        return "Welcome!";
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

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Title */}
        <h1 className="text-2xl font-semibold text-[#181818] mb-8">
          World Chat Lite
        </h1>

        {/* QR Code Box */}
        <div className="w-64 h-64 bg-[#F5F5F5] rounded-2xl flex items-center justify-center mb-6">
          {state === "waiting_for_scan" && qrUrl ? (
            <QRCodeSVG
              value={qrUrl}
              size={224}
              level="M"
              includeMargin={false}
              className="rounded-lg"
            />
          ) : state === "error" ? (
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <X className="w-8 h-8 text-red-500" />
            </div>
          ) : state === "success" ? (
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          ) : (
            <Loader2 className="w-8 h-8 text-[#717680] animate-spin" />
          )}
        </div>

        {/* Status */}
        <p
          className={`text-sm mb-4 ${
            state === "error" ? "text-red-500" : "text-[#717680]"
          }`}
        >
          {getStatusText()}
        </p>

        {/* Address */}
        {connectedAddress && state !== "error" && (
          <p className="text-xs text-[#9BA3AE] font-mono mb-4">
            {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
          </p>
        )}

        {/* Retry */}
        {state === "error" && (
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 text-sm text-[#005CFF] hover:bg-[#005CFF]/5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        )}

        {/* Loading indicator for states that need it */}
        {isLoading && state !== "generating" && state !== "checking_session" && (
          <div className="flex items-center gap-2 text-xs text-[#9BA3AE]">
            <Loader2 className="w-3 h-3 animate-spin" />
            Keep World App open
          </div>
        )}
      </div>
    </div>
  );
}
