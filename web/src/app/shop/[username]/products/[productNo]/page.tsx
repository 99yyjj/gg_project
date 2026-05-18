"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShoppingBag } from "lucide-react";

import { fetchShopProduct } from "@/lib/shop-api";

export default function ShopProductPage() {
  const { username, productNo } = useParams<{
    username: string;
    productNo: string;
  }>();

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["shop-product", username, productNo],
    queryFn: () => fetchShopProduct(username, Number(productNo)),
    enabled: !!productNo,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-500">불러오는 중...</p>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <ShoppingBag className="w-12 h-12 text-slate-300" />
        <p className="text-slate-900 font-semibold">상품을 찾을 수 없습니다.</p>
        <Link href={`/shop/${username}`} className="text-emerald-600 text-sm hover:underline">
          쇼핑몰로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link
            href={`/shop/${username}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> 쇼핑몰로 돌아가기
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-10">
          {/* 이미지 */}
          <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center">
            {product.detail_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.detail_image}
                alt={product.product_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <ShoppingBag className="w-16 h-16 text-slate-300" />
            )}
          </div>

          {/* 상품 정보 */}
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-slate-900 leading-snug">
              {product.product_name}
            </h1>
            <p className="mt-4 text-3xl font-bold text-emerald-600">
              {product.price?.toLocaleString() ?? "-"}원
            </p>

            <div className="mt-6 flex gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  product.display === "T"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {product.display === "T" ? "판매중" : "판매종료"}
              </span>
            </div>

            {product.description && (
              <div className="mt-8 border-t border-slate-100 pt-6">
                <h2 className="text-sm font-semibold text-slate-500 mb-3">상품 설명</h2>
                <div
                  className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="text-center py-10 text-xs text-slate-400">
        Powered by GG
      </footer>
    </div>
  );
}
