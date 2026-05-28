"use client";

import { useState } from "react";

type Period = "month" | "total";

interface Summary {
  label: string;
  amount: string;
  count: string;
  avg: string;
}

interface Bar {
  name: string;
  count: string;
  height: number; // 0~100 (%)
}

interface Keyword {
  tag: string;
  clicks: string;
  orders: string;
  rate: string;
  revenue: string;
}

const SUMMARY: Record<Period, Summary> = {
  month: { label: "이번 달", amount: "15,420,000원", count: "412건", avg: "37,427원" },
  total: { label: "전체 기간", amount: "124,580,000원", count: "3,325건", avg: "37,467원" },
};

const BAR_COLORS = ["bg-indigo-500", "bg-indigo-400", "bg-indigo-300", "bg-indigo-200", "bg-indigo-100"];
const PRODUCT_NAMES = ["어노브 트리트먼트", "극손상 케어팩", "머스크 헤어오일", "두피 샴푸", "수분 에센스"];

const BARS: Record<Period, Bar[]> = {
  month: [
    { name: PRODUCT_NAMES[0], count: "182건", height: 90 },
    { name: PRODUCT_NAMES[1], count: "120건", height: 65 },
    { name: PRODUCT_NAMES[2], count: "95건", height: 50 },
    { name: PRODUCT_NAMES[3], count: "68건", height: 38 },
    { name: PRODUCT_NAMES[4], count: "51건", height: 28 },
  ],
  total: [
    { name: PRODUCT_NAMES[0], count: "1,420건", height: 95 },
    { name: PRODUCT_NAMES[1], count: "980건", height: 70 },
    { name: PRODUCT_NAMES[2], count: "520건", height: 45 },
    { name: PRODUCT_NAMES[3], count: "245건", height: 25 },
    { name: PRODUCT_NAMES[4], count: "160건", height: 18 },
  ],
};

const KEYWORDS: Record<Period, Keyword[]> = {
  month: [
    { tag: "#손상모", clicks: "1,240회", orders: "124건", rate: "10.0%", revenue: "4,340,000원" },
    { tag: "#단백질케어", clicks: "980회", orders: "78건", rate: "7.9%", revenue: "2,730,000원" },
    { tag: "#은은한머스크향", clicks: "850회", orders: "51건", rate: "6.0%", revenue: "1,530,000원" },
  ],
  total: [
    { tag: "#손상모", clicks: "10,450회", orders: "1,120건", rate: "10.7%", revenue: "39,200,000원" },
    { tag: "#단백질케어", clicks: "8,120회", orders: "690건", rate: "8.4%", revenue: "24,150,000원" },
    { tag: "#수분보습", clicks: "5,430회", orders: "380건", rate: "7.0%", revenue: "11,400,000원" },
  ],
};

const PERIOD_STATS = [
  { name: "어노브 단백질 트리트먼트", no: "104203", amount: "4,550,000원", count: "182건", review: "45건" },
  { name: "극손상 모발 고농축 케어팩", no: "104204", amount: "3,120,000원", count: "120건", review: "32건" },
];

