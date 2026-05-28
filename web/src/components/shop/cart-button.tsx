"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShoppingCart } from "lucide-react";

import { useCart } from "@/lib/cart";

export default function CartButton({
  username,
  className = "",
  color,
}: {
  username: string;
  /** 위치/색상 등 추가 클래스 (예: 헤더 절대배치) */
  className?: string;
  /** 아이콘 색상 (시안 accent 등) */
  color?: string;
}) {
  const { count } = useCart(username);
  const router = useRouter();
  const [askMove, setAskMove] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAskMove(true)}
        aria-label={`장바구니${count > 0 ? ` (${count})` : ""}`}
        className={`relative inline-flex items-center justify-center ${className}`}
        style={color ? { color } : undefined}
      >
        <ShoppingCart className="w-6 h-6" />
        {count > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold leading-none flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* 장바구니 이동 여부 확인 */}
      {askMove && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setAskMove(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-slate-900 text-center">
              장바구니 페이지로 넘어가시겠습니까?
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setAskMove(false)}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={() => {
                  setAskMove(false);
                  router.push(`/shop/${username}/cart`);
                }}
                className="flex-1 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
