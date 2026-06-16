"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";

import { useToast } from "@/components/toast";
import { useCart } from "@/lib/cart";
import { createShopOrder } from "@/lib/shop-api";
import { errorMessage } from "@/lib/api";

export default function CartPage() {
  const { username } = useParams<{ username: string }>();
  const toast = useToast();
  const { items, total, count, setQty, remove, clear } = useCart(username);

  // 주문서 모달 상태
  const [checkout, setCheckout] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneOrderNo, setDoneOrderNo] = useState<string | null>(null);

  async function submitOrder() {
    if (!name.trim()) {
      toast.push("주문자 이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createShopOrder(username, {
        buyer_name: name.trim(),
        buyer_phone: phone.trim(),
        address: address.trim(),
        items: items.map((i) => ({
          product_no: i.product_no,
          product_name: i.product_name,
          price: i.price ?? 0,
          quantity: i.qty,
        })),
      });
      clear();
      setDoneOrderNo(res.order_no);
    } catch (e) {
      toast.push(`주문에 실패했습니다. ${errorMessage(e, "")}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href={`/shop/${username}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> 쇼핑 계속하기
          </Link>
          <h1 className="text-base font-bold text-slate-900">
            장바구니{count > 0 ? ` (${count})` : ""}
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-28 gap-4">
            <ShoppingBag className="w-14 h-14 text-slate-200" />
            <p className="text-slate-500 text-lg">장바구니가 비어 있습니다.</p>
            <Link
              href={`/shop/${username}`}
              className="mt-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              상품 보러 가기
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 상품 목록 */}
            <ul className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200">
              {items.map((item) => (
                <li key={item.product_no} className="flex gap-4 p-4">
                  <Link
                    href={`/shop/${username}/products/${item.product_no}`}
                    className="w-20 h-20 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center"
                  >
                    {item.detail_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.detail_image}
                        alt={item.product_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingBag className="w-7 h-7 text-slate-300" />
                    )}
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/shop/${username}/products/${item.product_no}`}
                      className="text-sm font-semibold text-slate-900 line-clamp-2 hover:text-emerald-600"
                    >
                      {item.product_name}
                    </Link>
                    <p className="mt-1 text-sm font-bold text-emerald-600">
                      {(item.price ?? 0).toLocaleString()}원
                    </p>

                    {/* 수량 조절 */}
                    <div className="mt-2 inline-flex items-center rounded-lg border border-slate-300">
                      <button
                        type="button"
                        onClick={() => setQty(item.product_no, item.qty - 1)}
                        aria-label="수량 줄이기"
                        className="p-1.5 text-slate-600 hover:text-slate-900"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-9 text-center text-sm tabular-nums">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(item.product_no, item.qty + 1)}
                        aria-label="수량 늘리기"
                        className="p-1.5 text-slate-600 hover:text-slate-900"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between">
                    <button
                      type="button"
                      onClick={() => remove(item.product_no)}
                      aria-label="삭제"
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-slate-900">
                      {((item.price ?? 0) * item.qty).toLocaleString()}원
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/* 합계 + 주문 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>총 결제금액</span>
                <span className="text-emerald-600">{total.toLocaleString()}원</span>
              </div>
              <button
                type="button"
                onClick={() => setCheckout(true)}
                className="mt-5 w-full py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                주문하기
              </button>
              <button
                type="button"
                onClick={() => {
                  clear();
                  toast.push("장바구니를 비웠습니다.");
                }}
                className="mt-2 w-full py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                장바구니 비우기
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-10 text-xs text-slate-400">
        Powered by GG
      </footer>

      {/* 주문서 / 주문 완료 모달 */}
      {checkout && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !submitting && setCheckout(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {doneOrderNo ? (
              // ── 주문 완료 ──
              <div className="text-center py-4">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">주문이 접수되었습니다</h3>
                <p className="mt-2 text-sm text-slate-500">
                  주문번호 <span className="font-semibold text-slate-700">{doneOrderNo}</span>
                </p>
                <Link
                  href={`/shop/${username}`}
                  className="mt-6 inline-block w-full py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  쇼핑 계속하기
                </Link>
              </div>
            ) : (
              // ── 주문서 입력 ──
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">주문서 작성</h3>
                  <button
                    type="button"
                    onClick={() => setCheckout(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <Field label="주문자 이름 *">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </Field>
                  <Field label="연락처">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </Field>
                  <Field label="배송지">
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="서울시 ..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </Field>
                </div>

                <div className="mt-5 flex items-center justify-between text-sm font-bold">
                  <span>총 결제금액</span>
                  <span className="text-emerald-600">{total.toLocaleString()}원</span>
                </div>

                <button
                  type="button"
                  onClick={submitOrder}
                  disabled={submitting}
                  className="mt-4 w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-semibold"
                >
                  {submitting ? "주문 처리 중…" : "주문 완료하기"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
