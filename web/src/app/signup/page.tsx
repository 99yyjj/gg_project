"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import { signupRequest, loginRequest } from "@/lib/queries";
import { tokenStore } from "@/lib/auth-storage";

const Schema = z.object({
  email: z.email("이메일 형식이 올바르지 않습니다."),
  username: z
    .string()
    .min(3, "아이디는 3자 이상이어야 합니다.")
    .max(50, "아이디는 50자 이하여야 합니다."),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다.")
    .max(128)
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
      message: "영문과 숫자를 모두 포함해야 합니다.",
    }),
  full_name: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  shop_name: z.string().max(100).optional().or(z.literal("")),
  cafe24_mall_id: z.string().max(50).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof Schema>;

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // 빈 문자열은 백엔드로 보내지 않음
      const payload = {
        email: values.email,
        username: values.username,
        password: values.password,
        full_name: values.full_name || undefined,
        phone: values.phone || undefined,
        shop_name: values.shop_name || undefined,
        cafe24_mall_id: values.cafe24_mall_id || undefined,
      };
      await signupRequest(payload);
      // 가입 직후 자동 로그인
      const tok = await loginRequest(values.username, values.password);
      tokenStore.set(tok.access_token, tok.refresh_token);
      toast.push("회원가입이 완료되었습니다.");
      router.replace("/dashboard");
    } catch (e) {
      toast.push(errorMessage(e, "회원가입에 실패했습니다."), "err");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-2">회원가입</h1>
        <p className="text-sm text-slate-900 mb-6">
          GG에서 1인 쇼핑몰을 시작해 보세요.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="이메일" error={errors.email?.message}>
            <input
              type="email"
              {...register("email")}
              className={inputCls}
              autoComplete="email"
            />
          </Field>
          <Field label="아이디" error={errors.username?.message}>
            <input
              type="text"
              {...register("username")}
              className={inputCls}
              autoComplete="username"
            />
          </Field>
          <Field label="비밀번호" error={errors.password?.message}>
            <input
              type="password"
              {...register("password")}
              className={inputCls}
              autoComplete="new-password"
            />
          </Field>
          <Field label="실명 (선택)">
            <input type="text" {...register("full_name")} className={inputCls} />
          </Field>
          <Field label="휴대폰 (선택)">
            <input type="tel" {...register("phone")} className={inputCls} />
          </Field>
          <Field label="쇼핑몰 이름 (선택)">
            <input type="text" {...register("shop_name")} className={inputCls} />
          </Field>
          <Field label="Cafe24 mall_id (선택)">
            <input
              type="text"
              {...register("cafe24_mall_id")}
              className={inputCls}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "가입 처리 중..." : "회원가입"}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-900 text-center">
          이미 계정이 있나요?{" "}
          <Link
            href="/login"
            className="text-emerald-600 font-medium hover:underline"
          >
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
