// 공개 쇼핑몰 API — 인증 헤더 없이 호출
import axios from "axios";

import type { ShopTemplate } from "./shop-builder";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

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
  description: string | null;
  detail_image: string | null;
  list_image: string | null;
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
