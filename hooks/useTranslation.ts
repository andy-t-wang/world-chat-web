"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { isElectron } from "@/lib/storage";

interface TranslationResult {
  translatedText: string;
  from: string;
  to: string;
}

interface LanguageDetectionResult {
  language: string | null;
  confidence: number;
}

interface TranslationProgress {
  progress: number;
  total: number;
  message: string;
}

/**
 * Hook for on-device translation using Electron's Python translation service
 * Only available in the Electron desktop app
 */
export function useTranslation() {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Clean up progress listener on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  /**
   * Check if translation is available (only in Electron)
   */
  const isAvailable = useCallback(async (): Promise<boolean> => {
    if (!isElectron()) return false;
    try {
      return await window.electronAPI?.translation?.isAvailable() ?? false;
    } catch {
      return false;
    }
  }, []);

  /**
   * Initialize translation service and download models
   * This may take a while on first run as it downloads models
   */
  const initialize = useCallback(async (userLanguage = "en"): Promise<boolean> => {
    if (!isElectron() || !window.electronAPI?.translation) {
      setError("Translation only available in desktop app");
      return false;
    }

    setIsInitializing(true);
    setError(null);
    setProgress(null);

    // Subscribe to progress updates
    if (window.electronAPI.translation.onProgress) {
      cleanupRef.current = window.electronAPI.translation.onProgress((p) => {
        setProgress(p);
      });
    }

    try {
      await window.electronAPI.translation.initialize(userLanguage);
      setIsInitialized(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initialize translation";
      setError(message);
      return false;
    } finally {
      setIsInitializing(false);
      setProgress(null);
      // Clean up progress listener
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    }
  }, []);

  /**
   * Translate text from one language to another
   */
  const translate = useCallback(async (
    text: string,
    from: string,
    to: string
  ): Promise<TranslationResult | null> => {
    if (!isElectron() || !window.electronAPI?.translation) {
      return null;
    }

    try {
      return await window.electronAPI.translation.translate(text, from, to);
    } catch (err) {
      console.error("[useTranslation] Translate failed:", err);
      return null;
    }
  }, []);

  /**
   * Detect the language of text
   */
  const detectLanguage = useCallback(async (text: string): Promise<LanguageDetectionResult | null> => {
    if (!isElectron() || !window.electronAPI?.translation) {
      return null;
    }

    try {
      return await window.electronAPI.translation.detectLanguage(text);
    } catch (err) {
      console.error("[useTranslation] Detect language failed:", err);
      return null;
    }
  }, []);

  /**
   * Stop the translation service to free memory
   */
  const dispose = useCallback(async (): Promise<void> => {
    if (!isElectron() || !window.electronAPI?.translation) return;

    try {
      await window.electronAPI.translation.dispose();
      setIsInitialized(false);
    } catch (err) {
      console.error("[useTranslation] Dispose failed:", err);
    }
  }, []);

  return {
    isAvailable,
    initialize,
    translate,
    detectLanguage,
    dispose,
    isInitializing,
    isInitialized,
    progress,
    error,
  };
}
