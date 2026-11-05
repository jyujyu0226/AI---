$ErrorActionPreference = 'Stop'
$outDir = $PSScriptRoot   # 이 스크립트가 있는 폴더(sample_csv)에 CSV를 생성
$months = @(@(2026,8), @(2026,9), @(2026,10))   # 마지막 달(10월)이 분석 대상 달
$enc = New-Object System.Text.UTF8Encoding($true)

function Gen($profile, $seed) {
  $rnd = New-Object System.Random $seed
  $rows = New-Object System.Collections.ArrayList
  for ($mi = 0; $mi -lt 3; $mi++) {
    $y = $months[$mi][0]; $mo = $months[$mi][1]
    $dim = [DateTime]::DaysInMonth($y, $mo)
    $scale = 1 + $mi * $profile.growth
    foreach ($r in $profile.rules) {
      if ($r.fixed) {
        if ($r.months -and ($r.months -notcontains ($mi + 1))) { continue }
        [void]$rows.Add([pscustomobject]@{ date = ('{0:D4}-{1:D2}-{2:D2}' -f $y, $mo, $r.day); merchant = $r.merchant; amount = $r.amount; cat = $r.cat; method = '카드' })
        continue
      }
      $n = [int][math]::Round($r.count * $scale, [MidpointRounding]::AwayFromZero)
      $d1 = 1; if ($r.d1) { $d1 = $r.d1 }
      $d2 = $dim; if ($r.d2) { $d2 = [math]::Min($r.d2, $dim) }
      for ($i = 0; $i -lt $n; $i++) {
        $day = $rnd.Next($d1, $d2 + 1)
        $amt = [int]([math]::Round(($r.min + $rnd.NextDouble() * ($r.max - $r.min)) / 100) * 100)
        $mer = $r.merchants[$rnd.Next(0, $r.merchants.Count)]
        $meth = '카드'; if ($r.cash -and ($rnd.NextDouble() -lt $r.cash)) { $meth = '현금' }
        [void]$rows.Add([pscustomobject]@{ date = ('{0:D4}-{1:D2}-{2:D2}' -f $y, $mo, $day); merchant = $mer; amount = $amt; cat = $r.cat; method = $meth })
      }
    }
  }
  $sorted = $rows | Sort-Object date
  $lines = @('날짜,사용처,금액,카테고리,결제수단')
  foreach ($t in $sorted) { $lines += ('{0},{1},{2},{3},{4}' -f $t.date, $t.merchant, $t.amount, $t.cat, $t.method) }
  return ($lines -join "`r`n") + "`r`n"
}

function Save($name, $text) { [System.IO.File]::WriteAllText((Join-Path $outDir $name), $text, $enc) }

$profiles = [ordered]@{}

