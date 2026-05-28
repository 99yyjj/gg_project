"""
리뷰 서비스 — DB CRUD + 상품별 통계 + AI 분석 트리거.

저장 구조:
    리뷰 본문 + AI 분석(감정/요약) + 사장님 답글이 reviews 테이블 한 row에 보관된다.

소유권:
    user_id 가 일치하지 않는 리뷰는 PermissionError 로 막는다.
    (라우터/예외 핸들러가 403 으로 변환)

AI 분석 트리거 흐름:
    1) 라우터가 BackgroundTasks 로 analyze_and_save(review_id) 를 예약
    2) DB에는 우선 sentiment='loading' 상태로 row 가 들어가 있음
    3) 백그라운드가 ai_service.analyze_review() 결과로 row 를 update
"""

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.review import Review
from app.schemas.review import (
    ReviewAIAnalysis,
    ReviewCreate,
    ReviewFilter,
    ReviewStats,
    ReviewUpdate,
)
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)


class ReviewService:
    def __init__(self, db: AsyncSession, ai: AIService):
        self.db = db
        self.ai = ai

    # ─────────────── 조회 ───────────────

    async def list_for_product(
        self,
        user_id: int,
        product_no: int,
        filter_: ReviewFilter = "all",
    ) -> list[Review]:
        """상품의 리뷰 목록.

        정렬 규칙(샘플 HTML 그대로):
          - 미처리(is_done=false) + 별점 1~2점 리뷰가 항상 맨 위
          - 그 다음은 id 역순(최신 우선)
        """
        stmt = select(Review).where(
            Review.user_id == user_id,
            Review.product_no == product_no,
        )
        if filter_ == "undone":
            stmt = stmt.where(Review.is_done.is_(False))
        elif filter_ in {"pos", "neu", "neg"}:
            stmt = stmt.where(Review.sentiment == filter_)

        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())
        rows.sort(
            key=lambda r: (
                # 미처리 + 1~2점 우선 (False=0이 앞에 오므로 not (urgent) 사용)
                not ((not r.is_done) and r.rating <= 2),
                -r.id,
            )
        )
        return rows

    async def compute_stats(self, user_id: int, product_no: int) -> ReviewStats:
        """통계 카드용 수치 4종 — 단순 count 쿼리 4번. 양은 적어 비용 무시 가능."""
        total_q = await self.db.execute(
            select(func.count(Review.id)).where(
                Review.user_id == user_id, Review.product_no == product_no
            )
        )
        total = int(total_q.scalar() or 0)
        if total == 0:
            return ReviewStats(total=0, avg_rating=None, urgent=0, done=0)

        avg_q = await self.db.execute(
            select(func.avg(Review.rating)).where(
                Review.user_id == user_id, Review.product_no == product_no
            )
        )
        avg_val = avg_q.scalar()
        avg_rating = round(float(avg_val), 1) if avg_val is not None else None

        urgent_q = await self.db.execute(
            select(func.count(Review.id)).where(
                Review.user_id == user_id,
                Review.product_no == product_no,
                Review.is_done.is_(False),
                Review.rating <= 2,
            )
        )
        urgent = int(urgent_q.scalar() or 0)

        done_q = await self.db.execute(
            select(func.count(Review.id)).where(
                Review.user_id == user_id,
                Review.product_no == product_no,
                Review.is_done.is_(True),
            )
        )
        done = int(done_q.scalar() or 0)

        return ReviewStats(total=total, avg_rating=avg_rating, urgent=urgent, done=done)

    async def get_owned(self, user_id: int, review_id: int) -> Review:
        """본인 소유 리뷰만 반환. 없으면 LookupError, 남의 것이면 PermissionError."""
        result = await self.db.execute(select(Review).where(Review.id == review_id))
        row = result.scalar_one_or_none()
        if row is None:
            raise LookupError("리뷰를 찾을 수 없습니다.")
        if row.user_id != user_id:
            raise PermissionError("본인이 등록한 리뷰만 수정/삭제할 수 있습니다.")
        return row

    # ─────────────── 변경 ───────────────

    async def create(
        self,
        user_id: int,
        product_no: int,
        payload: ReviewCreate,
        *,
        edit_token: Optional[str] = None,
    ) -> Review:
        """sentiment='loading' 으로 우선 insert. AI 분석은 백그라운드에서.

        edit_token 이 주어지면 함께 저장한다 (손님 공개 API 작성 흐름).
        """
        row = Review(
            user_id=user_id,
            product_no=product_no,
            author_name=payload.author_name.strip(),
            rating=payload.rating,
            content=payload.content.strip(),
            sentiment="loading",
            is_done=False,
            edit_token=edit_token,
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    @staticmethod
    def generate_edit_token() -> str:
        """손님 익명 수정용 64자 토큰. 충돌 확률 무시 가능."""
        return secrets.token_urlsafe(32)[:64]

    async def get_by_id_and_token(self, review_id: int, token: str) -> Review:
        """edit_token 일치 확인 후 row 반환. 손님 수정용."""
        result = await self.db.execute(select(Review).where(Review.id == review_id))
        row = result.scalar_one_or_none()
        if row is None:
            raise LookupError("리뷰를 찾을 수 없습니다.")
        # token 미설정(관리자 작성) 리뷰는 손님이 수정할 수 없다.
        if not row.edit_token or not secrets.compare_digest(row.edit_token, token):
            raise PermissionError("본인 리뷰만 수정할 수 있습니다.")
        return row

    async def apply_customer_edit(
        self,
        row: Review,
        *,
        author_name: Optional[str],
        rating: Optional[int],
        content: Optional[str],
    ) -> tuple[Review, bool]:
        """손님이 본인 리뷰를 수정. content/rating 이 바뀌면 재분석 필요(True) 반환."""
        needs_reanalysis = False
        if author_name is not None:
            row.author_name = author_name.strip()
        if rating is not None and rating != row.rating:
            row.rating = rating
            needs_reanalysis = True
        if content is not None and content.strip() != row.content:
            row.content = content.strip()
            needs_reanalysis = True

        if needs_reanalysis:
            # 새 본문/별점이 들어왔으니 분석 중 상태로 되돌린다.
            # admin_reply 는 손대지 않음 — 사장님이 수동 작성한 답글을 보존하기 위함.
            row.sentiment = "loading"
            row.summary = None
            row.ai_analyzed_at = None

        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row, needs_reanalysis

    async def update(
        self,
        user_id: int,
        review_id: int,
        payload: ReviewUpdate,
    ) -> Review:
        row = await self.get_owned(user_id, review_id)
        changed = False
        if payload.admin_reply is not None:
            row.admin_reply = payload.admin_reply.strip() or None
            changed = True
        if payload.is_done is not None:
            row.is_done = payload.is_done
            changed = True
        if changed:
            self.db.add(row)
            await self.db.commit()
            await self.db.refresh(row)
        return row

    async def delete(self, user_id: int, review_id: int) -> None:
        row = await self.get_owned(user_id, review_id)
        await self.db.delete(row)
        await self.db.commit()

    async def apply_ai_analysis(
        self,
        review_id: int,
        result: ReviewAIAnalysis,
    ) -> None:
        """이미 'loading' 으로 들어가 있는 row 에 분석 결과를 채워 넣는다."""
        result_q = await self.db.execute(select(Review).where(Review.id == review_id))
        row = result_q.scalar_one_or_none()
        if row is None:
            logger.warning(f"AI 분석 결과를 반영할 리뷰가 없음 (id={review_id})")
            return
        row.sentiment = result.sentiment
        row.summary = result.summary
        # 사장님이 아직 답글을 안 적었으면 초안을 미리 채워둔다.
        if not row.admin_reply:
            row.admin_reply = result.draft_reply
        row.ai_analyzed_at = datetime.now(timezone.utc)
        self.db.add(row)
        await self.db.commit()


async def analyze_and_save(
    session_maker: async_sessionmaker[AsyncSession],
    ai: AIService,
    review_id: int,
    content: str,
    rating: int,
) -> None:
    """
    BackgroundTasks 에서 호출되는 분리된 함수.

    라우터의 요청 스코프 세션은 응답 직후 닫히므로, 백그라운드에서는
    session_maker 로 새 세션을 열어 사용한다.
    """
    try:
        analysis = await ai.analyze_review(content, rating)
    except Exception as e:  # 외부 API 실패 → 별점 기반 폴백
        logger.error(f"AI 리뷰 분석 실패 → 폴백 (review_id={review_id}): {e}")
        analysis = ai._mock_analyze_review(content, rating)  # type: ignore[attr-defined]

    payload = ReviewAIAnalysis(
        sentiment=analysis.sentiment,  # type: ignore[arg-type]
        summary=analysis.summary,
        draft_reply=analysis.draft_reply,
    )

    async with session_maker() as session:
        try:
            service = ReviewService(session, ai)
            await service.apply_ai_analysis(review_id, payload)
        except Exception as e:
            logger.error(f"AI 분석 결과 저장 실패 (review_id={review_id}): {e}")
            await session.rollback()


__all__ = ["ReviewService", "analyze_and_save"]
