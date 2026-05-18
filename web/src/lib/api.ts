// 백엔드 호출용 axios 인스턴스.
// access 토큰을 자동으로 첨부하고, 401 응답 시 refresh로 1회 자동 갱신 후 재시도한다.

import axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { tokenStore } from "./auth-storage";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export const api = axios.create({
  baseURL: BASE_URL,
});

// 매 요청마다 access 토큰 첨부
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → /auth/refresh 호출 후 1회 재시도
type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;

  // 동시 401이 여러 개 발생해도 refresh는 한 번만
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
      .then((res) => {
        const { access_token, refresh_token } = res.data;
        tokenStore.set(access_token, refresh_token);
        return access_token as string;
      })
      .catch(() => {
        tokenStore.clear();
        return null;
      })
      .finally(() => {
        // 다음 401에 대비해 락 해제
        setTimeout(() => {
          refreshing = null;
        }, 0);
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (!original || error.response?.status !== 401 || original._retry) {
      throw error;
    }

    // 로그인/리프레시 자체의 401은 재시도하지 않음
    const url = original.url || "";
    if (url.includes("/auth/login") || url.includes("/auth/refresh")) {
      throw error;
    }

    original._retry = true;
    const newToken = await refreshAccessToken();
    if (!newToken) {
      // refresh도 실패: 로그아웃 처리. 호출자가 로그인 화면으로 이동시키도록 그대로 던짐.
      throw error;
    }

    original.headers = original.headers || {};
    (original.headers as Record<string, string>).Authorization =
      `Bearer ${newToken}`;
    return api.request(original);
  }
);

export function authHeaderFromError(error: unknown): number | null {
  if (axios.isAxiosError(error)) return error.response?.status ?? null;
  return null;
}

export function errorMessage(error: unknown, fallback = "오류가 발생했습니다."): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  }
  return fallback;
}
