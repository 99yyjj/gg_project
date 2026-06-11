# ==========================================
# 1. 자동 카테고리 매칭 기능 (Auto-Classification)
# ==========================================
def get_recommended_category(detected_tags, cafe24_categories):
    """
    기존 AI가 추출한 태그 목록과 Cafe24 상점의 실제 카테고리 목록을 비교하여 
    가장 연관성이 높은 Cafe24 카테고리 ID(category_no)를 추천합니다.
    """
    best_category_no = None
    max_matches = 0
    
    # Cafe24 카테고리 데이터 형식 예시: 
    # [{"category_no": 12, "category_name": "패션의류 > 상의 > 맨투맨"}, ...]
    for cat in cafe24_categories:
        cat_name = cat.get('category_name', '').lower()
        match_count = 0
        
        # 태그가 카테고리 명에 포함되는지 확인 (단순 단어 매칭 기반 가속)
        for tag in detected_tags:
            if tag.lower() in cat_name:
                match_count += 1
                
        # 가장 매칭이 많이 된 카테고리를 선정
        if match_count > max_matches:
            max_matches = match_count
            best_category_no = cat.get('category_no')
            
    # 매칭되는 카테고리가 전혀 없다면 기본값(예: 분류되지 않은 상품 카테고리 번호) 반환
    if best_category_no is None:
        best_category_no = 1 # Cafe24의 루트 혹은 기본 카테고리 번호 지정
        
    return best_category_no


# ==========================================
# 2. 스마트 마진 역산 및 판매가 제안 (Pricing)
# ==========================================
def calculate_smart_pricing(cost_price, target_margin_rate=0.3):
    """
    셀러가 입력한 원가(cost_price)와 희망 마진율을 기반으로
    소비자 눈을 사로잡을 수 있는 '소비자가'와 '최종 판매가'를 계산합니다.
    (Cafe24 API 규격에 맞춰 할인 구조로 인풋을 분할 제공)
    """
    if cost_price <= 0:
        return {"error": "원가는 0원보다 커야 합니다."}

    # 1. 희망 마진율을 확보하기 위한 기준 판매가 계산
    # 공식: 원가 / (1 - 마진율)
    base_selling_price = cost_price / (1 - target_margin_rate)
    
    # 2. 커머스 꿀팁: 원래 비싼 가격인데 '즉시 할인'해 주는 느낌을 주기 위해 소비자가를 뻥튀기
    # 소비자가는 기준 판매가보다 약 25% 높게 책정
    calculated_consumer_price = base_selling_price * 1.25
    
    # 3. 금액 단위를 한국 정서에 맞게 백의 자리에서 올림/버림 처리하여 'XX,900원' 형태로 보정
    # 예: 28,400원 -> 28,900원 / 35,100원 -> 35,900원 (가격이 저렴해 보이는 효과)
    final_selling_price = (int(base_selling_price) // 1000) * 1000 + 900
    final_consumer_price = (int(calculated_consumer_price) // 1000) * 1000 + 900
    
    # 4. 실제 적용된 할인율 역산
    actual_discount_rate = round(((final_consumer_price - final_selling_price) / final_consumer_price) * 100)
    
    return {
        "cost_price": int(cost_price),               # 공급 원가
        "consumer_price": final_consumer_price,     # Cafe24 [소비자가] 항목에 주입할 값
        "product_price": final_selling_price,       # Cafe24 [판매가] 항목에 주입할 값
        "discount_rate": f"{actual_discount_rate}%", # 화면에 표시할 할인율 기획 문구
        "margin_preview": int(final_selling_price - cost_price) # 예상 순수익 마진
    }


# ==========================================
# 3. 예상 FAQ 자동 생성 기능
# ==========================================
# FAQ 생성은 LLM(Gemini) 호출이 필요하므로 AIService로 이동했습니다.
# → app/services/ai_service.py 의 AIService.generate_product_faq() 참고