"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import { tokenStore } from "@/lib/auth-storage";
import { loginRequest } from "@/lib/queries";

// Cafe24 OAuth는 카페24 콜백(공개 HTTPS 도메인)과 같은 출처에서 시작해야
// state 쿠키가 콜백까지 전달된다. 일반 API base와 분리해 OAUTH 전용 base를 쓴다.
// (미설정 시 API base로 폴백 → 콜백도 같은 도메인일 때만 정상 동작)
const OAUTH_BASE =
  process.env.NEXT_PUBLIC_OAUTH_BASE ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://127.0.0.1:8000";

const Schema = z.object({
  username_or_email: z.string().min(1, "아이디 또는 이메일을 입력하세요."),
  password: z.string().min(1, "비밀번호를 입력하세요."),
});
type FormValues = z.infer<typeof Schema>;

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const data = await loginRequest(values.username_or_email, values.password);
      tokenStore.set(data.access_token, data.refresh_token);
      queryClient.clear();
      toast.push("로그인되었습니다.");
      router.replace("/dashboard");
    } catch (e) {
      toast.push(errorMessage(e, "로그인에 실패했습니다."), "err");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCafe24Login() {
    // 백엔드가 Cafe24 OAuth URL로 직접 리다이렉트 (콜백과 같은 출처에서 시작)
    window.location.href = `${OAUTH_BASE}/auth/cafe24/login`;
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-2">GG 로그인</h1>
        <p className="text-sm text-slate-900 mb-6">
          1인 쇼핑몰을 AI와 함께 운영해 보세요.
        </p>

        {/* Cafe24 OAuth 로그인 */}
        <button
          type="button"
          onClick={handleCafe24Login}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 mb-4 flex items-center justify-center gap-2"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          카페24 계정으로 로그인
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs text-slate-400 bg-white px-2">
            또는
          </div>
        </div>

        {/* 일반 로그인 */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              아이디 또는 이메일
            </label>
            <input
              type="text"
              autoComplete="username"
              {...register("username_or_email")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {errors.username_or_email && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.username_or_email.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">비밀번호</label>
            <input
              type="password"
              autoComplete="current-password"
              {...register("password")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.password.message}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 text-white py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-900 text-center">
          아직 계정이 없나요?{" "}
          <Link
            href="/signup"
            className="text-emerald-600 font-medium hover:underline"
          >
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
