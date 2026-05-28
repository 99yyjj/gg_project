"use client";

import type { ReviewFilter } from "@/lib/types";

const CHIPS: { value: ReviewFilter; label: string; tone: ChipTone }[] = [
  { value: "all", label: "전체", tone: "slate" },
  { value: "neg", label: "🔴 부정", tone: "rose" },
  { value: "neu", label: "🟡 중립", tone: "amber" },
  { value: "pos", label: "🟢 긍정", tone: "emerald" },
  { value: "undone", label: "⚡ 미처리", tone: "slate" },
];

type ChipTone = "slate" | "rose" | "amber" | "emerald";

export function ReviewFilterBar({
  value,
  onChange,
}: {
  value: ReviewFilter;
  onChange: (v: ReviewFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="text-sm text-slate-500 mr-1">필터</span>
      {CHIPS.map((c) => (
        <Chip
          key={c.value}
          tone={c.tone}
          active={value === c.value}
          onClick={() => onChange(c.value)}
        >
          {c.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  children,
  active,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  tone: ChipTone;
  onClick: () => void;
}) {
  // 비활성 상태의 옅은 배경/테두리 색 + 활성 상태의 진한 채움
  const inactive: Record<ChipTone, string> = {
    slate: "bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600",
    rose: "bg-rose-50 border-rose-200 text-rose-600 hover:border-rose-400",
    amber: "bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400",
  };
  const activeCls: Record<ChipTone, string> = {
    slate: "bg-indigo-600 border-indigo-600 text-white",
    rose: "bg-rose-500 border-rose-500 text-white",
    amber: "bg-amber-500 border-amber-500 text-white",
    emerald: "bg-emerald-500 border-emerald-500 text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active ? activeCls[tone] : inactive[tone]
      }`}
    >
      {children}
    </button>
  );
}
