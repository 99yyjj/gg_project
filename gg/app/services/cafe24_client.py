"""
[파일 역할]
Cafe24 Admin API와 실제로 HTTP 통신을 담당하는 클라이언트 모듈.

이 모듈의 책임:
    - Cafe24 API 엔드포인트에 GET/PUT/POST 요청을 보낸다.
    - 인증 헤더(Authorization, X-Cafe24-Api-Version)를 자동으로 추가한다.
    - 액세스 토큰이 만료(401 응답)되면 refresh token으로 자동 갱신 후 재시도한다.
    - 응답을 Python dict로 파싱해서 반환한다.

토큰 갱신 흐름:
    API 요청
      → 401 응답 수신
      → POST /oauth/token (refresh_token grant)
      → 새 access_token + refresh_token 수신
      → .env 파일 업데이트 (서버 재시작 시에도 유효한 토큰 유지)
      → 원래 요청 1회 재시도

이 모듈이 하지 않는 것:
    - DB 저장, 비즈니스 로직 판단 → product_service.py의 역할
    - AI 생성 호출 → ai_service.py의 역할
"""

import base64
import logging
import re
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings  # mutable — 갱신 시 직접 속성 교체 가능

logger = logging.getLogger(__name__)

# .env 파일 경로 (프로젝트 루트 기준)
# cafe24_client.py 위치: app/services/ → 루트까지 2단계 위
ENV_FILE_PATH = Path(__file__).parent.parent.parent / ".env"

# 모듈-레벨 싱글톤: 갱신된 토큰이 요청 간에 유지되도록 단일 인스턴스를 공유
_singleton: "Cafe24Client | None" = None


def get_cafe24_client() -> "Cafe24Client":
    global _singleton
    if _singleton is None:
        _singleton = Cafe24Client()
    return _singleton


