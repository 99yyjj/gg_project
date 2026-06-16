"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { useMe } from "@/lib/queries";

export default function SettingsPage() {
  const { data: me } = useMe();

  if (!me) return null;

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">내 정보</h1>
        <p className="text-sm text-slate-800 mt-1">
          가입 시 입력한 정보입니다.
        </p>
      </header>

      {/* 내 쇼핑몰 링크 */}
      <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">내 쇼핑몰 주소</p>
          <p className="text-sm text-emerald-700 mt-0.5">/shop/{me.username}</p>
        </div>
        <Link
          href={`/shop/${me.username}`}
          target="_blank"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
        >
          <ExternalLink className="w-4 h-4" /> 열기
        </Link>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <Row label="아이디" value={me.username} />
        <Row label="이메일" value={me.email} />
        <Row label="이름" value={me.full_name ?? "-"} />
        <Row label="휴대폰" value={me.phone ?? "-"} />
        <Row label="쇼핑몰 이름" value={me.shop_name ?? "-"} />
        <Row label="Cafe24 mall_id" value={me.cafe24_mall_id ?? "-"} />
        <Row label="가입일" value={new Date(me.created_at).toLocaleString()} />
        <Row label="권한" value={me.is_admin ? "관리자" : "일반"} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-800">{label}</div>
      <div className="text-slate-900 font-medium mt-0.5 break-all">{value}</div>
    </div>
  );
}
