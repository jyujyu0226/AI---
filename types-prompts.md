# 월렛미러 소비 유형 · 이미지 프롬프트 정리

> 기준: 현재 저장소 코드 (`js/data.js`, `js/ui.js`, `js/logic.js`, `css/style.css`). 이 문서를 만들면서 코드는 수정하지 않았어요.

## 1. 소비 유형 (총 8개)

정의 위치: `js/data.js` → `const TYPES` (167줄부터) / 판정 규칙: `js/logic.js` → `classifyType()` (516줄부터)

| # | ID | 이름 | 한 줄 설명 (tagline) | 정의 위치 |
|---|---|---|---|---|
| 1 | `baemin` | 배민 VIP형 | 냉장고는 장식, 우리 집 앞은 배달 존 | `js/data.js` 169줄 |
| 2 | `sub` | 구독 수집가형 | 쓰지도 않는데 결제일은 칼같이 와요 | `js/data.js` 176줄 |
| 3 | `monthend` | 월말 파산형 | 월초엔 사장님, 월말엔 라면 앞에서 눈물 | `js/data.js` 183줄 |
| 4 | `cafe` | 카페 지박령형 | 카페가 내 집, 아메리카노가 내 월세 | `js/data.js` 190줄 |
| 5 | `shop` | 쇼핑 도파민 중독형 | 장바구니 비우기가 취미, 결제 알림이 애정 | `js/data.js` 197줄 |
| 6 | `saver` | 속세 단절 짠테크형 | 돈 쓰는 법을 잊은 수행자, 통장은 두둑 | `js/data.js` 204줄 |
| 7 | `flex` | Flex 한방형 | 평소엔 조용, 가끔 터지는 한 방 결제 | `js/data.js` 211줄 |
| 8 | `social` | 인싸 모임러형 | 내 지갑은 단톡방 일정에 달려 있어요 | `js/data.js` 218줄 |

## 2. 지금 결과 화면에서 쓰는 이미지

**결론: 이미지 파일은 하나도 없고, 모든 유형이 이모지로 표시돼요.** (`images/types/`에는 `README.txt`만 있음)

| 유형 | 지금 표시되는 것 | 테마 색 |
|---|---|---|
| 배민 VIP형 | 🛵 | `#F59BB4` |
| 구독 수집가형 | 📺 | `#B9A7F5` |
| 월말 파산형 | 📉 | `#8DB8F0` |
| 카페 지박령형 | ☕ | `#D2B09A` |
| 쇼핑 도파민 중독형 | 🛍️ | `#F7A8D2` |
| 속세 단절 짠테크형 | 🐿️ | `#9FD5BF` |
| Flex 한방형 | 💸 | `#F7D77E` |
| 인싸 모임러형 | 🎉 | `#F9B48E` |

이모지·색은 `js/data.js`의 각 유형 `emoji`, `color` 값이에요.

### 코드 위치
| 화면 / 위치 | 무엇을 표시 | 코드 |
|---|---|---|
| 결과 화면 맨 위 '나의 소비 유형' 카드 — 가운데 큰 캐릭터 | 유형 이모지 (이미지 파일이 있으면 그 파일) | `js/ui.js` 304줄 `#char-wrap` 자리 → 378줄 `mountCharacter(r)` |
| 　캐릭터 불러오는 순서 | ① 틸론 실시간 생성(꺼져 있음) → ② `images/types/{유형ID}.png` → ③ 이모지 | `js/ui.js` 158~173줄 `mountCharacter()` |
| 　이모지 캐릭터 모양 | 테마 색 원 안에 이모지 | `js/ui.js` 134~136줄 `emojiCharacter()` / `css/style.css` 156~162줄 `.char-emoji` |
| 　이미지 파일일 때 모양 | 220×220 정사각형, `object-fit: contain` | `css/style.css` 154~155줄 `.char-wrap`, `.char-img` |
| 　캐릭터 주변 떠다니는 장식 | 지출 상위 카테고리 이모지 2개 + 🎀 | `js/ui.js` 294줄, 305~307줄 (`.orbit`) |
| 결과 화면 '궁합' 카드 | 찰떡·상극 유형의 이모지 | `js/ui.js` 362~363줄 |
| 결과 화면 '📊 나와 같은 유형은?' 통계 | 내 유형 이모지, 유형별 분포 목록 이모지 | `js/ui.js` 410줄, 420줄 |
| '이미지로 저장' 카드 (PNG 다운로드) | 캔버스에 유형 이모지를 큰 글씨로 그림 | `js/ui.js` 458~459줄 `saveCard()` |
| 시작 화면 | 🛵 ☕ 🎀 🛍️ 떠다니는 장식, 샘플 버튼 🛵 📺 🐿️ | `index.html` 19~22줄, 56~58줄 |

