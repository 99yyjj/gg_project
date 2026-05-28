"use client";

// 손님 화면용 장바구니 — 백엔드 없이 localStorage에 보관한다.
// 쇼핑몰(username)별로 분리 저장하고, useSyncExternalStore로 여러 컴포넌트
// (상품 페이지 / 헤더 배지 / 장바구니 페이지)가 같은 상태를 실시간 공유한다.

import { useCallback, useSyncExternalStore } from "react";

export type CartItem = {
  product_no: number;
  product_name: string;
  price: number | null;
  detail_image: string | null;
  qty: number;
};

const PREFIX = "gg-cart:";
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();

// useSyncExternalStore는 같은 값이면 같은 참조를 돌려줘야 하므로 username별 캐시.
const cache = new Map<string, { raw: string; parsed: CartItem[] }>();

function storageKey(username: string) {
  return `${PREFIX}${username}`;
}

function getSnapshot(username: string): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(storageKey(username)) ?? "[]";
  const cached = cache.get(username);
  if (cached && cached.raw === raw) return cached.parsed;
  let parsed: CartItem[];
  try {
    const v = JSON.parse(raw);
    parsed = Array.isArray(v) ? (v as CartItem[]) : [];
  } catch {
    parsed = [];
  }
  cache.set(username, { raw, parsed });
  return parsed;
}

function persist(username: string, items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(username), JSON.stringify(items));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // 다른 탭에서의 변경도 반영
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export type CartProductInput = Omit<CartItem, "qty">;

export function addToCart(username: string, product: CartProductInput, qty = 1) {
  const items = getSnapshot(username).slice();
  const idx = items.findIndex((i) => i.product_no === product.product_no);
  if (idx >= 0) {
    items[idx] = { ...items[idx], qty: items[idx].qty + qty };
  } else {
    items.push({ ...product, qty });
  }
  persist(username, items);
}

export function setQty(username: string, productNo: number, qty: number) {
  const current = getSnapshot(username);
  const next =
    qty <= 0
      ? current.filter((i) => i.product_no !== productNo)
      : current.map((i) => (i.product_no === productNo ? { ...i, qty } : i));
  persist(username, next);
}

export function removeFromCart(username: string, productNo: number) {
  persist(
    username,
    getSnapshot(username).filter((i) => i.product_no !== productNo)
  );
}

export function clearCart(username: string) {
  persist(username, []);
}

export function useCart(username: string) {
  const items = useSyncExternalStore(
    subscribe,
    useCallback(() => getSnapshot(username), [username]),
    () => EMPTY
  );
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0);
  return {
    items,
    count,
    total,
    add: (product: CartProductInput, qty?: number) =>
      addToCart(username, product, qty),
    setQty: (productNo: number, qty: number) => setQty(username, productNo, qty),
    remove: (productNo: number) => removeFromCart(username, productNo),
    clear: () => clearCart(username),
  };
}
