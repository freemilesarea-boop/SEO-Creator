"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, Trash2, ChevronRight } from "lucide-react";
import {
  getHistory,
  getHistoryDetail,
  removeHistory,
  type HistoryListItem,
  type GenerationResponse,
} from "@/lib/api";

interface HistoryPanelProps {
  onLoad?: (response: GenerationResponse) => void;
  onError?: (msg: string) => void;
  onToast?: (msg: string) => void;
  /** 외부 트리거(새 generation, 즐겨찾기 토글 등). 값이 바뀌면 다시 fetch. */
  refreshKey?: number;
}

function _fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("ko", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function HistoryPanel({
  onLoad,
  onError,
  onToast,
  refreshKey,
}: HistoryPanelProps) {
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getHistory();
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "히스토리 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  const handleOpen = async (id: string) => {
    if (!onLoad) return;
    setBusyId(id);
    try {
      const detail = await getHistoryDetail(id);
      if (!detail) {
        if (onError) onError("해당 결과를 찾을 수 없습니다.");
        return;
      }
      onLoad(detail);
    } catch (e) {
      if (onError) onError(e instanceof Error ? e.message : "결과 로드 실패");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBusyId(id);
    try {
      await removeHistory(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (onToast) onToast("히스토리에서 삭제되었습니다");
    } catch (err) {
      if (onError) onError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-zinc-200">최근 히스토리</h3>
        {loading && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-xs text-zinc-500">아직 생성한 결과가 없습니다.</p>
      )}
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.id}>
            <div
              role={onLoad ? "button" : undefined}
              tabIndex={onLoad ? 0 : -1}
              onClick={() => handleOpen(it.id)}
              onKeyDown={(e) => {
                if (onLoad && (e.key === "Enter" || e.key === " ")) {
                  handleOpen(it.id);
                }
              }}
              className={`group flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs ${
                onLoad ? "cursor-pointer hover:bg-zinc-800/60" : ""
              }`}
            >
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                {it.inputType}
              </span>
              <span className="flex-1 truncate text-zinc-300">
                {it.label || it.id}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                SEO {Math.round(Number(it.seoScore) || 0)}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                {_fmtDate(it.createdAt)}
              </span>
              <button
                type="button"
                onClick={(e) => handleRemove(e, it.id)}
                disabled={busyId === it.id}
                className="rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                title="삭제"
              >
                {busyId === it.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
              {onLoad && (
                <ChevronRight className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
