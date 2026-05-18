"use client";

import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

import BlockRenderer from "@/components/shop-builder/block-renderer";
import {
  ShopBlock,
  ShopTheme,
  blockTypeLabel,
} from "@/lib/shop-builder";

type Props = {
  blocks: ShopBlock[];
  theme: ShopTheme;
  onChange: (next: ShopBlock[]) => void;
};

export default function SortablePreview({ blocks, theme, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(blocks, oldIdx, newIdx));
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0">
          {blocks.map((b) => (
            <SortableBlock
              key={b.id}
              block={b}
              theme={theme}
              onRemove={() => removeBlock(b.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableBlock({
  block,
  theme,
  onRemove,
}: {
  block: ShopBlock;
  theme: ShopTheme;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative border-b border-dashed border-slate-200 last:border-b-0"
    >
      {/* 드래그 핸들 + 삭제 - 호버 시 표시 */}
      <div className="absolute top-3 left-3 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${blockTypeLabel(block.type)} 블록 이동`}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/95 border border-slate-200 text-xs text-slate-700 shadow cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3.5 h-3.5" />
          {blockTypeLabel(block.type)}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="블록 삭제"
          className="px-2 py-1 rounded-md bg-white/95 border border-slate-200 text-rose-600 shadow"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <BlockRenderer block={block} theme={theme} />
    </div>
  );
}
