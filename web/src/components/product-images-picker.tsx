"use client";

// 상품 등록·수정 화면의 통합 이미지 picker.
//
// UI는 "대표 이미지 (여러 장 가능)" 한 자리만 노출하고, 내부적으로 Cafe24 의 두 컬럼
// (detail_image = 1장, additional_images = N장) 에 매핑한다.
//   - 첫 장(index 0) → 대표 (detail_image)
//   - 나머지         → 추가 이미지 (additional_images)
//
// 신규 등록 모드(productNo 없음): 모든 파일을 props 로 받아 부모(form values) 에 보관.
// 수정 모드(productNo 있음): 기존 대표/추가 이미지를 서버에서 불러와 한 그리드에 보여주고,
//                            "+" 로 새 파일을 골라 그 즉시 추가 이미지로 업로드한다.

import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Plus, Star, Undo2, X } from "lucide-react";

import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import {
  useAddAdditionalImages,
  useAdditionalImages,
  useDeleteAdditionalImage,
} from "@/lib/queries";

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png"];
const ALLOWED_IMAGE_LABEL = "JPG, PNG";

function validateFiles(picked: FileList | null, pushErr: (m: string) => void): File[] {
  const valid: File[] = [];
  for (const f of Array.from(picked ?? [])) {
    if (!ALLOWED_IMAGE_MIME.includes(f.type)) {
      pushErr(
        `${ALLOWED_IMAGE_LABEL} 형식만 업로드 가능합니다. (받은 형식: ${f.type || "알 수 없음"})`
      );
      continue;
    }
    valid.push(f);
  }
  return valid;
}

