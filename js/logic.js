/* ============================================================
   월렛미러 계산 로직 (DOM 없음)
   원칙: 모든 숫자는 여기서 코드로 계산하고, 문장은 이 숫자를 끼워 넣어 만든다.
   ============================================================ */
(function (G) {
  G.WM = G.WM || {};
  const WM = G.WM;
  const D = WM.DATA;

  // ---------- 서식 ----------
  const fmtWon = (n) => (n < 0 ? "-" : "") + Math.round(Math.abs(n)).toLocaleString("ko-KR") + "원";
  const fmtMan = (n) => (n < 0 ? "-" : "") + Math.round(Math.abs(n) / 10000).toLocaleString("ko-KR") + "만";
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- 파일 디코딩 (인코딩 자동 감지) ----------
  // 지원: UTF-8, UTF-8 BOM, EUC-KR/CP949, UTF-16(엑셀 '유니코드 텍스트')
  function decodeBytes(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(b.subarray(3)), encoding: "UTF-8(BOM)" };
    if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(b.subarray(2)), encoding: "UTF-16" };
    if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(b.subarray(2)), encoding: "UTF-16" };
    // BOM 없는 UTF-16LE: 홀수 번째 바이트에 0이 많음
    const n = Math.min(b.length, 400);
    let zeros = 0;
    for (let i = 1; i < n; i += 2) if (b[i] === 0) zeros++;
    if (n >= 4 && zeros / (n / 2) > 0.3) return { text: new TextDecoder("utf-16le").decode(b), encoding: "UTF-16" };
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "UTF-8" }; }
    catch (e) { return { text: new TextDecoder("euc-kr").decode(b), encoding: "EUC-KR(CP949)" }; }
  }

  // ---------- CSV ----------
  function countOutsideQuotes(line, d) {
    let q = false, n = 0;
    for (const c of line) { if (c === '"') q = !q; else if (!q && c === d) n++; }
    return n;
  }
  // 구분자 자동 감지: 탭 > 세미콜론 > 쉼표 (기본 쉼표)
  function detectDelimiter(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 40);
    if (!lines.length) return ",";
    const has = (d) => lines.filter((l) => countOutsideQuotes(l, d) > 0).length / lines.length;
    if (has("\t") >= 0.5) return "\t";
    const c = has(","), s = has(";");
    if (s >= 0.5 && s > c) return ";";
    if (c === 0 && has("|") >= 0.5) return "|";
    return ",";
  }

  function parseCSV(text, delim) {
    text = String(text).replace(/^﻿/, "");
    const d = delim || detectDelimiter(text);
    const rows = [], lineNos = []; // lineNos: 각 행이 시작한 실제 파일 줄 번호 (빈 줄은 rows 에서 빠짐)
    let row = [], cur = "", q = false, line = 1, rowLine = 1;
    const endRow = () => {
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) { rows.push(row); lineNos.push(rowLine); }
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else { if (c === "\n") line++; cur += c; }
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        endRow();
        rowLine = ++line;
      } else cur += c;
    }
    endRow();
    rows.delimiter = d;
    rows.lineNos = lineNos;
    return rows;
  }

  // ---------- 가맹점 → 카테고리 ----------
  // 짧은 영문 키워드(cu, bhc, flo 등)는 단어 경계로만 매칭해서 엉뚱한 이름에 걸리지 않게 함
  const kwCache = {};
  function kwMatch(n, key) {
    if (/^[a-z0-9&]{1,3}$/.test(key)) {
      const re = kwCache[key] || (kwCache[key] = new RegExp("(^|[^a-z])" + key.replace(/&/g, "\\&") + "([^a-z]|$)"));
      return re.test(n);
    }
    return n.includes(key);
  }
  function normMerchant(name) {
    return String(name).toLowerCase()
      .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "")
      .replace(/[()\[\]{}<>]/g, "") // "(GS)25" → "gs25"
      .replace(/스마트/g, "smart") // '스마트스토어', '한국스마트카드'의 '마트'가 식비로 잡히지 않게
      .replace(/\s+/g, "");
  }
  let normKeywords = null, normIndustry = null, normSuffixes = null;
  function prepKeywords() {
    if (normKeywords) return;
    normKeywords = {}; normIndustry = {};
    D.CLASSIFY_ORDER.forEach((cat) => {
      normKeywords[cat] = D.CATEGORY_KEYWORDS[cat].map(normMerchant);
      normIndustry[cat] = (D.INDUSTRY_KEYWORDS[cat] || []).map(normMerchant);
    });
    normSuffixes = D.FOOD_SUFFIXES.map(normMerchant);
  }
  // 가장 길게(구체적으로) 맞는 키워드의 카테고리를 고른다. 길이가 같으면 CLASSIFY_ORDER 순서.
  // 예) "하이마트": '하이마트'(쇼핑) > '마트'(식비) / "홈플러스강서점": '홈플러스'(식비) > '서점'(문화)
  function matchKeywords(text, table) {
    const n = normMerchant(text);
    let best = null;
    if (!n) return { cat: "기타" };
    for (const cat of D.CLASSIFY_ORDER) {
      for (const k of table[cat]) {
        if (k && (!best || k.length > best.k.length) && kwMatch(n, k)) best = { cat, k };
      }
    }
    return best || { cat: "기타" };
  }
  // 지점명 떼기: "홈플러스 강서점" → "홈플러스" ('강서점'의 '서점'이 문화로 잡히지 않게)
  // 단, '정육점', '편의점'처럼 그 자체가 업종인 단어는 남김
  const TYPE_WORDS_ENDING_JEOM = ["정육점", "편의점", "서점", "백화점", "할인점", "전문점", "음식점", "문구점", "철물점", "제과점", "안경점", "꽃집"];
  function stripBranch(name) {
    const tokens = String(name).trim().split(/\s+/);
    while (tokens.length > 1) {
      const last = tokens[tokens.length - 1];
      if (/^[(\[]?.{0,10}점[)\]]?$/.test(last) && !TYPE_WORDS_ENDING_JEOM.includes(last.replace(/[()\[\]]/g, ""))) tokens.pop();
      else break;
    }
    return tokens.join(" ");
  }
  // 이름 끝 패턴으로 식당 추정: 결제대행 접두어(KCP*, NICE- 등)와 지점명(역삼점, 2호점)을 떼고 비교
  function restaurantSuffix(name) {
    const n = normMerchant(stripBranch(name)).split(/[*\-_\/]/).pop().replace(/[0-9]+$/, "");
    const cands = [n];
    if (/점$/.test(n)) for (let k = 1; k <= 5 && n.length - k - 1 >= 2; k++) cands.push(n.slice(0, -(k + 1))); // 띄어쓰기 없는 "하남돼지집역삼점"
    for (const c of cands) {
      const s = normSuffixes.find((x) => c.length > x.length && c.endsWith(x));
      if (s) return s;
    }
    return null;
  }
  function classifyMerchantDetail(name) {
    prepKeywords();
    const m = matchKeywords(stripBranch(name), normKeywords);
    if (m.cat !== "기타") return { category: m.cat, by: "merchant", why: `가맹점명에 '${m.k}'` };
    const s = restaurantSuffix(name);
    if (s) return { category: "식비", by: "merchant", why: `이름이 '${s}'(으)로 끝나서 식당으로 추정` };
    return { category: "기타", by: "none", why: "맞는 키워드 없음" };
  }
  function classifyMerchant(name) { return classifyMerchantDetail(name).category; }

  // 이미 읽은 거래를 현재 규칙·사용자 수정으로 다시 분류 (화면에서 카테고리를 바꿨을 때)
  function reclassify(txns) {
    txns.forEach((t) => {
      const c = classifyTxn({ merchant: t.merchant, category: t.rawCategory, industry: t.industry, memo: t.memo });
      t.category = c.category; t.why = c.why;
    });
    return txns;
  }

  // 사용자가 화면에서 직접 고친 분류 { 가맹점명: 카테고리 } — 가장 먼저 적용
  let overrides = {};
  function setOverrides(map) { overrides = Object.assign({}, map || {}); }

  // ---------- 본인 계좌 간 이체 (지출·수입 어디에도 넣지 않음) ----------
  const TRANSFER = "이체";
  const isValidCategory = (c) => D.CATEGORIES.includes(c) || c === TRANSFER;
  // 내 돈이 내 다른 계좌·지갑으로 옮겨 가는 거래로 보이는 이름
  const TRANSFER_RE = /본인|내계좌|내통장|계좌이체|자기앞|적금|예금|저축|청약|증권|cma|(페이|머니|pay|토스|카카오|네이버|뱅크).*충전|충전.*(페이|머니|pay)/;
  const BANK_ONLY_RE = /^(kb|국민|신한|우리|하나|농협|nh|ibk|기업|카카오뱅크|토스뱅크|케이뱅크|새마을금고|신협|수협|sc제일|씨티|부산|대구|경남|광주|전북|제주|우체국)(은행)?(이체|송금|입금|출금)?$/;
  let ownerName = "";
  function setOwnerName(name) { ownerName = String(name || "").replace(/\s+/g, "").toLowerCase(); }
  function transferReason(merchant, memo) {
    const n = normMerchant(merchant), mm = normMerchant(memo || "");
    if (ownerName.length >= 2 && n.includes(ownerName)) return "거래 상대가 본인 이름";
    let m = n.match(TRANSFER_RE) || mm.match(TRANSFER_RE);
    if (m) return `'${m[0].length > 8 ? m[0].slice(0, 8) + "…" : m[0]}' → 본인 계좌 이체로 추정`;
    if (BANK_ONLY_RE.test(n)) return "은행 이름만 있는 거래 → 본인 계좌 이체로 추정";
    return null;
  }

  // 거래 한 건 분류 순서: ⓪ 사용자 수정 ⓪' 본인 계좌 이체 ① 카테고리 컬럼(정확한 이름) ② 가맹점명 키워드·이름 패턴
  //                      ③ 업종 컬럼 ④ 카테고리 컬럼의 다른 표현(외식→식비 등) ⑤ 메모
  function classifyTxn({ merchant, category, industry, memo }) {
    prepKeywords();
    if (overrides[merchant] && isValidCategory(overrides[merchant])) return { category: overrides[merchant], by: "user", why: "직접 수정" };
    const tr = transferReason(merchant, memo);
    if (tr) return { category: TRANSFER, by: "transfer", why: tr };
    if (category && category !== "기타" && D.CATEGORIES.includes(category)) return { category, by: "column", why: `카테고리 컬럼 '${category}'` };
    const md = classifyMerchantDetail(merchant);
    if (md.category !== "기타") return md;
    let m;
    if (industry && (m = matchKeywords(industry, normIndustry)).cat !== "기타") return { category: m.cat, by: "industry", why: `업종 '${industry}'` };
    if (industry && (m = matchKeywords(industry, normKeywords)).cat !== "기타") return { category: m.cat, by: "industry", why: `업종 '${industry}'` };
    if (category && (m = matchKeywords(category, normIndustry)).cat !== "기타") return { category: m.cat, by: "column", why: `카테고리 컬럼 '${category}'` };
    if (category && (m = matchKeywords(category, normKeywords)).cat !== "기타") return { category: m.cat, by: "column", why: `카테고리 컬럼 '${category}'` };
    if (memo && (m = matchKeywords(memo, normKeywords)).cat !== "기타") return { category: m.cat, by: "memo", why: `메모에 '${m.k}'` };
    return { category: "기타", by: "none", why: "맞는 키워드 없음" };
  }

  // ---------- 날짜 ----------
  const pad2 = (v) => String(v).padStart(2, "0");
  function ymd(y, mo, d) {
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) return null; // 2026-02-30 같은 날짜 거르기
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  // 지원: 2026-11-05, 2026.11.05, 2026/11/05, 2026년 11월 5일, 20261105, 26/11/05, 26.11.05,
  //       11/05/2026, 시간이 붙은 형태(2026-11-05 14:23), 엑셀 날짜 숫자(46331)
  function parseDate(s) {
    const t = String(s == null ? "" : s).trim().replace(/^['"]+|"+$/g, "").trim();
    if (!t) return null;
    let m;
    if ((m = t.match(/^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{4})(\d{2})(\d{2})(\d{4}|\d{6})?(?!\d)/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{4})(?!\d)/))) {
      const a = +m[1], b = +m[2];
      return a > 12 ? ymd(+m[3], b, a) : ymd(+m[3], a, b);
    }
    if ((m = t.match(/^(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?!\d)/))) return ymd(2000 + +m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{5})(\.\d+)?$/)) && +m[1] > 36000 && +m[1] < 73000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + +m[1] * 86400000);
      return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    if ((m = t.match(/(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    return null;
  }

  // ---------- 금액 ----------
  // 지원: 12500, 12,500, "12,500원", ₩12,500, " 12 500 ", -12,500, 12,500-, (12,500), △12,500
  function parseAmount(s) {
    let t = String(s == null ? "" : s).trim().replace(/^['"]+|"+$/g, "").trim();
    if (!t) return NaN;
    let neg = false;
    t = t.replace(/[−–]/g, "-");
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/원|₩|krw|\\|,|\s/gi, "");
    if (t.startsWith("△")) { neg = !neg; t = t.slice(1); }
    if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
    else if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
    if (t.startsWith("+")) t = t.slice(1);
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    const v = Number(t);
    return neg ? -v : v;
  }

  // ---------- 컬럼 찾기 ----------
  // exact: 정확히 같은 이름(앞에 있을수록 우선), partial: 포함하면 후보, exclude: 포함하면 제외
  const FIELDS = {
    date: {
      label: "날짜",
      exact: ["날짜", "이용일자", "이용일", "이용일시", "승인일자", "승인일", "승인일시", "거래일자", "거래일", "거래일시", "사용일자", "사용일", "사용일시", "매출일자", "매출일", "일자", "일시", "date", "transactiondate"],
      partial: ["날짜", "일자", "일시", "이용일", "승인일", "거래일", "사용일", "매출일", "date"],
      exclude: ["결제일", "결제예정", "청구", "입금", "만료", "유효", "등록"],
      fallback: true, // 이용일 컬럼이 없으면 결제일 컬럼이라도 사용
    },
    amount: {
      label: "금액",
      exact: ["금액", "이용금액", "승인금액", "사용금액", "거래금액", "매출금액", "원화금액", "원화이용금액", "국내이용금액", "결제금액", "출금액", "출금금액", "지출금액", "지출", "청구금액", "결제예정금액", "amount", "price"],
      partial: ["금액", "출금", "지출", "amount"],
      exclude: ["해외", "외화", "현지", "usd", "달러", "$", "수수료", "할인", "포인트", "잔액", "결제후", "이자", "적립", "캐시백", "입금", "환율", "회차", "잔여"],
    },
    merchant: {
      label: "가맹점",
      exact: ["가맹점", "가맹점명", "이용가맹점", "이용가맹점명", "가맹점이름", "사용처", "사용처명", "이용처", "이용하신곳", "이용하신가맹점", "상호", "상호명", "거래처", "거래처명", "내용", "거래내용", "이용내용", "적요", "사용내역", "이용내역", "merchant", "store", "description"],
      partial: ["가맹점", "사용처", "이용처", "상호", "거래처", "내용", "적요", "내역", "merchant", "store", "description"],
      exclude: ["번호", "사업자", "주소", "업종", "전화", "코드", "구분", "국가", "도시"],
    },
    industry: { exact: ["업종", "업종명", "가맹점업종", "업태", "가맹점업태", "업종구분"], partial: ["업종", "업태"], exclude: [] },
    category: { exact: ["카테고리", "분류", "category", "소비분류"], partial: ["카테고리", "category"], exclude: [] },
    method: { exact: ["결제수단", "결제방법", "결제방식", "수단", "method", "payment"], partial: ["결제수단", "결제방법", "결제방식", "method"], exclude: [] },
    status: {
      exact: ["취소여부", "승인구분", "상태", "거래구분", "매출구분", "처리구분", "승인상태", "취소구분", "구분", "status"],
      partial: ["취소", "상태", "승인구분", "매출구분", "거래구분", "처리구분"], exclude: ["카드"],
    },
    memo: { exact: ["메모", "비고", "memo", "note"], partial: ["메모", "비고"], exclude: [] },
  };
  const REQUIRED = ["date", "amount", "merchant"];
  const normHeader = (s) => String(s == null ? "" : s).replace(/^﻿/, "").toLowerCase().replace(/\s+/g, "");

  function headerScore(h, f) {
    if (!h) return 0;
    const base = h.replace(/\(.*?\)|\[.*?\]/g, "");
    const excluded = f.exclude.some((k) => h.includes(k));
    const ex = f.exact.indexOf(base);
    if (ex >= 0 && !excluded) return 1000 - ex;
    if (f.partial.some((k) => h.includes(k))) return excluded ? (f.fallback ? 10 : 0) : 500;
    return 0;
  }
  function mapColumns(cells) {
    const hs = cells.map(normHeader);
    const used = new Set(), ci = {};
    Object.keys(FIELDS).forEach((key) => {
      let best = -1, bestScore = 0;
      hs.forEach((h, i) => {
        if (used.has(i)) return;
        const sc = headerScore(h, FIELDS[key]);
        if (sc > bestScore) { bestScore = sc; best = i; }
      });
      ci[key] = best;
      if (best >= 0) used.add(best);
    });
    return ci;
  }
  // 파일 위쪽 30줄 안에서 헤더 줄 자동 탐지 (제목·조회기간 같은 줄 건너뛰기)
  function findHeader(rows) {
    let partial = null;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const ci = mapColumns(rows[i]);
      const found = REQUIRED.filter((k) => ci[k] >= 0).length;
      if (found === REQUIRED.length) return { index: i, ci };
      if (found > 0 && (!partial || found > partial.found)) partial = { index: i, ci, found };
    }
    return { index: -1, partial };
  }

  // 따옴표 없이 쓴 "12,500원"이 쉼표에서 쪼개진 줄을 다시 합침
  function repairRow(r, n, ci, delim) {
    if (r.length <= n || delim !== ",") return r;
    let extra = r.length - n;
    const out = [];
    for (let i = 0; i < r.length; i++) {
      let cell = r[i];
      while (extra > 0 && i + 1 < r.length &&
        /^\s*[-−(△₩]*\s*\d{1,3}(,\d{3})*\s*$/.test(cell) && /^\d{3}(\.\d+)?\s*원?\s*\)?\s*-?\s*$/.test(r[i + 1])) {
        cell += "," + r[i + 1]; i++; extra--;
      }
      out.push(cell);
    }
    // 그래도 칸이 많으면 가맹점 이름 안의 쉼표로 보고 합침
    if (out.length > n && ci.merchant >= 0) {
      const m = ci.merchant, k = out.length - n;
      out.splice(m, k + 1, out.slice(m, m + k + 1).join(","));
    }
    return out;
  }

  const NO_DATA_MSG = "분석할 수 있는 거래가 없어요. CSV 형식을 확인해 주세요.";
  const NEED_COLS = "필요한 컬럼: 날짜(예: 날짜, 이용일자, 승인일자) · 가맹점(예: 가맹점, 가맹점명, 사용처) · 금액(예: 금액, 이용금액, 승인금액). 페이지 맨 아래 'CSV 파일 만드는 법'을 참고하세요.";
  const CANCEL_RE = /취소|환불|반품|cancel|refund/i;
  const SUMMARY_RE = /^(합계|소계|총계|총합계|총\s*\d+\s*건|총\s*이용|total|sum)/i;
  const clip = (s, n = 20) => { s = String(s).trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

  function skipReasonText(reasons) {
    const parts = [];
    if (reasons.date.n) parts.push(`날짜를 못 읽은 줄 ${reasons.date.n}개${reasons.date.ex ? ` (예: "${reasons.date.ex}")` : ""}`);
    if (reasons.amount.n) parts.push(`금액을 못 읽은 줄 ${reasons.amount.n}개${reasons.amount.ex ? ` (예: "${reasons.amount.ex}")` : ""}`);
    if (reasons.merchant.n) parts.push(`가맹점이 빈 줄 ${reasons.merchant.n}개`);
    if (reasons.zero.n) parts.push(`금액이 0인 줄 ${reasons.zero.n}개`);
    return parts.join(", ");
  }

  // 행 배열 → 거래 배열. 필수: 날짜, 가맹점, 금액 / 선택: 결제수단, 메모, 카테고리, 취소구분
  // 금액: 지출은 양수, 취소·환불은 음수 (취소구분 컬럼이나 가맹점명의 [취소] 표기가 있으면 음수로 바꿈)
  function toTransactions(rows) {
    if (!rows || !rows.length) throw new Error(`${NO_DATA_MSG} (파일이 비어 있어요)`);
    const h = findHeader(rows);
    if (h.index < 0) {
      if (h.partial) {
        const miss = REQUIRED.filter((k) => h.partial.ci[k] < 0).map((k) => `'${FIELDS[k].label}'`).join(", ");
        throw new Error(`CSV에서 ${miss} 컬럼을 찾지 못했어요. ${NEED_COLS} (찾은 헤더: ${clip(rows[h.partial.index].join(", "), 80)})`);
      }
      throw new Error(`CSV에서 날짜·가맹점·금액 컬럼을 찾지 못했어요. ${NEED_COLS} (파일 첫 줄: ${clip(rows[0].join(", "), 80)})`);
    }
    const ci = h.ci, n = rows[h.index].length, delim = rows.delimiter || ",";
    const txns = [];
    const reasons = { date: { n: 0 }, amount: { n: 0 }, merchant: { n: 0 }, zero: { n: 0 } };
    let autoClassified = 0, summaryRows = 0, refunds = 0;
    const classifiedBy = { user: 0, transfer: 0, column: 0, merchant: 0, industry: 0, memo: 0, none: 0 };
    for (let i = h.index + 1; i < rows.length; i++) {
      const r = repairRow(rows[i], n, ci, delim);
      const cell = (k) => (ci[k] >= 0 ? String(r[ci[k]] == null ? "" : r[ci[k]]).trim() : "");
      const rawDate = cell("date"), rawAmt = cell("amount");
      const merchant = cell("merchant").replace(/\s+/g, " ");
      const date = parseDate(rawDate);
      if (!date && r.some((c) => SUMMARY_RE.test(String(c).trim()))) { summaryRows++; continue; } // 합계·소계 줄
      if (!date) { reasons.date.n++; reasons.date.ex = reasons.date.ex || clip(rawDate || "(빈 칸)"); continue; }
      let amount = parseAmount(rawAmt);
      if (!isFinite(amount)) { reasons.amount.n++; reasons.amount.ex = reasons.amount.ex || clip(rawAmt || "(빈 칸)"); continue; }
      if (!merchant) { reasons.merchant.n++; continue; }
      amount = Math.round(amount);
      if (amount === 0) { reasons.zero.n++; continue; }
      const cancelMark = CANCEL_RE.test(cell("status")) || /^[\[(]\s*(취소|환불)\s*[\])]/.test(merchant);
      if (cancelMark && amount > 0) amount = -amount;
      if (amount < 0) refunds++;
      const memo = cell("memo");
      const cls = classifyTxn({ merchant, category: cell("category"), industry: cell("industry"), memo });
      if (cls.by !== "column" && cls.by !== "user" && cls.by !== "transfer") autoClassified++;
      classifiedBy[cls.by]++;
      const method = /현금|cash/i.test(cell("method")) ? "현금" : "카드";
      txns.push({ date, merchant, amount, category: cls.category, why: cls.why, by: cls.by, method, memo, rawCategory: cell("category"), industry: cell("industry") });
    }
    const skipped = reasons.date.n + reasons.amount.n + reasons.merchant.n + reasons.zero.n;
    if (!txns.length) {
      const why = skipReasonText(reasons);
      throw new Error(`${NO_DATA_MSG}${why ? ` (${why})` : " (헤더 아래에 거래 줄이 없어요)"} 날짜는 2026-11-05, 금액은 12500처럼 적어 주세요.`);
    }
    const colName = (k) => (ci[k] >= 0 ? String(rows[h.index][ci[k]]).replace(/^﻿/, "").trim() : "");
    const notes = [];

    // 금액 부호 자동 판별: 은행·간편결제 내역은 '지출 = 음수, 입금 = 양수'로 적혀 있음.
    // 거래의 60% 이상이 음수면 이 형식으로 보고 부호를 뒤집는다.
    // 뒤집은 뒤 남는 음수(원래 양수)는 같은 가맹점·같은 금액의 지출이 있으면 '취소·환불'로 차감하고,
    // 짝이 없으면 입금(용돈·급여·이체 등)으로 보고 지출 분석에서 뺀다.
    let deposits = 0, depositSum = 0, signFlipped = false;
    const negShare = txns.filter((t) => t.amount < 0).length / txns.length;
    if (txns.length >= 3 && negShare >= 0.6) {
      signFlipped = true;
      txns.forEach((t) => { t.amount = -t.amount; });
      const spendLeft = {};
      txns.forEach((t) => { if (t.amount > 0) { const k = t.merchant + "|" + t.amount; spendLeft[k] = (spendLeft[k] || 0) + 1; } });
      const kept = txns.filter((t) => {
        if (t.amount > 0) return true;
        const k = t.merchant + "|" + -t.amount;
        if (spendLeft[k] > 0) { spendLeft[k]--; return true; } // 원거래가 있는 취소·환불
        deposits++; depositSum -= t.amount;
        return false;
      });
      txns.length = 0; kept.forEach((t) => txns.push(t));
      refunds = txns.filter((t) => t.amount < 0).length;
      notes.push(`금액의 ${Math.round(negShare * 100)}%가 음수(-)라서 '음수 = 지출' 형식(은행·간편결제 내역)으로 읽었어요`);
      if (deposits) notes.push(`입금으로 보이는 양수 금액 ${deposits}건(${Math.round(depositSum).toLocaleString("ko-KR")}원)은 지출 분석에서 뺐어요`);
      if (!txns.length) throw new Error(`${NO_DATA_MSG} (지출 거래가 없어요)`);
      Object.keys(classifiedBy).forEach((k) => (classifiedBy[k] = 0));
      txns.forEach((t) => { classifiedBy[t.by]++; });
      autoClassified = txns.filter((t) => t.by !== "column" && t.by !== "user" && t.by !== "transfer").length;
    }

    // 안전장치: 카테고리·업종·메모 컬럼이 거의 모든 줄에 같은 값이면(예: 전부 '식비', 전부 '식사')
    // 거래를 구분하는 정보가 아니므로 분류에 쓰지 않고 가맹점명으로 다시 분류한다.
    const dominant = (key) => {
      const cnt = {};
      txns.forEach((t) => { const v = t[key]; if (v) cnt[v] = (cnt[v] || 0) + 1; });
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      return top && txns.length >= 8 && top[1] / txns.length >= 0.9 ? top[0] : null;
    };
    [["rawCategory", "카테고리"], ["industry", "업종"], ["memo", "메모"]].forEach(([key, label]) => {
      const v = dominant(key);
      if (!v) return;
      txns.forEach((t) => { if (t[key] === v) t[key] = ""; });
      notes.push(`${label} 컬럼('${colName(key === "rawCategory" ? "category" : key)}')이 거의 모든 줄에 '${clip(v, 12)}'라서 분류에 쓰지 않았어요`);
    });
    if (notes.length) {
      Object.keys(classifiedBy).forEach((k) => (classifiedBy[k] = 0));
      autoClassified = 0;
      txns.forEach((t) => {
        const c = classifyTxn({ merchant: t.merchant, category: t.rawCategory, industry: t.industry, memo: t.memo });
        t.category = c.category; t.why = c.why; t.by = c.by; classifiedBy[c.by]++;
        if (c.by !== "column" && c.by !== "user" && c.by !== "transfer") autoClassified++;
      });
    }
    return {
      txns, skipped, autoClassified, refunds, summaryRows, reasons, classifiedBy, notes, signFlipped, deposits, depositSum,
      columns: { date: colName("date"), merchant: colName("merchant"), amount: colName("amount"), industry: colName("industry"), category: colName("category"), memo: colName("memo") },
      skipText: skipReasonText(reasons), headerRow: rows.lineNos ? rows.lineNos[h.index] : h.index + 1,
      delimiter: delim === "\t" ? "탭" : delim === ";" ? "세미콜론" : delim === "|" ? "|" : "쉼표",
    };
  }

  // 파일 바이트 → 거래 (인코딩 감지 + 파싱)
  function parseFile(bytes) {
    const { text, encoding } = decodeBytes(bytes);
    const res = toTransactions(parseCSV(text));
    res.encoding = encoding;
    return res;
  }

  // ---------- 샘플 데이터 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const iso = (y, mo, d) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // 최근 3개월치 가상 거래 생성 (마지막 달이 '이번 분석 달')
  function generateSample(kind) {
    const p = D.SAMPLE_PROFILES[kind];
    const rnd = mulberry32(p.seed);
    const today = new Date();
    const txns = [];
    for (let m = 3; m >= 1; m--) {
      const base = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const y = base.getFullYear(), mo = base.getMonth();
      const dim = new Date(y, mo + 1, 0).getDate();
      const scale = 1 + (3 - m) * p.growth;
      p.rules.forEach((rule) => {
        if (rule.fixed) {
          txns.push({ date: iso(y, mo, rule.day), merchant: rule.merchant, amount: rule.amount, category: rule.cat, method: "카드" });
          return;
        }
        const n = Math.max(0, Math.round(rule.count * scale));
        for (let i = 0; i < n; i++) {
          const day = 1 + Math.floor(rnd() * dim);
          const amount = Math.round((rule.min + rnd() * (rule.max - rule.min)) / 100) * 100;
          const merchant = rule.merchants[Math.floor(rnd() * rule.merchants.length)];
          txns.push({ date: iso(y, mo, day), merchant, amount, category: rule.cat, method: rnd() < (rule.cash || 0) ? "현금" : "카드" });
        }
      });
    }
    txns.sort((a, b) => a.date.localeCompare(b.date));
    return txns;
  }

  function toCSV(txns) {
    const lines = ["날짜,사용처,금액,카테고리,결제수단"];
    txns.forEach((t) => lines.push([t.date, t.merchant, t.amount, t.category, t.method].join(",")));
    return "﻿" + lines.join("\n");
  }

  // ---------- 분석 ----------
  function classifyType(f) {
    const s = {
      baemin: f.share["배달"] / 0.25,
      sub: Math.max(f.share["구독"] / 0.15, f.subCount / 4),
      cafe: f.share["카페"] / 0.15,
      shop: f.share["쇼핑"] / 0.35,
      social: (f.share["식비"] + f.share["문화"]) / 0.55,
      monthend: f.spendRatio >= 0.6 ? (f.earlyShare - 0.33) / 0.3 : 0,
      flex: f.maxTx >= 100000 ? f.topShare / 0.25 : 0,
      saver: f.spendRatio <= 0.4 ? 2 : Math.max(0, (0.55 - f.spendRatio) / 0.15),
    };
    let id = "social", best = -Infinity;
    Object.keys(s).forEach((k) => { if (s[k] > best) { best = s[k]; id = k; } });
    return { id, scores: s };
  }

  function project(E, I, g) {
    const pts = [{ k: 0, balance: 0, cumExp: 0, cumInc: 0 }];
    let bal = 0, cum = 0;
    // 선형 증가: k개월 뒤 월 지출 = 현재 월 지출 × (1 + 증가율 × k)  (복리로 불리면 3년 예측이 비현실적으로 커져서 선형 사용)
    for (let k = 1; k <= 36; k++) {
      const e = E * (1 + g * k);
      cum += e; bal += I - e;
      pts.push({ k, balance: bal, cumExp: cum, cumInc: I * k });
    }
    let overMonth = null, negMonth = null;
    for (let k = 1; k <= 36; k++) {
      if (overMonth === null && E * (1 + g * k) > I) overMonth = k;
      if (negMonth === null && pts[k].balance < 0) negMonth = k;
    }
    return { pts, m3: pts[3], y1: pts[12], y3: pts[36], overMonth, negMonth };
  }

  // 절약 플랜: 지출이 큰 카테고리 상위 2~3개
  function savingsPlan(cat, subMap, dim) {
    const rules = savingRules(subMap, dim / 7);
    const items = Object.keys(rules)
      .filter((k) => cat[k].count > 0)
      .sort((a, b) => cat[b].sum - cat[a].sum)
      .map((k) => ({ cat: k, ...rules[k](cat[k]) }))
      .map((it) => ({ ...it, monthly: Math.round(it.monthly) }))
      .filter((it) => it.monthly >= 1000)
      .slice(0, 3);
    const monthly = items.reduce((a, b) => a + b.monthly, 0);
    return { items, monthly, y1: monthly * 12, y3: monthly * 36 };
  }

  // 가장 많이 쓴 항목('기타' 제외) 맞춤 절약법: 실제 거래 숫자를 넣은 팁 + 예상 절약액
  function topSavingTip(cat, subMap, dim, topCat) {
    const c = cat[topCat];
    if (!c || c.sum <= 0) return null;
    const weeks = dim / 7, avg = c.count ? c.sum / c.count : 0;
    const vars = { avg: fmtWon(avg), count: String(c.count), perWeek: (c.count / weeks).toFixed(1), subCount: String(Object.keys(subMap).length) };
    const tips = (D.SAVING_TIPS[topCat] || []).map((t) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] || ""));
    const rule = savingRules(subMap, weeks)[topCat];
    let action = null;
    if (rule && c.count > 0) {
      const r = rule(c);
      const monthly = Math.round(r.monthly);
      if (monthly >= 1000) action = { label: r.label, monthly, y1: monthly * 12 };
    }
    return { cat: topCat, sum: c.sum, share: c.share, count: c.count, avg: Math.round(avg), tips, action, noCut: topCat === "병원비" };
  }

  // 카테고리별 절약 규칙 (병원비는 줄이라고 권하지 않음)
  function savingRules(subMap, weeks) {
    return {
      배달: (c) => {
        const wk = c.count / weeks, cut = wk >= 3 ? 2 : 1, avg = c.sum / c.count;
        return { label: `배달 주 ${cut}회 줄이기`, monthly: Math.min(avg * cut * weeks, c.sum * 0.7) };
      },
      카페: (c) => {
        const wk = c.count / weeks, cut = wk >= 4 ? 3 : wk >= 2 ? 2 : 1, avg = c.sum / c.count;
        return { label: `카페 주 ${cut}회 줄이기`, monthly: Math.min(avg * cut * weeks, c.sum * 0.7) };
      },
      식비: (c) => {
        const avg = c.sum / c.count;
        return { label: "외식·간식 주 1회를 집밥·학식으로", monthly: Math.min(avg * weeks, c.sum * 0.4) };
      },
      쇼핑: (c) => ({ label: "쇼핑 30% 줄이기 (장바구니 24시간 룰)", monthly: c.sum * 0.3 }),
      문화: (c) => ({ label: "문화·여가 20% 줄이기", monthly: c.sum * 0.2 }),
      구독: (c) => {
        const n = Object.keys(subMap).length || 1;
        return { label: "안 보는 구독 1개 해지", monthly: c.sum / n };
      },
      교통: (c) => ({ label: "택시·가까운 거리 줄이고 교통 할인 활용", monthly: c.sum * 0.15 }),
      게임: (c) => ({ label: "게임 결제 한도 정하기 (30% 줄이기)", monthly: c.sum * 0.3 }),
      운동: (c) => ({ label: "안 가는 회원권 정리·공공 체육시설 활용", monthly: c.sum * 0.2 }),
    };
  }

  // 금액 → 학생에게 와닿는 물건으로 환산
  function convert(amount) {
    const main = D.CONVERT_ITEMS.find((it) => it.price <= amount);
    if (!main) return null;
    const count = Math.floor(amount / main.price);
    const rest = amount - count * main.price;
    const chicken = main === D.CHICKEN ? 0 : Math.floor(rest / D.CHICKEN.price);
    return { item: main, count, chicken };
  }

  function recommendSubs(typeId, subMap) {
    const list = Object.entries(subMap).map(([name, amt]) => ({ name, amt })).sort((a, b) => b.amt - a.amt);
    if (list.length >= 3) {
      const keep = list[0], cut = list.slice(1);
      return { mode: "cleanup", list, keep, cut, saving: cut.reduce((a, b) => a + b.amt, 0) };
    }
    const rec = D.SUB_REC[typeId];
    if (rec && list.length < 3) return { mode: list.length ? "keep" : "recommend", list, rec };
    return { mode: "none", list };
  }

  // 한 달 거래의 순지출 (취소·환불 음수 금액을 같은 카테고리에서 빼고, 카테고리별로 0 아래로는 내려가지 않게)
  function netByCategory(list) {
    const sums = {};
    D.CATEGORIES.forEach((c) => (sums[c] = 0));
    list.forEach((t) => { sums[t.category] += t.amount; });
    D.CATEGORIES.forEach((c) => (sums[c] = Math.max(0, sums[c])));
    return sums;
  }
  const sumValues = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  function analyze(allTxns, income) {
    if (!allTxns || !allTxns.length) throw new Error("분석할 수 있는 거래가 없어요. CSV 형식을 확인해 주세요.");
    // 본인 계좌 간 이체는 지출·수입·환불 어디에도 넣지 않음 (목록에는 보여 줌)
    const txns = allTxns.filter((t) => t.category !== TRANSFER);
    if (!txns.length) throw new Error("분석할 수 있는 거래가 없어요. 모든 거래가 '본인 계좌 이체'로 표시돼 있어요. '분류 근거 확인'에서 바꿔 주세요.");
    const byMonth = {};
    txns.forEach((t) => { (byMonth[t.date.slice(0, 7)] = byMonth[t.date.slice(0, 7)] || []).push(t); });
    // 분석 달 = 순지출이 있는 가장 최근 달 (환불만 있는 달은 건너뜀)
    const months = Object.keys(byMonth).sort().filter((k) => sumValues(netByCategory(byMonth[k])) > 0);
    if (!months.length) throw new Error("분석할 수 있는 지출이 없어요. 모든 거래가 취소·환불(음수 금액)이에요. CSV 형식을 확인해 주세요.");
    // 마지막 달이 며칠치만 있는 경우(예: 11월 1~5일만) 그 달은 한 달 소비를 대표하지 못하므로 직전 달을 분석한다.
    // 기준: 마지막 거래일이 15일 이전이면서 거래 수가 직전 달보다 적거나, 거래 수가 직전 달의 절반 미만
    const posCount = (k) => byMonth[k].filter((t) => t.amount > 0).length;
    const lastDay = (k) => Math.max(...byMonth[k].map((t) => +t.date.slice(8, 10)));
    let curIdx = months.length - 1, partialMonth = null;
    if (months.length >= 2) {
      const last = months[curIdx], prev = months[curIdx - 1];
      if ((lastDay(last) <= 15 && posCount(last) < posCount(prev)) || posCount(last) < posCount(prev) * 0.5) {
        partialMonth = { key: last, days: lastDay(last), count: posCount(last) };
        curIdx--;
      }
    }
    const curKey = months[curIdx];
    const cur = byMonth[curKey];
    const net = netByCategory(cur);
    const total = sumValues(net);
    const [yy, mm] = curKey.split("-").map(Number);
    const dim = new Date(yy, mm, 0).getDate();

    const cat = {};
    D.CATEGORIES.forEach((c) => (cat[c] = { sum: net[c], count: 0, share: 0 }));
    let cash = 0, early = 0, maxTx = 0, refundCount = 0, refundSum = 0;
    const subMap = {};
    cur.forEach((t) => {
      if (t.amount > 0) cat[t.category].count++;
      else { refundCount++; refundSum -= t.amount; }
      if (t.method === "현금") cash += t.amount;
      if (+t.date.slice(8, 10) <= 10) early += t.amount;
      if (t.amount > maxTx) maxTx = t.amount;
      if (t.category === "구독") subMap[t.merchant] = (subMap[t.merchant] || 0) + t.amount;
    });
    Object.keys(subMap).forEach((k) => { if (subMap[k] <= 0) delete subMap[k]; });
    cash = Math.min(total, Math.max(0, cash));
    early = Math.min(total, Math.max(0, early));
    D.CATEGORIES.forEach((c) => (cat[c].share = cat[c].sum / total));

    // 월 지출 증가율: 2개월 이상이면 최근 변화 평균, 아니면 가정값
    const monthTotals = months.slice(0, curIdx + 1).slice(-4).map((k) => sumValues(netByCategory(byMonth[k])));
    let growth = D.DEFAULT_GROWTH, growthAssumed = true;
    if (monthTotals.length >= 2) {
      const ch = [];
      for (let i = 1; i < monthTotals.length; i++) ch.push(monthTotals[i] / monthTotals[i - 1] - 1);
      growth = Math.max(-0.02, Math.min(0.05, ch.reduce((a, b) => a + b, 0) / ch.length));
      growthAssumed = false;
    }

    const features = {
      share: Object.fromEntries(D.CATEGORIES.map((c) => [c, cat[c].share])),
      subCount: Object.keys(subMap).length,
      earlyShare: early / total,
      maxTx, topShare: maxTx / total,
      spendRatio: total / income,
    };
    const cls = classifyType(features);
    const type = D.TYPES[cls.id];
    const proj = project(total, income, growth);
    const plan = savingsPlan(cat, subMap, dim);
    const topCatForTip = D.CATEGORIES.filter((c) => c !== "기타").sort((a, b) => cat[b].sum - cat[a].sum)[0];
    const topTip = topSavingTip(cat, subMap, dim, topCatForTip);
    const subs = recommendSubs(cls.id, subMap);
    const topCat = D.CATEGORIES.filter((c) => c !== "기타").sort((a, b) => cat[b].sum - cat[a].sum)[0];
    // 분류하지 못한(기타) 가맹점 — 금액 큰 순 (사용자가 어떤 이름이 안 잡혔는지 확인할 수 있게)
    const etcMap = {};
    cur.forEach((t) => { if (t.category === "기타" && t.amount > 0) etcMap[t.merchant] = (etcMap[t.merchant] || 0) + t.amount; });
    const unclassified = Object.entries(etcMap).map(([name, sum]) => ({ name, sum })).sort((a, b) => b.sum - a.sum);
    // 가맹점별 분류 결과·근거 (화면의 '분류 근거 확인'에서 사용)
    // 같은 달의 본인 계좌 이체도 목록에 넣어서 사용자가 확인·해제할 수 있게 함 (금액은 절댓값)
    const curTransfers = allTxns.filter((t) => t.category === TRANSFER && t.date.slice(0, 7) === curKey);
    const transfer = { count: curTransfers.length, sum: curTransfers.reduce((a, t) => a + Math.abs(t.amount), 0) };
    const mMap = {};
    cur.concat(curTransfers).forEach((t) => {
      const m = mMap[t.merchant] || (mMap[t.merchant] = { name: t.merchant, category: t.category, why: t.why || "", sum: 0, count: 0 });
      m.sum += t.category === TRANSFER ? Math.abs(t.amount) : t.amount; m.count++;
    });
    const merchants = Object.values(mMap).sort((a, b) => (a.category === TRANSFER) - (b.category === TRANSFER) || b.sum - a.sum);
    // 한 카테고리가 80% 이상이면, 그 카테고리로 분류된 가장 흔한 근거를 찾아 화면에 보여 준다
    let dominance = null;
    const domCat = D.CATEGORIES.filter((c) => c !== "기타").sort((a, b) => cat[b].sum - cat[a].sum)[0];
    if (cat[domCat].share >= 0.8) {
      const whyCnt = {};
      const inCat = cur.filter((t) => t.category === domCat && t.amount > 0);
      inCat.forEach((t) => { const w = t.why || "(근거 없음)"; whyCnt[w] = (whyCnt[w] || 0) + 1; });
      const top = Object.entries(whyCnt).sort((a, b) => b[1] - a[1])[0];
      if (top) dominance = { category: domCat, share: cat[domCat].share, why: top[0], whyCount: top[1], count: inCat.length };
    }

    let risk = "safe";
    if (proj.y1.balance < 0) risk = "danger";
    else if (proj.overMonth !== null || total / income > 0.8) risk = "warn";

    const result = {
      curKey, monthsCount: months.length, txCount: cur.length - refundCount, refundCount, refundSum, income, total, dim,
      cat, cashShare: cash / total, features, scores: cls.scores, type, topCat, unclassified, merchants, dominance, partialMonth, transfer, topTip,
      growth, growthAssumed, proj, plan, subs, risk,
      compat: D.COMPAT[cls.id],
      convY1: convert(plan.y1), convY3: convert(plan.y3),
    };
    result.text = narrate(result);
    return result;
  }

  // ---------- 해석 문장 (숫자는 위에서 계산한 값을 그대로 사용) ----------
  function convText(c) {
    if (!c) return "치킨 한 마리 값에는 조금 못 미치지만 꾸준히 쌓이면 달라져요";
    let s = `${c.item.emoji} ${c.item.name} ${c.count}${c.item.unit}`;
    if (c.chicken > 0) s += ` + 🍗 치킨 ${c.chicken}마리`;
    return s;
  }

  function narrate(r) {
    const t = r.type;
    const top = r.topCat;
    const money = `(월 ${fmtWon(r.total)}, 소득 대비 ${pct(r.total / r.income)})`;
    const etc = r.cat["기타"].share;
    let typeLine;
    if (r.cat[top].sum <= 0) {
      // 분류된 지출이 하나도 없을 때 "0%가 '식비'" 같은 문장을 만들지 않음
      typeLine = `이번 달 지출을 어떤 항목인지 분류하지 못했어요. ${money} 아래 '분류되지 않은 가맹점'을 확인해 주세요.`;
    } else {
      typeLine = `${t.voice} 이번 달 지출의 ${pct(r.cat[top].share)}가 '${top}'에 쓰였어요. ${money}`;
      if (etc >= 0.3) typeLine += ` 다만 지출의 ${pct(etc)}는 분류하지 못해서 유형이 정확하지 않을 수 있어요.`;
    }

    let warning;
    const g = (r.growth * 100).toFixed(1);
    if (r.total > r.income) {
      const over = r.total - r.income;
      warning = `이미 이번 달 소득보다 ${fmtWon(over)} 더 썼어요. 이 패턴이 이어지면 1년 뒤 누적 적자 ${fmtWon(-r.proj.y1.balance)}, 3년 뒤엔 ${fmtWon(-r.proj.y3.balance)}이에요. ${convText(convert(-r.proj.y1.balance))} 값이 1년 만에 사라지는 셈이에요.`;
    } else if (r.proj.negMonth !== null) {
      warning = `지금은 버티지만 지출이 매달 현재의 ${g}%씩 늘면 ${r.proj.negMonth}개월 뒤부터 누적 잔액이 마이너스가 돼요. 3년 뒤엔 누적 적자 ${fmtWon(-r.proj.y3.balance)}이에요.`;
    } else if (r.proj.overMonth !== null) {
      warning = `지금은 남지만 지출이 매달 현재의 ${g}%씩 늘면 ${r.proj.overMonth}개월 뒤부터 매달 소득보다 많이 쓰게 돼요. 3년 뒤 누적 잔액은 ${fmtWon(r.proj.y3.balance)}으로 줄어요.`;
    } else if (r.proj.y3.balance >= 0) {
      warning = `지금 페이스면 안정적이에요! 3년 뒤 누적 ${fmtWon(r.proj.y3.balance)}이 남아요. 다만 지출이 늘지 않도록 점검해 주세요.`;
    } else {
      warning = "지금 페이스를 점검해 보세요.";
    }

    const p = r.plan;
    let saving;
    if (p.items.length) {
      saving = `${p.items[0].label}만 지켜도 월 ${fmtWon(p.items[0].monthly)}을 아껴요. 전부 실천하면 월 ${fmtWon(p.monthly)}, 1년 ${fmtWon(p.y1)}, 3년 ${fmtWon(p.y3)}이에요.`;
    } else {
      saving = "이미 줄일 곳이 거의 없을 만큼 알뜰해요. 지금 습관을 유지하세요!";
    }
    return { typeLine, warning, saving };
  }

  WM.logic = {
    fmtWon, fmtMan, pct, esc, parseCSV, toTransactions, classifyMerchant, classifyMerchantDetail, classifyTxn, setOverrides, setOwnerName, reclassify, TRANSFER,
    decodeBytes, detectDelimiter, parseDate, parseAmount, parseFile,
    generateSample, toCSV, analyze, convert, convText, project,
  };
})(typeof window !== "undefined" ? window : globalThis);
