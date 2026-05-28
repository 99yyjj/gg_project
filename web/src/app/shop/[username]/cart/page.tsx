"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { useToast } from "@/components/toast";
import { useCart } from "@/lib/cart";

export default function CartPage() {
  const { username } = useParams<{ username: string }>();
  const toast = useToast();
  const { items, total, count, setQty, remove, clear } = useCart(username);

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
                onClick={() => toast.push("주문/결제 기능은 준비 중입니다.")}
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
    </div>
  );
}
