"use client";

import type { ReviewStats } from "@/lib/types";

/**
 * 통계 카드 4종 — 전체 / 평균 별점 / 긴급(1~2점 미처리) / 처리완료.
 * 샘플 HTML 의 stat-card 4 그리드 + 색상 강조를 Tailwind 로 옮긴 버전.
 */
export function ReviewStatsCards({ stats }: { stats: ReviewStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Card label="전체 리뷰" value={String(stats.total)} hint="등록된 리뷰 수" />
      <Card
        label="평균 별점"
        value={stats.avg_rating != null ? `${stats.avg_rating}★` : "-"}
        hint="전체 평균"
        tone="indigo"
      />
      <Card
        label="긴급 처리 필요"
        value={String(stats.urgent)}
        hint="1~2점 미처리"
        tone="rose"
      />
      <Card
        label="처리 완료"
        value={String(stats.done)}
        hint="답글 완료"
        tone="emerald"
      />
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "indigo" | "rose" | "emerald";
}) {
  const valueColor =
    tone === "indigo"
      ? "text-indigo-600"
      : tone === "rose"
      ? "text-rose-600"
      : tone === "emerald"
      ? "text-emerald-600"
      : "text-slate-900";

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <div className="text-xs text-slate-500 mb-1.5">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </div>
      <div className="text-[11px] text-slate-400 mt-1">{hint}</div>
    </div>
  );
}
