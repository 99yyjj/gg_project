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
  description: string | null;
  detail_image: string | null;
  list_image: string | null;
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
  description: string;
  category_no?: number;
  display?: "T" | "F";
  selling?: "T" | "F";
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