// File → object URL 캐시. 동일 File 참조면 동일 URL 재사용해 createObjectURL 호출을 줄인다.
// useState 지연 초기화로 안정된 Map 인스턴스를 얻고 직접 mutate — ref 가 아니므로
// "render 중에 ref 읽기" 경고에 안 걸리고, setState 호출도 없어 set-state-in-effect 도 회피.
function useFileUrls(files: (File | null | undefined)[]): (string | null)[] {
  const [cache] = useState<Map<File, string>>(() => new Map());

  // 렌더 중 캐시 조회/생성 — 동일 파일이면 항상 같은 URL 반환하므로 idempotent.
  const urls = files.map((f) => {
    if (!f) return null;
    let url = cache.get(f);
    if (!url) {
      url = URL.createObjectURL(f);
      cache.set(f, url);
    }
    return url;
  });

  // 사용 끝난 파일의 URL 정리 (매 렌더).
  useEffect(() => {
    const present = new Set<File>();
    for (const f of files) if (f) present.add(f);
    for (const [file, url] of Array.from(cache.entries())) {
      if (!present.has(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    }
  });

  // 언마운트 시 일괄 revoke.
  useEffect(() => {
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, [cache]);

  return urls;
}

// 신규 등록 모드 ──────────────────────────────────────────────────────────────
// 부모는 detail_image_file + additional_image_files 두 슬롯을 폼에서 관리한다.
// 이 picker 가 두 슬롯을 합쳐 "한 줄짜리 파일 배열" 로 보여주고, 첫 장이 대표가 된다.

export function NewProductImagesPicker({
  coverFile,
  extraFiles,
  onChange,
}: {
  coverFile: File | null;
  extraFiles: File[];
  onChange: (next: { coverFile: File | null; extraFiles: File[] }) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // [coverFile, ...extraFiles] 형태로 합쳐서 그리드를 그린다.
  const all: File[] = coverFile ? [coverFile, ...extraFiles] : extraFiles;

  // 각 파일별 object-URL (캐시). null 자리는 그대로 null.
  const thumbs = useFileUrls(all);

  function commit(files: File[]) {
    onChange({
      coverFile: files[0] ?? null,
      extraFiles: files.slice(1),
    });
  }

  function onPick(picked: FileList | null) {
    const valid = validateFiles(picked, (m) => toast.push(m, "err"));
    if (inputRef.current) inputRef.current.value = "";
    if (!valid.length) return;
    commit([...all, ...valid]);
  }

  function remove(idx: number) {
    commit(all.filter((_, i) => i !== idx));
  }

  function promoteToCover(idx: number) {
    if (idx === 0) return;
    const next = [all[idx], ...all.filter((_, i) => i !== idx)];
    commit(next);
  }

  return (
    <PickerShell hint="첫 번째 사진이 대표 이미지로 표시되고, 손님은 상품 페이지에서 좌우 화살표로 넘겨봐요.">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {all.map((file, i) => (
          <Thumb
            key={file.name + i}
            url={thumbs[i] ?? undefined}
            isCover={i === 0}
            onRemove={() => remove(i)}
            onPromote={i === 0 ? undefined : () => promoteToCover(i)}
          />
        ))}
        <AddSlot
          inputRef={inputRef}
          onPick={onPick}
          label={all.length ? "사진 추가" : "사진 선택"}
        />
      </div>
    </PickerShell>
  );
}

// 수정 모드 ────────────────────────────────────────────────────────────────────
// 기존 대표 / 기존 추가 이미지 / 새 대표(스테이징) 를 한 그리드에 보여준다.
//   - "+"     → 새 파일을 골라 즉시 추가 이미지로 업로드
//   - 대표의 카메라 아이콘 → 단일 파일 선택, 저장 시 대표 교체 (staged)
//   - X       → 대표(기존)면 삭제 플래그, 대표(staged)면 staged 해제,
//                추가(기존)면 즉시 API 삭제

export function EditProductImagesPicker({
  productNo,
  existingCoverUrl,
  coverMarkedForDeletion,
  pendingCoverFile,
  onPendingCoverFileChange,
  onMarkCoverDeletion,
  onUndoCoverDeletion,
}: {
  productNo: number;
  existingCoverUrl: string;
  coverMarkedForDeletion: boolean;
  pendingCoverFile: File | null;
  onPendingCoverFileChange: (f: File | null) => void;
  onMarkCoverDeletion: () => void;
  onUndoCoverDeletion: () => void;
}) {
  const toast = useToast();
  const addInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useAdditionalImages(productNo);
  const addMutation = useAddAdditionalImages(productNo);
  const delMutation = useDeleteAdditionalImage(productNo);

  const existingAdditionals = data?.images ?? [];

  // staged 대표 파일의 object-URL (캐시).
  const [pendingCoverUrl] = useFileUrls([pendingCoverFile]);

  // "+" 로 여러 장 한꺼번에 픽 — 즉시 추가 이미지로 업로드.
  async function onPickExtras(picked: FileList | null) {
    const valid = validateFiles(picked, (m) => toast.push(m, "err"));
    if (addInputRef.current) addInputRef.current.value = "";
    if (!valid.length) return;
    try {
      await addMutation.mutateAsync(valid);
      toast.push(`사진 ${valid.length}장을 추가했습니다.`);
    } catch (e) {
      toast.push(errorMessage(e, "사진 추가에 실패했습니다."), "err");
    }
  }

  // 카메라 아이콘 → 대표 교체 (단일 파일)
  function onPickCoverReplacement(picked: FileList | null) {
    const valid = validateFiles(picked, (m) => toast.push(m, "err"));
    if (coverInputRef.current) coverInputRef.current.value = "";
    if (!valid.length) return;
    onPendingCoverFileChange(valid[0]);
  }

  async function deleteExistingAdditional(additionalImageNo: number | null) {
    if (additionalImageNo == null) {
      toast.push("이 사진은 번호가 없어 삭제할 수 없습니다.", "err");
      return;
    }
    if (!confirm("이 사진을 삭제할까요?")) return;
    try {
      await delMutation.mutateAsync(additionalImageNo);
      toast.push("사진을 삭제했습니다.");
    } catch (e) {
      toast.push(errorMessage(e, "삭제에 실패했습니다."), "err");
    }
  }

  // 대표 슬롯의 표시 상태 ──────────────────────────────
  // 우선순위: staged 교체 파일 > 기존 URL(삭제 안 됨) > 비어있음/삭제 예정
  const showStagedCover = !!pendingCoverFile && !!pendingCoverUrl;
  const showExistingCover =
    !showStagedCover && !!existingCoverUrl && !coverMarkedForDeletion;
  const coverThumbUrl = showStagedCover
    ? pendingCoverUrl
    : showExistingCover
    ? existingCoverUrl
    : null;
  const coverDeletionPending =
    coverMarkedForDeletion && !pendingCoverFile;

  return (
    <PickerShell hint="첫 번째(★) 가 대표 이미지이고, 손님 상품 페이지에서 좌우 화살표로 모두 넘겨봐요. 변경 사항은 '+'/'X' 즉시, 대표 교체는 저장 시 적용됩니다.">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {/* 대표 슬롯 */}
          <div className="relative aspect-square rounded-lg border-2 border-emerald-200 overflow-hidden bg-slate-50 flex items-center justify-center">
            {coverThumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverThumbUrl}
                alt="대표 이미지"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-300">
                <ImageIcon className="w-7 h-7" />
                {coverDeletionPending && (
                  <span className="text-[10px] text-rose-600 font-medium">
                    저장 시 삭제됨
                  </span>
                )}
              </div>
            )}

            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold inline-flex items-center gap-0.5 shadow">
              <Star className="w-2.5 h-2.5 fill-current" /> 대표
            </div>

            {/* 우상단 액션 */}
            <div className="absolute top-1 right-1 flex gap-1">
              {/* 대표 교체 (카메라) — staged 가 아니라 기존이 보이는 상태일 때만 노출 */}
              {showExistingCover && (
                <label
                  title="대표 이미지 교체"
                  className="w-6 h-6 rounded-full bg-white/95 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white shadow cursor-pointer"
                >
                  <Camera className="w-3 h-3" />
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept={ALLOWED_IMAGE_MIME.join(",")}
                    className="hidden"
                    onChange={(e) => onPickCoverReplacement(e.target.files)}
                  />
                </label>
              )}

              {/* 삭제 / 되돌리기 */}
              {showStagedCover ? (
                <button
                  type="button"
                  onClick={() => onPendingCoverFileChange(null)}
                  aria-label="새 대표 선택 취소"
                  className="w-6 h-6 rounded-full bg-white/95 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white shadow"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : showExistingCover ? (
                <button
                  type="button"
                  onClick={onMarkCoverDeletion}
                  aria-label="대표 이미지 삭제"
                  className="w-6 h-6 rounded-full bg-white/95 border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-white shadow"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : coverDeletionPending ? (
                <button
                  type="button"
                  onClick={onUndoCoverDeletion}
                  aria-label="삭제 되돌리기"
                  className="w-6 h-6 rounded-full bg-white/95 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white shadow"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
              ) : null}
            </div>

            {/* 비어있는 대표 슬롯이면 가운데에 "선택" 트리거 */}
            {!coverThumbUrl && !coverDeletionPending && (
              <label className="absolute inset-0 cursor-pointer">
                <input
                  type="file"
                  accept={ALLOWED_IMAGE_MIME.join(",")}
                  className="hidden"
                  onChange={(e) => onPickCoverReplacement(e.target.files)}
                />
              </label>
            )}
          </div>

          {/* 기존 추가 이미지들 */}
          {existingAdditionals.map((img, i) => (
            <Thumb
              key={img.additional_image_no ?? img.image_url}
              url={img.image_url}
              ariaIndex={i + 2}
              onRemove={() => deleteExistingAdditional(img.additional_image_no)}
              busy={delMutation.isPending}
            />
          ))}

          {/* 추가 슬롯 */}
          <AddSlot
            inputRef={addInputRef}
            onPick={onPickExtras}
            label={addMutation.isPending ? "추가 중" : "사진 추가"}
            busy={addMutation.isPending}
            multiple
          />
        </div>
      )}
    </PickerShell>
  );
}

// 공용 부속 ─────────────────────────────────────────────────────────────────

function PickerShell({
  hint,
  children,
}: {
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">
        대표 이미지 (여러 장 가능)
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
      {children}
    </div>
  );
}

function Thumb({
  url,
  isCover,
  onRemove,
  onPromote,
  busy,
  ariaIndex,
}: {
  url: string | undefined;
  isCover?: boolean;
  onRemove: () => void;
  onPromote?: () => void;
  busy?: boolean;
  ariaIndex?: number;
}) {
  return (
    <div
      className={`relative aspect-square rounded-lg border overflow-hidden bg-slate-50 group ${
        isCover ? "border-2 border-emerald-200" : "border-slate-200"
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`이미지${ariaIndex ? ` ${ariaIndex}` : ""}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-slate-300" />
        </div>
      )}

      {isCover && (
        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold inline-flex items-center gap-0.5 shadow">
          <Star className="w-2.5 h-2.5 fill-current" /> 대표
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label="사진 제거"
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-white shadow disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {onPromote && (
        <button
          type="button"
          onClick={onPromote}
          title="대표 이미지로 설정"
          className="absolute bottom-1 left-1 right-1 px-2 py-1 rounded-md bg-white/90 text-[10px] text-slate-700 opacity-0 group-hover:opacity-100 hover:bg-white border border-slate-200"
        >
          대표로 설정
        </button>
      )}
    </div>
  );
}

function AddSlot({
  inputRef,
  onPick,
  label,
  busy,
  multiple = true,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (files: FileList | null) => void;
  label: string;
  busy?: boolean;
  multiple?: boolean;
}) {
  return (
    <label
      className={`aspect-square rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 ${
        busy
          ? "opacity-60 pointer-events-none"
          : "cursor-pointer hover:border-emerald-400 hover:text-emerald-500"
      }`}
    >
      {busy ? (
        <Loader2 className="w-6 h-6 animate-spin" />
      ) : (
        <Plus className="w-6 h-6" />
      )}
      <span className="text-[11px]">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_MIME.join(",")}
        multiple={multiple}
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
    </label>
  );
}
