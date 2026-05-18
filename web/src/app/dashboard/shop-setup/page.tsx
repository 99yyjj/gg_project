"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles, Wand2 } from "lucide-react";

import SortablePreview from "@/components/shop-builder/sortable-preview";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import {
  useAIDesign,
  useMe,
  useSaveShopTemplate,
  useShopTemplate,
} from "@/lib/queries";
import {
  BlockType,
  PRESETS,
  ShopBlock,
  ShopTheme,
  blockTypeLabel,
  instantiatePreset,
  newBlockId,
} from "@/lib/shop-builder";

const ALL_BLOCK_TYPES: BlockType[] = [
  "hero",
  "featured-products",
  "category-grid",
  "banner",
  "testimonial",
  "newsletter",
];

export default function ShopSetupPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: existing, isLoading } = useShopTemplate();
  const save = useSaveShopTemplate();
  const aiDesign = useAIDesign();

  const [presetId, setPresetId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ShopBlock[]>([]);
  const [theme, setTheme] = useState<ShopTheme>({});

  // 최초 진입 — 기존 시안이 있으면 그걸로 시작, 없으면 첫 시안 적용.
  useEffect(() => {
    if (isLoading) return;
    if (existing?.blocks?.length) {
      setPresetId(existing.preset_id ?? null);
      setBlocks(existing.blocks);
      setTheme(existing.theme ?? {});
    } else {
      applyPreset(PRESETS[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  function applyPreset(id: string) {
    const { blocks, theme } = instantiatePreset(id);
    setPresetId(id);
    setBlocks(blocks);
    setTheme(theme);
  }

  function addBlock(type: BlockType) {
    setBlocks((prev) => [...prev, { id: newBlockId(type), type, props: {} }]);
  }

  async function runAIDesign() {
    try {
      const res = await aiDesign.mutateAsync({
        preset_id: presetId,
        blocks,
        shop_name: me?.shop_name ?? me?.username,
      });
      setTheme((prev) => ({ ...prev, ...res.theme }));
      // hero 블록 카피 자동 채우기
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.type === "hero") {
            return {
              ...b,
              props: {
                ...b.props,
                headline: res.hero_headline ?? b.props.headline,
                subcopy: res.hero_subcopy ?? b.props.subcopy,
                cta: res.hero_cta ?? b.props.cta,
              },
            };
          }
          const sc = res.section_copy?.[b.type];
          if (sc) return { ...b, props: { ...b.props, title: sc } };
          return b;
        })
      );
      toast.push("AI가 시안을 다듬어 적용했습니다.");
    } catch (e) {
      toast.push(errorMessage(e, "AI 디자인에 실패했습니다."), "err");
    }
  }

  async function finalize() {
    if (blocks.length === 0) {
      toast.push("최소 한 개의 블록은 있어야 합니다.", "err");
      return;
    }
    try {
      await save.mutateAsync({
        preset_id: presetId,
        blocks,
        theme,
        finalize: true,
      });
      toast.push("쇼핑몰 시안을 확정했습니다. 이제 상품을 등록해보세요!");
      router.replace("/dashboard/products/new");
    } catch (e) {
      toast.push(errorMessage(e, "저장에 실패했습니다."), "err");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-500">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto -mt-2">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-emerald-600" />
          쇼핑몰 꾸미기
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          마음에 드는 시안을 고르고 블록을 자유롭게 옮겨보세요. AI가 마무리를 도와드립니다.
        </p>
      </header>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* 좌측: 시안 + 블록 추가 + 액션 */}
        <aside className="space-y-5">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
              시안 선택
            </h2>
            <div className="space-y-2">
              {PRESETS.map((p) => (
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
              onClick={runAIDesign}
              disabled={aiDesign.isPending}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {aiDesign.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              AI로 디자인 다듬기
            </button>
            <button
              type="button"
              onClick={finalize}
              disabled={save.isPending}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              이 시안으로 확정
            </button>
          </section>
        </aside>

        {/* 우측: 전체 미리보기 */}
        <main
          className="rounded-2xl border border-slate-200 overflow-hidden"
          style={{ background: theme.background_color ?? "#fff" }}
        >
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
