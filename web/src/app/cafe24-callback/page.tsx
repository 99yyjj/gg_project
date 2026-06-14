"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { tokenStore } from "@/lib/auth-storage";
import { errorMessage } from "@/lib/api";

// Cafe24 OAuth 경로(/auth/cafe24/*)는 /api prefix 없이 백엔드 도메인에 직접 있다.
// 일반 API base(NEXT_PUBLIC_API_BASE, /api 포함)가 아니라 OAUTH base를 쓴다.
const OAUTH_BASE =
  process.env.NEXT_PUBLIC_OAUTH_BASE ||
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api\/?$/, "") ||
  "http://127.0.0.1:8000";

// React 19 StrictMode는 effect를 두 번 실행한다. 일회용 code는 두 번째
// 교환에서 400이 나므로, 이미 처리한 code는 모듈 스코프에서 한 번만 보낸다.
const processed = new Set<string>();

function Cafe24CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setErrorMsg(decodeURIComponent(error));
      setStatus("error");
      return;
    }

    if (!code) {
      setErrorMsg("인증 코드를 받지 못했습니다. 다시 로그인해 주세요.");
      setStatus("error");
      return;
    }

    if (processed.has(code)) return;
    processed.add(code);

    // 일회용 code를 POST로 교환해 토큰을 받아온다 (토큰이 URL에 노출되지 않음).
    axios
      .post(`${OAUTH_BASE}/auth/cafe24/exchange`, { code })
      .then((res) => {
        const { access_token, refresh_token } = res.data;
        tokenStore.set(access_token, refresh_token);
        queryClient.clear();
        router.replace("/dashboard");
      })
      .catch((e) => {
        setErrorMsg(errorMessage(e, "로그인 처리에 실패했습니다. 다시 시도해 주세요."));
        setStatus("error");
      });
  }, [searchParams, router, queryClient]);

  if (status === "error") {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-rose-600 font-medium mb-4">{errorMsg}</p>
          <button
            onClick={() => router.replace("/login")}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
          >
            로그인 페이지로 돌아가기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="text-center text-slate-500 text-sm">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        카페24 로그인 처리 중...
      </div>
    </main>
  );
}

export default function Cafe24CallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center text-slate-500 text-sm">불러오는 중...</div>
        </main>
      }
    >
      <Cafe24CallbackInner />
    </Suspense>
  );
}
