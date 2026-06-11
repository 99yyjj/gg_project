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
      → on_token_refresh 콜백으로 호출자(유저 row)에 새 토큰 저장
      → 원래 요청 1회 재시도

멀티테넌트:
    이 클라이언트는 더 이상 모듈-레벨 싱글톤이 아니다. 요청마다 해당 유저의
    토큰으로 인스턴스를 생성한다(app/deps.py의 make_cafe24_client). 토큰 갱신
    결과는 on_token_refresh 콜백을 통해 그 유저 row에만 반영되므로, 사장님 A의
    갱신이 사장님 B의 토큰을 덮어쓰지 않는다.

이 모듈이 하지 않는 것:
    - DB 저장, 비즈니스 로직 판단 → product_service.py의 역할
    - AI 생성 호출 → ai_service.py의 역할
"""

import base64
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.core.config import settings  # API 버전 등 앱 공통 설정

logger = logging.getLogger(__name__)

# 토큰 갱신 시 새 (access, refresh)를 호출자에게 알리는 콜백 타입
TokenRefreshCallback = Callable[[str, str], Awaitable[None]]


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

    def __init__(
        self,
        mall_id: str,
        access_token: str,
        refresh_token: str,
        on_token_refresh: TokenRefreshCallback | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        """
        클라이언트 초기화.

        Args:
            mall_id: 이 클라이언트가 바라보는 Cafe24 몰 ID (유저별로 다름).
            access_token / refresh_token: 해당 유저의 현재 토큰.
            on_token_refresh: 토큰 갱신 성공 시 새 (access, refresh)를 받아
                호출자(유저 row 등)에 저장하는 async 콜백. None이면 인스턴스
                메모리에만 반영된다.
            transport: 테스트에서 httpx.MockTransport 주입용. prod에서는 None.

        액세스 토큰을 인스턴스 변수로 관리한다.
        토큰 갱신 시 이 변수만 교체하면 이후 모든 요청에 새 토큰이 적용된다.
        (헤더 딕셔너리에 고정하면 갱신이 불가능하므로 변수로 분리)
        """
        self.mall_id = mall_id
        self.base_url = f"https://{mall_id}.cafe24api.com/api/v2/admin"
        self.token_url = f"https://{mall_id}.cafe24api.com/api/v2/oauth/token"

        # 현재 유효한 액세스 토큰을 인스턴스 변수로 보관
        # → 토큰 갱신 시 self._access_token 만 교체하면 됨
        self._access_token: str = access_token

        # 현재 리프레시 토큰 (갱신 후 새 값으로 교체)
        self._refresh_token: str = refresh_token

        # API 버전은 변경되지 않으므로 고정
        self._api_version = settings.CAFE24_API_VERSION

        # 토큰 갱신 결과를 호출자에게 전파하는 콜백 (유저 row 저장 등)
        self._on_token_refresh = on_token_refresh

        # 테스트용 transport 주입 (prod None)
        self._transport = transport

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
            2. on_token_refresh 콜백으로 호출자(유저 row)에 새 토큰을 전파

        Raises:
            httpx.HTTPStatusError: 토큰 갱신 API 자체가 실패한 경우 (refresh token도 만료됨)
        """
        logger.info("액세스 토큰 만료 감지 → refresh token으로 갱신 시도")

        # Basic Auth 헤더 생성
        # Cafe24는 client_id:client_secret 을 Base64로 인코딩해 Authorization에 담는다.
        credentials = f"{settings.CAFE24_CLIENT_ID}:{settings.CAFE24_CLIENT_SECRET}"
        encoded = base64.b64encode(credentials.encode()).decode()

        async with httpx.AsyncClient(transport=self._transport) as client:
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

        logger.info("액세스 토큰 갱신 성공")

        # 호출자(유저 row 등)에 새 토큰 전파 → 이 유저의 토큰만 갱신된다.
        if self._on_token_refresh is not None:
            await self._on_token_refresh(new_access_token, new_refresh_token)

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
        async with httpx.AsyncClient(transport=self._transport) as client:
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
            params={"mall_id": self.mall_id},
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
                "mall_id": self.mall_id,
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
            "mall_id": self.mall_id,
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
                "mall_id": self.mall_id,
                "limit": limit,
                "offset": offset,
            },
            timeout=15.0,
        )

        data = response.json()
        categories = data.get("categories", [])
        logger.info(f"카테고리 {len(categories)}개 수신")
        return categories

    # =========================================================
    # 주문 조회 (mall.read_order 권한 필요)
    # =========================================================

    async def count_orders(
        self,
        start_date: str,
        end_date: str,
        order_status: str | None = None,
    ) -> int:
        """
        기간 내 주문 건수를 조회한다.

        Cafe24 API: GET /orders/count
        주문 목록 페이지네이션의 전체 개수를 구할 때 사용한다.

        Args:
            start_date / end_date: 조회 기간 (YYYY-MM-DD). 카페24는 기간 지정 필수.
            order_status: 특정 주문상태 코드로 필터 (예: N00, N10...). None이면 전체.
        """
        params: dict[str, Any] = {
            "mall_id": self.mall_id,
            "start_date": start_date,
            "end_date": end_date,
        }
        if order_status:
            params["order_status"] = order_status

        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/orders/count",
            params=params,
            timeout=15.0,
        )
        return int(response.json().get("count", 0))

    async def get_orders(
        self,
        start_date: str,
        end_date: str,
        order_status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        기간 내 주문 목록을 조회한다.

        Cafe24 API: GET /orders
        한 번에 최대 1000개. embed로 주문자(buyer)·수령자(receivers)·품목(items)을
        함께 받아 별도 호출 없이 화면에 필요한 정보를 모은다.

        Args:
            start_date / end_date: 조회 기간 (YYYY-MM-DD). 카페24는 기간 지정 필수.
            order_status: 주문상태 코드 필터. None이면 전체.
            limit: 한 번에 가져올 주문 수 (최대 1000, Cafe24 제한).
            offset: 건너뛸 주문 수 (페이지네이션용).

        Returns:
            주문 딕셔너리의 리스트.
        """
        params: dict[str, Any] = {
            "mall_id": self.mall_id,
            "start_date": start_date,
            "end_date": end_date,
            "limit": limit,
            "offset": offset,
            "embed": "items,buyer,receivers",
        }
        if order_status:
            params["order_status"] = order_status

        logger.info(
            f"Cafe24 주문 목록 요청: {start_date}~{end_date}, "
            f"limit={limit}, offset={offset}, status={order_status}"
        )

        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/orders",
            params=params,
            timeout=30.0,
        )

        orders = response.json().get("orders", [])
        logger.info(f"Cafe24에서 주문 {len(orders)}건 수신")
        return orders

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

    # ─────────── 상품 검색 키워드(태그) ───────────
    # Cafe24 Products tags 서브리소스: GET/POST /products/{product_no}/tags
    # (태그는 {tag_no, tag_name} 객체로 오가며, 생성 시 tag_name 문자열 배열을 보낸다)

    @staticmethod
    def _extract_tag_names(raw_tags: Any) -> list[str]:
        out: list[str] = []
        for t in raw_tags or []:
            if isinstance(t, dict) and t.get("tag_name"):
                out.append(str(t["tag_name"]))
            elif isinstance(t, str) and t.strip():
                out.append(t.strip())
        return out

    async def get_product_tags(self, product_no: int) -> list[str]:
        """상품의 검색 키워드(태그) 목록 조회."""
        response = await self._request_with_auto_refresh(
            method="get",
            url=f"{self.base_url}/products/{product_no}/tags",
            params={"mall_id": self.mall_id},
            timeout=15.0,
        )
        return self._extract_tag_names(response.json().get("tags"))

    async def set_product_tags(self, product_no: int, tags: list[str]) -> list[str]:
        """상품에 검색 키워드(태그)를 등록한다. tag_name 문자열 배열을 전송."""
        clean = [t.strip() for t in (tags or []) if t and t.strip()]
        if not clean:
            return []
        request_body = {"request": {"shop_no": 1, "tags": clean}}
        response = await self._request_with_auto_refresh(
            method="post",
            url=f"{self.base_url}/products/{product_no}/tags",
            json=request_body,
            timeout=20.0,
        )
        return self._extract_tag_names(response.json().get("tags")) or clean

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
            params={"mall_id": self.mall_id},
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
            path = f"https://{self.mall_id}.cafe24.com{path}"

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

        # Cafe24 image_upload_type 유효값은 "A" / "B" 뿐 ("C"는 422 invalid).
        #   A: 대표 이미지 한 장으로 목록/축소 등 나머지 사이즈를 Cafe24가 자동 생성
        #   B: 보낸 슬롯(대표/목록)을 직접 등록
        # 목록 이미지를 따로 지정했을 때만 B, 그 외엔 A(자동 생성)로 둔다.
        body: dict[str, Any] = {
            "shop_no": 1,
            "image_upload_type": "B" if list_bytes is not None else "A",
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
                image_block[key] = f"https://{self.mall_id}.cafe24.com{url}"

        logger.info(f"Cafe24 상품 이미지 부착 완료: product_no={product_no}")
        return image_block

    # =========================================================
    # 추가(상세) 이미지 — Cafe24 /products/{product_no}/additionalimages
    #
    # 주의: Cafe24 추가이미지 API의 요청/응답 키와 번호 체계는 변동될 수 있어
    #       파싱은 가능한 한 관대하게 처리한다. (image_url 추출은 _extract_image_url)
    # =========================================================

    def _abs_url(self, path: str | None) -> str | None:
        if not path:
            return None
        if path.startswith("http"):
            return path
        return f"https://{self.mall_id}.cafe24.com{path}"

    def _extract_image_url(self, item: Any) -> str | None:
        """추가이미지 응답 요소(dict/str)에서 표시용 URL을 최대한 뽑아낸다."""
        if isinstance(item, str):
            return self._abs_url(item)
        if isinstance(item, dict):
            for key in ("big", "medium", "small", "image_url", "path", "image"):
                url = item.get(key)
                if url:
                    return self._abs_url(url)
        return None

    async def get_additional_images(self, product_no: int) -> list[str]:
        """추가 이미지 URL 목록.

        Cafe24엔 GET /products/{no}/additionalimages 가 없다(404 "No API found").
        추가 이미지는 상품 리소스의 필드이므로 GET /products/{no} 의
        additional_image 에서 읽는다.
        """
        product = await self.get_product(product_no)
        items = product.get("additional_image") or []
        urls = [self._extract_image_url(it) for it in items]
        return [u for u in urls if u]

    async def create_additional_images(
        self, product_no: int, images: list[bytes]
    ) -> list[str]:
        """POST /products/{product_no}/additionalimages — 추가 이미지 다중 등록."""
        if not images:
            return []
        # Cafe24는 additional_image 를 base64 문자열의 "배열"로 받는다.
        # (객체 {"image": ...} 로 감싸면 422: "Only Base64 encoding format is supported")
        body = {
            "shop_no": 1,
            "additional_image": [
                base64.b64encode(b).decode("utf-8") for b in images
            ],
        }
        logger.info(
            f"Cafe24 추가이미지 등록 요청: product_no={product_no}, count={len(images)}"
        )
        response = await self._request_with_auto_refresh(
            method="post",
            url=f"{self.base_url}/products/{product_no}/additionalimages",
            json={"request": body},
            timeout=60.0,
        )
        data = response.json()
        block = data.get("additionalimage") or data.get("additionalimages") or {}
        items = block.get("additional_image") if isinstance(block, dict) else block
        urls = [self._extract_image_url(it) for it in (items or [])]
        return [u for u in urls if u]

    async def update_additional_image(
        self, product_no: int, additional_image_no: int, image_bytes: bytes
    ) -> str | None:
        """PUT /products/{product_no}/additionalimages/{no} — 추가 이미지 한 장 교체."""
        body = {
            "shop_no": 1,
            "image": base64.b64encode(image_bytes).decode("utf-8"),
        }
        logger.info(
            f"Cafe24 추가이미지 수정 요청: product_no={product_no}, no={additional_image_no}"
        )
        response = await self._request_with_auto_refresh(
            method="put",
            url=f"{self.base_url}/products/{product_no}/additionalimages/{additional_image_no}",
            json={"request": body},
            timeout=60.0,
        )
        data = response.json()
        block = data.get("additionalimage") or {}
        return self._extract_image_url(block)

    async def delete_additional_image(
        self, product_no: int, additional_image_no: int
    ) -> bool:
        """DELETE /products/{product_no}/additionalimages/{no} — 추가 이미지 삭제."""
        logger.info(
            f"Cafe24 추가이미지 삭제 요청: product_no={product_no}, no={additional_image_no}"
        )
        await self._request_with_auto_refresh(
            method="delete",
            url=f"{self.base_url}/products/{product_no}/additionalimages/{additional_image_no}",
            params={"mall_id": self.mall_id},
            timeout=15.0,
        )
        return True
