"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BarChart3, LogOut, Package, Settings, Sparkles, Truck } from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";

import { tokenStore } from "@/lib/auth-storage";
import { useMe } from "@/lib/queries";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: me, isLoading, isError } = useMe();

  // 토큰이 아예 없거나 me 호출 실패 → 로그인으로
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!tokenStore.getAccess()) {
      router.replace("/login");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (isError) {
      tokenStore.clear();
      router.replace("/login");
    }
  }, [isError, router]);

  if (isLoading || !me) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-900">
        불러오는 중...
      </main>
    );
  }

  function handleLogout() {
    tokenStore.clear();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <div className="flex flex-1">
      <aside className="w-60 bg-white border-r border-slate-200 px-4 py-6 flex flex-col">
        <Link
          href="/dashboard"
          className="text-xl font-bold mb-8 px-2 flex items-center gap-2"
        >
          <Sparkles className="w-5 h-5 text-emerald-600" />
          GG
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          <NavLink
            href="/dashboard/products"
            label="상품"
            icon={<Package className="w-4 h-4" />}
            active={pathname.startsWith("/dashboard/products")}
          />
          <NavLink
            href="/dashboard/orders"
            label="주문배송관리"
            icon={<Truck className="w-4 h-4" />}
            active={pathname.startsWith("/dashboard/orders")}
          />
          <NavLink
            href="/dashboard/sales"
            label="판매성과"
            icon={<BarChart3 className="w-4 h-4" />}
            active={pathname.startsWith("/dashboard/sales")}
          />
          <NavLink
            href="/dashboard/settings"
            label="내 정보"
            icon={<Settings className="w-4 h-4" />}
            active={pathname.startsWith("/dashboard/settings")}
          />
        </nav>
        <div className="mt-auto pt-4 border-t border-slate-200">
          <div className="px-2 text-xs text-slate-900 font-medium mb-2">
            {me.shop_name || me.username}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-slate-100 text-slate-900"
          >
            <LogOut className="w-4 h-4" /> 로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8 overflow-y-auto">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-900 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
