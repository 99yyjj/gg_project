"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, Edit3, Info, MessageSquare, Trash2 } from "lucide-react";

import { ProductReviewsPanel } from "@/components/reviews/product-reviews-panel";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import { useDeleteProduct, useProduct } from "@/lib/queries";

type Tab = "info" | "reviews";

export default function ProductDetailPage() {
  const params = useParams<{ productNo: string }>();
  const productNo = Number(params.productNo);
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();

  const tab: Tab = search.get("tab") === "reviews" ? "reviews" : "info";

  const { data: product, isLoading, isError } = useProduct(
    Number.isFinite(productNo) ? productNo : undefined
  );
  const del = useDeleteProduct();

  // 탭 전환 — URL 쿼리스트링으로 상태 보존 (새로고침/공유에도 유지)
  const setTab = useCallback(
    (next: Tab) => {
      const qs = new URLSearchParams(Array.from(search.entries()));
      if (next === "info") qs.delete("tab");
      else qs.set("tab", next);
      const suffix = qs.toString();
      router.replace(
        `/dashboard/products/${productNo}${suffix ? `?${suffix}` : ""}`,
        { scroll: false }
      );
    },
    [router, productNo, search]
  );

  async function handleDelete() {
    if (!product) return;
    if (!confirm(`'${product.product_name}' (#${product.product_no}) 상품을 삭제할까요?`))
      return;
    try {
      await del.mutateAsync(product.product_no);
      toast.push("삭제되었습니다.");
      router.replace("/dashboard/products");
    } catch (e) {
      toast.push(errorMessage(e, "삭제에 실패했습니다."), "err");
    }
  }

  if (isLoading) {
    return <div className="text-slate-900">불러오는 중...</div>;
  }
  if (isError || !product) {
    return (
      <div className="text-rose-600">
        상품을 찾을 수 없습니다.
        <Link href="/dashboard/products" className="ml-2 underline">
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/products"
        className="inline-flex items-center gap-1 text-sm text-slate-900 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> 목록으로
      </Link>

      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{product.product_name}</h1>
          <div className="text-sm text-slate-900 mt-1">
            #{product.product_no} · {product.product_code ?? "코드 없음"}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/products/${product.product_no}/edit`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            <Edit3 className="w-4 h-4" /> 수정
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm hover:bg-rose-100"
          >
            <Trash2 className="w-4 h-4" /> 삭제
          </button>
        </div>
      </header>

      {/* 탭 — 정보 / 리뷰 */}
      <div className="flex border-b border-slate-200 mb-6">
        <TabButton
          active={tab === "info"}
          onClick={() => setTab("info")}
          icon={<Info className="w-4 h-4" />}
          label="정보"
        />
        <TabButton
          active={tab === "reviews"}
          onClick={() => setTab("reviews")}
          icon={<MessageSquare className="w-4 h-4" />}
          label="리뷰"
        />
      </div>

      {tab === "info" ? (
        <ProductInfo product={product} />
      ) : (
        <ProductReviewsPanel productNo={productNo} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px px-4 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-1.5 transition-colors ${
        active
          ? "border-indigo-600 text-indigo-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ProductInfo({
  product,
}: {
  product: NonNullable<ReturnType<typeof useProduct>["data"]>;
}) {
  return (
    <>
      <section className="bg-white rounded-2xl border border-slate-200 p-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-6">
        <Row label="판매가" value={`${product.price?.toLocaleString() ?? "-"}원`} />
        <Row label="진열" value={product.display === "T" ? "진열" : "미진열"} />
        <Row label="판매" value={product.selling === "T" ? "판매중" : "판매안함"} />
        <Row
          label="카테고리"
          value={product.category_no ? `#${product.category_no}` : "-"}
        />
      </section>

      {product.detail_image && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h2 className="font-semibold mb-3">대표 이미지 경로</h2>
          <code className="text-xs text-slate-700 break-all">
            {product.detail_image}
          </code>
        </section>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold mb-3">상세 문구</h2>
        {product.description ? (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
            {product.description}
          </pre>
        ) : (
          <p className="text-sm text-slate-900">상세 문구가 없습니다.</p>
        )}
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-800">{label}</div>
      <div className="text-slate-900 font-medium mt-0.5">{value}</div>
    </div>
  );
}
