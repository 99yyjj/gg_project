"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2, Edit3, RefreshCw } from "lucide-react";

import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import { useDeleteProduct, useProducts } from "@/lib/queries";

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isFetching, refetch } = useProducts(PAGE_SIZE, offset);
  const del = useDeleteProduct();
  const toast = useToast();

  async function handleDelete(productNo: number, name: string) {
    if (!confirm(`'${name}' (#${productNo}) 상품을 삭제할까요?`)) return;
    try {
      await del.mutateAsync(productNo);
      toast.push("삭제되었습니다.");
    } catch (e) {
      toast.push(errorMessage(e, "삭제에 실패했습니다."), "err");
    }
  }

  return (
    <div className="max-w-6xl">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">상품 관리</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <Link
            href="/dashboard/products/new"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> 신규 상품
          </Link>
        </div>
      </header>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-900">불러오는 중...</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <Plus className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">등록된 상품이 없습니다.</p>
            <Link
              href="/dashboard/products/new"
              className="inline-block mt-4 text-emerald-600 hover:underline"
            >
              첫 상품 등록하기 →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 w-16">#</th>
                <th className="px-4 py-3">상품명</th>
                <th className="px-4 py-3 w-28">가격</th>
                <th className="px-4 py-3 w-24">진열</th>
                <th className="px-4 py-3 w-32">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p) => (
                <tr key={p.product_no} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{p.product_no}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/products/${p.product_no}`}
                      className="font-medium hover:text-emerald-600"
                    >
                      {p.product_name}
                    </Link>
                    {p.product_code && (
                      <div className="text-xs text-slate-800 mt-0.5">
                        {p.product_code}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.price?.toLocaleString() ?? "-"}원
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        p.display === "T"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.display === "T" ? "진열" : "미진열"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/products/${p.product_no}/edit`}
                        className="p-1.5 rounded text-slate-600 hover:bg-slate-100"
                        title="수정"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(p.product_no, p.product_name)}
                        className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 text-sm">
          <div className="text-slate-900">offset: {offset}</div>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
            >
              이전
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!data || data.items.length < PAGE_SIZE}
              className="px-3 py-1.5 rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
