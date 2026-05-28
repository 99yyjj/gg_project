"use client";

import { useState } from "react";
import { MessageSquare, Search } from "lucide-react";

import { useProductReviews } from "@/lib/queries";
import type { ReviewFilter } from "@/lib/types";

import { ReviewCard } from "./review-card";
import { ReviewFilterBar } from "./review-filter-bar";
import { ReviewStatsCards } from "./review-stats";

/**
 * 상품 상세 → "리뷰" 탭 본문 (관리자 전용).
 *
 * 관리자(사장님)는 보기·필터·감정 분류·답글만 한다. 리뷰 작성은 손님 화면에서만 가능.
 * 손님이 작성하면 백그라운드 AI 분석으로 sentiment 가 채워지고, useProductReviews 의
 * refetchInterval 이 'loading' 카드를 짧게 폴링해 자동으로 갱신해준다.
 */
export function ProductReviewsPanel({ productNo }: { productNo: number }) {
  const [filter, setFilter] = useState<ReviewFilter>("all");

  const { data, isLoading, isError } = useProductReviews(productNo, filter);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          리뷰 관리
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          고객이 남긴 리뷰를 AI가 긍정/중립/부정으로 자동 분류해줍니다. 답글을 달아 처리완료로 표시하세요.
        </p>
      </div>

      {data && <ReviewStatsCards stats={data.stats} />}

      <ReviewFilterBar value={filter} onChange={setFilter} />

      {isLoading ? (
        <div className="text-sm text-slate-500 py-10 text-center">
          불러오는 중...
        </div>
      ) : isError ? (
        <div className="text-sm text-rose-600 py-10 text-center">
          리뷰를 불러오지 못했어요.
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((r) => (
            <ReviewCard key={r.id} review={r} productNo={productNo} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: ReviewFilter }) {
  const isFiltered = filter !== "all";
  return (
    <div className="text-center py-16 text-slate-400">
      <div className="text-4xl mb-3">
        {isFiltered ? <Search className="w-10 h-10 mx-auto" /> : "💬"}
      </div>
      <div className="text-sm">
        {isFiltered
          ? "해당 조건의 리뷰가 없어요"
          : "아직 등록된 리뷰가 없어요. 손님이 쇼핑몰 상품 페이지에서 리뷰를 남기면 여기에 표시됩니다."}
      </div>
    </div>
  );
}