# 1. 배민 VIP형: 배달 비중이 매우 높고 점점 늘어남
$profiles['01_배민VIP형_배달폭주.csv'] = @{ seed = 101; growth = 0.07; rules = @(
  @{ cat='배달'; merchants=@('배달의민족','요기요','쿠팡이츠','교촌치킨'); count=16; min=13000; max=24000 },
  @{ cat='식비'; merchants=@('학생식당','GS25','맘스터치'); count=8; min=3500; max=9000; cash=0.3 },
  @{ cat='카페'; merchants=@('스타벅스','메가커피'); count=4; min=4000; max=6500 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=2; min=20000; max=30000 },
  @{ cat='쇼핑'; merchants=@('다이소','올리브영'); count=2; min=10000; max=25000 },
  @{ cat='문화'; merchants=@('CGV'); count=1; min=12000; max=14000 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스'; amount=13500; day=5 }) }

# 2. 구독 수집가형: 정기결제 6개
$profiles['02_구독수집가형_정기결제6개.csv'] = @{ seed = 202; growth = 0.04; rules = @(
  @{ cat='식비'; merchants=@('학생식당','GS25','김밥천국'); count=10; min=3500; max=9000; cash=0.2 },
  @{ cat='카페'; merchants=@('이디야','컴포즈커피'); count=5; min=4000; max=6500 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=2; min=20000; max=30000 },
  @{ cat='배달'; merchants=@('배달의민족','요기요'); count=3; min=14000; max=22000 },
  @{ cat='쇼핑'; merchants=@('무신사','쿠팡'); count=3; min=15000; max=40000 },
  @{ cat='문화'; merchants=@('CGV'); count=1; min=12000; max=14000 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스'; amount=13500; day=3 },
  @{ fixed=$true; cat='구독'; merchant='티빙'; amount=9500; day=7 },
  @{ fixed=$true; cat='구독'; merchant='유튜브 프리미엄'; amount=14900; day=11 },
  @{ fixed=$true; cat='구독'; merchant='멜론'; amount=10900; day=15 },
  @{ fixed=$true; cat='구독'; merchant='디즈니+'; amount=9900; day=20 },
  @{ fixed=$true; cat='구독'; merchant='쿠팡 와우'; amount=7890; day=25 }) }

# 3. 월말 파산형: 월초(1~10일)에 지출 몰림, 월말엔 편의점 소액뿐
$profiles['03_월말파산형_월초몰아쓰기.csv'] = @{ seed = 303; growth = 0.03; rules = @(
  @{ cat='쇼핑'; merchants=@('무신사','올리브영','에이블리'); count=4; min=25000; max=60000; d1=1; d2=8 },
  @{ cat='식비'; merchants=@('맘스터치','마라탕집','고깃집'); count=6; min=8000; max=25000; d1=1; d2=10 },
  @{ cat='배달'; merchants=@('배달의민족','요기요'); count=4; min=14000; max=22000; d1=2; d2=10 },
  @{ cat='카페'; merchants=@('스타벅스','투썸플레이스'); count=4; min=4000; max=6000; d1=1; d2=10 },
  @{ cat='문화'; merchants=@('CGV','노래방'); count=2; min=12000; max=14000; d1=3; d2=9 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=1; min=50000; max=50000; d1=1; d2=1 },
  @{ cat='식비'; merchants=@('GS25','CU'); count=5; min=3000; max=4500; d1=22; d2=30; cash=0.6 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스'; amount=13500; day=5 }) }

# 4. 카페 지박령형: 카페 결제가 하루 한두 번
$profiles['04_카페지박령형_하루두잔.csv'] = @{ seed = 404; growth = 0.03; rules = @(
  @{ cat='카페'; merchants=@('스타벅스','메가커피','컴포즈커피','투썸플레이스','이디야'); count=38; min=3500; max=6800 },
  @{ cat='식비'; merchants=@('학생식당','GS25','김밥천국'); count=10; min=5000; max=9000; cash=0.3 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=2; min=22000; max=28000 },
  @{ cat='쇼핑'; merchants=@('다이소','올리브영'); count=2; min=15000; max=25000 },
  @{ cat='배달'; merchants=@('배달의민족'); count=2; min=13000; max=17000 },
  @{ cat='문화'; merchants=@('교보문고'); count=1; min=12000; max=16000 },
  @{ fixed=$true; cat='구독'; merchant='유튜브 프리미엄'; amount=14900; day=12 }) }

# 5. 쇼핑 도파민 중독형: 쇼핑 비중이 압도적 (단건 10만 원 미만)
$profiles['05_쇼핑도파민중독형_택배폭탄.csv'] = @{ seed = 505; growth = 0.05; rules = @(
  @{ cat='쇼핑'; merchants=@('무신사','쿠팡','에이블리','지그재그','올리브영','29CM'); count=5; min=25000; max=90000 },
  @{ cat='식비'; merchants=@('학생식당','GS25','맘스터치'); count=8; min=4000; max=8000; cash=0.2 },
  @{ cat='카페'; merchants=@('메가커피'); count=3; min=4000; max=5500 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=1; min=45000; max=45000 },
  @{ cat='배달'; merchants=@('배달의민족','요기요'); count=2; min=15000; max=19000 },
  @{ fixed=$true; cat='구독'; merchant='티빙 광고형'; amount=5500; day=9 }) }

# 6. 속세 단절 짠테크형: 소득 대비 지출 20% 안팎
$profiles['06_짠테크형_속세단절.csv'] = @{ seed = 606; growth = 0.0; rules = @(
  @{ cat='식비'; merchants=@('학생식당','GS25','마트'); count=14; min=3000; max=6000; cash=0.5 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=1; min=40000; max=45000 },
  @{ cat='카페'; merchants=@('컴포즈커피'); count=1; min=4000; max=5000 },
  @{ cat='쇼핑'; merchants=@('다이소'); count=1; min=10000; max=20000 },
  @{ cat='배달'; merchants=@('배달의민족'); count=1; min=13000; max=15000 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스 광고형'; amount=5500; day=9 }) }

# 7. Flex 한방형: 평소엔 소액, 이번 달 항공권 한 번에 28만 원
$profiles['07_Flex한방형_항공권결제.csv'] = @{ seed = 707; growth = 0.0; rules = @(
  @{ cat='식비'; merchants=@('학생식당','GS25','김밥천국'); count=10; min=3500; max=8000; cash=0.3 },
  @{ cat='카페'; merchants=@('메가커피','컴포즈커피'); count=3; min=4000; max=5500 },
  @{ cat='교통'; merchants=@('티머니 교통'); count=2; min=20000; max=25000 },
  @{ cat='배달'; merchants=@('배달의민족'); count=2; min=13000; max=18000 },
  @{ cat='쇼핑'; merchants=@('다이소','올리브영'); count=1; min=20000; max=35000 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스 광고형'; amount=5500; day=9 },
  @{ fixed=$true; cat='쇼핑'; merchant='나이키 운동화'; amount=139000; day=14; months=@(1) },
  @{ fixed=$true; cat='기타'; merchant='제주항공 항공권'; amount=285000; day=18; months=@(3) }) }

# 8. 인싸 모임러형: 술자리·밥약·영화·노래방
$profiles['08_인싸모임러형_밥약술약.csv'] = @{ seed = 808; growth = 0.03; rules = @(
  @{ cat='식비'; merchants=@('이자카야','포차','고깃집','마라탕집','삼겹살집','파스타 레스토랑'); count=14; min=12000; max=30000 },
  @{ cat='문화'; merchants=@('CGV','노래방','보드게임카페','방탈출'); count=4; min=12000; max=25000 },
  @{ cat='카페'; merchants=@('스타벅스','투썸플레이스'); count=4; min=4500; max=6500 },
  @{ cat='교통'; merchants=@('카카오T 택시','티머니 교통'); count=3; min=8000; max=15000 },
  @{ cat='쇼핑'; merchants=@('올리브영'); count=1; min=18000; max=22000 },
  @{ cat='배달'; merchants=@('배달의민족'); count=1; min=15000; max=18000 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스 광고형'; amount=5500; day=9 }) }

# 9. 소득 초과 적자 위험: 월 100만 원 가까이 지출 (소득 70만 원 기준)
$profiles['09_적자위험형_소득초과.csv'] = @{ seed = 909; growth = 0.06; rules = @(
  @{ cat='배달'; merchants=@('배달의민족','요기요','쿠팡이츠'); count=14; min=15000; max=25000 },
  @{ cat='쇼핑'; merchants=@('무신사','쿠팡','올리브영','지그재그'); count=6; min=40000; max=90000 },
  @{ cat='식비'; merchants=@('고깃집','맘스터치','이자카야'); count=10; min=10000; max=20000; cash=0.1 },
  @{ cat='카페'; merchants=@('스타벅스','투썸플레이스'); count=15; min=4500; max=6500 },
  @{ cat='교통'; merchants=@('카카오T 택시','티머니 교통'); count=4; min=10000; max=15000 },
  @{ cat='문화'; merchants=@('CGV','노래방'); count=2; min=12000; max=20000 },
  @{ fixed=$true; cat='구독'; merchant='넷플릭스'; amount=13500; day=5 },
  @{ fixed=$true; cat='구독'; merchant='유튜브 프리미엄'; amount=14900; day=12 },
  @{ fixed=$true; cat='구독'; merchant='멜론'; amount=10900; day=18 }) }

foreach ($k in $profiles.Keys) {
  $p = $profiles[$k]
  Save $k (Gen $p $p.seed)
}

# 10. 형식이 제각각인 CSV (카테고리 컬럼 없음, 날짜·금액 형식 혼합, 현금·환불·빈 줄 포함, 1개월치)
$messy = @'
이용일,이용처,이용금액,결제수단
2026.10.01,스타벅스 강남역점,"5,600원",카드
2026/10/01,GS25 역삼점,"3,200",현금
2026-10-02,배달의민족,"18,500원",카드
2026.10.02,학생식당,"4,500",카드
2026.10.03,CGV 왕십리,"13,000원",카드
2026.10.03,올리브영 신촌점,"23,400",카드
2026.10.04,쿠팡이츠,"21,000원",카드
2026.10.05,티머니 교통카드충전,"30,000",카드
2026.10.05,넷플릭스,"13,500원",카드
2026.10.06,김밥천국,"6,000",현금
2026.10.07,메가커피 홍대점,"3,500원",카드
2026.10.07,무신사,"39,900",카드
2026.10.08,카카오T 택시,"9,800원",카드
2026.10.09,교촌치킨,"24,000",카드
2026.10.10,이마트,"31,200",카드
2026.10.11,알수없는가게,"7,000",현금
2026.10.12,다이소 강남점,"5,000원",카드
2026.10.12,환불-무신사,"-39,900",카드
2026.10.13,투썸플레이스,"6,800",카드
2026.10.14,PC방,"4,000원",현금
2026.10.15,요기요,"16,500",카드
2026.10.16,맘스터치,"7,900",카드
2026.10.17,교보문고,"15,300",카드
2026.10.18,스타벅스,"5,900원",카드
2026.10.19,GS25,"2,500",현금
2026.10.20,배달의민족,"22,000원",카드
2026.10.21,유튜브 프리미엄,"14,900",카드
2026.10.22,학식,"4,500",카드
2026.10.23,버스,"1,500",카드
2026.10.24,마라탕집,"13,500",카드
2026.10.25,이디야커피,"4,300",카드
2026.10.26,나이키,"69,000",카드
2026.10.27,배민,"19,000원",카드
2026.10.28,편의점,"3,900",현금
2026.10.30,,"5,000",카드
합계,,"",
'@
Save '10_형식제각각_자동분류테스트.csv' ($messy.Replace("`r`n","`n").Replace("`n","`r`n") + "`r`n")

Get-ChildItem $outDir -Filter *.csv | ForEach-Object { '{0}  {1} lines' -f $_.Name, ((Get-Content $_.FullName).Count) }
