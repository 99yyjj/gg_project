"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "@/lib/auth-storage";

function Cafe24CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const error = searchParams.get("error");

    if (error) {
      setErrorMsg(decodeURIComponent(error));
      setStatus("error");
      return;
    }

    if (!accessToken || !refreshToken) {
      setErrorMsg("토큰을 받지 못했습니다. 다시 로그인해 주세요.");
      setStatus("error");
      return;
    }

    tokenStore.set(accessToken, refreshToken);
    queryClient.clear();
    router.replace("/dashboard");
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
