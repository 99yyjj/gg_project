"use client";

import { ShoppingBag, Mail, Star, Tag, Sparkles } from "lucide-react";

import type { ShopBlock, ShopTheme } from "@/lib/shop-builder";

/**
 * 빌더 미리보기에서 쓰이는 더미 렌더링용 블록.
 * 손님화면(/shop/[username])이 아니라 dashboard에서 시안만 보여주는 용도라
 * 실제 상품 데이터 없이도 그럴듯하게 보이게 만든다.
 */

type Props = { block: ShopBlock; theme: ShopTheme };

export default function BlockRenderer({ block, theme }: Props) {
  switch (block.type) {
    case "hero":
      return <HeroBlock block={block} theme={theme} />;
    case "featured-products":
      return <FeaturedBlock block={block} theme={theme} />;
    case "category-grid":
      return <CategoryBlock block={block} theme={theme} />;
    case "banner":
      return <BannerBlock block={block} theme={theme} />;
    case "testimonial":
      return <TestimonialBlock block={block} theme={theme} />;
    case "newsletter":
      return <NewsletterBlock block={block} theme={theme} />;
  }
}

function HeroBlock({ block, theme }: Props) {
  const headline = (block.props.headline as string) || "당신만의 쇼핑몰";
  const subcopy = (block.props.subcopy as string) || "지금 바로 시작해보세요.";
  const cta = (block.props.cta as string) || "둘러보기";
  return (
    <section
      className="px-10 py-20 text-center"
      style={{ background: theme.background_color }}
    >
      <div
        className="inline-flex items-center gap-1 text-xs font-medium mb-4 px-3 py-1 rounded-full"
        style={{ background: theme.accent_color, color: "#fff" }}
      >
        <Sparkles className="w-3.5 h-3.5" /> NEW
      </div>
      <h1
        className="text-4xl font-bold mb-3 leading-tight"
        style={{ color: theme.primary_color }}
      >
        {headline}
      </h1>
      <p className="text-base mb-8" style={{ color: theme.text_color, opacity: 0.7 }}>
        {subcopy}
      </p>
      <button
        type="button"
        className="px-6 py-3 rounded-full text-sm font-semibold"
        style={{ background: theme.primary_color, color: "#fff" }}
      >
        {cta}
      </button>
    </section>
  );
}

function FeaturedBlock({ block, theme }: Props) {
  const title = (block.props.title as string) || "추천 상품";
  return (
    <section className="px-10 py-12">
      <h2
        className="text-xl font-bold mb-6"
        style={{ color: theme.primary_color }}
      >
        {title}
      </h2>
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden border border-slate-200 bg-white"
          >
            <div className="aspect-square bg-slate-100 flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-slate-300" />
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold" style={{ color: theme.text_color }}>
                상품 {i + 1}
              </div>
              <div className="text-sm mt-1 font-bold" style={{ color: theme.primary_color }}>
                29,000원
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryBlock({ block, theme }: Props) {
  const title = (block.props.title as string) || "카테고리";
  const cats = ["NEW", "BEST", "OUTER", "TOP", "BOTTOM", "ACC"];
  return (
    <section className="px-10 py-12">
      <h2 className="text-xl font-bold mb-6" style={{ color: theme.primary_color }}>
        {title}
      </h2>
      <div className="grid grid-cols-6 gap-3">
        {cats.map((c) => (
          <div
            key={c}
            className="rounded-2xl py-6 text-center text-sm font-semibold"
            style={{ background: theme.accent_color, color: "#fff" }}
          >
            <Tag className="w-5 h-5 mx-auto mb-1" />
            {c}
          </div>
        ))}
      </div>
    </section>
  );
}

function BannerBlock({ block, theme }: Props) {
  const title = (block.props.title as string) || "EVENT";
  const subtitle = (block.props.subtitle as string) || "이번 주만 특별가";
  return (
    <section className="px-10 py-6">
      <div
        className="rounded-3xl px-10 py-12 flex items-center justify-between"
        style={{ background: theme.primary_color, color: "#fff" }}
      >
        <div>
          <div className="text-3xl font-extrabold mb-2">{title}</div>
          <div className="text-sm opacity-80">{subtitle}</div>
        </div>
        <button
          className="px-5 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: theme.accent_color }}
        >
          확인하기
        </button>
      </div>
    </section>
  );
}

function TestimonialBlock({ block, theme }: Props) {
  const title = (block.props.title as string) || "고객 후기";
  return (
    <section className="px-10 py-12" style={{ background: theme.background_color }}>
      <h2 className="text-xl font-bold mb-6" style={{ color: theme.primary_color }}>
        {title}
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl p-5 bg-white border border-slate-200">
            <div className="flex gap-0.5 mb-2" style={{ color: theme.accent_color }}>
              {[0, 1, 2, 3, 4].map((s) => (
                <Star key={s} className="w-4 h-4 fill-current" />
              ))}
            </div>
            <p className="text-sm" style={{ color: theme.text_color }}>
              “정말 마음에 들어요. 다시 구매하고 싶어요!”
            </p>
            <div className="text-xs mt-3 text-slate-400">— 익명 고객 {i + 1}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewsletterBlock({ block, theme }: Props) {
  const title = (block.props.title as string) || "뉴스레터 구독";
  return (
    <section
      className="px-10 py-12 text-center"
      style={{ background: theme.accent_color, color: "#fff" }}
    >
      <Mail className="w-8 h-8 mx-auto mb-2 opacity-90" />
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <div className="flex justify-center gap-2 max-w-md mx-auto">
        <input
          className="flex-1 rounded-full px-4 py-2 text-sm text-slate-900"
          placeholder="이메일을 입력하세요"
          disabled
        />
        <button
          className="px-5 py-2 rounded-full text-sm font-semibold"
          style={{ background: theme.primary_color }}
        >
          구독
        </button>
      </div>
    </section>
  );
}
