"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, SlidersHorizontal, X, AlertCircle, ClipboardCopy } from "lucide-react";
import LinkInputForm from "@/components/LinkInputForm";
import ManualInputForm from "@/components/ManualInputForm";
import ResultsView from "@/components/ResultsView";
import HistoryPanel from "@/components/HistoryPanel";
import FavoritesPanel from "@/components/FavoritesPanel";
import {
  getAppVersion,
  getPlatform,
  type GenerationResponse,
} from "@/lib/api";
import { buildErrorReport } from "@/lib/error-report";

type Tab = "link" | "manual";

interface ErrorContext {
  screen?: string;
  generationId?: string;
  language?: string;
  lastAction?: string;
  /** ISO timestamp at the moment the toast was added. */
  timestamp?: string;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
  leaving?: boolean;
  /** Set on error toasts so the "진단 정보 복사" 버튼이 풍부한 보고서를 만들 수 있다. */
  errorContext?: ErrorContext;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("link");
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [historyKey, setHistoryKey] = useState(0);
  const [favoritesKey, setFavoritesKey] = useState(0);
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    getAppVersion()
      .then((v) => { if (!cancelled) setAppVersion(v); })
      .catch(() => { if (!cancelled) setAppVersion("dev"); });
    return () => { cancelled = true; };
  }, []);

  const addToast = useCallback(
    (
      message: string,
      type: "success" | "error" = "success",
      errorContext?: ErrorContext,
    ) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type, errorContext }]);
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
        );
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 300);
      }, type === "error" ? 6000 : 3000);
    },
    []
  );

  const handleResult = useCallback((data: GenerationResponse) => {
    setResult(data);
    setHistoryKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const bumpFavorites = useCallback(() => {
    setFavoritesKey((k) => k + 1);
  }, []);

  const handleError = useCallback(
    (msg: string) => {
      addToast(msg, "error", {
        screen: result ? "results" : "input",
        generationId: result?.generationId,
        language: result?.language,
        timestamp: new Date().toISOString(),
      });
    },
    [addToast, result]
  );

  const copyErrorReport = useCallback(
    async (toast: Toast) => {
      const ctx = toast.errorContext || {};
      const text = buildErrorReport({
        appVersion: appVersion || "dev",
        platform: getPlatform(),
        screen: ctx.screen,
        errorMessage: toast.message,
        lastAction: ctx.lastAction,
        generationId: ctx.generationId,
        language: ctx.language,
        timestamp: ctx.timestamp,
      });
      try {
        await navigator.clipboard.writeText(text);
        addToast("진단 정보가 복사되었습니다", "success");
      } catch {
        addToast("진단 정보 복사에 실패했습니다", "error");
      }
    },
    [addToast, appVersion]
  );

  const handleToast = useCallback(
    (msg: string) => {
      addToast(msg, "success");
    },
    [addToast]
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
                <span>
                  <span className="text-brand-400">SEO</span> Creator
                </span>
                {appVersion && appVersion !== "dev" && (
                  <span className="badge-new" title={`v${appVersion}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse-ring" />
                    v2.1 NEW
                  </span>
                )}
              </h1>
              <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">
                플레이리스트 SEO · 썸네일 생성기
              </p>
            </div>
            {result && (
              <button
                onClick={() => setResult(null)}
                className="btn-secondary text-xs"
              >
                새로 만들기
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {!result ? (
          /* Input Section */
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto max-w-2xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-zinc-100 sm:text-3xl">
                YouTube 플레이리스트를 위한
                <br />
                <span className="text-brand-400">SEO 최적화 제목</span>을
                생성하세요
              </h2>
              <p className="mt-3 text-sm text-zinc-500">
                링크를 붙여넣거나 수동으로 정보를 입력하여 SEO에 최적화된 제목과
                썸네일 컨셉을 생성합니다.
              </p>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
              <button
                onClick={() => setActiveTab("link")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === "link"
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Link2 className="h-4 w-4" />
                링크 입력
              </button>
              <button
                onClick={() => setActiveTab("manual")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === "manual"
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                수동 입력
              </button>
            </div>

            {/* Form Card */}
            <div className="card">
              {activeTab === "link" ? (
                <LinkInputForm onResult={handleResult} onError={handleError} />
              ) : (
                <ManualInputForm
                  onResult={handleResult}
                  onError={handleError}
                />
              )}
            </div>
            </div>

            {/* History + Favorites */}
            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              <HistoryPanel
                onLoad={handleResult}
                onError={handleError}
                onToast={handleToast}
                refreshKey={historyKey}
              />
              <FavoritesPanel
                onLoad={handleResult}
                onError={handleError}
                onToast={handleToast}
                refreshKey={favoritesKey}
              />
            </div>
          </div>
        ) : (
          /* Results Section */
          <ResultsView
            data={result}
            onRegenerate={handleResult}
            onToast={handleToast}
            onError={handleError}
            onFavoriteChange={bumpFavorites}
          />
        )}
      </main>

      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-xl ${
              toast.leaving ? "animate-toast-out" : "animate-toast-in"
            } ${
              toast.type === "error"
                ? "border border-red-500/20 bg-red-950/90 text-red-200"
                : "border border-emerald-500/20 bg-emerald-950/90 text-emerald-200"
            }`}
          >
            {toast.type === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            {toast.message}
            {toast.type === "error" && (
              <button
                onClick={() => copyErrorReport(toast)}
                className="ml-2 inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-100 transition-colors hover:bg-red-500/20"
                title="진단 정보 복사"
              >
                <ClipboardCopy className="h-3 w-3" />
                진단 복사
              </button>
            )}
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              className="ml-2 rounded p-0.5 hover:bg-white/10"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        SEO Creator &mdash; YouTube 플레이리스트 SEO 최적화 도구
        {appVersion && (
          <span className="ml-2 text-zinc-700">v{appVersion}</span>
        )}
      </footer>
    </div>
  );
}
