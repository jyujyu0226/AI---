/* ============================================================
   월렛미러 설정 파일
   - 틸론(이미지 생성) 연결 정보는 여기에만 입력하세요.
   - enabled 가 false 이거나 연결에 실패하면, 미리 만들어 둔 이미지
     (images/types/유형ID.png) → 없으면 이모지 캐릭터 순으로 대체됩니다.
   ============================================================ */
window.WM_CONFIG = {
  tillon: {
    enabled: false,        // true 로 바꾸면 실시간 생성을 시도합니다
    apiUrl: "",            // 틸론 이미지 생성 API 주소 (나중에 입력)
    apiKey: "",            // 틸론 API 키 (나중에 입력)
    // ※ 브라우저에 키가 노출되므로 시연용으로만 쓰세요.
  },
  /* ----------------------------------------------------------
     Supabase (진단 결과 요약의 익명 저장 + "같은 유형 ○%" 통계)
     - url / anonKey 를 둘 다 채우면 기능이 켜지고, 비워 두면 완전히 꺼집니다.
     - url:     Supabase 대시보드 > Project Settings > API 의 Project URL
                예) https://abcdefgh.supabase.co
     - anonKey: 같은 화면의 "anon public" 키 (또는 새 방식의 publishable 키).
                이 키는 브라우저에 공개되는 키라서 RLS 정책으로 보호돼요.
     ⚠️ service_role 키 / secret 키는 절대 여기에 넣지 마세요.
        (넣으면 코드가 감지해서 사용을 거부하지만, 파일에 남으면 유출 위험이 있어요.)
     저장되는 것: 소비 유형명, 카테고리별 비중, 생성 시각 — 이것뿐이에요.
     CSV 원본과 개별 거래 내역은 저장하지도, 전송하지도 않아요.
     ---------------------------------------------------------- */
  supabase: {
    url: "https://xcpyyxgkxseyadxwutel.supabase.co",
    anonKey: "sb_publishable_Xcu6IvaqQUX36SHGjznlTQ_ATeo9TxF",   // 공개(publishable) 키
    table: "results",
  },
  // 미리 생성해 둔 유형 이미지 위치. 예) images/types/baemin.png
  imageDir: "images/types/",
  imageExt: "png",
};
