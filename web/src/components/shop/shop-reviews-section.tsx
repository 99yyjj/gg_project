"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Star } from "lucide-react";

import {
  createShopReview,
  fetchShopReviews,
  loadOwnedReviewTokens,
  saveOwnedReviewToken,
  updateShopReview,
  type ShopReview,
} from "@/lib/shop-api";

/**
 * 손님 화면(`/shop/[username]/products/[productNo]`) 하단 리뷰 섹션.
 *
 * - 보기: 누구나 모든 리뷰를 본다.
 * - 쓰기: 익명으로 작성. 응답에 함께 오는 edit_token 을 localStorage 에 저장 → 본인 리뷰만 수정 가능.
 * - 수정: 본인 리뷰에 한해 "수정" 버튼이 노출되고, 헤더로 토큰을 함께 보낸다.
 *
 * 관리자 화면의 sentiment/AI 요약/처리완료 같은 운영용 정보는 노출하지 않는다.
 * 단, 사장님이 단 답글(admin_reply)은 손님에게 보여준다 — 그게 손님 입장에서 가치가 크니까.
 */
export function ShopReviewsSection({
  username,
  productNo,
}: {
  username: string;
  productNo: number;
}) {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shop-reviews", username, productNo],
    queryFn: () => fetchShopReviews(username, productNo),
  });

  const [ownedTokens, setOwnedTokens] = useState<Record<number, string>>(() =>
    loadOwnedReviewTokens(username)
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);

  const create = useMutation({
    mutationFn: (payload: {
      author_name: string;
      rating: number;
      content: string;
    }) => createShopReview(username, productNo, payload),
    onSuccess: (res) => {
      saveOwnedReviewToken(username, res.review.id, res.edit_token);
      setOwnedTokens((prev) => ({ ...prev, [res.review.id]: res.edit_token }));
      qc.invalidateQueries({ queryKey: ["shop-reviews", username, productNo] });
      setWriting(false);
    },
  });

  const update = useMutation({
    mutationFn: (args: {
      reviewId: number;
      token: string;
      author_name?: string;
      rating?: number;
      content?: string;
    }) =>
      updateShopReview(username, args.reviewId, args.token, {
        author_name: args.author_name,
        rating: args.rating,
        content: args.content,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-reviews", username, productNo] });
      setEditingId(null);
    },
  });

  return (
    <section className="mt-16 border-t border-slate-100 pt-10">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-500">상품 리뷰</h2>
          {data && (
            <div className="mt-1 flex items-center gap-2 text-slate-900">
              <span className="text-yellow-400">
                {"★".repeat(Math.round(data.avg_rating ?? 0))}
                {"☆".repeat(5 - Math.round(data.avg_rating ?? 0))}
              </span>
              <span className="text-sm font-semibold">
                {data.avg_rating != null ? data.avg_rating.toFixed(1) : "-"}
              </span>
              <span className="text-xs text-slate-400">
                ({data.total.toLocaleString()}개)
              </span>
            </div>
          )}
        </div>
        {!writing && (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            리뷰 쓰기
          </button>
        )}
      </div>

      {writing && (
        <ReviewForm
          onCancel={() => setWriting(false)}
          submitting={create.isPending}
          submitLabel="등록"
          onSubmit={(payload) => create.mutate(payload)}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">불러오는 중...</p>
      ) : isError ? (
        <p className="text-sm text-rose-600 py-8 text-center">
          리뷰를 불러오지 못했어요.
        </p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">
          첫 리뷰를 남겨주세요!
        </p>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {data.items.map((r) => {
            const owned = ownedTokens[r.id];
            const editing = editingId === r.id;
            return editing && owned ? (
              <ReviewForm
                key={r.id}
                initial={r}
                onCancel={() => setEditingId(null)}
                submitting={update.isPending}
                submitLabel="수정 저장"
                onSubmit={(payload) =>
                  update.mutate({
                    reviewId: r.id,
                    token: owned,
                    ...payload,
                  })
                }
              />
            ) : (
              <CustomerReviewCard
                key={r.id}
                review={r}
                isOwned={!!owned}
                onEdit={() => setEditingId(r.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function CustomerReviewCard({
  review,
  isOwned,
  onEdit,
}: {
  review: ShopReview;
  isOwned: boolean;
  onEdit: () => void;
}) {
  const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-900">
          {review.author_name}
        </span>
        <span className="text-sm text-yellow-400 tracking-wider">{stars}</span>
        <span className="text-[11px] text-slate-400 ml-auto">
          {formatDate(review.created_at)}
        </span>
        {isOwned && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 ml-2"
          >
            <Pencil className="w-3 h-3" /> 수정
          </button>
        )}
      </div>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {review.content}
      </p>
      {review.admin_reply && (
        <div className="mt-3 ml-2 pl-3 border-l-2 border-emerald-300 bg-emerald-50/50 py-2 pr-3 rounded-r-lg">
          <div className="text-[11px] font-semibold text-emerald-700 mb-0.5">
            사장님 답글
          </div>
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
            {review.admin_reply}
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  initial?: ShopReview;
  onSubmit: (p: { author_name: string; rating: number; content: string }) => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [author, setAuthor] = useState(initial?.author_name ?? "");
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [content, setContent] = useState(initial?.content ?? "");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!author.trim() || !content.trim() || !rating) {
      setErr("이름, 별점, 내용을 모두 입력해주세요.");
      return;
    }
    setErr(null);
    onSubmit({
      author_name: author.trim(),
      rating,
      content: content.trim(),
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-3">
      <div className="grid gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">
            이름
          </label>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="예) 김민준"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">
            별점
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`별점 ${n}점`}
                className="p-1"
              >
                <Star
                  className={`w-6 h-6 ${
                    n <= rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-slate-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">
            내용
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="상품에 대한 솔직한 후기를 남겨주세요."
            className="w-full min-h-[100px] px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 resize-vertical"
          />
        </div>
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "저장 중..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}
