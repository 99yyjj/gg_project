// 쇼핑몰 빌더 — 시안(preset)/블록 타입과 기본 데이터.

export type BlockType =
  | "hero"
  | "featured-products"
  | "category-grid"
  | "banner"
  | "testimonial"
  | "newsletter";

export type ShopBlock = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
};

export type ShopTheme = {
  primary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  font_family?: string;
  tone?: string;
  /** @deprecated 구버전 헤더 정렬. 지금은 header_x/header_y 자유 배치를 쓴다. */
  header_align?: "left" | "center";
  /** 쇼핑몰 이름 가로 위치: 헤더 영역 폭 대비 왼쪽 모서리 % (0 = 좌측) */
  header_x?: number;
  /** 쇼핑몰 이름 세로 위치: 헤더 영역 높이 대비 중심 % (50 = 세로 중앙) */
  header_y?: number;
  /** 쇼핑몰 이름 글자 크기 (px) */
  header_font_size?: number;
};

/** 헤더(쇼핑몰 이름) 영역 높이(px). 편집기·미리보기·손님화면이 같아야 위치가 일치한다. */
export const HEADER_BAND_HEIGHT = 96;
export const DEFAULT_HEADER_FONT_SIZE = 20;
export const HEADER_FONT_MIN = 12;
export const HEADER_FONT_MAX = 56;

export type ResolvedHeader = { x: number; y: number; fontSize: number };

/** theme에서 헤더 이름 위치/크기를 안전하게 해석한다 (구버전 header_align 호환). */
export function resolveHeader(theme: ShopTheme): ResolvedHeader {
  return {
    x: theme.header_x ?? (theme.header_align === "center" ? 38 : 0),
    y: theme.header_y ?? 50,
    fontSize: theme.header_font_size ?? DEFAULT_HEADER_FONT_SIZE,
  };
}

export type ShopTemplate = {
  preset_id: string | null;
  blocks: ShopBlock[];
  theme: ShopTheme;
};

export type Preset = {
  id: string;
  name: string;
  tagline: string;
  swatch: { bg: string; primary: string; accent: string };
  blocks: ShopBlock[];
  theme: ShopTheme;
};

let _id = 0;
const nextId = (prefix: string) => `${prefix}-${++_id}-${Date.now().toString(36)}`;

const blk = (type: BlockType, props: Record<string, unknown> = {}): ShopBlock => ({
  id: nextId(type),
  type,
  props,
});

