"use client";

import { Eye, ImageIcon, Loader2, Sparkles, Trash2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png"];
const ALLOWED_IMAGE_LABEL = "JPG, PNG";

import ProductPreviewModal from "@/components/product-preview-modal";
import { errorMessage } from "@/lib/api";
import { generateMarketingCopy } from "@/lib/queries";
import { useToast } from "@/components/toast";

export type ProductFormValues = {
  product_name: string;
  price: string;
  supply_price: string;
  description: string;
  category_no: string;
  display: "T" | "F";
  selling: "T" | "F";
  /** 기존 Cafe24 대표 이미지 URL (수정 화면에서 미리 채워짐) */
  detail_image: string;
  /** 기존 Cafe24 목록 이미지 URL (수정 화면에서 미리 채워짐) */
  list_image: string;
  /** 새로 선택한 대표 이미지 파일 — 폼 제출 시 Cafe24에 업로드됨 */
  detail_image_file: File | null;
  /** 새로 선택한 목록 이미지 파일 */
  list_image_file: File | null;
  /** 기존 대표 이미지를 Cafe24에서 삭제 표시 */
  delete_detail_image: boolean;
  /** 기존 목록 이미지를 Cafe24에서 삭제 표시 */
  delete_list_image: boolean;
};

export function emptyFormValues(): ProductFormValues {
  return {
    product_name: "",
    price: "",
    supply_price: "",
    description: "",
    category_no: "",
    display: "T",
    selling: "T",
    detail_image: "",
    list_image: "",
    detail_image_file: null,
    list_image_file: null,
    delete_detail_image: false,
    delete_list_image: false,
  };
}

type Props = {
  values: ProductFormValues;
  setValues: (v: ProductFormValues) => void;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  username?: string;
  shopName?: string;
};

export default function ProductForm({
  values,
  setValues,
  submitting,
  submitLabel,
  onSubmit,
  username,
  shopName,
}: Props) {
  const toast = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [preview, setPreview] = useState(false);

  const detailPreviewUrl = useRef<string | null>(null);
  const listPreviewUrl = useRef<string | null>(null);

  // 파일 선택 시 Object URL 생성 (메모리 누수 방지를 위해 revoke 관리)
  const [detailThumb, setDetailThumb] = useState<string | null>(null);
  const [listThumb, setListThumb] = useState<string | null>(null);

  useEffect(() => {
    if (values.detail_image_file) {
      if (detailPreviewUrl.current) URL.revokeObjectURL(detailPreviewUrl.current);
      const url = URL.createObjectURL(values.detail_image_file);
      detailPreviewUrl.current = url;
      setDetailThumb(url);
    } else {
      setDetailThumb(null);
    }
  }, [values.detail_image_file]);

  useEffect(() => {
    if (values.list_image_file) {
      if (listPreviewUrl.current) URL.revokeObjectURL(listPreviewUrl.current);
      const url = URL.createObjectURL(values.list_image_file);
      listPreviewUrl.current = url;
      setListThumb(url);
    } else {
      setListThumb(null);
    }
  }, [values.list_image_file]);

  function update<K extends keyof ProductFormValues>(
    k: K,
    v: ProductFormValues[K]
  ) {
    setValues({ ...values, [k]: v });
  }

  async function handleAI() {
    if (!values.product_name.trim()) {
      toast.push("상품명을 먼저 입력하세요.", "err");
      return;
    }
    setAiLoading(true);
    try {
      const ai = await generateMarketingCopy({
        product_name: values.product_name,
        price: values.price ? Number(values.price) : undefined,
        original_description: values.description || undefined,
        custom_prompt: customPrompt || undefined,
      });
      update("description", ai.description);
      setTags(ai.tags);
      toast.push("AI 문구를 채웠습니다. 자유롭게 수정하세요.");
    } catch (e) {
      toast.push(errorMessage(e, "AI 생성에 실패했습니다."), "err");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      {/* 기본 정보 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold">기본 정보</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="상품명">
            <input
              type="text"
              value={values.product_name}
              onChange={(e) => update("product_name", e.target.value)}
              className={inputCls}
              placeholder="예: 봄 데일리 셔츠"
            />
          </Field>
          <Field label="카테고리 번호 (선택)">
            <input
              type="number"
              value={values.category_no}
              onChange={(e) => update("category_no", e.target.value)}
              className={inputCls}
              placeholder="예: 27"
            />
          </Field>
          <Field label="판매가 (원)">
            <input
              type="number"
              value={values.price}
              onChange={(e) => update("price", e.target.value)}
              className={inputCls}
              placeholder="예: 19900"
            />
          </Field>
          <Field label="공급가 (선택)">
            <input
              type="number"
              value={values.supply_price}
              onChange={(e) => update("supply_price", e.target.value)}
              className={inputCls}
              placeholder="비우면 판매가와 동일"
            />
          </Field>
          <Field label="진열">
            <select
              value={values.display}
              onChange={(e) => update("display", e.target.value as "T" | "F")}
              className={inputCls}
            >
              <option value="T">진열</option>
              <option value="F">미진열</option>
            </select>
          </Field>
          <Field label="판매">
            <select
              value={values.selling}
              onChange={(e) => update("selling", e.target.value as "T" | "F")}
              className={inputCls}
            >
              <option value="T">판매중</option>
              <option value="F">판매안함</option>
            </select>
          </Field>
        </div>
      </section>

      {/* 이미지 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold">상품 이미지</h2>
        <p className="text-xs text-slate-500">
          이미지를 선택하면 상품 등록·수정 시 Cafe24에 자동 업로드됩니다.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* 대표 이미지 */}
          <ImagePicker
            label="대표(상세) 이미지"
            newPreview={detailThumb}
            existingUrl={values.detail_image}
            fileName={values.detail_image_file?.name}
            hasNewFile={!!values.detail_image_file}
            markedForDeletion={values.delete_detail_image}
            onPickFile={(file) =>
              setValues({
                ...values,
                detail_image_file: file,
                delete_detail_image: false,
              })
            }
            onCancelPick={() => update("detail_image_file", null)}
            onMarkDeletion={() =>
              setValues({
                ...values,
                delete_detail_image: true,
                detail_image_file: null,
              })
            }
            onUndoDeletion={() => update("delete_detail_image", false)}
          />

          {/* 목록 이미지 */}
          <ImagePicker
            label="목록 이미지 (선택)"
            newPreview={listThumb}
            existingUrl={values.list_image}
            fileName={values.list_image_file?.name}
            hasNewFile={!!values.list_image_file}
            markedForDeletion={values.delete_list_image}
            onPickFile={(file) =>
              setValues({
                ...values,
                list_image_file: file,
                delete_list_image: false,
              })
            }
            onCancelPick={() => update("list_image_file", null)}
            onMarkDeletion={() =>
              setValues({
                ...values,
                delete_list_image: true,
                list_image_file: null,
              })
            }
            onUndoDeletion={() => update("delete_list_image", false)}
          />
        </div>
      </section>

      {/* AI 문구 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">마케팅 문구</h2>
          <button
            type="button"
            onClick={handleAI}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {aiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            AI로 채우기
          </button>
        </div>
        <input
          type="text"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          className={inputCls}
          placeholder="톤앤매너 (선택, 예: 20대 여성 타깃, 고급스럽게)"
        />
        <textarea
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          rows={10}
          className={`${inputCls} font-mono text-sm leading-relaxed`}
          placeholder="상세 문구를 직접 작성하거나 AI로 채워보세요."
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="text-xs bg-slate-100 text-slate-900 px-2 py-1 rounded-full"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-between items-center">
        {username ? (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye className="w-4 h-4" />
            손님 화면 미리보기
          </button>
        ) : (
          <span />
        )}

        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "처리 중..." : submitLabel}
        </button>
      </div>

      {preview && username && (
        <ProductPreviewModal
          values={values}
          username={username}
          shopName={shopName || username}
          onClose={() => setPreview(false)}
        />
      )}
    </form>
  );
}

// ─── 이미지 선택 컴포넌트 ───────────────────────────────────────

function ImagePicker({
  label,
  newPreview,
  existingUrl,
  fileName,
  hasNewFile,
  markedForDeletion,
  onPickFile,
  onCancelPick,
  onMarkDeletion,
  onUndoDeletion,
}: {
  label: string;
  newPreview: string | null;
  existingUrl: string;
  fileName?: string;
  hasNewFile: boolean;
  markedForDeletion: boolean;
  onPickFile: (file: File) => void;
  onCancelPick: () => void;
  onMarkDeletion: () => void;
  onUndoDeletion: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // 표시 상태: 새 파일 > 기존(삭제 안된 경우) > 비어있음/삭제 예정
  const showingNew = hasNewFile && newPreview;
  const showingExisting = !hasNewFile && existingUrl && !markedForDeletion;
  const thumb = showingNew ? newPreview : showingExisting ? existingUrl : null;

  function cancelPick() {
    if (inputRef.current) inputRef.current.value = "";
    onCancelPick();
  }

  function markDeletion() {
    if (inputRef.current) inputRef.current.value = "";
    onMarkDeletion();
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">{label}</div>

      {/* 썸네일 */}
      <div className="relative w-full aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
        {thumb ? (
          <img
            src={thumb}
            alt="이미지 미리보기"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-300">
            <ImageIcon className="w-10 h-10" />
            {markedForDeletion && (
              <span className="text-[11px] text-rose-600 font-medium">
                저장 시 삭제됨
              </span>
            )}
          </div>
        )}

        {/* 우측 상단 버튼: 새 파일 취소 OR 기존 이미지 삭제 OR 삭제 되돌리기 */}
        {showingNew && (
          <button
            type="button"
            onClick={cancelPick}
            aria-label="이미지 선택 취소"
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white shadow"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {showingExisting && (
          <button
            type="button"
            onClick={markDeletion}
            aria-label="기존 이미지 삭제"
            title="기존 이미지 삭제"
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-white shadow"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {markedForDeletion && !hasNewFile && (
          <button
            type="button"
            onClick={onUndoDeletion}
            aria-label="삭제 되돌리기"
            title="삭제 되돌리기"
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white shadow"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 파일 선택 버튼 */}
      <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm cursor-pointer hover:bg-slate-50 w-full">
        <Upload className="w-4 h-4 text-slate-500" />
        {fileName ? (
          <span className="truncate text-slate-700">{fileName}</span>
        ) : (
          <span className="text-slate-500">파일 선택 ({ALLOWED_IMAGE_LABEL})</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!ALLOWED_IMAGE_MIME.includes(f.type)) {
              toast.push(
                `${ALLOWED_IMAGE_LABEL} 형식만 업로드 가능합니다. (받은 형식: ${f.type || "알 수 없음"})`,
                "err"
              );
              e.target.value = "";
              return;
            }
            onPickFile(f);
          }}
        />
      </label>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
