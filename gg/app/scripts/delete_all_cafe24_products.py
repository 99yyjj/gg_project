"""
Cafe24 쇼핑몰의 모든 상품을 삭제하는 일회성 스크립트.

실행:
    cd gg
    python -m app.scripts.delete_all_cafe24_products
"""

import asyncio
import base64
import sys

import httpx

from app.core.config import settings

BASE_URL = f"https://{settings.CAFE24_MALL_ID}.cafe24api.com/api/v2/admin"
HEADERS = {
    "Authorization": f"Bearer {settings.CAFE24_ACCESS_TOKEN}",
    "X-Cafe24-Api-Version": settings.CAFE24_API_VERSION,
    "Content-Type": "application/json",
}


async def fetch_all_product_nos(client: httpx.AsyncClient) -> list[int]:
    nos: list[int] = []
    offset = 0
    limit = 100
    while True:
        r = await client.get(
            f"{BASE_URL}/products",
            headers=HEADERS,
            params={"mall_id": settings.CAFE24_MALL_ID, "limit": limit, "offset": offset},
            timeout=30.0,
        )
        r.raise_for_status()
        items = r.json().get("products", [])
        if not items:
            break
        nos.extend(p["product_no"] for p in items)
        offset += limit
        print(f"  조회 중... {len(nos)}개")
    return nos


async def delete_product(client: httpx.AsyncClient, product_no: int) -> bool:
    r = await client.delete(
        f"{BASE_URL}/products/{product_no}",
        headers=HEADERS,
        params={"mall_id": settings.CAFE24_MALL_ID},
        timeout=15.0,
    )
    return r.status_code in (200, 204)


async def main() -> None:
    print(f"Cafe24 쇼핑몰: {settings.CAFE24_MALL_ID}")
    print("전체 상품 조회 중...")

    async with httpx.AsyncClient() as client:
        nos = await fetch_all_product_nos(client)

    if not nos:
        print("삭제할 상품이 없습니다.")
        return

    print(f"\n총 {len(nos)}개 상품 발견.")
    answer = input("전부 삭제하시겠습니까? (yes 입력 시 진행): ").strip()
    if answer != "yes":
        print("취소됨.")
        sys.exit(0)

    print("\n삭제 중...")
    async with httpx.AsyncClient() as client:
        for i, no in enumerate(nos, 1):
            ok = await delete_product(client, no)
            status = "✓" if ok else "✗"
            print(f"  [{i}/{len(nos)}] product_no={no} {status}")

    print(f"\n완료. {len(nos)}개 상품 삭제됨.")


if __name__ == "__main__":
    asyncio.run(main())
