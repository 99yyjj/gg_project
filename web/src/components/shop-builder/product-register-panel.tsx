"use client";

// "쇼핑몰 꾸미기" 확정 후 같은 화면(manage 단계)에서 쓰는 상품 등록 패널.
// futureterior 상품상세 형태: 좌 이미지 / 우 상품명·가격·간략설명·구매·장바구니,
// 하단 상세정보. 등록 시 useCreateProduct로 만들고 발급된 product_no에
// 추가 이미지를 업로드한다.

import { Camera, ImageIcon, Loader2, Plus, ShoppingCart, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ImagePicker } from "@/components/product-form";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import {
  addAdditionalImagesRequest,
  analyzeProductImage,
  useCreateProduct,
} from "@/lib/queries";
import { sanitizeHtml } from "@/lib/sanitize";

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png"];
const ALLOWED_IMAGE_LABEL = "JPG, PNG";

type AddlImage = { file: File; url: string };

export default function ProductRegisterPanel({
  shopName,
  onRegistered,
}: {
  shopName: string;
  /** 등록 성공 후 호출 (모달 닫기 등). 없으면 폼만 초기화하고 계속 머문다. */
  onRegistered?: () => void;
}) {
  const toast = useToast();
  const create = useCreateProduct();

  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 대표 이미지
  const [detailFile, setDetailFile] = useState<File | null>(null);
  const [detailThumb, setDetailThumb] = useState<string | null>(null);

  // 추가(상세) 이미지 갤러리
  const [addl, setAddl] = useState<AddlImage[]>([]);
  const addlInputRef = useRef<HTMLInputElement>(null);

  // 생성한 ObjectURL을 모아두었다가 언마운트 때 일괄 해제 (React 19: effect에서 set 금지)
  const createdUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = createdUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function makeUrl(file: File): string {
    const url = URL.createObjectURL(file);
    createdUrls.current.add(url);
    return url;
  }

  function revoke(url: string | null) {
    if (url && createdUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      createdUrls.current.delete(url);
    }
  }

  function onPickDetail(file: File) {
    revoke(detailThumb);
    const url = makeUrl(file);
    setDetailFile(file);
    setDetailThumb(url);
  }

  function onClearDetail() {
    revoke(detailThumb);
    setDetailFile(null);
    setDetailThumb(null);
  }

  function onAddAddl(files: FileList | null) {
    if (!files) return;
    const next: AddlImage[] = [];
    for (const f of Array.from(files)) {
      if (!ALLOWED_IMAGE_MIME.includes(f.type)) {
        toast.push(`${ALLOWED_IMAGE_LABEL} 형식만 가능합니다.`, "err");
        continue;
      }
      next.push({ file: f, url: makeUrl(f) });
    }
    if (next.length) setAddl((prev) => [...prev, ...next]);
    if (addlInputRef.current) addlInputRef.current.value = "";
  }

  function onRemoveAddl(idx: number) {
    setAddl((prev) => {
      const target = prev[idx];
      if (target) revoke(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleAnalyzeImage() {
    if (!detailFile) {
      toast.push("분석할 대표 이미지를 먼저 선택하세요.", "err");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzeProductImage(detailFile);
      if (res.product_name) setProductName(res.product_name);
      if (res.summary) setSummary(res.summary);
      if (res.description) setDescription(res.description);
      setKeywords(res.keywords);
      toast.push("사진 분석 완료! 내용을 확인하고 자유롭게 수정하세요.");
    } catch (e) {
      toast.push(errorMessage(e, "사진 분석에 실패했습니다."), "err");
    } finally {
      setAnalyzing(false);
    }
  }

  function resetForm() {
    onClearDetail();
    setAddl((prev) => {
      prev.forEach((a) => revoke(a.url));
      return [];
    });
    setProductName("");
    setPrice("");
    setSummary("");
    setDescription("");
    setKeywords([]);
  }

  async function handleRegister() {
    if (!productName.trim()) {
      toast.push("상품명을 입력하세요.", "err");
      return;
    }
    if (!price || Number(price) <= 0) {
      toast.push("판매가를 입력하세요.", "err");
      return;
    }
    if (!description.trim()) {
      toast.push("상세 문구를 입력하거나 AI로 채워주세요.", "err");
      return;
    }
    setSubmitting(true);
    try {
      const res = await create.mutateAsync({
        product_name: productName,
        price: Number(price),
        summary_description: summary || undefined,
        description,
        display: "T",
        selling: "T",
        tags: keywords,
        detail_image_file: detailFile,
      });
      res.warnings?.forEach((w) => toast.push(w, "err"));

      // 발급된 product_no로 추가 이미지 업로드
      if (addl.length) {
        try {
          await addAdditionalImagesRequest(
            res.product.product_no,
            addl.map((a) => a.file)
          );
        } catch (e) {
          toast.push(errorMessage(e, "추가 이미지 업로드에 실패했습니다."), "err");
        }
      }

      toast.push(res.message);
      resetForm();
      onRegistered?.();
    } catch (e) {
      toast.push(errorMessage(e, "등록에 실패했습니다."), "err");
    } finally {
      setSubmitting(false);
    }
  }

  const priceLabel = price ? Number(price).toLocaleString() : "0";

  return (
    <div className="space-y-10">
      {/* 상단: 좌 이미지 / 우 정보 (futureterior 상품상세 레이아웃) */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* 좌: 대표 이미지 + 추가 이미지 갤러리 */}
        <div className="space-y-4">
          <ImagePicker
            label="대표 이미지"
            newPreview={detailThumb}
            existingUrl=""
            fileName={detailFile?.name}
            hasNewFile={!!detailFile}
            markedForDeletion={false}
            onPickFile={onPickDetail}
            onCancelPick={onClearDetail}
            onMarkDeletion={onClearDetail}
            onUndoDeletion={() => {}}
          />

          <button
            type="button"
            onClick={handleAnalyzeImage}
            disabled={analyzing || !detailFile}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            사진으로 분석
          </button>
          <p className="text-xs text-slate-500 -mt-1">
            대표 이미지를 올리고 누르면 상품명·키워드·설명을 AI가 채워줍니다.
          </p>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-full"
                >
                  #{k}
                </span>
              ))}
            </div>
          )}

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              추가 이미지 (상세 갤러리)
            </div>
            <div className="grid grid-cols-4 gap-2">
              {addl.map((a, i) => (
                <div
                  key={a.url}
                  className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={`추가 이미지 ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveAddl(i)}
                    aria-label="추가 이미지 삭제"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-white shadow"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <label className="aspect-square rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 cursor-pointer hover:border-emerald-400 hover:text-emerald-500">
                <Plus className="w-6 h-6" />
                <span className="text-[11px]">추가</span>
                <input
                  ref={addlInputRef}
                  type="file"
                  accept={ALLOWED_IMAGE_MIME.join(",")}
                  multiple
                  className="hidden"
                  onChange={(e) => onAddAddl(e.target.files)}
                />
              </label>
            </div>
          </div>
        </div>

        {/* 우: 상품명/가격/간략설명 + 구매·장바구니 목업 */}
        <div className="flex flex-col">
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="text-2xl font-bold text-slate-900 leading-snug border-0 border-b border-transparent focus:border-slate-300 focus:outline-none px-0"
            placeholder="상품명을 입력하세요"
          />

          <div className="mt-4 flex items-baseline gap-2">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="text-3xl font-bold text-emerald-600 w-48 focus:outline-none"
              placeholder="0"
            />
            <span className="text-2xl font-bold text-emerald-600">원</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">미리보기: {priceLabel}원</p>

          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-500 mb-1">
              간략 설명
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="상품 상단에 노출되는 간단한 소개"
            />
          </div>

          {/* 구매·장바구니 (목업, 비활성) */}
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              disabled
              className="flex-1 py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold opacity-60 cursor-not-allowed"
            >
              바로 구매
            </button>
            <button
              type="button"
              disabled
              className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 opacity-60 cursor-not-allowed"
            >
              <ShoppingCart className="w-4 h-4" />
              장바구니
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            * 구매/장바구니는 손님 화면에서 동작하는 미리보기입니다.
          </p>
        </div>
      </div>

      {/* 하단: 상세정보 (description) */}
      <section className="border-t border-slate-100 pt-8">
        <h2 className="font-semibold text-slate-900 mb-1">상품 상세정보</h2>
        <p className="text-xs text-slate-500 mb-3">
          왼쪽 <b>사진으로 분석</b>으로 채우거나 직접 작성하세요.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="상세 문구를 직접 작성하거나 사진으로 분석해 채워보세요."
        />

        {/* 상세 미리보기 + 추가 이미지 */}
        {(description.trim() || addl.length > 0) && (
          <div className="mt-6 rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
            <div className="text-xs font-semibold text-slate-500 mb-3">
              상세정보 미리보기
            </div>
            {description.trim() && (
              <div
                className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
              />
            )}
            {addl.length > 0 && (
              <div className="mt-4 space-y-3">
                {addl.map((a, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a.url}
                    src={a.url}
                    alt={`상세 이미지 ${i + 1}`}
                    className="w-full rounded-lg"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ImageIcon className="w-4 h-4" />
          {shopName}
        </div>
        <button
          type="button"
          onClick={handleRegister}
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "등록 중..." : "상품등록하기"}
        </button>
      </div>
    </div>
  );
}
