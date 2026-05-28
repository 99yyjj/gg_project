"use client";

import { useMemo, useState } from "react";
import { Download, Search, Truck, X } from "lucide-react";

import { useToast } from "@/components/toast";

type OrderStatus = "결제완료" | "배송준비" | "배송중";

interface Order {
  orderNo: string;
  date: string;
  name: string;
  phone: string;
  address: string;
  product: string;
  amount: number;
  status: OrderStatus;
  tracking: string; // "" 또는 "대한통운 640582910291"
}

const INITIAL_ORDERS: Order[] = [
  { orderNo: "20260521-0001", date: "2026-05-21", name: "홍길동", phone: "010-1234-5678", address: "서울시 강남구", product: "오버핏 리넨 셔츠", amount: 58000, status: "배송준비", tracking: "" },
  { orderNo: "20260519-0002", date: "2026-05-19", name: "김철수", phone: "010-9876-5432", address: "부산시 해운대구", product: "가죽 스니커즈", amount: 89000, status: "결제완료", tracking: "" },
  { orderNo: "20260515-0003", date: "2026-05-15", name: "이영희", phone: "010-5555-4444", address: "대구시 수성구", product: "데일리 에코백", amount: 15000, status: "배송준비", tracking: "" },
  { orderNo: "20260512-0004", date: "2026-05-12", name: "박민수", phone: "010-3333-2222", address: "인천시 부평구", product: "와이드 슬랙스 블랙", amount: 39000, status: "배송중", tracking: "대한통운 640582910291" },
  { orderNo: "20260505-0005", date: "2026-05-05", name: "최수연", phone: "010-7777-8888", address: "대전시 서구", product: "실크 스카프 외 2건", amount: 124000, status: "결제완료", tracking: "" },
  { orderNo: "20260428-0001", date: "2026-04-28", name: "정우성", phone: "010-1111-2222", address: "서울시 강남구", product: "남성용 클래식 수트", amount: 290000, status: "배송중", tracking: "대한통운 612345678901" },
  { orderNo: "20260422-0002", date: "2026-04-22", name: "한소희", phone: "010-4444-9999", address: "경기도 성남시", product: "크롭 니트 베스트", amount: 42500, status: "배송준비", tracking: "" },
  { orderNo: "20260418-0003", date: "2026-04-18", name: "이정재", phone: "010-8888-1111", address: "서울시 용산구", product: "프리미엄 옥스퍼드 셔츠", amount: 75000, status: "배송중", tracking: "대한통운 609483019283" },
  { orderNo: "20260410-0004", date: "2026-04-10", name: "강동원", phone: "010-2222-7777", address: "경남 창원시", product: "린넨 반바지 카키", amount: 33000, status: "결제완료", tracking: "" },
  { orderNo: "20260402-0005", date: "2026-04-02", name: "송혜교", phone: "010-6666-3333", address: "서울시 성동구", product: "V넥 플라워 원피스", amount: 135000, status: "배송준비", tracking: "" },
  { orderNo: "20260325-0001", date: "2026-03-25", name: "유재석", phone: "010-1212-3434", address: "서울시 압구정동", product: "트레이닝 세트 그레이", amount: 65000, status: "배송중", tracking: "대한통운 639988776655" },
  { orderNo: "20260318-0002", date: "2026-03-18", name: "이효리", phone: "010-7171-8282", address: "제주도 애월읍", product: "보헤미안 롱 원피스", amount: 112000, status: "배송준비", tracking: "" },
  { orderNo: "20260312-0003", date: "2026-03-12", name: "김종국", phone: "010-2525-2525", address: "경기도 안양시", product: "머슬핏 반팔 티셔츠 3팩", amount: 45000, status: "배송중", tracking: "대한통운 618877665544" },
  { orderNo: "20260304-0004", date: "2026-03-04", name: "지석진", phone: "010-0909-0909", address: "서울시 서초동", product: "가죽 서류 가방 브라운", amount: 320000, status: "결제완료", tracking: "" },
  { orderNo: "20260226-0001", date: "2026-02-26", name: "하하", phone: "010-7711-2233", address: "서울시 마포구", product: "스트릿 비니 믹스", amount: 28000, status: "배송중", tracking: "대한통운 655443322110" },
  { orderNo: "20260220-0002", date: "2026-02-20", name: "송지효", phone: "010-4455-6677", address: "경기도 일산", product: "여성용 퀼팅 자켓", amount: 87000, status: "배송준비", tracking: "" },
  { orderNo: "20260215-0003", date: "2026-02-15", name: "전소민", phone: "010-9988-1122", address: "경기도 고양시", product: "플로럴 블라우스 핑크", amount: 54000, status: "배송중", tracking: "대한통운 611223344556" },
  { orderNo: "20260210-0004", date: "2026-02-10", name: "양세찬", phone: "010-3434-7878", address: "경기도 동두천", product: "오버핏 후드티 차콜", amount: 24000, status: "결제완료", tracking: "" },
  { orderNo: "20260205-0005", date: "2026-02-05", name: "신동엽", phone: "010-1919-2020", address: "서울시 청담동", product: "싱글 코트 카멜 캐시미어", amount: 185000, status: "배송중", tracking: "대한통운 644556677889" },
  { orderNo: "20260202-0006", date: "2026-02-02", name: "성시경", phone: "010-4848-4949", address: "서울시 한남동", product: "프리미엄 와인 잔 세트", amount: 96000, status: "배송준비", tracking: "" },
];

