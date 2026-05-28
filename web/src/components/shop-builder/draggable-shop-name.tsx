"use client";

// 쇼핑몰 이름을 헤더 영역 안에서 자유롭게 드래그해 배치하는 헤더.
//  - 이름을 잡고 끌면 위치(header_x/header_y)가 바뀐다.
//  - editable=true(내 쇼핑몰 편집)면 살짝 클릭으로 이름을 그 자리에서 수정한다.
//  - onFontSize가 주어지면 글자 크기 조절 버튼(−/+)을 헤더에 띄운다.

import { useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";

import EditableText from "@/components/shop-builder/editable-text";
import {
  HEADER_BAND_HEIGHT,
  HEADER_FONT_MAX,
  HEADER_FONT_MIN,
} from "@/lib/shop-builder";

const DRAG_THRESHOLD = 4; // px 이상 움직이면 클릭이 아닌 드래그로 본다

type Props = {
  shopName: string;
  x: number; // 0~100 (%)
  y: number; // 0~100 (%)
  fontSize: number; // px
  bg: string;
  color: string;
  accent: string;
  /** true면 이름을 클릭해 그 자리에서 수정 */
  editable?: boolean;
  onMove: (x: number, y: number) => void;
  onCommitName?: (name: string) => void;
  /** 주어지면 글자 크기 조절 UI를 표시 */
  onFontSize?: (size: number) => void;
};

export default function DraggableShopName({
  shopName,
  x,
  y,
  fontSize,
  bg,
  color,
  accent,
  editable = false,
  onMove,
  onCommitName,
  onFontSize,
}: Props) {
  const bandRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  function onPointerDown(e: ReactPointerEvent) {
    // 이미 편집 중이면(텍스트에 포커스) 드래그하지 않고 그대로 둔다.
    const editableNode = nameRef.current?.querySelector("[data-editable]");
    if (editable && editableNode && document.activeElement === editableNode) return;

    const band = bandRef.current;
    const nameEl = nameRef.current;
    if (!band || !nameEl) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const bandRect = band.getBoundingClientRect();
    const nameRect = nameEl.getBoundingClientRect();
    const grabX = startX - nameRect.left; // 잡은 지점 ~ 요소 좌상단
    const grabY = startY - nameRect.top;
    let moved = false;

    function onPointerMove(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) {
        return;
      }
      if (!moved) {
        moved = true;
        document.body.style.userSelect = "none";
        // 드래그 시작 시 실수로 들어간 편집 포커스를 해제
        (document.activeElement as HTMLElement | null)?.blur?.();
      }

      const w = bandRect.width;
      const h = bandRect.height;
      const nameW = nameRect.width;
      const nameH = nameRect.height;

      let leftPx = ev.clientX - bandRect.left - grabX;
      leftPx = Math.max(0, Math.min(leftPx, Math.max(0, w - nameW)));

      const centerPx = ev.clientY - bandRect.top - grabY + nameH / 2;
      const minC = nameH / 2;
      const maxC = h - nameH / 2;
      const clampedC = Math.max(minC, Math.min(centerPx, maxC));

      const xPct = w ? (leftPx / w) * 100 : 0;
      const yPct = h ? (clampedC / h) * 100 : 50;
      onMove(Math.round(xPct * 10) / 10, Math.round(yPct * 10) / 10);
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const nameStyle: CSSProperties = {
    left: `${x}%`,
    top: `${y}%`,
    transform: "translateY(-50%)",
    fontSize: `${fontSize}px`,
    color,
  };

  function changeFont(delta: number) {
    if (!onFontSize) return;
    onFontSize(Math.max(HEADER_FONT_MIN, Math.min(HEADER_FONT_MAX, Math.round(fontSize + delta))));
  }

  return (
    <header
      className="sticky top-0 z-10 border-b"
      style={{ background: bg, borderColor: "rgba(0,0,0,0.08)" }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div ref={bandRef} className="relative" style={{ height: HEADER_BAND_HEIGHT }}>
          <div
            ref={nameRef}
            onPointerDown={onPointerDown}
            title="드래그해서 위치를 옮기세요"
            className="absolute touch-none cursor-move whitespace-nowrap leading-none"
            style={nameStyle}
          >
            {editable && onCommitName ? (
              <EditableText
                as="span"
                value={shopName}
                placeholder="쇼핑몰 이름"
                onCommit={onCommitName}
                className="font-bold"
              />
            ) : (
              <span className="font-bold">{shopName}</span>
            )}
          </div>

          <ShoppingBag
            className="w-6 h-6 absolute right-0 top-1/2 -translate-y-1/2"
            style={{ color: accent }}
          />

          {onFontSize && (
            <div className="absolute left-0 bottom-2 flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => changeFont(-2)}
                aria-label="글자 작게"
                className="p-0.5 text-slate-600 hover:text-slate-900"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-9 text-center tabular-nums text-slate-700">{fontSize}px</span>
              <button
                type="button"
                onClick={() => changeFont(2)}
                aria-label="글자 크게"
                className="p-0.5 text-slate-600 hover:text-slate-900"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