class Cafe24Client:
    """
    Cafe24 Admin API HTTP 클라이언트 클래스.

    액세스 토큰 자동 갱신 기능을 내장한다.
    토큰이 만료되면 refresh token으로 새 토큰을 발급받고,
    .env 파일을 업데이트한 뒤 원래 요청을 1회 재시도한다.

    Cafe24 API 기본 URL 구조:
        https://{mall_id}.cafe24api.com/api/v2/admin/{endpoint}

    토큰 갱신 URL:
        https://{mall_id}.cafe24api.com/api/v2/oauth/token
    """

    def __init__(self):
        """
        클라이언트 초기화.

        액세스 토큰을 인스턴스 변수로 관리한다.
        토큰 갱신 시 이 변수만 업데이트하면 이후 모든 요청에 새 토큰이 적용된다.
        (헤더 딕셔너리에 고정하면 갱신이 불가능하므로 변수로 분리)
        """
        self.base_url = f"https://{settings.CAFE24_MALL_ID}.cafe24api.com/api/v2/admin"
        self.token_url = f"https://{settings.CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token"

        # 현재 유효한 액세스 토큰을 인스턴스 변수로 보관
        # → 토큰 갱신 시 self._access_token 만 교체하면 됨
        self._access_token: str = settings.CAFE24_ACCESS_TOKEN

        # 현재 리프레시 토큰 (갱신 후 새 값으로 교체)
        self._refresh_token: str = settings.CAFE24_REFRESH_TOKEN

        # API 버전은 변경되지 않으므로 고정
        self._api_version = settings.CAFE24_API_VERSION

    def _build_headers(self) -> dict[str, str]:
        """
        API 요청에 사용할 공통 헤더를 매번 새로 만들어 반환하는 내부 함수.

        __init__에서 헤더를 한 번만 만들면 토큰 갱신 후에도 이전 토큰이
        헤더에 남아있는 문제가 생긴다.
        이 함수를 호출할 때마다 self._access_token의 현재값을 읽으므로
        갱신된 토큰이 자동으로 반영된다.

        Returns:
            Authorization, X-Cafe24-Api-Version, Content-Type이 담긴 헤더 딕셔너리
        """
        return {
            "Authorization": f"Bearer {self._access_token}",
            "X-Cafe24-Api-Version": self._api_version,
            "Content-Type": "application/json",
        }

    async def _refresh_access_token(self) -> None:
        """
        Cafe24 OAuth2 refresh token grant로 새 액세스 토큰을 발급받는 함수.

        Cafe24 토큰 갱신 API 스펙:
            - URL: POST https://{mall_id}.cafe24api.com/api/v2/oauth/token
            - 인증: HTTP Basic Auth (client_id:client_secret 을 Base64 인코딩)
            - Body: grant_type=refresh_token&refresh_token={refresh_token}
            - 응답: {"access_token": "...", "refresh_token": "...", "expires_at": "..."}

        갱신 성공 시:
            1. self._access_token, self._refresh_token 을 새 값으로 교체
            2. .env 파일의 토큰 값도 덮어씀 → 서버 재시작 후에도 유효한 토큰 유지

        Raises:
            httpx.HTTPStatusError: 토큰 갱신 API 자체가 실패한 경우 (refresh token도 만료됨)
        """
        logger.info("액세스 토큰 만료 감지 → refresh token으로 갱신 시도")

        # Basic Auth 헤더 생성
        # Cafe24는 client_id:client_secret 을 Base64로 인코딩해 Authorization에 담는다.
        credentials = f"{settings.CAFE24_CLIENT_ID}:{settings.CAFE24_CLIENT_SECRET}"
        encoded = base64.b64encode(credentials.encode()).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url=self.token_url,
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                # form 데이터로 전송 (JSON이 아님 - Cafe24 OAuth2 스펙)
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                },
                timeout=15.0,
            )

            # 갱신 실패 시 (refresh token도 만료됐거나 잘못된 경우)
            # 이 경우엔 Cafe24 개발자 센터에서 수동으로 새 토큰을 발급받아야 한다.
            response.raise_for_status()

        token_data = response.json()

        # 새로 받은 토큰으로 인스턴스 변수 교체
        new_access_token = token_data["access_token"]
        new_refresh_token = token_data.get("refresh_token", self._refresh_token)

        self._access_token = new_access_token
        self._refresh_token = new_refresh_token

        # 메모리의 settings도 즉시 갱신 → 만약 싱글톤이 재생성될 경우에도 최신 토큰 사용
        settings.CAFE24_ACCESS_TOKEN = new_access_token
        settings.CAFE24_REFRESH_TOKEN = new_refresh_token

        logger.info("액세스 토큰 갱신 성공")

        # .env 파일에 새 토큰을 저장 → 서버 재시작 후에도 유효한 토큰 유지
        self._update_env_file(new_access_token, new_refresh_token)

    def _update_env_file(self, new_access_token: str, new_refresh_token: str) -> None:
        """
        .env 파일의 토큰 값을 새 값으로 덮어쓰는 내부 함수.

        왜 .env를 직접 수정하는가?
            서버가 재시작되면 settings 객체가 다시 .env를 읽는다.
            갱신된 토큰을 .env에 저장하지 않으면 재시작 후 만료된 토큰이 다시 로드된다.

        동작 방식:
            정규식으로 CAFE24_ACCESS_TOKEN=... 줄을 찾아 새 값으로 교체한다.
            파일 전체를 읽어 치환 후 다시 쓰는 단순한 방식이므로 성능보다 안정성 우선.

        Args:
            new_access_token: 새로 발급받은 액세스 토큰
            new_refresh_token: 새로 발급받은 리프레시 토큰
        """
        if not ENV_FILE_PATH.exists():
            logger.warning(f".env 파일을 찾을 수 없어 토큰 저장을 건너뜀: {ENV_FILE_PATH}")
            return

        try:
            content = ENV_FILE_PATH.read_text(encoding="utf-8")

            # 정규식으로 해당 줄만 교체
            # re.MULTILINE: ^ $ 가 각 줄의 시작/끝에 매칭되도록 설정
            content = re.sub(
                r"^CAFE24_ACCESS_TOKEN=.*$",
                f"CAFE24_ACCESS_TOKEN={new_access_token}",
                content,
                flags=re.MULTILINE,
            )
            content = re.sub(
                r"^CAFE24_REFRESH_TOKEN=.*$",
                f"CAFE24_REFRESH_TOKEN={new_refresh_token}",
                content,
                flags=re.MULTILINE,
            )

            ENV_FILE_PATH.write_text(content, encoding="utf-8")
            logger.info(".env 파일 토큰 업데이트 완료")

        except Exception as e:
            # .env 업데이트 실패는 치명적이지 않음 (인메모리 토큰은 이미 갱신됨)
            # 단, 서버 재시작 시 다시 만료된 토큰이 로드될 수 있다는 경고만 남김
            logger.warning(f".env 파일 업데이트 실패 (다음 재시작 시 토큰 재갱신 필요): {e}")

    def update_tokens(self, access_token: str, refresh_token: str) -> None:
        """OAuth 콜백 등 외부에서 새 토큰을 주입할 때 사용."""
        self._access_token = access_token
        self._refresh_token = refresh_token
        settings.CAFE24_ACCESS_TOKEN = access_token
        settings.CAFE24_REFRESH_TOKEN = refresh_token
        self._update_env_file(access_token, refresh_token)

    async def _request_with_auto_refresh(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """
        HTTP 요청을 보내고, 401(토큰 만료) 응답 시 자동으로 토큰을 갱신 후 재시도하는 함수.

        이 함수를 거치면 get_products, update_product 등 모든 API 메서드가
        토큰 만료를 신경 쓰지 않아도 된다. (관심사 분리)

        재시도 횟수를 1회로 제한하는 이유:
            refresh token도 만료됐다면 무한 루프에 빠지므로 1회만 시도한다.

        Args:
            method: HTTP 메서드 문자열 ("get", "put", "post")
            url: 요청 URL
            **kwargs: httpx 요청 옵션 (params, json, timeout 등)

        Returns:
            성공한 httpx.Response 객체

        Raises:
            httpx.HTTPStatusError: 토큰 갱신 후 재시도에도 실패한 경우
        """
        async with httpx.AsyncClient() as client:
            # 첫 번째 요청 시도
            response = await client.request(
                method=method,
                url=url,
                headers=self._build_headers(),  # 매번 최신 토큰으로 헤더 생성
                **kwargs,
            )

            # 401(Unauthorized): 액세스 토큰이 만료됐을 가능성이 높음
            if response.status_code == 401:
                logger.warning("401 응답 수신 → 토큰 갱신 후 재시도")

                # 토큰 갱신 (self._access_token, self._refresh_token 업데이트)
                await self._refresh_access_token()

                # 갱신된 토큰으로 동일 요청 1회 재시도
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self._build_headers(),  # 갱신된 토큰이 담긴 헤더
                    **kwargs,
                )

            # 재시도 후에도 에러면 응답 본문 로깅 후 예외 발생
            if response.is_error:
                logger.error(f"Cafe24 API 오류 [{response.status_code}] {method.upper()} {url}")
                logger.error(f"Cafe24 오류 응답 본문: {response.text}")
            response.raise_for_status()
            return response

    # =========================================================
    # 실제 API 메서드들 (내부적으로 _request_with_auto_refresh 사용)
    # =========================================================

    async def get_product(self, product_no: int) -> dict:
        """Cafe24에서 상품 단건 조회 (카테고리 등 상세 정보 포함)."""
        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/products/{product_no}",
            params={"mall_id": settings.CAFE24_MALL_ID},
            timeout=15.0,
        )
        return response.json().get("product", {})

    async def get_products_by_nos(self, product_nos: list[int]) -> list[dict[str, Any]]:
        """특정 product_no 목록에 해당하는 상품만 Cafe24에서 조회."""
        if not product_nos:
            return []
        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/products",
            params={
                "product_no": ",".join(str(n) for n in product_nos),
                "mall_id": settings.CAFE24_MALL_ID,
                "limit": len(product_nos),
            },
            timeout=30.0,
        )
        return response.json().get("products", [])

    async def get_products(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Cafe24에서 상품 목록을 가져오는 함수.

        Cafe24 API: GET /products
        한 번에 최대 100개까지 가져올 수 있으며, offset으로 페이지를 넘긴다.

        Args:
            limit: 한 번에 가져올 상품 수 (최대 100, Cafe24 제한)
            offset: 건너뛸 상품 수 (페이지네이션용)

        Returns:
            상품 딕셔너리의 리스트
        """
        params = {
            "limit": limit,
            "offset": offset,
            "mall_id": settings.CAFE24_MALL_ID,
            "display": "T",  # 진열 중인 상품만 가져옴
        }

        logger.info(f"Cafe24 상품 목록 요청: limit={limit}, offset={offset}")

        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/products",
            params=params,
            timeout=30.0,
        )

        data = response.json()
        products = data.get("products", [])

        logger.info(f"Cafe24에서 상품 {len(products)}개 수신")
        return products

    async def get_all_products(self) -> list[dict[str, Any]]:
        """
        Cafe24의 전체 상품을 페이지네이션으로 모두 가져오는 함수.

        Cafe24 API는 한 번에 최대 100개까지만 반환하므로,
        빈 결과가 나올 때까지 offset을 100씩 늘려가며 반복 요청한다.

        Returns:
            전체 상품 딕셔너리 리스트
        """
        all_products: list[dict[str, Any]] = []
        offset = 0
        limit = 100

        logger.info("Cafe24 전체 상품 동기화 시작 (페이지네이션)")

        while True:
            products = await self.get_products(limit=limit, offset=offset)

            if not products:
                logger.info(f"페이지네이션 완료. 총 {len(all_products)}개 상품 수집")
                break

            all_products.extend(products)
            offset += limit
            logger.debug(f"현재까지 수집: {len(all_products)}개 (다음 offset: {offset})")

        return all_products

    async def get_categories(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        Cafe24에 등록된 카테고리 목록을 가져오는 함수.

        Cafe24 API: GET /categories
        상품 등록 시 category_no 선택용으로 사용한다.
        """
        logger.info(f"Cafe24 카테고리 목록 요청: limit={limit}, offset={offset}")

        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/categories",
            params={
                "mall_id": settings.CAFE24_MALL_ID,
                "limit": limit,
                "offset": offset,
            },
            timeout=15.0,
        )

        data = response.json()
        categories = data.get("categories", [])
        logger.info(f"카테고리 {len(categories)}개 수신")
        return categories

    async def create_product(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Cafe24에 신규 상품을 등록하는 함수.

        Cafe24 API: POST /products
        AI가 생성한 상세설명을 포함한 상품 정보를 Cafe24에 새로 등록할 때 사용한다.

        Args:
            payload: 등록할 상품 정보 딕셔너리
                     (product_name, price, description, display, selling 등)

        Returns:
            Cafe24 API가 반환한 생성된 상품 정보 (product_no 포함)
        """
        logger.info(f"Cafe24 신규 상품 등록 요청: {payload.get('product_name')}")

        request_body = {"request": {"shop_no": 1, **payload}}

        response = await self._request_with_auto_refresh(
            method="post",
            url=f"{self.base_url}/products",
            json=request_body,
            timeout=30.0,
        )

        data = response.json()
        created_product = data.get("product", {})

        logger.info(f"Cafe24 신규 상품 등록 완료: product_no={created_product.get('product_no')}")
        return created_product

    async def update_product(
        self,
        product_no: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Cafe24 PUT /products/{product_no} — 상품 정보 부분 업데이트.
        """
        logger.info(f"Cafe24 상품 업데이트 요청: product_no={product_no}")

        request_body = {"request": {"shop_no": 1, **payload}}

        response = await self._request_with_auto_refresh(
            method="put",
            url=f"{self.base_url}/products/{product_no}",
            json=request_body,
            timeout=30.0,
        )

        data = response.json()
        updated_product = data.get("product", {})

        logger.info(f"Cafe24 상품 업데이트 완료: product_no={product_no}")
        return updated_product

    async def delete_product(self, product_no: int) -> bool:
        """
        Cafe24 DELETE /products/{product_no} — 상품 삭제.

        Returns:
            True (삭제 성공)
        Raises:
            httpx.HTTPStatusError: 토큰 갱신 후에도 실패한 경우
        """
        logger.info(f"Cafe24 상품 삭제 요청: product_no={product_no}")

        await self._request_with_auto_refresh(
            method="delete",
            url=f"{self.base_url}/products/{product_no}",
            params={"mall_id": settings.CAFE24_MALL_ID},
            timeout=15.0,
        )

        logger.info(f"Cafe24 상품 삭제 완료: product_no={product_no}")
        return True

    async def upload_image(self, file_bytes: bytes, filename: str) -> str:
        """
        Cafe24 POST /products/images — 상품 번호 없는 이미지 업로드 (CDN에만 올림).

        Cafe24는 multipart가 아니라 JSON + base64 방식으로 이미지를 받는다.
        현재는 사용되지 않지만, 향후 미부착 업로드가 필요할 때를 위해 보존.
        """
        logger.info(f"Cafe24 이미지 업로드 요청: filename={filename}, size={len(file_bytes)}B")

        image_base64 = base64.b64encode(file_bytes).decode("utf-8")

        response = await self._request_with_auto_refresh(
            method="post",
            url=f"{self.base_url}/products/images",
            json={
                "request": {
                    "shop_no": 1,
                    "image_data": image_base64,
                    "image_name": filename,
                }
            },
            timeout=60.0,
        )

        data = response.json()

        image_block = data.get("image") or {}
        if not image_block:
            images = data.get("images") or []
            if images:
                image_block = images[0]

        path = (
            image_block.get("image_path")
            or image_block.get("big_image_path")
            or image_block.get("path")
        )
        if path and not path.startswith("http"):
            path = f"https://{settings.CAFE24_MALL_ID}.cafe24.com{path}"

        if not path:
            raise ValueError(f"Cafe24 이미지 업로드 응답에서 path를 찾을 수 없음: {data}")

        logger.info(f"Cafe24 이미지 업로드 완료: path={path}")
        return path

    async def upload_product_image(
        self,
        product_no: int,
        detail_bytes: bytes | None,
        list_bytes: bytes | None,
    ) -> dict[str, Any]:
        """
        Cafe24 POST /products/{product_no}/images — 특정 상품에 대표/목록 이미지 부착.

        상품 생성/수정 직후 이 메서드를 호출해 product_no에 이미지를 묶는다.

        image_upload_type:
            - "A" (자동): detail_image 한 장만 받아 list/tiny/small 사이즈를 Cafe24가
              자동 생성. list_image를 별도로 보내도 무시되고 detail로 덮어쓰여 둘이
              같은 이미지가 된다. 또 list_image 필드가 빠지면 일부 케이스에서 4xx.
            - "C" (사용자): 각 이미지를 독립적으로 업로드. 보낸 슬롯만 갱신되고
              나머지는 유지/공란. 대표·목록을 다른 이미지로 쓰고 싶거나 한쪽만
              올리고 싶을 때 사용.

        프론트는 대표·목록을 별도 파일로 받으므로 "C"가 맞다.

        Returns:
            응답의 image 블록 (갱신된 detail_image / list_image URL 등 포함).
        """
        if detail_bytes is None and list_bytes is None:
            return {}

        body: dict[str, Any] = {
            "shop_no": 1,
            "image_upload_type": "C",
        }
        if detail_bytes is not None:
            body["detail_image"] = base64.b64encode(detail_bytes).decode("utf-8")
        if list_bytes is not None:
            body["list_image"] = base64.b64encode(list_bytes).decode("utf-8")

        logger.info(
            f"Cafe24 상품 이미지 부착 요청: product_no={product_no}, "
            f"detail={'O' if detail_bytes else 'X'}, list={'O' if list_bytes else 'X'}"
        )

        response = await self._request_with_auto_refresh(
            method="post",
            url=f"{self.base_url}/products/{product_no}/images",
            json={"request": body},
            timeout=60.0,
        )

        data = response.json()
        image_block = data.get("image") or {}

        for key in ("detail_image", "list_image"):
            url = image_block.get(key)
            if url and not url.startswith("http"):
                image_block[key] = f"https://{settings.CAFE24_MALL_ID}.cafe24.com{url}"

        logger.info(f"Cafe24 상품 이미지 부착 완료: product_no={product_no}")
        return image_block