## 3. SDXL-Turbo용 영어 프롬프트 (유형당 1개)

- **공통 문구**: 모든 프롬프트 끝에 `cute flat illustration, soft colors, simple background, centered character` 를 붙였어요.
- 글자·숫자·로고·브랜드·유명 캐릭터가 나올 만한 단어(브랜드명, 지폐, 티켓, 간판 등)는 피했어요.

| # | 유형 | 프롬프트 |
|---|---|---|
| 1 | 배민 VIP형 | `a happy round character sitting on the floor surrounded by stacked food delivery boxes and takeout bags, a small scooter by the door, cute flat illustration, soft colors, simple background, centered character` |
| 2 | 구독 수집가형 | `a sleepy character on a sofa surrounded by many floating blank screens and headphones, a wall calendar with many red circles, cute flat illustration, soft colors, simple background, centered character` |
| 3 | 월말 파산형 | `a teary character holding an empty open wallet next to a cup of instant noodles, a few coins rolling away, cute flat illustration, soft colors, simple background, centered character` |
| 4 | 카페 지박령형 | `a cozy character sitting inside a giant coffee cup holding a latte, a tall stack of empty coffee cups beside it, cute flat illustration, soft colors, simple background, centered character` |
| 5 | 쇼핑 도파민 중독형 | `an excited character with sparkling eyes opening a pile of parcels and shopping bags, ribbons and sparkles around, cute flat illustration, soft colors, simple background, centered character` |
| 6 | 속세 단절 짠테크형 | `a calm squirrel character hugging a big piggy bank with a neat pile of gold coins and acorns, cute flat illustration, soft colors, simple background, centered character` |
| 7 | Flex 한방형 | `a cool character wearing sunglasses holding one huge shiny gift box while gold coins burst like fireworks, cute flat illustration, soft colors, simple background, centered character` |
| 8 | 인싸 모임러형 | `a cheerful character with a party hat raising a glass at a table with snacks, popcorn and confetti, cute flat illustration, soft colors, simple background, centered character` |

### SDXL-Turbo 사용 팁
- SDXL-Turbo는 **짧은 프롬프트**에 강하고, 보통 `num_inference_steps=1~4`, `guidance_scale=0.0`으로 써요. 이 설정에선 **네거티브 프롬프트가 거의 효과가 없어서** 글자가 생기면 시드를 바꿔 다시 생성하는 편이 나아요.
- 기본 해상도는 512×512예요. 사이트 캐릭터 칸이 정사각형(220×220, `contain`)이라 그대로 쓰기 좋아요.
- 그림체를 더 맞추고 싶으면 8장 모두 **같은 시드**로 생성해 보세요.

## 4. 파일명 (type01_xxx.png 형식)

| # | 유형 | 파일명 | 넣을 폴더 |
|---|---|---|---|
| 1 | 배민 VIP형 | `type01_baemin.png` | `images/types/` |
| 2 | 구독 수집가형 | `type02_sub.png` | `images/types/` |
| 3 | 월말 파산형 | `type03_monthend.png` | `images/types/` |
| 4 | 카페 지박령형 | `type04_cafe.png` | `images/types/` |
| 5 | 쇼핑 도파민 중독형 | `type05_shop.png` | `images/types/` |
| 6 | 속세 단절 짠테크형 | `type06_saver.png` | `images/types/` |
| 7 | Flex 한방형 | `type07_flex.png` | `images/types/` |
| 8 | 인싸 모임러형 | `type08_social.png` | `images/types/` |

> ✅ **적용 완료**: 8장 모두 `images/types/`에 위 이름으로 들어 있고, `js/data.js`의 `TYPE_IMAGES`가 유형과 파일을 연결해요.
> 결과 화면 유형 카드와 '이미지로 저장' 카드에 표시되고, 파일이 없으면 이모지로 대신 보여요.
> '궁합'·'통계' 카드는 지금도 이모지를 써요.
