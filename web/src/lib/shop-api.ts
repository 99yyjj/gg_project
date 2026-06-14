// 공개 쇼핑몰 API — 인증 헤더 없이 호출
import axios from "axios";

import type { ShopTemplate } from "./shop-builder";

// 백엔드 API는 모두 /api prefix 아래에 있다(프론트 /shop 페이지와의 경로 충돌 방지).
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

export const shopApi = axios.create({ baseURL: BASE_URL });

export type ShopInfo = {
  username: string;
  shop_name: string | null;
  full_name: string | null;
  // 사장님이 확정한 시안. 한 번도 안 꾸민 사용자는 null → 기본 레이아웃 폴백.
  shop_template: ShopTemplate | null;
};

export type ShopProduct = {
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

export type ShopProductListResponse = {
  shop: ShopInfo;
  items: ShopProduct[];
  limit: number;
  offset: number;
};

export type ShopCategory = {
  category_no: number;
  category_name: string;
  parent_category_no: number | null;
  depth: number | null;
};

export async function fetchShopInfo(username: string): Promise<ShopInfo> {
  const { data } = await shopApi.get<ShopInfo>(`/shop/${username}`);
  return data;
}

export async function fetchShopProducts(
  username: string,
  limit = 20,
  offset = 0
): Promise<ShopProductListResponse> {
  const { data } = await shopApi.get<ShopProductListResponse>(
    `/shop/${username}/products`,
    { params: { limit, offset } }
  );
  return data;
}

export async function fetchShopProduct(
  username: string,
  productNo: number
): Promise<ShopProduct> {
  const { data } = await shopApi.get<ShopProduct>(
    `/shop/${username}/products/${productNo}`
  );
  return data;
}

export async function fetchShopCategories(
  username: string
): Promise<ShopCategory[]> {
  const { data } = await shopApi.get<{ items: ShopCategory[]; total: number }>(
    `/shop/${username}/categories`
  );
  return data.items;
}

// ─────────────── 공개 리뷰 ───────────────

export type ShopReview = {
  id: number;
  product_no: number;
  author_name: string;
  rating: number;
  content: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
};

export type ShopReviewListResponse = {
  items: ShopReview[];
  total: number;
  avg_rating: number | null;
};

export type ShopReviewCreatePayload = {
  author_name: string;
  rating: number;
  content: string;
};

export type ShopReviewCreateResponse = {
  review: ShopReview;
  edit_token: string;
};

export type ShopReviewUpdatePayload = Partial<ShopReviewCreatePayload>;

export async function fetchShopReviews(
  username: string,
  productNo: number
): Promise<ShopReviewListResponse> {
  const { data } = await shopApi.get<ShopReviewListResponse>(
    `/shop/${username}/products/${productNo}/reviews`
  );
  return data;
}

export async function createShopReview(
  username: string,
  productNo: number,
  payload: ShopReviewCreatePayload
): Promise<ShopReviewCreateResponse> {
  const { data } = await shopApi.post<ShopReviewCreateResponse>(
    `/shop/${username}/products/${productNo}/reviews`,
    payload
  );
  return data;
}

export async function updateShopReview(
  username: string,
  reviewId: number,
  editToken: string,
  payload: ShopReviewUpdatePayload
): Promise<ShopReview> {
  const { data } = await shopApi.patch<ShopReview>(
    `/shop/${username}/reviews/${reviewId}`,
    payload,
    { headers: { "X-Edit-Token": editToken } }
  );
  return data;
}

// ─────────────── 본인 리뷰 식별 (localStorage) ───────────────

/**
 * 손님 브라우저에 자기가 쓴 리뷰의 id↔edit_token 매핑을 보관한다.
 * 다른 브라우저/기기로 접속하면 본인 리뷰를 수정할 수 없는 게 의도된 한계.
 */
const STORAGE_PREFIX = "gg-shop-review-tokens";

function storageKey(username: string): string {
  return `${STORAGE_PREFIX}:${username}`;
}

export function loadOwnedReviewTokens(username: string): Record<number, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(username));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    // 키가 number 로 잘 직렬화되었는지 보정
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(k);
      if (Number.isFinite(n)) out[n] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveOwnedReviewToken(
  username: string,
  reviewId: number,
  editToken: string
): void {
  if (typeof window === "undefined") return;
  const current = loadOwnedReviewTokens(username);
  current[reviewId] = editToken;
  window.localStorage.setItem(storageKey(username), JSON.stringify(current));
}
