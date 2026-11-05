/* ============================================================
   월렛미러 데이터·상수
   - 유형, 궁합표, 환산 기준표, 구독 추천, 샘플 데이터 프로필
   - 가격은 "대략적인 기준값"입니다. 바뀌면 이 파일에서 수정하세요.
   ============================================================ */
(function (G) {
  G.WM = G.WM || {};
  const WM = G.WM;

  const CATEGORIES = ["식비", "배달", "카페", "교통", "쇼핑", "구독", "문화", "기타"];

  const CAT_EMOJI = { 식비: "🍚", 배달: "🛵", 카페: "☕", 교통: "🚌", 쇼핑: "🛍️", 구독: "📺", 문화: "🎬", 기타: "📦" };
  const CAT_COLORS = {
    식비: "#F7C873", 배달: "#F59BB4", 카페: "#D2B09A", 교통: "#8DB8F0",
    쇼핑: "#F7A8D2", 구독: "#B9A7F5", 문화: "#9FD5BF", 기타: "#C4C2CC",
  };
  // 틸론 프롬프트에 반영할 소품
  const CAT_PROPS = {
    식비: "rice bowl", 배달: "delivery box and scooter", 카페: "coffee cup", 교통: "bus card",
    쇼핑: "shopping bags", 구독: "streaming play button", 문화: "movie ticket", 기타: "small box",
  };

  // 사용처 키워드 → 카테고리 (위에서부터 먼저 맞는 카테고리로 분류)
  const CLASSIFY_ORDER = ["구독", "배달", "카페", "교통", "문화", "식비", "쇼핑"];
  const CATEGORY_KEYWORDS = {
    구독: ["넷플릭스", "netflix", "유튜브프리미엄", "youtubepremium", "티빙", "웨이브", "디즈니", "왓챠", "멜론", "스포티파이", "spotify", "쿠팡와우", "쿠팡플레이", "icloud", "구글원", "chatgpt", "밀리의서재", "애플구독", "구독"],
    배달: ["배달의민족", "배민", "요기요", "쿠팡이츠", "땡겨요", "배달", "교촌", "bhc", "bbq", "굽네", "도미노", "피자헛", "푸라닭"],
    카페: ["스타벅스", "투썸", "이디야", "메가커피", "메가mgc", "컴포즈", "빽다방", "할리스", "블루보틀", "폴바셋", "매머드", "카페", "커피", "cafe", "coffee", "베이커리", "디저트"],
    교통: ["버스", "지하철", "택시", "카카오t", "코레일", "ktx", "srt", "티머니", "교통", "따릉이", "주유", "하이패스"],
    문화: ["cgv", "메가박스", "롯데시네마", "영화", "노래방", "pc방", "피시방", "공연", "콘서트", "전시", "교보문고", "알라딘", "yes24", "예스24", "게임", "스팀", "닌텐도", "넥슨", "볼링", "보드게임", "방탈출"],
    식비: ["식당", "마트", "gs25", "cu", "세븐일레븐", "이마트", "홈플러스", "편의점", "김밥", "분식", "학식", "학생식당", "고기", "국밥", "마라", "초밥", "롯데리아", "맘스터치", "버거킹", "맥도날드", "한식", "회식", "술집", "포차", "이자카야", "맥주", "밥", "면옥", "냉면", "돈까스"],
    쇼핑: ["쿠팡", "무신사", "올리브영", "에이블리", "지그재그", "29cm", "11번가", "g마켓", "지마켓", "네이버쇼핑", "네이버페이", "다이소", "나이키", "유니클로", "자라", "h&m", "쇼핑", "애플스토어", "아이패드", "옷"],
  };

  // ------------------------------------------------------------
  // 소비 유형 8종
  // ------------------------------------------------------------
  const TYPES = {
    baemin: {
      id: "baemin", name: "배민 VIP형", emoji: "🛵", color: "#F59BB4",
      tagline: "냉장고는 장식, 우리 집 앞은 배달 존",
      desc: "배달앱이 나보다 내 입맛을 잘 알아요. 한 끼 한 끼는 작아 보여도 배달비와 최소주문금액이 차곡차곡 쌓여 월 지출의 큰 덩어리가 됩니다.",
      voice: "사장님, 오늘도 단골 인증 완료!",
      prompt: "cute 3D mascot character with a delivery scooter and stacked food boxes, coral peach pastel colors, sticker style, white background",
    },
    sub: {
      id: "sub", name: "구독 수집가형", emoji: "📺", color: "#B9A7F5",
      tagline: "쓰지도 않는데 결제일은 칼같이 와요",
      desc: "OTT, 음악, 클라우드… 구독 목록이 도감 수준이에요. 하나하나는 커피 한 잔 값이지만 합치면 매달 고정으로 빠져나가는 '조용한 지출'입니다.",
      voice: "결제 알림은 오는데, 마지막으로 본 게 언제더라…",
      prompt: "cute 3D mascot character holding many glowing play-button cards, purple pastel colors, sticker style, white background",
    },
    monthend: {
      id: "monthend", name: "월말 파산형", emoji: "📉", color: "#8DB8F0",
      tagline: "월초엔 사장님, 월말엔 라면 앞에서 눈물",
      desc: "용돈이 들어오면 초반에 확 쓰고 월말엔 바닥을 보는 패턴이에요. 총액보다 '쓰는 타이밍'이 문제인 유형입니다.",
      voice: "월초의 나야, 월말의 나를 좀 생각해 줘!",
      prompt: "cute 3D mascot character with an empty wallet and instant ramen cup, blue pastel colors, sticker style, white background",
    },
    cafe: {
      id: "cafe", name: "카페 지박령형", emoji: "☕", color: "#D2B09A",
      tagline: "카페가 내 집, 아메리카노가 내 월세",
      desc: "하루 한두 잔이 습관이 된 유형이에요. 한 번에 나가는 돈은 작지만 횟수가 많아서 한 달이면 꽤 큰 금액이 됩니다.",
      voice: "오늘도 '딱 한 잔만'이라고 했죠?",
      prompt: "cute 3D mascot character sitting inside a giant coffee cup, warm brown pastel colors, sticker style, white background",
    },
    shop: {
      id: "shop", name: "쇼핑 도파민 중독형", emoji: "🛍️", color: "#F7A8D2",
      tagline: "장바구니 비우기가 취미, 결제 알림이 애정",
      desc: "'세일이라서', '배송이 빨라서'를 이유로 쇼핑 비중이 높아요. 필요해서 산 것보다 기분 때문에 산 것이 더 많을 수 있어요.",
      voice: "택배 상자 뜯는 순간이 제일 행복하죠?",
      prompt: "cute 3D mascot character surrounded by colorful shopping bags and parcels, pink pastel colors, sticker style, white background",
    },
    saver: {
      id: "saver", name: "속세 단절 짠테크형", emoji: "🐿️", color: "#9FD5BF",
      tagline: "돈 쓰는 법을 잊은 수행자, 통장은 두둑",
      desc: "소득에 비해 지출이 아주 적은 알뜰형이에요. 이미 훌륭하지만, 너무 참기만 하면 지칠 수 있으니 '가치 있는 소비' 한 가지는 남겨 두세요.",
      voice: "이 정도면 거의 수행의 경지예요.",
      prompt: "cute 3D mascot squirrel hugging acorn coins and a piggy bank, mint green pastel colors, sticker style, white background",
    },
    flex: {
      id: "flex", name: "Flex 한방형", emoji: "💸", color: "#F7D77E",
      tagline: "평소엔 조용, 가끔 터지는 한 방 결제",
      desc: "평소엔 잘 아끼다가 큰 결제 한 번이 한 달 지출을 좌우해요. 한 방 소비 전에 '24시간 보류' 규칙이 잘 맞는 유형입니다.",
      voice: "그날 그 결제, 지금도 후회 안 하나요?",
      prompt: "cute 3D mascot character with sunglasses throwing flying money bills, golden yellow pastel colors, sticker style, white background",
    },
    social: {
      id: "social", name: "인싸 모임러형", emoji: "🎉", color: "#F9B48E",
      tagline: "내 지갑은 단톡방 일정에 달려 있어요",
      desc: "밥약, 술약, 영화, 놀러가기… 사람 만나는 데 쓰는 돈이 큰 유형이에요. 관계가 소중한 만큼 '모임 예산'을 정해 두면 훨씬 편해집니다.",
      voice: "오늘 약속, 몇 번째인지 세어 봤어요?",
      prompt: "cute 3D mascot character with party hat, drinks and movie tickets, peach pastel colors, sticker style, white background",
    },
  };

  // 궁합표: 잘 맞는 유형 1개, 안 맞는 유형 1개 (유형 × 유형 규칙표)
  const COMPAT = {
    baemin:   { good: "saver",   goodWhy: "집밥 레시피를 전수해 줄 수 있는 든든한 수행자예요.",           bad: "social",   badWhy: "같이 있으면 '시켜 먹자' 모임이 폭주해서 배달비가 두 배가 돼요." },
    sub:      { good: "saver",   goodWhy: "구독 쉐어와 정리를 도와주는 알뜰 코치예요.",                   bad: "shop",     badWhy: "'혜택 놓치기 싫어' 결제가 겹쳐서 고정비가 눈덩이처럼 커져요." },
    monthend: { good: "cafe",    goodWhy: "소액을 꾸준히 쓰는 패턴이라 월 예산을 같이 짜기 쉬워요.",       bad: "flex",     badWhy: "월초 폭주와 한 방 결제가 겹치면 월 중순에 바닥이 보여요." },
    cafe:     { good: "sub",     goodWhy: "집콕 취향이 맞아서 카페 대신 집에서 즐기는 법을 알려 줘요.",    bad: "social",   badWhy: "카페 투어와 모임이 이어지면 소액 결제가 끝없이 쌓여요." },
    shop:     { good: "saver",   goodWhy: "'장바구니 24시간 룰'을 같이 지켜 줄 브레이크 같은 존재예요.",   bad: "sub",      badWhy: "서로 '이건 사야 해'를 부추기는 최악의 짝이에요." },
    saver:    { good: "baemin",  goodWhy: "함께하면 집밥 모임으로 배달러를 구제할 수 있어요.",             bad: "flex",     badWhy: "한 방 결제를 볼 때마다 속이 터져서 같이 여행 가기 어려워요." },
    flex:     { good: "saver",   goodWhy: "큰 결제 전에 '진짜 필요해?'를 물어봐 주는 현실 친구예요.",      bad: "shop",     badWhy: "서로의 소비를 응원하다가 같이 카드값에 놀라요." },
    social:   { good: "saver",   goodWhy: "모임 대신 집들이·산책 같은 저비용 약속을 제안해 줘요.",         bad: "baemin",   badWhy: "만나면 먹고 시키고, 헤어지면 또 시켜요." },
  };

  // 절약액 → 체감 환산 기준표 (대략 가격 / 코드 상수)
  const CONVERT_ITEMS = [
    { name: "학기 등록금",         unit: "학기", price: 3500000, emoji: "🎓" },
    { name: "맥북 에어",           unit: "대",   price: 1500000, emoji: "💻" },
    { name: "일본 여행(3박4일)",   unit: "회",   price: 1200000, emoji: "🗼" },
    { name: "아이패드",            unit: "대",   price: 500000,  emoji: "📱" },
    { name: "에어팟",              unit: "개",   price: 190000,  emoji: "🎧" },
    { name: "제주도 왕복 항공권",  unit: "장",   price: 100000,  emoji: "✈️" },
    { name: "치킨",                unit: "마리", price: 20000,   emoji: "🍗" },
  ];
  const CHICKEN = CONVERT_ITEMS[CONVERT_ITEMS.length - 1];

  // 구독 추천 (유형별). 가격은 대략적인 기준이며 바뀔 수 있어요.
  const SUB_REC = {
    baemin:   { name: "넷플릭스 광고형",         price: 5500, why: "배달 대신 집밥을 먹으면서 볼 콘텐츠 하나만 두세요." },
    sub:      null, // 구독이 많으면 '정리' 로직을 씁니다
    monthend: { name: "티빙 광고형",             price: 5500, why: "월말엔 돈 안 드는 집콕 오락 하나가 큰 힘이 돼요." },
    cafe:     { name: "유튜브 프리미엄(학생)",   price: 7900, why: "카페에서 듣던 음악·영상을 집에서 해결해 보세요." },
    shop:     { name: "티빙 광고형",             price: 5500, why: "쇼핑 구경 시간을 정주행으로 바꾸면 결제 충동이 줄어요." },
    saver:    null, // 추가 구독 비추천
    flex:     { name: "넷플릭스 광고형",         price: 5500, why: "큰 한 방 대신 월 5천 원대 소소한 즐거움으로 분산해요." },
    social:   { name: "넷플릭스 광고형",         price: 5500, why: "모임 한 번을 집에서 같이 보는 '파티 시청'으로 바꿔 보세요." },
  };

  // 샘플 데이터 프로필 (3종)
  const SAMPLE_PROFILES = {
    baemin: {
      label: "배달 많은 사람", seed: 11, growth: 0.07,
      rules: [
        { cat: "배달", merchants: ["배달의민족", "요기요", "쿠팡이츠"], count: 16, min: 13000, max: 24000 },
        { cat: "식비", merchants: ["학생식당", "GS25", "맘스터치"], count: 8, min: 3500, max: 9000, cash: 0.3 },
        { cat: "카페", merchants: ["스타벅스", "메가커피"], count: 4, min: 4000, max: 6500 },
        { cat: "교통", merchants: ["티머니 교통"], count: 2, min: 20000, max: 30000 },
        { cat: "쇼핑", merchants: ["다이소", "올리브영"], count: 2, min: 10000, max: 25000 },
        { cat: "문화", merchants: ["CGV"], count: 1, min: 12000, max: 14000 },
        { fixed: true, cat: "구독", merchant: "넷플릭스", amount: 13500, day: 5 },
      ],
    },
    sub: {
      label: "구독 많은 사람", seed: 22, growth: 0.04,
      rules: [
        { cat: "식비", merchants: ["학생식당", "GS25", "김밥천국"], count: 10, min: 3500, max: 9000, cash: 0.2 },
        { cat: "카페", merchants: ["이디야", "컴포즈커피"], count: 5, min: 4000, max: 6500 },
        { cat: "교통", merchants: ["티머니 교통"], count: 2, min: 20000, max: 30000 },
        { cat: "배달", merchants: ["배달의민족", "요기요"], count: 3, min: 14000, max: 22000 },
        { cat: "쇼핑", merchants: ["무신사", "쿠팡"], count: 3, min: 15000, max: 40000 },
        { cat: "문화", merchants: ["CGV"], count: 1, min: 12000, max: 14000 },
        { fixed: true, cat: "구독", merchant: "넷플릭스", amount: 13500, day: 3 },
        { fixed: true, cat: "구독", merchant: "티빙", amount: 9500, day: 7 },
        { fixed: true, cat: "구독", merchant: "유튜브 프리미엄", amount: 14900, day: 11 },
        { fixed: true, cat: "구독", merchant: "멜론", amount: 10900, day: 15 },
        { fixed: true, cat: "구독", merchant: "디즈니+", amount: 9900, day: 20 },
        { fixed: true, cat: "구독", merchant: "쿠팡 와우", amount: 7890, day: 25 },
      ],
    },
    saver: {
      label: "알뜰한 사람", seed: 33, growth: 0,
      rules: [
        { cat: "식비", merchants: ["학생식당", "GS25", "마트"], count: 14, min: 3000, max: 6000, cash: 0.5 },
        { cat: "교통", merchants: ["티머니 교통"], count: 1, min: 40000, max: 45000 },
        { cat: "카페", merchants: ["컴포즈커피"], count: 1, min: 4000, max: 5000 },
        { cat: "쇼핑", merchants: ["다이소"], count: 1, min: 10000, max: 20000 },
        { cat: "배달", merchants: ["배달의민족"], count: 1, min: 13000, max: 15000 },
        { fixed: true, cat: "구독", merchant: "넷플릭스 광고형", amount: 5500, day: 9 },
      ],
    },
  };

  WM.DATA = {
    CATEGORIES, CAT_EMOJI, CAT_COLORS, CAT_PROPS, CLASSIFY_ORDER, CATEGORY_KEYWORDS,
    TYPES, COMPAT, CONVERT_ITEMS, CHICKEN, SUB_REC, SAMPLE_PROFILES,
    DEFAULT_GROWTH: 0.02, // CSV가 1개월치일 때 쓰는 월 지출 증가율 가정값
  };
})(typeof window !== "undefined" ? window : globalThis);
