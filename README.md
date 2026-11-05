# 월렛미러 (WalletMirror)

`index.html` 을 더블클릭하면 바로 실행돼요. (설치·서버 불필요)

## 파일 구조
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 뼈대 (시작 / 로딩 / 결과) |
| `css/style.css` | 디자인. 맨 위 `:root` 의 색상·둥글기 변수만 바꿔도 전체 분위기가 바뀜 |
| `js/data.js` | 유형 8종 문구, 궁합표, 환산 기준표(가격), 구독 추천, 샘플 데이터, 카테고리 키워드 |
| `js/logic.js` | 분류·유형 판정·미래 예측·절약 계산·문장 생성 (모든 숫자는 여기서 계산) |
| `js/ui.js` | 결과 화면 구성, 그래프, 이미지 저장 |
| `js/config.js` | 틸론 API 주소/키 입력 |
| `images/types/` | 틸론으로 만든 유형 이미지 (파일명은 README.txt 참고) |

## 자주 바꾸는 곳
- 유형 이름·설명·말투: `js/data.js` → `TYPES`
- 환산 물건/가격: `js/data.js` → `CONVERT_ITEMS`
- 구독 추천/가격: `js/data.js` → `SUB_REC`
- 유형 판정 기준: `js/logic.js` → `classifyType`
- 미래 예측 방식: `js/logic.js` → `project` (선형 증가, 증가율 -2%~+5%로 제한)

## 익명 통계 (Supabase, 선택 기능)
1. Supabase 대시보드 > SQL Editor 에서 `supabase_setup.sql` 을 실행
2. `js/config.js` 의 `supabase.url`, `supabase.anonKey` 를 채움 (anon/publishable 키만! service_role·secret 키 금지)
3. 비워 두면 기능이 완전히 꺼지고, 연결에 실패해도 진단 기능은 그대로 동작해요.
- 저장: 유형명, 카테고리별 비중, 생성 시각 / 비저장: CSV 원본, 거래 내역
- 샘플 데이터 체험 결과는 저장하지 않고 통계 조회만 해요. (코드: `js/stats.js`, `js/ui.js`의 `loadStats`)
- 결과 화면 '📊 나와 같은 유형은?' 카드: 내 유형 비율 + 8개 유형 전체 분포(많은 순, 내 유형 강조)를 보여 줘요. 유형별 **개수만** 조회해요.
- 같은 파일은 한 번만 저장하고(창을 닫기 전까지), '직접 고치기'로 유형이 바뀌면 통계만 다시 조회해요(다시 저장하지 않음).
- 테스트하며 쌓인 데이터를 지우려면 Supabase SQL Editor 에서 `delete from public.results;` 를 실행하세요. (anon 키로는 삭제할 수 없어요)
