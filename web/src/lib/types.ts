// 백엔드 스키마와 1:1 매핑되는 타입 정의

export type UserResponse = {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  shop_name: string | null;
  cafe24_mall_id: string | null;
  is_active: boolean;
  is_admin: boolean;
  onboarding_completed: boolean;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type ProductSummary = {
  product_no: number;
  product_code: string | null;
  product_name: string;
  price: number | null;
  summary_description: string | null;
  description: string | null;
  detail_image: string | null;
  list_image: string | null;
  additional_images: string[];
  display: string | null;
  selling: string | null;
  category_no: number | null;
};

export type ProductListResponse = {
  items: ProductSummary[];
  limit: number;
  offset: number;
};

export type ProductCreateRequest = {
  product_name: string;
  price: number;
  supply_price?: number;
  summary_description?: string;
  description: string;
  category_no?: number;
  display?: "T" | "F";
  selling?: "T" | "F";
  tags?: string[];
};

export type ProductUpdateRequest = Partial<ProductCreateRequest> & {
  delete_detail_image?: boolean;
  delete_list_image?: boolean;
};

export type ProductMutationResponse = {
  product: ProductSummary;
  message: string;
  warnings?: string[];
};

export type AdditionalImage = {
  additional_image_no: number | null;
  image_url: string;
};

export type AdditionalImageListResponse = {
  product_no: number;
  images: AdditionalImage[];
};

export type AdditionalImageMutationResponse = {
  product_no: number;
  images: AdditionalImage[];
  message: string;
};

export type AIMarketingCopyRequest = {
  product_name: string;
  price?: number;
  original_description?: string;
  custom_prompt?: string;
};

export type AIMarketingCopyResponse = {
  description: string;
  tags: string[];
};

export type AIImageAnalysisResponse = {
  file_id: string;
  product_name: string;
  keywords: string[];
  summary: string;
  description: string;
  analysis_text: string;
};

// ─────────────── reviews ───────────────

export type ReviewSentiment = "loading" | "pos" | "neu" | "neg";
export type ReviewFilter = "all" | "pos" | "neu" | "neg" | "undone";

export type Review = {
  id: number;
  product_no: number;
  author_name: string;
  rating: number; // 1~5
  content: string;
  sentiment: ReviewSentiment;
  summary: string | null;
  admin_reply: string | null;
  is_done: boolean;
  ai_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewStats = {
  total: number;
  avg_rating: number | null;
  urgent: number; // 1~2점 미처리
  done: number;
};

export type ReviewListResponse = {
  items: Review[];
  stats: ReviewStats;
};

export type ReviewCreateRequest = {
  author_name: string;
  rating: number;
  content: string;
};

export type ReviewUpdateRequest = {
  admin_reply?: string | null;
  is_done?: boolean;
};

export type RegenerateReplyResponse = {
  draft_reply: string;
};

// ─────────────── 주문 / 판매성과 (카페24 읽기 전용) ───────────────

export type OrderSummary = {
  order_no: string;
  date: string;
  name: string;
  phone: string;
  address: string;
  product: string;
  amount: number;
  status: string;
  tracking: string;
};

export type OrderListResponse = {
  orders: OrderSummary[];
  total: number;
};

export type SalesMetric = {
  label: string;
  amount: number;
  count: number;
  avg: number;
};

export type ProductRank = {
  name: string;
  count: number;
};

export type ProductStat = {
  name: string;
  product_no: string;
  amount: number;
  count: number;
};

export type SalesSummaryResponse = {
  summary: SalesMetric;
  ranking: ProductRank[];
  period_stats: ProductStat[];
};
