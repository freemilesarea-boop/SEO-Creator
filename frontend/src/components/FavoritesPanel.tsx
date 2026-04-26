"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, Loader2, Trash2, ChevronRight } from "lucide-react";
import {
  listFavorites,
  removeFavorite,
  type FavoriteRecord,
  type GenerationResponse,
} from "@/lib/api";

interface FavoritesPanelProps {
  onLoad?: (response: GenerationResponse) => void;
  onError?: (msg: string) => void;
  onToast?: (msg: string) => void;
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

function _isResponse(p: unknown): p is GenerationResponse {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.generationId === "string" && Array.isArray(obj.results);
}

export default function FavoritesPanel({
  onLoad,
  onError,
  onToast,
  refreshKey,
}: FavoritesPanelProps) {
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listFavorites();
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "즐겨찾기 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  const handleOpen = (rec: FavoriteRecord) => {
    if (!onLoad) return;
    if (_isResponse(rec.payload)) {
      onLoad(rec.payload);
    } else if (onError) {
      onError("이 즐겨찾기 항목에는 복원 가능한 데이터가 없습니다.");
    }
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBusyId(id);
    try {
      await removeFavorite(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (onToast) onToast("즐겨찾기에서 제거되었습니다");
    } catch (err) {
      if (onError) onError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">즐겨찾기</h3>
        {loading && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-xs text-zinc-500">아직 즐겨찾기가 없습니다.</p>
      )}
      <ul className="space-y-1.5">
        {items.map((it) => {
          const restorable = _isResponse(it.payload);
          const interactive = Boolean(onLoad) && restorable;
          return (
            <li key={it.id}>
              <div
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : -1}
                onClick={() => handleOpen(it)}
                onKeyDown={(e) => {
                  if (interactive && (e.key === "Enter" || e.key === " ")) {
                    handleOpen(it);
                  }
                }}
                className={`group flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs ${
                  interactive ? "cursor-pointer hover:bg-zinc-800/60" : ""
                }`}
                title={restorable ? "" : "이 항목은 복원할 수 없습니다."}
              >
                <Star className="h-3 w-3 text-amber-400" />
                <span className="flex-1 truncate text-zinc-300">
                  {it.label || it.id}
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {_fmtDate(it.favoritedAt)}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleRemove(e, it.id)}
                  disabled={busyId === it.id}
                  className="rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  title="제거"
                >
                  {busyId === it.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
                {interactive && (
                  <ChevronRight className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
