"use client";

// 시안 확정 후 manage 단계에서 쓰는 "편집 가능한 손님화면".
// storefront.tsx와 같은 시안을 그리되,
//   - 모든 카피(헤드라인 / "BEST PICK" 같은 제목 / 배너 문구 / 쇼핑몰 이름)를
//     클릭해 그 자리에서 수정하고(EditableText, blur 시 커밋 → 부모가 자동 저장),
//   - 추천상품 영역은 실제 등록 상품을 보여준다. 비어 있으면 + 카드만 뜨고,
//     + 를 누르면 ProductRegisterPanel을 모달로 띄워 상품을 등록한다.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Plus, ShoppingBag, Sparkles, Star, Tag, X } from "lucide-react";

import DraggableShopName from "@/components/shop-builder/draggable-shop-name";
import EditableText from "@/components/shop-builder/editable-text";
import ProductRegisterPanel from "@/components/shop-builder/product-register-panel";
import { useProducts } from "@/lib/queries";
import { fetchShopCategories } from "@/lib/shop-api";
import { resolveHeader, type ShopBlock, type ShopTheme } from "@/lib/shop-builder";
import type { ProductSummary } from "@/lib/types";

type Props = {
  shopName: string;
  username: string;
  blocks: ShopBlock[];
  theme: ShopTheme;
  onChangeBlocks: (next: ShopBlock[]) => void;
  onChangeShopName: (name: string) => void;
  onChangeTheme: (next: ShopTheme) => void;
};

type Testimonial = { quote: string; author: string };

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  { quote: "정말 마음에 들어요. 다시 구매하고 싶어요!", author: "익명 고객 1" },
  { quote: "배송도 빠르고 품질이 좋아요.", author: "익명 고객 2" },
  { quote: "주변에도 추천하고 있어요.", author: "익명 고객 3" },
];

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function ProductCard({
  product,
  text,
  primary,
}: {
  product: ProductSummary;
  text: string;
  primary: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {product.detail_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.detail_image}
            alt={product.product_name}
            className="w-full h-full object-cover"
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
          {product.product_name}
        </p>
        <p className="mt-2 text-base font-bold" style={{ color: primary }}>
          {product.price?.toLocaleString() ?? "-"}원
        </p>
      </div>
    </div>
  );
}

