"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tokenStore } from "@/lib/auth-storage";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const target = tokenStore.getAccess() ? "/dashboard" : "/login";
    router.replace(target);
  }, [router]);
  return (
    <main className="flex-1 flex items-center justify-center text-slate-900">
      이동 중...
    </main>
  );
}
