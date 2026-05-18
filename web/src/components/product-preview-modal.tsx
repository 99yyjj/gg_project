"use client";

import { X, ShoppingBag } from "lucide-react";
import { ProductFormValues } from "@/components/product-form";

type Props = {
  values: ProductFormValues;
  shopName: string;
  username: string;
  onClose: () => void;
};

export default function ProductPreviewModal({
  values,
  shopName,
  username,
  onClose,
}: Props) {
  const price = values.price ? Number(values.price) : null;

  return (
    /* 오버레이 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 모달 패널 */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-50 rounded-2xl shadow-2xl">

        {/* 모달 상단바 */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-slate-200 px-5 py-3">
          <span className="text-sm font-semibold text-slate-700">
            손님 화면 미리보기
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 쇼핑몰 헤더 시뮬레이션 */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{shopName}</h1>
            <p className="text-xs text-slate-500">@{username}</p>
          </div>
          <ShoppingBag className="w-5 h-5 text-emerald-600" />
        </div>

        {/* 상품 상세 시뮬레이션 */}
        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-8">

            {/* 이미지 */}
            <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center">
              {values.detail_image && !values.delete_detail_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={values.detail_image}
                  alt={values.product_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-300">
                  <ShoppingBag className="w-14 h-14" />
                  <span className="text-xs">이미지 없음</span>
                </div>
              )}
            </div>

            {/* 상품 정보 */}
            <div className="flex flex-col">
              <h2 className="text-2xl font-bold text-slate-900 leading-snug">
                {values.product_name || (
                  <span className="text-slate-300">상품명을 입력하세요</span>
                )}
              </h2>

              <p className="mt-4 text-3xl font-bold text-emerald-600">
                {price ? `${price.toLocaleString()}원` : (
                  <span className="text-slate-300 text-2xl">가격 미입력</span>
                )}
              </p>

              <div className="mt-4 flex gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    values.display === "T"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {values.display === "T" ? "판매중" : "판매종료"}
                </span>
              </div>

              {values.description ? (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                    상품 설명
                  </h3>
                  <div
                    className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: values.description }}
                  />
                </div>
              ) : (
                <p className="mt-6 text-sm text-slate-300">상세 문구를 입력하면 여기에 표시됩니다.</p>
              )}
            </div>
          </div>
        </div>

        <div className="text-center py-4 text-xs text-slate-400 border-t border-slate-200">
          Powered by GG · 미리보기 (실제 저장된 내용과 다를 수 있습니다)
        </div>
      </div>
    </div>
  );
}
