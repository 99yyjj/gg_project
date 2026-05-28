"use client";

// 시안 글자를 클릭해 그 자리에서 바로 고치는 인라인 편집 텍스트.
// contentEditable을 "비제어(uncontrolled)"로 쓰고 blur 시점에만 값을 커밋한다.
// 타이핑 중에는 상태를 갱신하지 않으므로 리렌더로 커서가 튀지 않는다.

import { useRef } from "react";
import type { CSSProperties, ElementType, KeyboardEvent } from "react";

type Props = {
  value: string;
  onCommit: (next: string) => void;
  /** 렌더링 태그 (기본 span). 제목은 h1~h3, 본문은 p/div 권장. */
  as?: ElementType;
  /** true면 Enter로 줄바꿈 허용. 기본은 Enter = 편집 종료(blur). */
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
};

export default function EditableText({
  value,
  onCommit,
  as,
  multiline = false,
  placeholder,
  className = "",
  style,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const Tag: ElementType = as ?? "span";

  function commit() {
    const text = (ref.current?.innerText ?? "").replace(/\n+$/, "");
    if (text !== value) onCommit(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      data-editable=""
      data-placeholder={placeholder}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={`cursor-text rounded-sm outline-none transition hover:bg-emerald-50/50 focus:bg-white/90 focus:ring-2 focus:ring-emerald-400/70 ${className}`}
      style={style}
    >
      {value}
    </Tag>
  );
}
