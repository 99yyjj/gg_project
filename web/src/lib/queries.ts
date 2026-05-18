// React Query 훅 + 백엔드 호출 함수.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  AIMarketingCopyRequest,
  AIMarketingCopyResponse,
  ProductCreateRequest,
  ProductListResponse,
  ProductMutationResponse,
  ProductSummary,
  ProductUpdateRequest,
  TokenResponse,
  UserResponse,
} from "./types";

// ─────────────── auth ───────────────

export async function loginRequest(
  username_or_email: string,
  password: string
): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", {
    username_or_email,
    password,
  });
  return data;
}

export type SignupPayload = {
  email: string;
  username: string;
  password: string;
  full_name?: string;
  phone?: string;
  shop_name?: string;
  cafe24_mall_id?: string;
};

export async function signupRequest(p: SignupPayload): Promise<UserResponse> {
  const { data } = await api.post<UserResponse>("/auth/signup", p);
  return data;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<UserResponse> => {
      const { data } = await api.get<UserResponse>("/auth/me");
      return data;
    },
    retry: false,
  });
}

// ─────────────── products ───────────────

/** 상품 등록·수정 mutation에 파일을 함께 전달하기 위한 확장 타입 */
export type ProductCreatePayload = ProductCreateRequest & {
  detail_image_file?: File | null;
  list_image_file?: File | null;
};

export type ProductUpdatePayload = ProductUpdateRequest & {
  detail_image_file?: File | null;
  list_image_file?: File | null;
};

function buildProductFormData(
  payload: ProductCreatePayload | ProductUpdatePayload
): FormData {
  const { detail_image_file, list_image_file, ...rest } = payload;
  const fd = new FormData();

  for (const [k, v] of Object.entries(rest)) {
    if (v == null) continue;
    fd.append(k, String(v));
  }
  if (detail_image_file) fd.append("detail_image_file", detail_image_file);
  if (list_image_file) fd.append("list_image_file", list_image_file);

  return fd;
}

export function useProducts(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["products", limit, offset],
    queryFn: async (): Promise<ProductListResponse> => {
      const { data } = await api.get<ProductListResponse>("/products/", {
        params: { limit, offset },
      });
      return data;
    },
  });
}

export function useProduct(productNo: number | undefined) {
  return useQuery({
    queryKey: ["product", productNo],
    queryFn: async (): Promise<ProductSummary> => {
      const { data } = await api.get<ProductSummary>(`/products/${productNo}`);
      return data;
    },
    enabled: typeof productNo === "number",
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductCreatePayload) => {
      const fd = buildProductFormData(payload);
      const { data } = await api.post<ProductMutationResponse>("/products/", fd);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductUpdatePayload) => {
      const fd = buildProductFormData(payload);
      const { data } = await api.put<ProductMutationResponse>(
        `/products/${productNo}`,
        fd
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", productNo] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productNo: number) => {
      const { data } = await api.delete<{ product_no: number; message: string }>(
        `/products/${productNo}`
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

// ─────────────── shop template (빌더) ───────────────

import type {
  ShopBlock,
  ShopTemplate,
  ShopTheme,
} from "./shop-builder";

export type AIDesignResponse = {
  theme: ShopTheme;
  hero_headline?: string | null;
  hero_subcopy?: string | null;
  hero_cta?: string | null;
  section_copy?: Record<string, string>;
  recommended_blocks?: string[];
};

export function useShopTemplate() {
  return useQuery({
    queryKey: ["shop-template"],
    queryFn: async (): Promise<ShopTemplate> => {
      const { data } = await api.get<ShopTemplate>("/shop-template/me");
      return data;
    },
  });
}

export function useSaveShopTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      preset_id: string | null;
      blocks: ShopBlock[];
      theme: ShopTheme;
      finalize: boolean;
    }) => {
      const { data } = await api.put<ShopTemplate>("/shop-template/me", payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-template"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useAIDesign() {
  return useMutation({
    mutationFn: async (payload: {
      preset_id: string | null;
      blocks: ShopBlock[];
      shop_name?: string;
      extra_prompt?: string;
    }): Promise<AIDesignResponse> => {
      const { data } = await api.post<AIDesignResponse>(
        "/shop-template/ai-design",
        payload
      );
      return data;
    },
  });
}

// ─────────────── AI ───────────────

export async function generateMarketingCopy(
  payload: AIMarketingCopyRequest
): Promise<AIMarketingCopyResponse> {
  const { data } = await api.post<AIMarketingCopyResponse>(
    "/ai/marketing-copy",
    payload
  );
  return data;
}
