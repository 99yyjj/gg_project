"use client";

import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";

import { useToast } from "@/components/toast";
import { useOrders } from "@/lib/queries";
import { errorMessage } from "@/lib/api";
import type { OrderSummary } from "@/lib/types";

// 카페24 주문상태 라벨 → 배지 색상. 알 수 없는 상태는 회색으로 폴백.
function statusBadge(status: string): string {
  if (status.includes("배송중")) return "bg-sky-100 text-sky-700";
  if (status.includes("배송완료")) return "bg-emerald-100 text-emerald-700";
  if (
    status.includes("배송준비") ||
    status.includes("상품준비") ||
    status.includes("배송대기") ||
    status.includes("배송보류")
  )
    return "bg-amber-100 text-amber-800";
  if (status.includes("입금")) return "bg-blue-100 text-blue-800";
  if (status.includes("취소") || status.includes("반품") || status.includes("교환"))
    return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export default function OrdersPage() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useOrders();
  const orders = useMemo(() => data?.orders ?? [], [data]);

  const [tab, setTab] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<OrderSummary | null>(null);

  // 데이터에 실제로 존재하는 상태들로 탭을 구성한다(카페24 상태는 몰마다 다양).
  const tabs = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.status) set.add(o.status);
    return ["전체", ...Array.from(set)];
  }, [orders]);

  const summary = useMemo(() => {
    let prep = 0,
      shipping = 0,
      totalSales = 0;
    for (const o of orders) {
      totalSales += o.amount;
      if (o.status.includes("배송준비")) prep++;
      else if (o.status.includes("배송중")) shipping++;
    }
    return { prep, shipping, totalSales, total: orders.length };
  }, [orders]);

  // 주문일 기준 추이(최근 8개 날짜 버킷).
  const trend = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) m.set(o.date, (m.get(o.date) ?? 0) + 1);
    const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
    return { labels: sorted.map((e) => e[0].slice(5)), data: sorted.map((e) => e[1]) };
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesTab = tab === "전체" || o.status === tab;
      const matchesSearch = !q || o.name.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [orders, tab, search]);

  function exportToExcel() {
    const header = ["주문번호", "주문일", "주문자", "상품명", "결제금액", "주문상태", "송장정보"];
    const rows = visible.map((o) => [
      o.order_no,
      o.date,
      o.name,
      o.product,
      String(o.amount),
      o.status,
      o.tracking || "미발송",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `주문내역_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push("엑셀(CSV) 다운로드를 시작합니다.");
  }

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">📊 주문/배송 관리</h1>
        <p className="text-sm text-slate-700 mt-1">
          연동된 카페24 쇼핑몰의 실제 주문을 한 화면에서 확인하세요. (최근 90일)
        </p>
      </header>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400">
          주문을 불러오는 중…
        </div>
      ) : isError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center text-rose-700">
          주문을 불러오지 못했습니다. {errorMessage(error, "")}
          <p className="mt-2 text-xs text-rose-500">
            카페24 주문 조회 권한(mall.read_order)이 필요합니다. 권한 추가 후 다시 로그인해 주세요.
          </p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard title="전체 주문" value={`${summary.total} 건`} valueClass="text-slate-900" />
            <SummaryCard title="배송 준비중" value={`${summary.prep} 건`} valueClass="text-amber-700" />
            <SummaryCard title="배송중인 상품" value={`${summary.shipping} 건`} valueClass="text-sky-700" />
            <SummaryCard
              title={`누적 매출 합계 (${summary.total}건 기준)`}
              value={`${summary.totalSales.toLocaleString()} 원`}
              valueClass="text-slate-900"
            />
          </div>

          {/* 주문 추이 차트 */}
          {trend.data.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
              <h2 className="text-base font-semibold text-slate-700 mb-4">📈 최근 주문 건수 추이</h2>
              <WeeklyChart labels={trend.labels} data={trend.data} />
            </section>
          )}

          {/* 상태 탭 */}
          <div className="flex flex-wrap border-b-2 border-slate-200 mb-5">
            {tabs.map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-6 py-3 -mb-0.5 text-sm font-bold border-b-2 transition ${
                    active
                      ? "text-blue-600 border-blue-600"
                      : "text-slate-500 border-transparent hover:text-slate-800"
                  }`}
                >
                  {t === "전체" ? "전체보기" : t}
                </button>
              );
            })}
          </div>

          {/* 검색 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">주문자 실시간 검색</span>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름을 입력하여 필터링"
                className="pl-9 pr-3 py-2 w-60 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 액션 */}
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-md"
            >
              <Download className="w-4 h-4" /> 엑셀 다운로드
            </button>
          </div>

          {/* 주문 테이블 */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">주문번호</th>
                    <th className="px-4 py-3 font-semibold">주문일</th>
                    <th className="px-4 py-3 font-semibold">주문자</th>
                    <th className="px-4 py-3 font-semibold">상품명</th>
                    <th className="px-4 py-3 font-semibold">결제금액</th>
                    <th className="px-4 py-3 font-semibold">주문상태</th>
                    <th className="px-4 py-3 font-semibold">송장정보</th>
                    <th className="px-4 py-3 font-semibold">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        조건에 맞는 주문이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    visible.map((o) => (
                      <tr key={o.order_no} className="align-middle hover:bg-slate-50/60">
                        <td className="px-4 py-3">{o.order_no}</td>
                        <td className="px-4 py-3">{o.date}</td>
                        <td className="px-4 py-3">{o.name}</td>
                        <td className="px-4 py-3">{o.product}</td>
                        <td className="px-4 py-3">{o.amount.toLocaleString()}원</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusBadge(o.status)}`}>
                            {o.status || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{o.tracking || "—"}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDetail(o)}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            상세보기
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 상세 모달 */}
      {detail && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">주문 상세 정보</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <DetailRow label="주문번호" value={detail.order_no} />
              <DetailRow label="주문자명" value={detail.name} />
              <DetailRow label="연락처" value={detail.phone} />
              <DetailRow label="배송지" value={detail.address} />
              <DetailRow label="상품명" value={detail.product} />
              <DetailRow label="결제금액" value={`${detail.amount.toLocaleString()}원`} />
              <DetailRow label="주문상태" value={detail.status || "-"} />
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">송장정보</dt>
                <dd className="font-bold text-blue-600">{detail.tracking || "미발송"}</dd>
              </div>
            </dl>
            <button
              onClick={() => setDetail(null)}
              className="mt-6 w-full bg-slate-700 hover:bg-slate-800 text-white py-2 rounded-md text-sm font-bold"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, valueClass }: { title: string; value: string; valueClass: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="text-xs font-medium text-slate-500 mb-2">{title}</div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

function WeeklyChart({ labels, data }: { labels: string[]; data: number[] }) {
  const W = 520,
    H = 200,
    padL = 24,
    padR = 16,
    padT = 16,
    padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...data, 1);
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + (1 - v / max) * innerH;
  const linePoints = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPoints = `${x(0)},${padT + innerH} ${linePoints} ${x(n - 1)},${padT + innerH}`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" preserveAspectRatio="none">
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padL}
            x2={W - padR}
            y1={padT + t * innerH}
            y2={padT + t * innerH}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}
        <polygon points={areaPoints} fill="rgba(37,99,235,0.1)" />
        <polyline points={linePoints} fill="none" stroke="#2563eb" strokeWidth={2} />
        {data.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={4} fill="#2563eb" />
            <text x={x(i)} y={y(v) - 10} textAnchor="middle" fontSize={11} fill="#1e293b" fontWeight="bold">
              {v}
            </text>
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">
              {labels[i]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