const WEEKLY = {
  labels: ["2026-02-05", "2026-02-20", "2026-03-15", "2026-04-15", "2026-05-15"],
  data: [3, 3, 4, 5, 5],
};

const TABS: ("전체" | OrderStatus)[] = ["전체", "결제완료", "배송준비", "배송중"];

const STATUS_BADGE: Record<OrderStatus, string> = {
  결제완료: "bg-blue-100 text-blue-800",
  배송준비: "bg-amber-100 text-amber-800",
  배송중: "bg-sky-100 text-sky-700",
};

export default function OrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [tab, setTab] = useState<"전체" | OrderStatus>("전체");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Order | null>(null);

  const summary = useMemo(() => {
    let ready = 0, prep = 0, shipping = 0, totalSales = 0;
    for (const o of orders) {
      totalSales += o.amount;
      if (o.status === "결제완료") ready++;
      else if (o.status === "배송준비") prep++;
      else if (o.status === "배송중") shipping++;
    }
    return { ready, prep, shipping, totalSales };
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesTab = tab === "전체" || o.status === tab;
      const matchesSearch = !q || o.name.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [orders, tab, search]);

  function shipOrder(orderNo: string) {
    const value = (trackingInputs[orderNo] ?? "").trim();
    if (!/^[0-9]{12}$/.test(value)) {
      toast.push(
        "대한통운 운송장 번호 양식에 맞지 않습니다. 하이픈(-)을 제외한 정확한 12자리 숫자를 입력해 주세요.",
        "err",
      );
      return;
    }
    setOrders((prev) =>
      prev.map((o) =>
        o.orderNo === orderNo
          ? { ...o, status: "배송중", tracking: `대한통운 ${value}` }
          : o,
      ),
    );
    toast.push("발송 처리가 완료되었습니다.");
  }

  function bulkUpdateToPrep() {
    if (selected.size === 0) {
      toast.push("변경할 주문 건을 선택해 주세요.", "err");
      return;
    }
    setOrders((prev) =>
      prev.map((o) =>
        selected.has(o.orderNo) && o.status === "결제완료"
          ? { ...o, status: "배송준비" }
          : o,
      ),
    );
    setSelected(new Set());
  }

  function toggleSelect(orderNo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(visible.map((o) => o.orderNo)) : new Set());
  }

  function exportToExcel() {
    const header = ["주문번호", "주문일시", "주문자", "상품명", "결제금액", "주문상태", "운송장번호"];
    const rows = visible.map((o) => [
      o.orderNo, o.date, o.name, o.product, String(o.amount), o.status, o.tracking || "미발송",
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

  const allVisibleSelected =
    visible.length > 0 && visible.every((o) => selected.has(o.orderNo));

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">📊 주문/배송 관리</h1>
        <p className="text-sm text-slate-700 mt-1">
          신규 주문 확인부터 운송장 등록·발송 처리까지 한 화면에서 관리하세요.
        </p>
      </header>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard title="신규 주문 (결제완료)" value={`${summary.ready} 건`} valueClass="text-blue-600" />
        <SummaryCard title="배송 준비중" value={`${summary.prep} 건`} valueClass="text-amber-700" />
        <SummaryCard title="배송중인 상품" value={`${summary.shipping} 건`} valueClass="text-sky-700" />
        <SummaryCard title={`누적 매출 합계 (${orders.length}건 기준)`} value={`${summary.totalSales.toLocaleString()} 원`} valueClass="text-slate-900" />
      </div>

      {/* 주간 주문 추이 차트 */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-700 mb-4">
          📈 최근 기간별 주간 주문 건수 추이
        </h2>
        <WeeklyChart labels={WEEKLY.labels} data={WEEKLY.data} />
      </section>

      {/* 상태 탭 */}
      <div className="flex border-b-2 border-slate-200 mb-5">
        {TABS.map((t) => {
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
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={bulkUpdateToPrep}
          className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold px-4 py-2 rounded-md"
        >
          선택 항목 배송준비로 변경
        </button>
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
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">주문번호</th>
                <th className="px-4 py-3 font-semibold">주문일시</th>
                <th className="px-4 py-3 font-semibold">주문자</th>
                <th className="px-4 py-3 font-semibold">상품명</th>
                <th className="px-4 py-3 font-semibold">결제금액</th>
                <th className="px-4 py-3 font-semibold">주문상태</th>
                <th className="px-4 py-3 font-semibold w-60">운송장 번호 입력</th>
                <th className="px-4 py-3 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    조건에 맞는 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                visible.map((o) => (
                  <tr key={o.orderNo} className="align-middle hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.orderNo)}
                        onChange={() => toggleSelect(o.orderNo)}
                      />
                    </td>
                    <td className="px-4 py-3">{o.orderNo}</td>
                    <td className="px-4 py-3">{o.date}</td>
                    <td className="px-4 py-3">{o.name}</td>
                    <td className="px-4 py-3">{o.product}</td>
                    <td className="px-4 py-3">{o.amount.toLocaleString()}원</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[o.status]}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.status === "배송중" ? (
                        <span className="text-slate-700">{o.tracking}</span>
                      ) : o.status === "배송준비" ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={trackingInputs[o.orderNo] ?? ""}
                            onChange={(e) =>
                              setTrackingInputs((p) => ({ ...p, [o.orderNo]: e.target.value }))
                            }
                            placeholder="12자리 숫자 입력"
                            maxLength={12}
                            className="w-32 px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => shipOrder(o.orderNo)}
                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1.5 rounded-md"
                          >
                            <Truck className="w-3.5 h-3.5" /> 발송
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            disabled
                            placeholder="배송준비 필요"
                            className="w-32 px-2 py-1.5 text-xs border border-slate-200 bg-slate-100 rounded-md text-slate-400"
                          />
                          <button
                            disabled
                            className="bg-slate-300 text-white text-xs px-2.5 py-1.5 rounded-md cursor-not-allowed"
                          >
                            발송
                          </button>
                        </div>
                      )}
                    </td>
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
              <DetailRow label="주문번호" value={detail.orderNo} />
              <DetailRow label="주문자명" value={detail.name} />
              <DetailRow label="연락처" value={detail.phone} />
              <DetailRow label="배송지" value={detail.address} />
              <DetailRow label="상품명" value={detail.product} />
              <DetailRow label="결제금액" value={`${detail.amount.toLocaleString()}원`} />
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">송장번호</dt>
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
  const W = 520, H = 200, padL = 24, padR = 16, padT = 16, padB = 32;
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
