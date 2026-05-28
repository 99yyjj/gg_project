"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";

import CartButton from "@/components/shop/cart-button";
import { ShopReviewsSection } from "@/components/shop/shop-reviews-section";
import { useCart } from "@/lib/cart";
import { fetchShopProduct } from "@/lib/shop-api";
import { sanitizeHtml } from "@/lib/sanitize";

export default function ShopProductPage() {
  const { username, productNo } = useParams<{
    username: string;
    productNo: string;
  }>();
  const router = useRouter();
  const { add } = useCart(username);
  const [askMove, setAskMove] = useState(false);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["shop-product", username, productNo],
    queryFn: () => fetchShopProduct(username, Number(productNo)),
    enabled: !!productNo,
  });

  // 상단 갤러리 — 대표 이미지(detail_image) + 추가 이미지(additional_images) 를
  // 한 캐러셀로 묶어 좌·우 화살표로 넘겨본다. 중복 URL 은 한 번만.
  const gallery = product
    ? Array.from(
        new Set(
          [product.detail_image, ...(product.additional_images ?? [])].filter(
            (u): u is string => !!u
          )
        )
      )
    : [];
  const [selected, setSelected] = useState(0);
  const mainImage = gallery[selected] ?? gallery[0] ?? null;
  const hasMany = gallery.length > 1;

  function prev() {
    setSelected((i) => (i <= 0 ? i : i - 1));
  }
  function next() {
    setSelected((i) => (i >= gallery.length - 1 ? i : i + 1));
  }

  // 키보드 ← → 로도 넘길 수 있게 — 입력창에 포커스가 있을 땐 무시.
  // 핸들러는 effect 안에서 직접 처리해 의존성을 단순화한다.
  useEffect(() => {
    if (!hasMany) return;
    const last = gallery.length - 1;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") setSelected((i) => (i <= 0 ? i : i - 1));
      else if (e.key === "ArrowRight")
        setSelected((i) => (i >= last ? i : i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasMany, gallery.length]);

  function handleAddToCart() {
    if (!product) return;
    add({
      product_no: product.product_no,
      product_name: product.product_name,
      price: product.price,
      detail_image: product.detail_image,
    });
    setAskMove(true);
  }

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
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href={`/shop/${username}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> 쇼핑몰로 돌아가기
          </Link>
          <CartButton username={username} className="text-slate-700 hover:text-slate-900" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-10">
          {/* 좌: 메인 이미지 + 좌우 화살표 + 카운터 + 썸네일 */}
          <div>
            <div className="relative aspect-square bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center group">
              {mainImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mainImage}
                  alt={product.product_name}
                  className="w-full h-full object-cover select-none"
                  draggable={false}
                />
              ) : (
                <ShoppingBag className="w-16 h-16 text-slate-300" />
              )}

              {/* 화살표 — 이미지가 두 장 이상일 때만 노출. 양 끝에선 비활성 처리. */}
              {hasMany && (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    disabled={selected === 0}
                    aria-label="이전 이미지"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white shadow-md flex items-center justify-center text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    disabled={selected >= gallery.length - 1}
                    aria-label="다음 이미지"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white shadow-md flex items-center justify-center text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/55 text-white text-xs font-medium">
                    {selected + 1} / {gallery.length}
                  </div>
                </>
              )}
            </div>

            {hasMany && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {gallery.map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    onClick={() => setSelected(i)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 ${
                      i === selected ? "border-emerald-500" : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${product.product_name} ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 우: 상품명 / 가격 / 간략설명 / 구매·장바구니 */}
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-slate-900 leading-snug">
              {product.product_name}
            </h1>
            <p className="mt-4 text-3xl font-bold text-emerald-600">
              {product.price?.toLocaleString() ?? "-"}원
            </p>

            {product.summary_description && (
              <p className="mt-4 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {product.summary_description}
              </p>
            )}

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

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                className="flex-1 py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                바로 구매
              </button>
              <button
                type="button"
                onClick={handleAddToCart}
                className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ShoppingCart className="w-4 h-4" />
                장바구니
              </button>
            </div>
          </div>
        </div>

        {/* 스크롤 하단: 상품 설명 (이미지는 위 캐러셀에서 좌·우 화살표로 본다) */}
        {product.description && (
          <section className="mt-16 border-t border-slate-100 pt-10">
            <h2 className="text-sm font-semibold text-slate-500 mb-5">상품 상세정보</h2>
            <div
              className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
            />
          </section>
        )}

        {/* 상세정보 아래: 리뷰 섹션 */}
        <ShopReviewsSection
          username={username}
          productNo={Number(productNo)}
        />
      </main>

      <footer className="text-center py-10 text-xs text-slate-400">
        Powered by GG
      </footer>

      {/* 장바구니 담은 뒤 이동 여부 확인 */}
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
              장바구니에 담았습니다.
            </p>
            <p className="text-sm text-slate-600 text-center mt-1">
              장바구니 페이지로 이동하시겠습니까?
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
                onClick={() => router.push(`/shop/${username}/cart`)}
                className="flex-1 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
