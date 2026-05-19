"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  NexaAsyncLoadingOverlay,
  type NexaAsyncLoadingMessage
} from "@/components/nexa-async-loading-overlay";

type NexaAsyncLoadingContextValue = {
  showLoading: (message?: NexaAsyncLoadingMessage) => void;
  showAiGenerating: (message?: NexaAsyncLoadingMessage) => void;
  hideLoading: () => void;
};

const NexaAsyncLoadingContext = createContext<NexaAsyncLoadingContextValue | null>(null);

export function NexaAsyncLoadingProvider(props: { children: ReactNode }): React.JSX.Element {
  const depthRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<NexaAsyncLoadingMessage>("Caricamento...");

  const showLoading = useCallback((nextMessage: NexaAsyncLoadingMessage = "Caricamento..."): void => {
    depthRef.current += 1;
    setMessage(nextMessage);
    setOpen(true);
  }, []);

  const showAiGenerating = useCallback(
    (nextMessage: NexaAsyncLoadingMessage = "Generazione AI..."): void => {
      showLoading(nextMessage);
    },
    [showLoading]
  );

  const hideLoading = useCallback((): void => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setOpen(false);
    }
  }, []);

  const value = useMemo(
    (): NexaAsyncLoadingContextValue => ({
      showLoading,
      showAiGenerating,
      hideLoading
    }),
    [hideLoading, showAiGenerating, showLoading]
  );

  return (
    <NexaAsyncLoadingContext.Provider value={value}>
      {props.children}
      <NexaAsyncLoadingOverlay open={open} message={message} />
    </NexaAsyncLoadingContext.Provider>
  );
}

export function useNexaAsyncLoading(): NexaAsyncLoadingContextValue {
  const ctx = useContext(NexaAsyncLoadingContext);
  if (!ctx) {
    throw new Error("useNexaAsyncLoading must be used within NexaAsyncLoadingProvider");
  }
  return ctx;
}

/** Mostra l’overlay finché `active` è true (con contatore interno nel provider). */
export function useTrackAsyncLoad(
  active: boolean,
  kind: "load" | "ai" = "load",
  message?: NexaAsyncLoadingMessage
): void {
  const { showLoading, showAiGenerating, hideLoading } = useNexaAsyncLoading();

  useEffect(() => {
    if (!active) {
      return;
    }
    if (kind === "ai") {
      showAiGenerating(message ?? "Generazione AI...");
    } else {
      showLoading(message ?? "Caricamento...");
    }
    return () => {
      hideLoading();
    };
  }, [active, hideLoading, kind, message, showAiGenerating, showLoading]);
}