export default function SalesPage() {
  const [period, setPeriod] = useState<Period>("month");
  const s = SUMMARY[period];
  const bars = BARS[period];
  const keywords = KEYWORDS[period];

  return (
    <div className="max-w-6xl space-y-8">
      <header className="bg-white p-8 rounded-2xl border border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight">판매 성과 분석</h1>
        <p className="text-slate-500 mt-2 text-sm">
          AI 자동화 솔루션 기반 통합 데이터 실적 통계 대시보드입니다.
        </p>
      </header>

      {/* 주요 실적 지표 */}
      <section>
        <div className="flex justify-between items-center mb-4">
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
              전체 기간
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard label={`${s.label} 판매 금액`} value={s.amount} valueClass="text-indigo-600" />
          <MetricCard label={`${s.label} 판매 개수`} value={s.count} valueClass="text-slate-800" />
          <MetricCard label={`${s.label} 평균 객단가`} value={s.avg} valueClass="text-emerald-600" />
        </div>
      </section>

      {/* 상품별 판매 랭킹 */}
      <section className="bg-white p-8 rounded-2xl border border-slate-200">
        <div className="border-b border-slate-100 pb-4 mb-10">
          <h2 className="text-lg font-bold text-slate-800">🏆 상품별 판매 랭킹 (TOP 5)</h2>
          <p className="text-xs text-slate-400 mt-1">판매 수량(건)을 기준으로 정렬된 그래프입니다.</p>
        </div>

        <div className="grid grid-cols-5 gap-4 h-64 items-end border-b border-slate-200 pb-2">
          {bars.map((b, i) => (
            <div
              key={b.name}
              className="flex flex-col items-center gap-2 h-full justify-end relative mx-auto w-full max-w-[80px]"
            >
              <div className="text-xs font-bold text-indigo-600 mb-1 whitespace-nowrap">{b.count}</div>
              <div
                className={`w-full ${BAR_COLORS[i]} rounded-t-xl transition-all duration-500`}
                style={{ height: `${b.height}%` }}
              />
              <span className="text-xs font-medium text-slate-700 text-center mt-2 truncate w-full absolute -bottom-7">
                {b.name}
              </span>
            </div>
          ))}
        </div>
        <div className="h-6" />
      </section>

      {/* AI 키워드별 결제 전환 */}
      <section className="bg-white p-8 rounded-2xl border border-slate-200">
        <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800">🎯 AI 도출 키워드별 결제 전환 추적</h2>
            <p className="text-xs text-slate-400 mt-1">
              AI 모델이 이미지 분석을 통해 생성한 키워드 태그가 실제 결제로 연결된 성과 데이터입니다.
            </p>
          </div>
          <span className="self-start sm:self-center text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-1 rounded-xl font-medium">
            ✨ 키워드 경유 결제 트래픽 정렬 중
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-400 text-xs font-bold uppercase border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">AI 생성 핵심 키워드 (해시태그)</th>
                <th className="px-6 py-4 text-center">클릭 및 유입 수</th>
                <th className="px-6 py-4 text-center">최종 결제 건수</th>
                <th className="px-6 py-4 text-center text-indigo-600">구매 전환율</th>
                <th className="px-6 py-4 text-right">총 발생 매출액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {keywords.map((k) => (
                <tr key={k.tag} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-indigo-600">{k.tag}</td>
                  <td className="px-6 py-4 text-center text-slate-500 font-medium">{k.clicks}</td>
                  <td className="px-6 py-4 text-center text-slate-900 font-semibold">{k.orders}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md text-xs">
                      {k.rate}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">{k.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 기간별 통계 */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">📈 기간별 통계</h2>
            <p className="text-xs text-slate-400 mt-1">원하는 기간과 정렬 기준을 선택하여 실적을 조회하세요.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="1w">주간 (최근 7일)</option>
              <option value="1m">월간 (최근 30일)</option>
              <option value="3m">3개월간</option>
              <option value="6m">6개월간</option>
              <option value="1y">1년간</option>
            </select>
            <select className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="amount">💰 판매 금액순</option>
              <option value="count">📦 판매량순</option>
              <option value="review">💬 리뷰 많은 순</option>
            </select>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 text-slate-400 text-xs font-bold uppercase border-b border-slate-100">
            <tr>
              <th className="px-6 py-4">상품명 / 번호</th>
              <th className="px-6 py-4 text-right">총 판매 금액</th>
              <th className="px-6 py-4 text-right">총 판매 수량</th>
              <th className="px-6 py-4 text-right text-indigo-600">리뷰 수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {PERIOD_STATS.map((p) => (
              <tr key={p.no} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-900">{p.name}</div>
                  <span className="text-xs text-slate-400">No. {p.no}</span>
                </td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">{p.amount}</td>
                <td className="px-6 py-4 text-right font-medium">{p.count}</td>
                <td className="px-6 py-4 text-right font-bold text-indigo-600">{p.review}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
