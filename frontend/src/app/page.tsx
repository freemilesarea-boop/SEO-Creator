"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, SlidersHorizontal, X, AlertCircle } from "lucide-react";
import LinkInputForm from "@/components/LinkInputForm";
import ManualInputForm from "@/components/ManualInputForm";
import ResultsView from "@/components/ResultsView";
import type { GenerationResponse } from "@/lib/api";

type Tab = "link" | "manual";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
  leaving?: boolean;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("link");
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 3000);
  }, []);

  const handleResult = useCallback((data: GenerationResponse) => {
    setResult(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleError = useCallback(
    (msg: string) => {
      addToast(msg, "error");
    },
    [addToast]
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
              <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
                <span className="text-brand-400">SEO</span> Creator
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
        ) : (
          /* Results Section */
          <ResultsView
            data={result}
            onRegenerate={handleResult}
            onToast={handleToast}
            onError={handleError}
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
      </footer>
    </div>
  );
}
