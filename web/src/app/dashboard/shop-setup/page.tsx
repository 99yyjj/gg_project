"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Store,
} from "lucide-react";

import DraggableShopName from "@/components/shop-builder/draggable-shop-name";
import EditableStorefront from "@/components/shop-builder/editable-storefront";
import SortablePreview from "@/components/shop-builder/sortable-preview";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import {
  useMe,
  useSaveShopTemplate,
  useShopTemplate,
  useUpdateMe,
} from "@/lib/queries";
import {
  BlockType,
  HEADER_FONT_MAX,
  HEADER_FONT_MIN,
  PRESETS,
  ShopBlock,
  ShopTheme,
  blockTypeLabel,
  instantiatePreset,
  newBlockId,
  resolveHeader,
} from "@/lib/shop-builder";

const ALL_BLOCK_TYPES: BlockType[] = [
  "hero",
  "featured-products",
  "category-grid",
  "banner",
  "testimonial",
  "newsletter",
];

const INITIAL_VISIBLE = 2;
const MAX_VISIBLE = Math.min(5, PRESETS.length);

type Step = "name" | "design" | "manage";

export default function ShopSetupPage() {
  const toast = useToast();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: existing, isLoading: tplLoading } = useShopTemplate();
  const updateMe = useUpdateMe();
  const save = useSaveShopTemplate();

  const [step, setStep] = useState<Step | null>(null);
  const [shopName, setShopName] = useState("");

  const [presetId, setPresetId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ShopBlock[]>([]);
  const [theme, setTheme] = useState<ShopTheme>({});
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // manage 단계 인라인 편집 자동 저장(디바운스) 타이머
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  // 최초 진입 — 사용자 상태에 따라 시작 단계를 정한다.
  useEffect(() => {
    if (step !== null || meLoading || tplLoading) return;

    setShopName(me?.shop_name ?? "");

    if (existing?.blocks?.length) {
      setPresetId(existing.preset_id ?? null);
      setBlocks(existing.blocks);
      setTheme(existing.theme ?? {});
    } else {
      const { blocks: b, theme: t } = instantiatePreset(PRESETS[0].id);
      setPresetId(PRESETS[0].id);
      setBlocks(b);
      setTheme(t);
    }

    if (!me?.shop_name) setStep("name");
    else if (!me?.onboarding_completed) setStep("design");
    else setStep("manage");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading, tplLoading]);

  function applyPreset(id: string) {
    const { blocks: b, theme: t } = instantiatePreset(id);
    setPresetId(id);
    setBlocks(b);
    // 시안을 바꿔도 사용자가 잡아둔 쇼핑몰 이름의 위치/크기는 유지한다.
    setTheme({
      ...t,
      header_x: theme.header_x,
      header_y: theme.header_y,
      header_font_size: theme.header_font_size,
    });
  }

  function addBlock(type: BlockType) {
    setBlocks((prev) => [...prev, { id: newBlockId(type), type, props: {} }]);
  }

  async function handleCreateShop() {
    const name = shopName.trim();
    if (!name) {
      toast.push("쇼핑몰 이름을 입력하세요.", "err");
      return;
    }
    try {
      await updateMe.mutateAsync({ shop_name: name });
      toast.push(`'${name}' 쇼핑몰을 만들었어요. 이제 시안을 골라볼까요?`);
      setStep("design");
    } catch (e) {
      toast.push(errorMessage(e, "쇼핑몰 이름 저장에 실패했습니다."), "err");
    }
  }

  async function finalize() {
    if (blocks.length === 0) {
      toast.push("최소 한 개의 블록은 있어야 합니다.", "err");
      return;
    }
    try {
      await save.mutateAsync({ preset_id: presetId, blocks, theme, finalize: true });
      toast.push("쇼핑몰 시안을 확정했습니다. 이제 상품을 등록해보세요!");
      setStep("manage");
    } catch (e) {
      toast.push(errorMessage(e, "저장에 실패했습니다."), "err");
    }
  }

  // ── manage 단계: 시안 글자/상품을 그 자리에서 고치면 자동 저장한다 ──
  function autosaveTemplate(nextBlocks: ShopBlock[], nextTheme: ShopTheme) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save.mutate(
        { preset_id: presetId, blocks: nextBlocks, theme: nextTheme, finalize: false },
        { onError: (e) => toast.push(errorMessage(e, "자동 저장에 실패했습니다."), "err") }
      );
    }, 500);
  }

  function handleManageBlocks(next: ShopBlock[]) {
    setBlocks(next);
    autosaveTemplate(next, theme);
  }

  function handleManageTheme(next: ShopTheme) {
    setTheme(next);
    autosaveTemplate(blocks, next);
  }

  function handleManageShopName(name: string) {
    const v = name.trim();
    if (!v || v === (shopName || me?.shop_name)) return;
    setShopName(v);
    updateMe.mutate(
      { shop_name: v },
      {
        onError: (e) =>
          toast.push(errorMessage(e, "쇼핑몰 이름 저장에 실패했습니다."), "err"),
      }
    );
  }

  if (step === null) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-500">
        불러오는 중...
      </div>
    );
  }

  // ───────────── 1단계: 쇼핑몰 이름 ─────────────
  if (step === "name") {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="text-center mb-8">
          <Store className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">쇼핑몰 만들기</h1>
          <p className="text-sm text-slate-600 mt-2">
            먼저 쇼핑몰 이름을 정해주세요. 나중에 언제든 바꿀 수 있어요.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">쇼핑몰 이름</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateShop();
              }}
              maxLength={100}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="예: 봄날의 옷장"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={handleCreateShop}
            disabled={updateMe.isPending}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {updateMe.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Store className="w-4 h-4" />
            )}
            쇼핑몰 만들기
          </button>
        </div>
      </div>
    );
  }

  // ───────────── 3단계: 내 쇼핑몰 편집 (manage) ─────────────
  if (step === "manage") {
    return (
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-600" />
              내 쇼핑몰
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              글자를 클릭하면 바로 수정돼요. 상품 영역의 + 를 눌러 상품을 등록하세요.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setStep("design")}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
            >
              시안 다시 꾸미기
            </button>
            {me?.username && (
              <Link
                href={`/shop/${me.username}`}
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="w-4 h-4" />내 쇼핑몰 보기
              </Link>
            )}
          </div>
        </header>

        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <EditableStorefront
            shopName={shopName || me?.shop_name || me?.username || ""}
            username={me?.username || ""}
            blocks={blocks}
            theme={theme}
            onChangeBlocks={handleManageBlocks}
            onChangeShopName={handleManageShopName}
            onChangeTheme={handleManageTheme}
          />
        </div>
      </div>
    );
  }

  // ───────────── 2단계: 시안 디자인 ─────────────
  const header = resolveHeader(theme);
  const visiblePresets = PRESETS.slice(0, visibleCount);

  return (
    <div className="max-w-7xl mx-auto -mt-2">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-emerald-600" />
          쇼핑몰 꾸미기
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          마음에 드는 시안을 고르고 블록을 자유롭게 옮겨보세요.
        </p>
      </header>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* 좌측: 시안 + 헤더 정렬 + 블록 추가 + 액션 */}
        <aside className="space-y-5">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
              시안 선택
            </h2>
            <div className="space-y-2">
              {visiblePresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    presetId === p.id
                      ? "border-emerald-500 ring-2 ring-emerald-100 bg-white"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm">{p.name}</div>
                    {presetId === p.id && (
                      <Check className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mb-3">{p.tagline}</div>
                  <div className="flex gap-1">
                    <span
                      className="inline-block w-7 h-7 rounded-full border border-slate-200"
                      style={{ background: p.swatch.bg }}
                    />
                    <span
                      className="inline-block w-7 h-7 rounded-full"
                      style={{ background: p.swatch.primary }}
                    />
                    <span
                      className="inline-block w-7 h-7 rounded-full"
                      style={{ background: p.swatch.accent }}
                    />
                  </div>
                </button>
              ))}
            </div>
            {visibleCount < MAX_VISIBLE && (
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((c) => Math.min(MAX_VISIBLE, c + 1))
                }
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 hover:border-emerald-400 hover:text-emerald-600"
              >
                <Plus className="w-4 h-4" />
                시안 더 보기 ({visibleCount}/{MAX_VISIBLE})
              </button>
            )}
          </section>

          <section>
            <h2 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
              쇼핑몰 이름
            </h2>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              오른쪽 미리보기에서 이름을 <b>드래그</b>해 원하는 위치로 옮기고,
              아래에서 글자 크기를 조절하세요.
            </p>
            <label className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span>글자 크기</span>
              <span className="tabular-nums text-slate-500">{header.fontSize}px</span>
            </label>
            <input
              type="range"
              min={HEADER_FONT_MIN}
              max={HEADER_FONT_MAX}
              value={header.fontSize}
              onChange={(e) =>
                setTheme((prev) => ({ ...prev, header_font_size: Number(e.target.value) }))
              }
              className="w-full accent-emerald-600"
            />
          </section>

          <section>
            <h2 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
              블록 추가
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_BLOCK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addBlock(t)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-white border border-slate-200 hover:border-emerald-400 text-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {blockTypeLabel(t)}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <button
              type="button"
              onClick={finalize}
              disabled={save.isPending}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {save.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              이 시안으로 확정
            </button>
          </section>
        </aside>

        {/* 우측: 전체 미리보기 */}
        <main
          className="rounded-2xl border border-slate-200 overflow-hidden"
          style={{ background: theme.background_color ?? "#fff" }}
        >
          {/* 헤더 미리보기 — 이름을 드래그해 위치 지정 */}
          <DraggableShopName
            shopName={shopName || me?.shop_name || "내 쇼핑몰"}
            x={header.x}
            y={header.y}
            fontSize={header.fontSize}
            bg={theme.background_color ?? "#fff"}
            color={theme.primary_color ?? "#0f172a"}
            accent={theme.accent_color ?? "#10b981"}
            onMove={(nx, ny) =>
              setTheme((prev) => ({ ...prev, header_x: nx, header_y: ny }))
            }
          />
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
              <Sparkles className="w-10 h-10 mb-2" />
              <p className="text-sm">왼쪽에서 시안을 골라보세요.</p>
            </div>
          ) : (
            <SortablePreview blocks={blocks} theme={theme} onChange={setBlocks} />
          )}
        </main>
      </div>
    </div>
  );
}