export const PRESETS: Preset[] = [
  {
    id: "minimal",
    name: "Minimal",
    tagline: "여백 중심의 정제된 톤",
    swatch: { bg: "#ffffff", primary: "#0f172a", accent: "#10b981" },
    theme: {
      primary_color: "#0f172a",
      accent_color: "#10b981",
      background_color: "#ffffff",
      text_color: "#0f172a",
      font_family: "Pretendard, system-ui, sans-serif",
      tone: "minimal",
    },
    blocks: [
      blk("hero", {
        headline: "조용한 큐레이션, 매일의 선택.",
        subcopy: "필요한 것만 남겼습니다. 좋은 물건과 단정한 톤.",
        cta: "지금 둘러보기",
      }),
      blk("featured-products", { title: "BEST PICK" }),
      blk("category-grid", { title: "카테고리" }),
      blk("newsletter", { title: "새 소식을 가장 먼저" }),
    ],
  },
  {
    id: "bold",
    name: "Bold",
    tagline: "선명한 컬러와 강한 헤드라인",
    swatch: { bg: "#fff7ed", primary: "#dc2626", accent: "#fbbf24" },
    theme: {
      primary_color: "#dc2626",
      accent_color: "#fbbf24",
      background_color: "#fff7ed",
      text_color: "#1c1917",
      font_family: "'Spoqa Han Sans Neo', sans-serif",
      tone: "bold",
    },
    blocks: [
      blk("hero", {
        headline: "오늘 가장 뜨거운 컬렉션.",
        subcopy: "트렌드의 맨 앞줄. 지금 만나보세요.",
        cta: "오늘의 핫딜",
      }),
      blk("banner", { title: "TIME SALE", subtitle: "오늘 자정까지" }),
      blk("featured-products", { title: "HOT 10" }),
      blk("testimonial", { title: "고객 리얼 후기" }),
      blk("newsletter", { title: "할인 알림 받기" }),
    ],
  },
  {
    id: "playful",
    name: "Playful",
    tagline: "밝은 컬러, 둥글둥글한 분위기",
    swatch: { bg: "#fdf4ff", primary: "#7c3aed", accent: "#f472b6" },
    theme: {
      primary_color: "#7c3aed",
      accent_color: "#f472b6",
      background_color: "#fdf4ff",
      text_color: "#3b0764",
      font_family: "'Nanum Gothic', sans-serif",
      tone: "playful",
    },
    blocks: [
      blk("hero", {
        headline: "즐거운 쇼핑, 여기서 시작!",
        subcopy: "당신의 하루를 가볍게 만들 아이템들",
        cta: "구경하러 가기",
      }),
      blk("category-grid", { title: "카테고리 탐험" }),
      blk("featured-products", { title: "이번 주 PICK" }),
      blk("banner", { title: "친구 초대 EVENT", subtitle: "초대할수록 적립" }),
      blk("newsletter", { title: "친구가 되어주세요" }),
    ],
  },
  {
    id: "natural",
    name: "Natural",
    tagline: "자연스러운 베이지 톤, 편안한 무드",
    swatch: { bg: "#faf8f3", primary: "#5b4636", accent: "#a3b18a" },
    theme: {
      primary_color: "#5b4636",
      accent_color: "#a3b18a",
      background_color: "#faf8f3",
      text_color: "#3f352c",
      font_family: "Pretendard, system-ui, sans-serif",
      tone: "natural",
    },
    blocks: [
      blk("hero", {
        headline: "자연이 건넨, 오늘의 선택.",
        subcopy: "편안하고 단정한 일상을 위한 큐레이션.",
        cta: "둘러보기",
      }),
      blk("featured-products", { title: "이달의 추천" }),
      blk("category-grid", { title: "카테고리" }),
      blk("testimonial", { title: "고객의 한마디" }),
      blk("newsletter", { title: "소식 받아보기" }),
    ],
  },
  {
    id: "luxury",
    name: "Luxury",
    tagline: "딥 톤과 골드 포인트의 고급스러운 무드",
    swatch: { bg: "#0f0f10", primary: "#caa45d", accent: "#caa45d" },
    theme: {
      primary_color: "#caa45d",
      accent_color: "#caa45d",
      background_color: "#0f0f10",
      text_color: "#ece8e1",
      font_family: "'Spoqa Han Sans Neo', sans-serif",
      tone: "luxury",
    },
    blocks: [
      blk("hero", {
        headline: "당신의 격을 높이는 컬렉션.",
        subcopy: "엄선한 프리미엄 셀렉션을 만나보세요.",
        cta: "컬렉션 보기",
      }),
      blk("banner", { title: "EXCLUSIVE", subtitle: "회원 전용 특별가" }),
      blk("featured-products", { title: "SIGNATURE" }),
      blk("newsletter", { title: "프라이빗 소식 구독" }),
    ],
  },
];

export function blockTypeLabel(t: BlockType): string {
  switch (t) {
    case "hero": return "히어로";
    case "featured-products": return "추천 상품";
    case "category-grid": return "카테고리";
    case "banner": return "배너";
    case "testimonial": return "고객 후기";
    case "newsletter": return "뉴스레터";
  }
}

/** 시안 ID로 새 블록 인스턴스 배열을 만든다 (id 충돌 방지) */
export function instantiatePreset(presetId: string): { blocks: ShopBlock[]; theme: ShopTheme } {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0];
  return {
    blocks: p.blocks.map((b) => ({ ...b, id: nextId(b.type), props: { ...b.props } })),
    theme: { ...p.theme },
  };
}

export function newBlockId(type: BlockType): string {
  return nextId(type);
}
