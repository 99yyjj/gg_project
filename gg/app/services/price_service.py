import logging
import math

logger = logging.getLogger(__name__)

def calculate_reverse_price(original_price: float | None, fee_rate: float) -> int:
    """
    플랫폼 수수료율(fee_rate)을 고려하여,
    최종 정산 금액이 목표 금액(original_price)이 되도록 역산 판매가를 계산합니다.
    """
    # 가격 미입력(None) 또는 0 이하인 경우 0을 반환해 상위 로직이 가격 단계를 건너뛰도록 함
    if not original_price or original_price <= 0:
        return 0
        
    try:
        # 수수료율 안전장치 (예: 10% 수수료율은 0.1로 입력됨)
        if fee_rate >= 1.0 or fee_rate < 0:
            logger.warning(f"잘못된 수수료율 ({fee_rate}). 수수료 0%로 계산합니다.")
            fee_rate = 0.0

        # 역산 공식: 목표 금액 / (1 - 수수료율)
        reverse_price = original_price / (1.0 - fee_rate)
        
        # 10원 단위 올림 처리 (예: 1253원 -> 1260원)
        final_price = int(math.ceil(reverse_price / 10.0) * 10)
        
        return final_price

    except Exception as e:
        logger.error(f"가격 역산 중 오류 발생: {e}")
        return original_price