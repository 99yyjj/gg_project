"use client";

import { Camera, Eye, ImageIcon, Loader2, Trash2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png"];
const ALLOWED_IMAGE_LABEL = "JPG, PNG";

import ProductPreviewModal from "@/components/product-preview-modal";
import { errorMessage } from "@/lib/api";
import { analyzeProductImage } from "@/lib/queries";
import { useToast } from "@/components/toast";

export type ProductFormValues = {
  product_name: string;
  price: string;
  summary_description: string;
  description: string;
  display: "T" | "F";
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
  /** 신규 등록 시 함께 올릴 상세(추가) 이미지 파일들 (스테이징) */
  additional_image_files: File[];
  /** AI 사진 분석으로 추출한 검색 키워드(태그) */
  tags: string[];
};

export function emptyFormValues(): ProductFormValues {
  return {
    product_name: "",
    price: "",
    summary_description: "",
    description: "",
    display: "T",
    detail_image: "",
    list_image: "",
    detail_image_file: null,
    list_image_file: null,
    delete_detail_image: false,
    delete_list_image: false,
    additional_image_files: [],
    tags: [],
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
  /** 수정 모드에서 전달. 있으면 '목록 이미지' 대신 상세(추가) 이미지 갤러리를 관리한다. */
  productNo?: number;
};

export default function ProductForm({
  values,
  setValues,
  submitting,
  submitLabel,
  onSubmit,
  username,
  shopName,
  productNo,
}: Props) {
  const toast = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState(false);

  // 새로 선택한 대표 이미지의 미리보기 object-URL.
  const [detailThumb, setDetailThumb] = useState<string | null>(null);
  useEffect(() => {
    const f = values.detail_image_file;
    if (!f) {
      setDetailThumb(null);
      return;
    }
    const url = URL.createObjectURL(f);
    setDetailThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [values.detail_image_file]);

  function update<K extends keyof ProductFormValues>(
    k: K,
    v: ProductFormValues[K]
  ) {
    setValues({ ...values, [k]: v });
  }

  async function handleAnalyzeImage() {
    if (!values.detail_image_file) {
      toast.push("분석할 대표 이미지를 먼저 선택하세요.", "err");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzeProductImage(values.detail_image_file);
      setValues({
        ...values,
        product_name: res.product_name || values.product_name,
        summary_description: res.summary || values.summary_description,
        description: res.description || values.description,
        tags: res.keywords.length ? res.keywords : values.tags,
      });
      toast.push("사진 분석 완료! 내용을 확인하고 자유롭게 수정하세요.");
    } catch (e) {
      toast.push(errorMessage(e, "사진 분석에 실패했습니다."), "err");
    } finally {
      setAnalyzing(false);
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
          <Field label="판매가 (원)">
            <input
              type="number"
              value={values.price}
              onChange={(e) => update("price", e.target.value)}
              className={inputCls}
              placeholder="예: 19900"
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
            <p className="text-xs text-slate-500 mt-1">
              진열하면 손님 화면에 보이고, 미진열이면 손님 화면에서 숨겨집니다.
            </p>
          </Field>
        </div>
        <Field label="간략 설명 (선택)">
          <input
            type="text"
            value={values.summary_description}
            onChange={(e) => update("summary_description", e.target.value)}
            className={inputCls}
            placeholder="상품 상단에 노출되는 한 줄 설명"
          />
        </Field>
      </section>

      {/* 이미지 — 대표 이미지 한 장 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold">상품 이미지</h2>
        <ImagePicker
          label="대표 이미지"
          newPreview={detailThumb}
          existingUrl={productNo ? values.detail_image : ""}
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
      </section>

      {/* 상품 설명 (AI 사진 분석) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">상품 설명</h2>
          <button
            type="button"
            onClick={handleAnalyzeImage}
            disabled={analyzing || !values.detail_image_file}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            사진으로 분석
          </button>
        </div>
        <p className="text-xs text-slate-500">
          대표 이미지를 올린 뒤 <b>사진으로 분석</b>을 누르면 상품명·간략설명·상세설명·키워드를 AI가 채워줍니다.
        </p>
        <textarea
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          rows={10}
          className={`${inputCls} font-mono text-sm leading-relaxed`}
          placeholder="상세 문구를 직접 작성하거나 사진으로 분석해 채워보세요."
        />
        {values.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {values.tags.map((t) => (
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

export function ImagePicker({
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
