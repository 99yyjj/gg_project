"use client";

import { useState } from "react";
import { Loader2, RotateCw, Sparkles, Trash2 } from "lucide-react";

import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import {
  useDeleteReview,
  useRegenerateReply,
  useUpdateReview,
} from "@/lib/queries";
import type { Review, ReviewSentiment } from "@/lib/types";

/**
 * 리뷰 카드 한 장 — 헤더 + 본문 + AI 요약 + 액션 + 펼침 답글박스.
 *
 * 동작:
 *  - "AI 답글 초안" / "직접 작성" 버튼 → 답글박스 펼침
 *  - textarea 편집 후 "발송 완료" → PATCH admin_reply + is_done=true
 *  - "다시 생성" → POST /reviews/{id}/regenerate-reply (DB 저장은 발송 시점)
 */
export function ReviewCard({
  review,
  productNo,
}: {
  review: Review;
  productNo: number;
}) {
  const toast = useToast();
  const update = useUpdateReview(productNo);
  const del = useDeleteReview(productNo);
  const regen = useRegenerateReply();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(review.admin_reply ?? "");
  // 백그라운드 분석으로 서버의 admin_reply 가 갱신되면 (사용자가 아직 한 글자도
  // 안 적었을 때만) textarea 도 따라간다.
  // "render 중에 prop 변화 감지 + setState" — useEffect 보다 권장되는 패턴.
  const [seenServerReply, setSeenServerReply] = useState(review.admin_reply ?? "");
  if ((review.admin_reply ?? "") !== seenServerReply) {
    setSeenServerReply(review.admin_reply ?? "");
    if (!draft && review.admin_reply) setDraft(review.admin_reply);
  }

  const tone = sentimentTone(review.sentiment);

  async function handleSend() {
    if (!draft.trim()) {
      toast.push("답글 내용을 입력하세요.", "err");
      return;
    }
    try {
      await update.mutateAsync({
        id: review.id,
        body: { admin_reply: draft.trim(), is_done: true },
      });
      toast.push("답글을 저장하고 처리완료로 변경했어요.");
      setOpen(false);
    } catch (e) {
      toast.push(errorMessage(e, "저장에 실패했습니다."), "err");
    }
  }

  async function handleRegenerate() {
    try {
      const { draft_reply } = await regen.mutateAsync(review.id);
      setDraft(draft_reply);
    } catch (e) {
      toast.push(errorMessage(e, "재생성에 실패했습니다."), "err");
    }
  }

  async function handleDelete() {
    if (!confirm("이 리뷰를 삭제할까요?")) return;
    try {
      await del.mutateAsync(review.id);
      toast.push("삭제되었습니다.");
    } catch (e) {
      toast.push(errorMessage(e, "삭제에 실패했습니다."), "err");
    }
  }

  const stars = "⭐".repeat(review.rating) + "☆".repeat(5 - review.rating);
  const isLoading = review.sentiment === "loading";

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl px-5 py-4 border-l-4 ${tone.borderL} ${
        review.is_done ? "opacity-50" : ""
      } transition-shadow hover:shadow-sm`}
    >
      <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
        <span className="text-sm font-semibold text-slate-900">
          {review.author_name}
        </span>
        <span className={`text-[13px] tracking-wider ${starColor(review.rating)}`}>
          {stars}
        </span>
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tone.badge}`}
        >
          {sentimentLabel(review.sentiment)}
        </span>
        <span className="text-[11px] text-slate-400 ml-auto">
          {formatRelative(review.created_at)}
        </span>
      </div>

      <div className="text-sm text-slate-700 leading-relaxed mb-2.5">
        {review.content}
      </div>

      {isLoading ? (
        <div className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          AI가 분석 중이에요...
        </div>
      ) : review.summary ? (
        <div className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mb-3 leading-relaxed">
          <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />
          <span className="font-semibold">AI 요약:</span> {review.summary}
        </div>
      ) : null}

      {!isLoading && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" /> AI 답글 초안
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            직접 작성
          </button>
          {!review.is_done ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await update.mutateAsync({
                    id: review.id,
                    body: { is_done: true },
                  });
                } catch (e) {
                  toast.push(errorMessage(e, "처리 실패"), "err");
                }
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              ✓ 처리완료
            </button>
          ) : (
            <span className="text-xs text-emerald-600">✓ 처리됨</span>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1"
            aria-label="리뷰 삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {open && !isLoading && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-indigo-700 mb-2">
            <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />
            AI 초안 — 수정 후 발송하세요
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[72px] text-sm leading-relaxed bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 resize-vertical font-sans text-slate-900"
            placeholder="고객에게 보낼 답글을 작성하세요"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={update.isPending}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {update.isPending ? "저장 중..." : "발송 완료"}
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regen.isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white inline-flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCw className={`w-3 h-3 ${regen.isPending ? "animate-spin" : ""}`} />
              다시 생성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function sentimentTone(s: ReviewSentiment): {
  borderL: string;
  badge: string;
} {
  switch (s) {
    case "neg":
      return {
        borderL: "border-l-rose-500",
        badge: "bg-rose-100 text-rose-700",
      };
    case "pos":
      return {
        borderL: "border-l-emerald-500",
        badge: "bg-emerald-100 text-emerald-700",
      };
    case "loading":
      return {
        borderL: "border-l-slate-200",
        badge: "bg-slate-100 text-slate-500",
      };
    case "neu":
    default:
      return {
        borderL: "border-l-amber-500",
        badge: "bg-amber-100 text-amber-700",
      };
  }
}

function sentimentLabel(s: ReviewSentiment): string {
  return s === "pos"
    ? "긍정"
    : s === "neg"
    ? "부정"
    : s === "loading"
    ? "분석 중..."
    : "중립";
}

function starColor(rating: number): string {
  if (rating <= 2) return "text-rose-500";
  if (rating === 3) return "text-amber-500";
  return "text-yellow-400";
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}
