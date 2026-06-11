"use client";

import { useMemo, useState } from "react";

import { useSalesSummary } from "@/lib/queries";
import { errorMessage } from "@/lib/api";

type Period = "month" | "total";

const BAR_COLORS = [
  "bg-indigo-500",
  "bg-indigo-400",
  "bg-indigo-300",
  "bg-indigo-200",
  "bg-indigo-100",
];

export default function SalesPage() {
  const [period, setPeriod] = useState<Period>("month");
  const { data, isLoading, isError, error } = useSalesSummary(period);

  const ranking = useMemo(() => data?.ranking ?? [], [data]);
  const maxCount = useMemo(
    () => Math.max(1, ...ranking.map((r) => r.count)),
    [ranking],
  );

  return (
    <div className="max-w-6xl space-y-8">
      <header className="bg-white p-8 rounded-2xl border border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight">판매 성과 분석</h1>
        <p className="text-slate-500 mt-2 text-sm">
          연동된 카페24 쇼핑몰의 실제 주문 데이터 기반 실적 통계입니다.
        </p>
      </header>

      {/* 기간 토글 */}
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold text-slate-700">📊 주요 실적 지표</span>
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setPeriod("month")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              period === "month"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            이번 달
          </button>
          <button
            onClick={() => setPeriod("total")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              period === "total"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            최근 3개월
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400">
          판매 데이터를 불러오는 중…
        </div>
      ) : isError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center text-rose-700">
          판매 데이터를 불러오지 못했습니다. {errorMessage(error, "")}
          <p className="mt-2 text-xs text-rose-500">
            카페24 주문 조회 권한(mall.read_order)이 필요합니다. 권한 추가 후 다시 로그인해 주세요.
          </p>
        </div>
      ) : !data ? null : (
        <>
          {/* 주요 실적 지표 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              label={`${data.summary.label} 판매 금액`}
              value={`${data.summary.amount.toLocaleString()}원`}
              valueClass="text-indigo-600"
            />
            <MetricCard
              label={`${data.summary.label} 판매 건수`}
              value={`${data.summary.count.toLocaleString()}건`}
              valueClass="text-slate-800"
            />
            <MetricCard
              label={`${data.summary.label} 평균 객단가`}
              value={`${data.summary.avg.toLocaleString()}원`}
              valueClass="text-emerald-600"
            />
          </div>

          {/* 상품별 판매 랭킹 */}
          <section className="bg-white p-8 rounded-2xl border border-slate-200">
            <div className="border-b border-slate-100 pb-4 mb-10">
              <h2 className="text-lg font-bold text-slate-800">🏆 상품별 판매 랭킹 (TOP 5)</h2>
              <p className="text-xs text-slate-400 mt-1">판매 수량(건)을 기준으로 정렬된 그래프입니다.</p>
            </div>

            {ranking.length === 0 ? (
              <p className="text-center text-slate-400 py-10">해당 기간의 판매 내역이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-5 gap-4 h-64 items-end border-b border-slate-200 pb-2">
                {ranking.map((b, i) => (
                  <div
                    key={`${b.name}-${i}`}
                    className="flex flex-col items-center gap-2 h-full justify-end relative mx-auto w-full max-w-[80px]"
                  >
                    <div className="text-xs font-bold text-indigo-600 mb-1 whitespace-nowrap">
                      {b.count.toLocaleString()}건
                    </div>
                    <div
                      className={`w-full ${BAR_COLORS[i] ?? "bg-indigo-100"} rounded-t-xl transition-all duration-500`}
                      style={{ height: `${Math.round((b.count / maxCount) * 100)}%` }}
                    />
                    <span className="text-xs font-medium text-slate-700 text-center mt-2 truncate w-full absolute -bottom-7">
                      {b.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="h-6" />
          </section>

          {/* 상품별 기간 실적 */}
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/30">
              <h2 className="text-lg font-bold text-slate-800">📈 상품별 실적</h2>
              <p className="text-xs text-slate-400 mt-1">
                {data.summary.label} 기준 상품별 판매 금액·수량입니다.
              </p>
            </div>

            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-400 text-xs font-bold uppercase border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">상품명 / 번호</th>
                  <th className="px-6 py-4 text-right">총 판매 금액</th>
                  <th className="px-6 py-4 text-right">총 판매 수량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {data.period_stats.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-slate-400">
                      판매 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.period_stats.map((p, i) => (
                    <tr key={`${p.product_no}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        {p.product_no && <span className="text-xs text-slate-400">No. {p.product_no}</span>}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {p.amount.toLocaleString()}원
                      </td>
                      <td className="px-6 py-4 text-right font-medium">{p.count.toLocaleString()}건</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">{label}</span>
      <div className={`text-3xl font-extrabold ${valueClass}`}>{value}</div>
    </div>
  );
}
