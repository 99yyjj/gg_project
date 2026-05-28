// React Query 훅 + 백엔드 호출 함수.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  AdditionalImageListResponse,
  AdditionalImageMutationResponse,
  AIImageAnalysisResponse,
  AIMarketingCopyRequest,
  AIMarketingCopyResponse,
  ProductCreateRequest,
  ProductListResponse,
  ProductMutationResponse,
  ProductSummary,
  ProductUpdateRequest,
  RegenerateReplyResponse,
  Review,
  ReviewCreateRequest,
  ReviewFilter,
  ReviewListResponse,
  ReviewUpdateRequest,
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

/** 내 정보 수정 (쇼핑몰 이름). */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { shop_name: string }): Promise<UserResponse> => {
      const { data } = await api.patch<UserResponse>("/auth/me", payload);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
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
    if (Array.isArray(v)) {
      // 태그처럼 배열인 값은 같은 키로 여러 번 append (백엔드 list[str] Form)
      for (const item of v) fd.append(k, String(item));
      continue;
    }
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

// ─────────────── 추가(상세) 이미지 ───────────────

/** 추가 이미지 다중 업로드 — 상품 생성 직후 직접 호출용 (훅 밖에서도 사용). */
export async function addAdditionalImagesRequest(
  productNo: number,
  files: File[]
): Promise<AdditionalImageMutationResponse> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const { data } = await api.post<AdditionalImageMutationResponse>(
    `/products/${productNo}/additionalimages`,
    fd
  );
  return data;
}

export function useAdditionalImages(productNo: number | undefined) {
  return useQuery({
    queryKey: ["additional-images", productNo],
    queryFn: async (): Promise<AdditionalImageListResponse> => {
      const { data } = await api.get<AdditionalImageListResponse>(
        `/products/${productNo}/additionalimages`
      );
      return data;
    },
    enabled: typeof productNo === "number",
  });
}

export function useAddAdditionalImages(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => addAdditionalImagesRequest(productNo, files),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["additional-images", productNo] }),
  });
}

export function useUpdateAdditionalImage(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { additionalImageNo: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", payload.file);
      const { data } = await api.put<AdditionalImageMutationResponse>(
        `/products/${productNo}/additionalimages/${payload.additionalImageNo}`,
        fd
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["additional-images", productNo] }),
  });
}

export function useDeleteAdditionalImage(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (additionalImageNo: number) => {
      const { data } = await api.delete<AdditionalImageMutationResponse>(
        `/products/${productNo}/additionalimages/${additionalImageNo}`
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["additional-images", productNo] }),
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

export async function analyzeProductImage(
  file: File
): Promise<AIImageAnalysisResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<AIImageAnalysisResponse>(
    "/ai/analyze-image",
    fd
  );
  return data;
}

// ─────────────── reviews ───────────────

/**
 * 상품 리뷰 목록 + 통계.
 *
 * 신규 리뷰는 sentiment='loading' 으로 들어와 백그라운드 AI 분석이 끝나면
 * 'pos'|'neu'|'neg' 로 갱신된다. UI 쪽에서 loading 상태인 카드가 있으면
 * 짧은 폴링으로 새로 받으면 된다 — refetchInterval 옵션은 호출 측에서 결정.
 */
export function useProductReviews(
  productNo: number | undefined,
  filter: ReviewFilter = "all"
) {
  return useQuery({
    queryKey: ["product-reviews", productNo, filter],
    queryFn: async (): Promise<ReviewListResponse> => {
      const { data } = await api.get<ReviewListResponse>(
        `/products/${productNo}/reviews`,
        { params: { filter } }
      );
      return data;
    },
    enabled: typeof productNo === "number",
    refetchInterval: (query) => {
      // loading 상태 리뷰가 남아 있으면 1.5초 간격으로 폴링.
      const data = query.state.data as ReviewListResponse | undefined;
      const hasLoading = data?.items?.some((r) => r.sentiment === "loading");
      return hasLoading ? 1500 : false;
    },
  });
}

export function useCreateReview(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReviewCreateRequest): Promise<Review> => {
      const { data } = await api.post<Review>(
        `/products/${productNo}/reviews`,
        payload
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["product-reviews", productNo] }),
  });
}

export function useUpdateReview(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      body: ReviewUpdateRequest;
    }): Promise<Review> => {
      const { data } = await api.patch<Review>(
        `/reviews/${payload.id}`,
        payload.body
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["product-reviews", productNo] }),
  });
}

export function useDeleteReview(productNo: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/reviews/${id}`);
      return id;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["product-reviews", productNo] }),
  });
}

export function useRegenerateReply() {
  return useMutation({
    mutationFn: async (id: number): Promise<RegenerateReplyResponse> => {
      const { data } = await api.post<RegenerateReplyResponse>(
        `/reviews/${id}/regenerate-reply`
      );
      return data;
    },
  });
}
