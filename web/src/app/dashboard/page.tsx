"use client";

import Link from "next/link";
import { ExternalLink, Package, Plus, Sparkles } from "lucide-react";

import { useMe, useProducts } from "@/lib/queries";

export default function DashboardHome() {
  const { data: me } = useMe();
  const { data: products } = useProducts(5, 0);

  return (
    <div className="max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold">
          안녕하세요, {me?.full_name || me?.username}님
        </h1>
        <p className="text-slate-900 mt-1">
          오늘은 어떤 상품을 등록해 볼까요?
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/dashboard/products/new"
          className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-emerald-500 hover:shadow-md transition"
        >
          <Plus className="w-6 h-6 text-emerald-600 mb-3" />
          <div className="font-semibold">신규 상품 등록</div>
          <div className="text-sm text-slate-800 mt-1">
            AI 마케팅 문구로 빠르게 등록
          </div>
        </Link>
        <Link
          href="/dashboard/products"
          className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-emerald-500 hover:shadow-md transition"
        >
          <Package className="w-6 h-6 text-emerald-600 mb-3" />
          <div className="font-semibold">상품 관리</div>
          <div className="text-sm text-slate-800 mt-1">
            등록된 상품 조회·수정·삭제
          </div>
        </Link>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <Sparkles className="w-6 h-6 text-emerald-600 mb-3" />
          <div className="font-semibold">AI 도우미</div>
          <div className="text-sm text-slate-800 mt-1">
            등록·수정 화면에서 자동 활성화
          </div>
        </div>

        {/* 내 쇼핑몰 바로가기 */}
        {me?.username && (
          <Link
            href={`/shop/${me.username}`}
            target="_blank"
            className="group bg-emerald-50 rounded-2xl border border-emerald-200 p-6 hover:border-emerald-400 hover:shadow-md transition"
          >
            <ExternalLink className="w-6 h-6 text-emerald-600 mb-3" />
            <div className="font-semibold text-emerald-800">내 쇼핑몰 보기</div>
            <div className="text-sm text-emerald-700 mt-1 truncate">
              /shop/{me.username}
            </div>
          </Link>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">최근 상품</h2>
          <Link
            href="/dashboard/products"
            className="text-sm text-emerald-600 hover:underline"
          >
            전체 보기 →
          </Link>
        </div>
        {!products?.items.length ? (
          <p className="text-sm text-slate-800">등록된 상품이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {products.items.map((p) => (
              <li
                key={p.product_no}
                className="py-3 flex justify-between items-center"
              >
                <Link
                  href={`/dashboard/products/${p.product_no}`}
                  className="hover:text-emerald-600"
                >
                  <div className="font-medium">{p.product_name}</div>
                  <div className="text-xs text-slate-800">
                    #{p.product_no}
                  </div>
                </Link>
                <div className="text-sm text-slate-900">
                  {p.price?.toLocaleString()}원
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
