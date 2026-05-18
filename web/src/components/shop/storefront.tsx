"use client";

// 손님화면(/shop/[username]) 시안 렌더러.
// dashboard 미리보기용 block-renderer.tsx 와 달리, 실제 상품/카테고리 데이터를 받아 그린다.

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";

import type { ShopCategory, ShopProduct } from "@/lib/shop-api";
import type { ShopBlock, ShopTheme } from "@/lib/shop-builder";

type Props = {
  shopName: string;
  username: string;
  blocks: ShopBlock[];
  theme: ShopTheme;
  products: ShopProduct[];
  categories: ShopCategory[];
  offset: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
};

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

type ProductGridProps = {
  products: ShopProduct[];
  username: string;
  text: string;
  accent: string;
  primary: string;
  offset: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
};

function ProductGrid({
  products,
  username,
  text,
  accent,
  primary,
  offset,
  hasMore,
  onPrev,
  onNext,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <ShoppingBag
          className="w-12 h-12"
          style={{ color: accent, opacity: 0.4 }}
        />
        <p style={{ color: text, opacity: 0.6 }}>아직 등록된 상품이 없습니다.</p>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((p) => (
          <Link
            key={p.product_no}
            href={`/shop/${username}/products/${p.product_no}`}
            className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition"
          >
            <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
              {p.detail_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.detail_image}
                  alt={p.product_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <ShoppingBag className="w-10 h-10 text-slate-300" />
              )}
            </div>
            <div className="p-4">
              <p
                className="text-sm font-semibold line-clamp-2 leading-snug"
                style={{ color: text }}
              >
                {p.product_name}
              </p>
              <p className="mt-2 text-base font-bold" style={{ color: primary }}>
                {p.price?.toLocaleString() ?? "-"}원
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex justify-center gap-3 mt-12">
        <button
          type="button"
          onClick={onPrev}
          disabled={offset === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
        >
          <ChevronLeft className="w-4 h-4" /> 이전
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasMore}
          className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
        >
          다음 <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

export default function Storefront({
  shopName,
  username,
  blocks,
  theme,
  products,
  categories,
  offset,
  pageSize,
  onPrev,
  onNext,
}: Props) {
  const bg = theme.background_color ?? "#ffffff";
  const text = theme.text_color ?? "#0f172a";
  const primary = theme.primary_color ?? "#0f172a";
  const accent = theme.accent_color ?? "#10b981";
  const font = theme.font_family ?? undefined;

  const hasMore = products.length >= pageSize;
  const hasFeaturedBlock = blocks.some((b) => b.type === "featured-products");

  const gridProps: ProductGridProps = {
    products,
    username,
    text,
    accent,
    primary,
    offset,
    hasMore,
    onPrev,
    onNext,
  };

  function renderBlock(block: ShopBlock) {
    switch (block.type) {
      case "hero": {
        const headline = str(block.props.headline, "당신만의 쇼핑몰");
        const subcopy = str(block.props.subcopy, "지금 바로 시작해보세요.");
        const cta = str(block.props.cta, "둘러보기");
        return (
          <section key={block.id} className="px-6 sm:px-10 py-20 text-center">
            <div
              className="inline-flex items-center gap-1 text-xs font-medium mb-4 px-3 py-1 rounded-full"
              style={{ background: accent, color: "#fff" }}
            >
              <Sparkles className="w-3.5 h-3.5" /> NEW
            </div>
            <h1
              className="text-4xl font-bold mb-3 leading-tight"
              style={{ color: primary }}
            >
              {headline}
            </h1>
            <p className="text-base mb-8" style={{ color: text, opacity: 0.7 }}>
              {subcopy}
            </p>
            <button
              type="button"
              className="px-6 py-3 rounded-full text-sm font-semibold"
              style={{ background: primary, color: "#fff" }}
            >
              {cta}
            </button>
          </section>
        );
      }

      case "featured-products": {
        const title = str(block.props.title, "추천 상품");
        return (
          <section key={block.id} className="px-6 sm:px-10 py-12">
            <h2 className="text-xl font-bold mb-6" style={{ color: primary }}>
              {title}
            </h2>
            <ProductGrid {...gridProps} />
          </section>
        );
      }

      case "category-grid": {
        if (categories.length === 0) return null;
        const title = str(block.props.title, "카테고리");
        const top = categories.filter((c) => c.depth == null || c.depth === 1);
        const shown = (top.length ? top : categories).slice(0, 12);
        return (
          <section key={block.id} className="px-6 sm:px-10 py-12">
            <h2 className="text-xl font-bold mb-6" style={{ color: primary }}>
              {title}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {shown.map((c) => (
                <div
                  key={c.category_no}
                  className="rounded-2xl py-6 text-center text-sm font-semibold"
                  style={{ background: accent, color: "#fff" }}
                >
                  <Tag className="w-5 h-5 mx-auto mb-1" />
                  {c.category_name}
                </div>
              ))}
            </div>
          </section>
        );
      }

      case "banner": {
        const title = str(block.props.title, "EVENT");
        const subtitle = str(block.props.subtitle, "이번 주만 특별가");
        return (
          <section key={block.id} className="px-6 sm:px-10 py-6">
            <div
              className="rounded-3xl px-10 py-12 flex items-center justify-between gap-4"
              style={{ background: primary, color: "#fff" }}
            >
              <div>
                <div className="text-3xl font-extrabold mb-2">{title}</div>
                <div className="text-sm opacity-80">{subtitle}</div>
              </div>
              <button
                type="button"
                className="px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap"
                style={{ background: accent, color: "#fff" }}
              >
                확인하기
              </button>
            </div>
          </section>
        );
      }

      case "testimonial": {
        const title = str(block.props.title, "고객 후기");
        return (
          <section key={block.id} className="px-6 sm:px-10 py-12">
            <h2 className="text-xl font-bold mb-6" style={{ color: primary }}>
              {title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl p-5 bg-white border border-slate-200"
                >
                  <div className="flex gap-0.5 mb-2" style={{ color: accent }}>
                    {[0, 1, 2, 3, 4].map((s) => (
                      <Star key={s} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm" style={{ color: text }}>
                    “정말 마음에 들어요. 다시 구매하고 싶어요!”
                  </p>
                  <div className="text-xs mt-3 text-slate-400">
                    — 익명 고객 {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }

      case "newsletter": {
        const title = str(block.props.title, "뉴스레터 구독");
        return (
          <section
            key={block.id}
            className="px-6 sm:px-10 py-12 text-center"
            style={{ background: accent, color: "#fff" }}
          >
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-90" />
            <h3 className="text-xl font-bold mb-4">{title}</h3>
            <div className="flex justify-center gap-2 max-w-md mx-auto">
              <input
                className="flex-1 rounded-full px-4 py-2 text-sm text-slate-900"
                placeholder="이메일을 입력하세요"
              />
              <button
                type="button"
                className="px-5 py-2 rounded-full text-sm font-semibold"
                style={{ background: primary, color: "#fff" }}
              >
                구독
              </button>
            </div>
          </section>
        );
      }

      default:
        return null;
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: bg, color: text, fontFamily: font }}
    >
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: bg, borderColor: "rgba(0,0,0,0.08)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: primary }}>
            {shopName}
          </h1>
          <ShoppingBag className="w-6 h-6" style={{ color: accent }} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {blocks.map(renderBlock)}

        {/* featured-products 블록이 없으면 상품이 손님에게 닿지 못하므로 보강 */}
        {!hasFeaturedBlock && (
          <section className="px-6 sm:px-10 py-12">
            <h2 className="text-xl font-bold mb-6" style={{ color: primary }}>
              전체 상품
            </h2>
            <ProductGrid {...gridProps} />
          </section>
        )}
      </main>

      <footer
        className="text-center py-10 text-xs"
        style={{ color: text, opacity: 0.4 }}
      >
        Powered by GG
      </footer>
    </div>
  );
}
