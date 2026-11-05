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

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((x) => x.trim() !== "")) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
    return rows;
  }

  function classifyMerchant(name) {
    const n = String(name).toLowerCase().replace(/\s+/g, "");
    for (const cat of D.CLASSIFY_ORDER) {
      if (D.CATEGORY_KEYWORDS[cat].some((k) => n.includes(k.toLowerCase().replace(/\s+/g, "")))) return cat;
    }
    return "기타";
  }

  function parseDate(s) {
    const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // 행 배열 → 거래 배열. 컬럼: 날짜, 사용처, 금액, (카테고리), (결제수단)
  function toTransactions(rows) {
    if (rows.length < 2) throw new Error("데이터가 비어 있어요. 첫 줄은 컬럼 이름, 그 아래부터 거래 내역이어야 해요.");
    const header = rows[0].map((s) => s.replace(/^﻿/, "").trim().toLowerCase());
    const find = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
    const ci = {
      date: find(["날짜", "일자", "거래일", "이용일", "date"]),
      merchant: find(["사용처", "가맹점", "이용처", "내용", "merchant"]),
      amount: find(["금액", "amount"]),
      category: find(["카테고리", "분류", "category"]),
      method: find(["결제수단", "결제방법", "수단", "method"]),
    };
    if (ci.date < 0 || ci.merchant < 0 || ci.amount < 0) {
      throw new Error('CSV 첫 줄에 "날짜, 사용처, 금액" 컬럼이 있어야 해요. (카테고리, 결제수단은 선택)');
    }
    const txns = [];
    let skipped = 0, autoClassified = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const date = parseDate(r[ci.date] || "");
      const amount = Number(String(r[ci.amount] || "").replace(/[^\d.-]/g, ""));
      const merchant = (r[ci.merchant] || "").trim();
      if (!date || !isFinite(amount) || amount <= 0 || !merchant) { skipped++; continue; }
      let category = ci.category >= 0 ? (r[ci.category] || "").trim() : "";
      if (!D.CATEGORIES.includes(category)) { category = classifyMerchant(merchant); autoClassified++; }
      const methodRaw = ci.method >= 0 ? r[ci.method] || "" : "";
      txns.push({ date, merchant, amount: Math.round(amount), category, method: methodRaw.includes("현금") ? "현금" : "카드" });
    }
    if (!txns.length) throw new Error("읽을 수 있는 거래 내역이 없어요. 날짜(2025-01-31)와 금액 형식을 확인해 주세요.");
    return { txns, skipped, autoClassified };
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
    const weeks = dim / 7;
    const rules = {
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
    };
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

  function analyze(txns, income) {
    const byMonth = {};
    txns.forEach((t) => { (byMonth[t.date.slice(0, 7)] = byMonth[t.date.slice(0, 7)] || []).push(t); });
    const months = Object.keys(byMonth).sort();
    const curKey = months[months.length - 1];
    const cur = byMonth[curKey];
    const total = cur.reduce((a, t) => a + t.amount, 0);
    if (total <= 0) throw new Error("분석할 지출이 없어요.");
    const [yy, mm] = curKey.split("-").map(Number);
    const dim = new Date(yy, mm, 0).getDate();

    const cat = {};
    D.CATEGORIES.forEach((c) => (cat[c] = { sum: 0, count: 0, share: 0 }));
    let cash = 0, early = 0, maxTx = 0;
    const subMap = {};
    cur.forEach((t) => {
      cat[t.category].sum += t.amount; cat[t.category].count++;
      if (t.method === "현금") cash += t.amount;
      if (+t.date.slice(8, 10) <= 10) early += t.amount;
      if (t.amount > maxTx) maxTx = t.amount;
      if (t.category === "구독") subMap[t.merchant] = (subMap[t.merchant] || 0) + t.amount;
    });
    D.CATEGORIES.forEach((c) => (cat[c].share = cat[c].sum / total));

    // 월 지출 증가율: 2개월 이상이면 최근 변화 평균, 아니면 가정값
    const monthTotals = months.slice(-4).map((k) => byMonth[k].reduce((a, t) => a + t.amount, 0));
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
    const subs = recommendSubs(cls.id, subMap);
    const topCat = D.CATEGORIES.filter((c) => c !== "기타").sort((a, b) => cat[b].sum - cat[a].sum)[0];

    let risk = "safe";
    if (proj.y1.balance < 0) risk = "danger";
    else if (proj.overMonth !== null || total / income > 0.8) risk = "warn";

    const result = {
      curKey, monthsCount: months.length, txCount: cur.length, income, total, dim,
      cat, cashShare: cash / total, features, scores: cls.scores, type, topCat,
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
    const typeLine = `${t.voice} 이번 달 지출의 ${pct(r.cat[top].share)}가 '${top}'에 쓰였어요. (월 ${fmtWon(r.total)}, 소득 대비 ${pct(r.total / r.income)})`;

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
    fmtWon, fmtMan, pct, esc, parseCSV, toTransactions, classifyMerchant,
    generateSample, toCSV, analyze, convert, convText, project,
  };
})(typeof window !== "undefined" ? window : globalThis);