export default function EditableStorefront({
  shopName,
  username,
  blocks,
  theme,
  onChangeBlocks,
  onChangeShopName,
  onChangeTheme,
}: Props) {
  const [adding, setAdding] = useState(false);

  const { data: productData } = useProducts(20, 0);
  const products = productData?.items ?? [];

  const hasCategoryBlock = blocks.some((b) => b.type === "category-grid");
  const { data: categoryData } = useQuery({
    queryKey: ["shop-categories", username],
    queryFn: () => fetchShopCategories(username),
    enabled: hasCategoryBlock && !!username,
    retry: false,
  });
  const categories = categoryData ?? [];

  const bg = theme.background_color ?? "#ffffff";
  const text = theme.text_color ?? "#0f172a";
  const primary = theme.primary_color ?? "#0f172a";
  const accent = theme.accent_color ?? "#10b981";
  const font = theme.font_family ?? undefined;
  const header = resolveHeader(theme);

  const hasFeaturedBlock = blocks.some((b) => b.type === "featured-products");

  function setProp(blockId: string, key: string, value: unknown) {
    onChangeBlocks(
      blocks.map((b) =>
        b.id === blockId ? { ...b, props: { ...b.props, [key]: value } } : b
      )
    );
  }

  // 비어 있으면 큰 + 카드, 상품이 있으면 그리드 + 마지막에 추가 카드.
  function renderProductArea() {
    if (products.length === 0) {
      return (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-16 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition"
        >
          <Plus className="w-8 h-8" />
          <span className="text-sm font-medium">상품 등록하기</span>
          <span className="text-xs">+ 를 눌러 첫 상품을 추가하세요</span>
        </button>
      );
    }
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((p) => (
          <ProductCard key={p.product_no} product={p} text={text} primary={primary} />
        ))}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-2xl border-2 border-dashed border-slate-300 min-h-[220px] flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition"
        >
          <Plus className="w-7 h-7" />
          <span className="text-sm font-medium">상품 추가</span>
        </button>
      </div>
    );
  }

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
            <EditableText
              as="h1"
              value={headline}
              placeholder="헤드라인"
              onCommit={(v) => setProp(block.id, "headline", v)}
              className="block text-4xl font-bold mb-3 leading-tight"
              style={{ color: primary }}
            />
            <EditableText
              as="p"
              multiline
              value={subcopy}
              placeholder="부제목"
              onCommit={(v) => setProp(block.id, "subcopy", v)}
              className="block text-base mb-8"
              style={{ color: text, opacity: 0.7 }}
            />
            <EditableText
              value={cta}
              placeholder="버튼 문구"
              onCommit={(v) => setProp(block.id, "cta", v)}
              className="inline-block px-6 py-3 rounded-full text-sm font-semibold"
              style={{ background: primary, color: "#fff" }}
            />
          </section>
        );
      }

      case "featured-products": {
        const title = str(block.props.title, "추천 상품");
        return (
          <section key={block.id} className="px-6 sm:px-10 py-12">
            <EditableText
              as="h2"
              value={title}
              placeholder="섹션 제목"
              onCommit={(v) => setProp(block.id, "title", v)}
              className="block text-xl font-bold mb-6"
              style={{ color: primary }}
            />
            {renderProductArea()}
          </section>
        );
      }

      case "category-grid": {
        const title = str(block.props.title, "카테고리");
        const top = categories.filter((c) => c.depth == null || c.depth === 1);
        const shown = (top.length ? top : categories).slice(0, 12);
        return (
          <section key={block.id} className="px-6 sm:px-10 py-12">
            <EditableText
              as="h2"
              value={title}
              placeholder="섹션 제목"
              onCommit={(v) => setProp(block.id, "title", v)}
              className="block text-xl font-bold mb-6"
              style={{ color: primary }}
            />
            {shown.length > 0 ? (
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
            ) : (
              <p className="text-sm" style={{ color: text, opacity: 0.5 }}>
                연결된 Cafe24 카테고리가 손님 화면에 표시됩니다.
              </p>
            )}
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
              <div className="min-w-0">
                <EditableText
                  as="div"
                  value={title}
                  placeholder="배너 제목"
                  onCommit={(v) => setProp(block.id, "title", v)}
                  className="text-3xl font-extrabold mb-2"
                />
                <EditableText
                  as="div"
                  value={subtitle}
                  placeholder="배너 설명"
                  onCommit={(v) => setProp(block.id, "subtitle", v)}
                  className="text-sm opacity-80"
                />
              </div>
              <span
                className="px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap"
                style={{ background: accent, color: "#fff" }}
              >
                확인하기
              </span>
            </div>
          </section>
        );
      }

      case "testimonial": {
        const title = str(block.props.title, "고객 후기");
        const raw = block.props.items;
        const items: Testimonial[] = Array.isArray(raw) && raw.length
          ? (raw as Testimonial[])
          : DEFAULT_TESTIMONIALS;

        function setItem(idx: number, key: keyof Testimonial, value: string) {
          const next = items.map((it, i) =>
            i === idx ? { ...it, [key]: value } : it
          );
          setProp(block.id, "items", next);
        }

        return (
          <section key={block.id} className="px-6 sm:px-10 py-12">
            <EditableText
              as="h2"
              value={title}
              placeholder="섹션 제목"
              onCommit={(v) => setProp(block.id, "title", v)}
              className="block text-xl font-bold mb-6"
              style={{ color: primary }}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {items.map((it, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-5 bg-white border border-slate-200"
                >
                  <div className="flex gap-0.5 mb-2" style={{ color: accent }}>
                    {[0, 1, 2, 3, 4].map((s) => (
                      <Star key={s} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <EditableText
                    as="p"
                    multiline
                    value={it.quote}
                    placeholder="후기 내용"
                    onCommit={(v) => setItem(i, "quote", v)}
                    className="block text-sm"
                    style={{ color: text }}
                  />
                  <EditableText
                    as="div"
                    value={it.author}
                    placeholder="작성자"
                    onCommit={(v) => setItem(i, "author", v)}
                    className="text-xs mt-3 text-slate-400"
                  />
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
            <EditableText
              as="h3"
              value={title}
              placeholder="섹션 제목"
              onCommit={(v) => setProp(block.id, "title", v)}
              className="block text-xl font-bold mb-4"
            />
            <div className="flex justify-center gap-2 max-w-md mx-auto">
              <input
                className="flex-1 rounded-full px-4 py-2 text-sm text-slate-900"
                placeholder="이메일을 입력하세요"
                disabled
              />
              <span
                className="px-5 py-2 rounded-full text-sm font-semibold"
                style={{ background: primary, color: "#fff" }}
              >
                구독
              </span>
            </div>
          </section>
        );
      }

      default:
        return null;
    }
  }

  return (
    <>
      <div className="min-h-[60vh]" style={{ background: bg, color: text, fontFamily: font }}>
        <DraggableShopName
          shopName={shopName}
          x={header.x}
          y={header.y}
          fontSize={header.fontSize}
          bg={bg}
          color={primary}
          accent={accent}
          editable
          onCommitName={onChangeShopName}
          onMove={(nx, ny) => onChangeTheme({ ...theme, header_x: nx, header_y: ny })}
          onFontSize={(size) => onChangeTheme({ ...theme, header_font_size: size })}
        />

        <main className="max-w-6xl mx-auto">
          {blocks.map(renderBlock)}

          {/* featured-products 블록이 없으면 상품이 손님에게 닿지 못하므로 보강 */}
          {!hasFeaturedBlock && (
            <section className="px-6 sm:px-10 py-12">
              <h2 className="text-xl font-bold mb-6" style={{ color: primary }}>
                전체 상품
              </h2>
              {renderProductArea()}
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

      {/* 상품 등록 모달 — + 클릭 시 */}
      {adding && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdding(false);
          }}
        >
          <div className="relative w-full max-w-5xl my-8 bg-white rounded-2xl shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-slate-200 px-5 py-3 rounded-t-2xl">
              <span className="text-sm font-semibold text-slate-700">상품 등록</span>
              <button
                type="button"
                onClick={() => setAdding(false)}
                aria-label="닫기"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 sm:p-8">
              <ProductRegisterPanel
                shopName={shopName}
                onRegistered={() => setAdding(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
