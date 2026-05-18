"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, ChevronLeft, ChevronRight } from "lucide-react";

import Storefront from "@/components/shop/storefront";
import {
  fetchShopCategories,
  fetchShopProducts,
  ShopProduct,
} from "@/lib/shop-api";

const PAGE_SIZE = 20;

export default function ShopPage() {
  const { username } = useParams<{ username: string }>();
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shop", username, offset],
    queryFn: () => fetchShopProducts(username, PAGE_SIZE, offset),
  });

  const template = data?.shop.shop_template ?? null;
  const hasCategoryBlock =
    template?.blocks?.some((b) => b.type === "category-grid") ?? false;

  // category-grid 블록이 있는 시안일 때만 카테고리를 불러온다 (불필요한 Cafe24 호출 회피).
  const { data: categories } = useQuery({
    queryKey: ["shop-categories", username],
    queryFn: () => fetchShopCategories(username),
    enabled: hasCategoryBlock,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-500">불러오는 중...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <ShoppingBag className="w-12 h-12 text-slate-300" />
        <p className="text-slate-900 font-semibold">쇼핑몰을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const { shop, items } = data;
  const shopName = shop.shop_name || shop.username;

  // 사장님이 확정한 시안이 있으면 그 시안대로 렌더.
  if (template?.blocks?.length) {
    return (
      <Storefront
        shopName={shopName}
        username={username}
        blocks={template.blocks}
        theme={template.theme ?? {}}
        products={items}
        categories={categories ?? []}
        offset={offset}
        pageSize={PAGE_SIZE}
        onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        onNext={() => setOffset(offset + PAGE_SIZE)}
      />
    );
  }

  // 아직 쇼핑몰을 꾸미지 않은 사용자 → 기본 레이아웃으로 폴백.
  return (
    <div>
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{shopName}</h1>
            {shop.shop_name && (
              <p className="text-xs text-slate-500">@{shop.username}</p>
            )}
          </div>
          <ShoppingBag className="w-6 h-6 text-emerald-600" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-32 gap-4">
            <ShoppingBag className="w-14 h-14 text-slate-200" />
            <p className="text-slate-500 text-lg">아직 등록된 상품이 없습니다.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-6">
              총 {items.length}개 상품
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {items.map((p) => (
                <ProductCard key={p.product_no} username={username} product={p} />
              ))}
            </div>

            {/* 페이지네이션 */}
            <div className="flex justify-center gap-3 mt-12">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" /> 이전
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={items.length < PAGE_SIZE}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                다음 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="text-center py-10 text-xs text-slate-400">
        Powered by GG
      </footer>
    </div>
  );
}

function ProductCard({
  username,
  product,
}: {
  username: string;
  product: ShopProduct;
}) {
  return (
    <Link
      href={`/shop/${username}/products/${product.product_no}`}
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-emerald-300 transition"
    >
      {/* 상품 이미지 */}
      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {product.detail_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.detail_image}
            alt={product.product_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <ShoppingBag className="w-10 h-10 text-slate-300" />
        )}
      </div>

      {/* 상품 정보 */}
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
          {product.product_name}
        </p>
        <p className="mt-2 text-base font-bold text-emerald-600">
          {product.price?.toLocaleString() ?? "-"}원
        </p>
      </div>
    </Link>
  );
}
