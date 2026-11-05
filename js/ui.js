/* ============================================================
   월렛미러 화면(UI)
   ============================================================ */
(function () {
  const WM = window.WM, D = WM.DATA, L = WM.logic, CFG = window.WM_CONFIG;
  const { fmtWon, fmtMan, pct, esc } = L;
  const $ = (id) => document.getElementById(id);

  const state = { file: null, result: null, busy: false };

  // ---------- 화면 전환 ----------
  function show(name) {
    ["start", "loading", "result"].forEach((n) => $("screen-" + n).classList.toggle("active", n === name));
    window.scrollTo({ top: 0 });
  }
  function showError(msg) {
    const el = $("start-error");
    el.textContent = msg; el.hidden = !msg;
  }

  // ---------- 입력 ----------
  function readIncome() {
    const v = parseFloat($("income").value);
    if (!isFinite(v) || v <= 0) throw new Error("월 소득(만원)을 1 이상으로 입력해 주세요.");
    return Math.round(v * 10000);
  }

  // 파일을 고르면 바로 읽어서 "총 N건" 또는 오류를 보여 준다. 읽은 거래가 없으면 분석 버튼을 막는다.
  function setFileStatus(text, ok) {
    const el = $("file-status");
    el.innerHTML = text; el.hidden = !text;
    el.classList.toggle("ok", !!ok);
  }
  let loadSeq = 0;
  async function loadFile(f) {
    const seq = ++loadSeq; // 파일을 연달아 바꾸면 마지막 파일 결과만 반영
    state.file = f || null; state.parsed = null;
    $("btn-analyze").disabled = true;
    showError(""); setFileStatus("");
    $("file-name").textContent = f ? "📄 " + f.name : "카드·현금 내역 CSV 파일 선택";
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      if (seq !== loadSeq) return;
      Object.keys(userOverrides).forEach((k) => delete userOverrides[k]); // 새 파일이면 이전 수정 초기화
      L.setOverrides({}); state.openMerchants = false; state.merchantOrder = null;
      L.setOwnerName($("owner-name").value);
      const parsed = L.parseFile(buf);
      state.parsed = parsed;
      $("file-name").textContent = "✅ " + f.name;
      const extra = [];
      if (parsed.refunds) extra.push(`취소·환불 ${parsed.refunds}건 포함`);
      if (parsed.skipped) extra.push(`건너뜀 ${parsed.skipped}건 – ${parsed.skipText}`);
      if (parsed.headerRow > 1) extra.push(`${parsed.headerRow}번째 줄을 컬럼 이름으로 사용`);
      const col = parsed.columns || {};
      extra.push(`사용한 컬럼: 날짜='${col.date}' · 가맹점='${col.merchant}' · 금액='${col.amount}'` +
        (col.category ? ` · 카테고리='${col.category}'` : "") + (col.industry ? ` · 업종='${col.industry}'` : "") + (col.memo ? ` · 메모='${col.memo}'` : ""));
      const by = parsed.classifiedBy || {};
      extra.push(`분류 근거: 가맹점명 ${by.merchant || 0}건` + (by.column ? ` · 카테고리 컬럼 ${by.column}건` : "") +
        (by.industry ? ` · 업종 ${by.industry}건` : "") + (by.memo ? ` · 메모 ${by.memo}건` : "") + ` · 분류 못 함 ${by.none || 0}건`);
      (parsed.notes || []).forEach((n) => extra.push("⚠️ " + n));
      const tCount = parsed.txns.filter((t) => t.category === L.TRANSFER).length;
      if (tCount) extra.push(`🔁 본인 계좌 이체로 보이는 거래 ${tCount}건은 지출·수입에서 빼요 (결과 화면에서 확인·해제할 수 있어요)`);
      setFileStatus(`<b>총 ${parsed.txns.length.toLocaleString("ko-KR")}건의 거래를 읽었어요.</b>` +
        extra.map((x) => `<small>${esc(x)}</small>`).join("") +
        `<small>인코딩 ${esc(parsed.encoding)} · 구분자 ${esc(parsed.delimiter)}</small>`, true);
      $("btn-analyze").disabled = false;
    } catch (e) {
      if (seq !== loadSeq) return;
      $("file-name").textContent = "⚠️ " + f.name;
      setFileStatus("<b>총 0건의 거래를 읽었어요.</b>");
      showError(e.message);
    }
  }

  async function run(getTxns) {
    if (state.busy) return;
    showError("");
    let income, txns, meta = {};
    try {
      income = readIncome();
      const got = await getTxns();
      txns = got.txns; meta = got;
    } catch (e) { showError(e.message); return; }

    state.busy = true;
    state.merchantOrder = null; // 새 분석이면 목록을 다시 금액 순으로
    show("loading");
    const msgs = ["카드 내역 훑어보는 중… 🔍", "카테고리 분류하는 중… 🗂️", "미래 지갑 시뮬레이션 중… 🔮", "소비 유형 판정 중… 🧪"];
    const bar = $("progress-bar");
    bar.style.width = "0%";
    msgs.forEach((m, i) => setTimeout(() => { $("loading-msg").textContent = m; bar.style.width = ((i + 1) / msgs.length) * 100 + "%"; }, i * 450));
    await new Promise((r) => setTimeout(r, msgs.length * 450 + 200));

    try {
      state.result = WM.logic.analyze(txns, income);
      state.result.meta = meta;
      renderResult(state.result);
      show("result");
      loadStats(state.result); // 실패해도 진단 결과 화면에는 영향 없음 (기다리지 않음)
    } catch (e) {
      show("start"); showError(e.message);
    } finally { state.busy = false; }
  }

  // ---------- 차트 ----------
  function lineChart(proj) {
    const W = 360, H = 240, pad = { l: 50, r: 12, t: 14, b: 28 };
    const vals = proj.pts.map((p) => p.balance);
    let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
    if (max === min) max = min + 1;
    const x = (k) => pad.l + ((W - pad.l - pad.r) * k) / 36;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
    const neg = proj.y3.balance < 0;
    const color = neg ? "#E0556F" : "#3E9E7E";
    const line = proj.pts.map((p, i) => (i ? "L" : "M") + x(p.k).toFixed(1) + "," + y(p.balance).toFixed(1)).join(" ");
    const area = `${line} L${x(36).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
    // 축 라벨이 서로 겹치지 않도록 14px 이상 떨어진 눈금만 표시 (0 은 항상 표시)
    const ticks = [0, max, min].filter((v, i, a) => a.indexOf(v) === i)
      .filter((v) => v === 0 || Math.abs(y(v) - y(0)) >= 14);
    const yAxis = ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#2A2530" : "#E3D6DD"}" stroke-width="${v === 0 ? 1.5 : 1}" ${v === 0 ? "" : 'stroke-dasharray="4 4"'}/>` +
      `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#6B6B7B">${fmtMan(v)}</text>`).join("");
    const xAxis = [[0, "지금"], [12, "1년"], [24, "2년"], [36, "3년"]].map(([k, t]) =>
      `<text x="${x(k)}" y="${H - 10}" text-anchor="${k === 0 ? "start" : k === 36 ? "end" : "middle"}" font-size="11" fill="#6B6B7B">${t}</text>`).join("");
    const dots = [3, 12, 36].map((k) => `<circle cx="${x(k)}" cy="${y(proj.pts[k].balance)}" r="5" fill="#fff" stroke="${color}" stroke-width="2.5"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="누적 잔액 예측 그래프">
      ${yAxis}${xAxis}
      <path d="${area}" fill="${color}" opacity="0.14"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}</svg>`;
  }

  // ---------- 캐릭터 이미지 (틸론 → 미리 만든 이미지 → 이모지) ----------
  function emojiCharacter(t) {
    return `<div class="char-emoji" style="--tc:${t.color}" role="img" aria-label="${esc(t.name)} 캐릭터"><span>${t.emoji}</span></div>`;
  }

  function buildPrompt(r) {
    const t = r.type;
    const props = D.CATEGORIES.filter((c) => c !== "기타").sort((a, b) => r.cat[b].sum - r.cat[a].sum).slice(0, 2).map((c) => D.CAT_PROPS[c]);
    return `${t.prompt}, holding ${props.join(" and ")}`;
  }

  async function tillonGenerate(prompt) {
    // 틸론 API 규격에 맞게 이 함수를 수정하세요. (config.js 에 주소·키 입력)
    const res = await fetch(CFG.tillon.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + CFG.tillon.apiKey },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error("tillon " + res.status);
    const data = await res.json();
    const url = data.imageUrl || data.url || (data.base64 ? "data:image/png;base64," + data.base64 : "");
    if (!url) throw new Error("no image");
    return url;
  }

  async function mountCharacter(r) {
    const box = $("char-wrap");
    const t = r.type;
    box.innerHTML = emojiCharacter(t); // 기본값
    const setImg = (src, onFail) => {
      const img = new Image();
      img.alt = t.name + " 캐릭터"; img.className = "char-img";
      img.onload = () => { box.innerHTML = ""; box.appendChild(img); };
      img.onerror = onFail || (() => {});
      img.src = src;
    };
    const premade = () => setImg(`${CFG.imageDir}${t.id}.${CFG.imageExt}`);
    if (CFG.tillon.enabled && CFG.tillon.apiUrl) {
      try { setImg(await tillonGenerate(buildPrompt(r)), premade); return; } catch (e) { /* 대체 동작 */ }
    }
    premade();
  }

  // 분류하지 못한 가맹점 (기타 비중이 20% 이상일 때만, 금액 큰 순 최대 8개)
  function unclassifiedHtml(r) {
    const list = r.unclassified || [];
    if (!list.length || r.cat["기타"].share < 0.2) return "";
    const items = list.slice(0, 8).map((u) => `<li><span>${esc(u.name)}</span><b>${fmtWon(u.sum)}</b></li>`).join("");
    return `<div class="unclassified">
      <p class="unc-title">🔎 분류되지 않은 가맹점 <small>(지출의 ${pct(r.cat["기타"].share)} · ${list.length}곳)</small></p>
      <ul>${items}</ul>
      <p class="note">CSV에 <b>카테고리</b> 컬럼(식비·배달·카페·교통·쇼핑·구독·문화·게임·운동·병원비·기타)을 추가하거나 <b>메모</b>에 "점심", "커피"처럼 적으면 더 정확하게 분류돼요.</p>
    </div>`;
  }

  // 가장 많이 쓴 항목 맞춤 절약법
  function topTipHtml(r) {
    const t = r.topTip;
    if (!t || !t.tips.length) return "";
    const action = t.action
      ? `<div class="tip-action">이것만 실천해도 <b>${esc(t.action.label)}</b> → 월 <b>${fmtWon(t.action.monthly)}</b>, 1년 <b>${fmtWon(t.action.y1)}</b> 절약</div>`
      : t.noCut ? `<div class="tip-action">병원비는 줄이기보다 <b>돌려받을 수 있는 돈</b>을 챙기는 게 좋아요.</div>` : "";
    return `<section class="card tip-card" style="--tc:${D.CAT_COLORS[t.cat]}">
      <h3 class="sec-title">🎯 가장 많이 쓴 항목 절약법</h3>
      <p class="tip-lead">${D.CAT_EMOJI[t.cat]} <b>${esc(t.cat)}</b>에 이번 달 지출의 <b>${pct(t.share)}</b>(${fmtWon(t.sum)}, ${t.count}건)를 썼어요.</p>
      <ol class="tip-list">${t.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      ${action}
    </section>`;
  }

  // 한 카테고리가 80% 이상일 때: 왜 그렇게 분류됐는지(가장 흔한 근거)를 보여 줌
  function dominanceHtml(r) {
    const d = r.dominance;
    if (!d || (r.meta && r.meta.isSample)) return "";
    const notes = ((r.meta && r.meta.notes) || []).map((n) => `<p>⚠️ ${esc(n)}</p>`).join("");
    return `<div class="dominance">
      <p><b>📌 지출의 ${pct(d.share)}가 '${esc(d.category)}'로 분류됐어요.</b></p>
      <p>${esc(d.category)} 거래 ${d.count}건 중 ${d.whyCount}건의 근거: <b>${esc(d.why)}</b></p>
      ${notes}
      <p class="note">실제와 다르면 아래 '분류 근거 확인 · 직접 고치기'에서 바꿀 수 있어요.</p>
    </div>`;
  }

  // 가맹점별 분류 결과와 근거 + 직접 고치기 (금액 큰 순)
  function merchantsHtml(r) {
    let list = r.merchants || [];
    if (!list.length || (r.meta && r.meta.isSample)) return "";
    // 직접 고치는 동안에는 처음 보여 준 줄 순서를 유지 (바꾼 줄이 다른 자리로 튀지 않게)
    if (state.merchantOrder) {
      const pos = new Map(state.merchantOrder.map((n, i) => [n, i]));
      list = list.slice().sort((a, b) => (pos.has(a.name) ? pos.get(a.name) : 1e9) - (pos.has(b.name) ? pos.get(b.name) : 1e9));
    }
    const opts = (cur) => D.CATEGORIES.map((c) => `<option value="${c}"${c === cur ? " selected" : ""}>${D.CAT_EMOJI[c]} ${c}</option>`).join("") +
      `<option value="${L.TRANSFER}"${cur === L.TRANSFER ? " selected" : ""}>🔁 본인 계좌 이체 (분석 제외)</option>`;
    const rows = list.map((m) => `<li${m.category === L.TRANSFER ? ' class="is-transfer"' : ""}>
        <div class="mc-name"><span>${esc(m.name)}</span><small>${esc(m.why || "")}${m.count > 1 ? ` · ${m.count}건` : ""}</small></div>
        <b>${fmtWon(m.sum)}</b>
        <select data-merchant="${esc(m.name)}" aria-label="${esc(m.name)} 카테고리">${opts(m.category)}</select>
      </li>`).join("");
    return `<details class="merchant-check" id="merchant-check"${state.openMerchants ? " open" : ""}>
      <summary>🧾 분류 근거 확인 · 직접 고치기 <small>(${list.length}곳)</small></summary>
      <p class="note">가맹점 이름으로 자동 분류한 결과예요. 틀린 게 있으면 바로 바꾸세요. 같은 가맹점 거래가 모두 바뀌고 결과가 다시 계산돼요. 내 계좌끼리 옮긴 돈은 <b>🔁 본인 계좌 이체</b>로 바꾸면 지출·수입에서 빠져요. (수정 내용은 이 창을 닫으면 사라져요)</p>
      <ul>${rows}</ul>
    </details>`;
  }

  // ---------- 결과 렌더 ----------
  function convBlock(c) {
    if (!c) return `<div class="conv-empty">치킨 한 마리에는 조금 못 미치지만<br>꾸준히 쌓이면 달라져요</div>`;
    return `<div class="conv-emoji">${c.item.emoji}</div>
      <div class="conv-main">${esc(c.item.name)} <b>${c.count}${c.item.unit}</b></div>
      ${c.chicken > 0 ? `<div class="conv-sub">+ 🍗 치킨 ${c.chicken}마리</div>` : ""}`;
  }

  function renderResult(r) {
    const t = r.type, tx = r.text, p = r.plan;
    const riskLabel = { safe: "🟢 안전", warn: "🟡 주의", danger: "🔴 위험" }[r.risk];
    const cats = D.CATEGORIES.filter((c) => r.cat[c].sum > 0).sort((a, b) => r.cat[b].sum - r.cat[a].sum);
    const maxShare = Math.max(...cats.map((c) => r.cat[c].share));

    const bars = cats.map((c) => `
      <div class="bar-row">
        <span class="bar-name">${D.CAT_EMOJI[c]} ${c}</span>
        <span class="bar-track"><i style="width:${(r.cat[c].share / maxShare) * 100}%;background:${D.CAT_COLORS[c]}"></i></span>
        <span class="bar-val">${pct(r.cat[c].share)}<small>${fmtWon(r.cat[c].sum)}</small></span>
      </div>`).join("");

    const mile = (label, pt) => {
      const neg = pt.balance < 0;
      return `<div class="mile ${neg ? "neg" : "pos"}">
        <span class="mile-label">${label}</span>
        <b>${neg ? "누적 적자" : "누적 잔액"}</b>
        <strong>${neg ? "-" : "+"}${fmtWon(Math.abs(pt.balance))}</strong>
        <small>누적 지출 ${fmtWon(pt.cumExp)}</small>
      </div>`;
    };

    const planRows = p.items.length ? p.items.map((it) => `
      <li><span class="plan-emoji">${D.CAT_EMOJI[it.cat]}</span>
        <span class="plan-label">${esc(it.label)}</span>
        <span class="plan-val">월 <b>${fmtWon(it.monthly)}</b></span></li>`).join("") : `<li class="plan-none">줄일 곳이 거의 없어요. 대단해요! 👏</li>`;

    const other = (id) => D.TYPES[id];
    const g = r.compat.good, b = r.compat.bad;

    let subHtml;
    const s = r.subs;
    if (s.mode === "cleanup") {
      subHtml = `<p class="ai-line">구독이 <b>${s.list.length}개</b>예요. 한 번에 하나만 구독하고 돌려 보는 걸 추천해요.</p>
        <ul class="sub-list">${s.list.map((x, i) => `<li class="${i === 0 ? "keep" : "cut"}"><span>${i === 0 ? "✅ 유지 후보" : "✂️ 정리 후보"}</span><span>${esc(x.name)}</span><b>${fmtWon(x.amt)}</b></li>`).join("")}</ul>
        <p class="sub-save">정리하면 월 <b>${fmtWon(s.saving)}</b>, 1년 <b>${fmtWon(s.saving * 12)}</b> 절약</p>`;
    } else if (s.mode === "none") {
      subHtml = `<p class="ai-line">${s.list.length ? "지금 구독이면 충분해요. 새 구독은 추가하지 않는 걸 추천해요." : "추가 구독은 필요 없어요! 무료로 즐길 수 있는 방법을 먼저 활용해 보세요."}</p>
        <p class="sub-rec-why">💡 도서관 전자책·영상, 유튜브 무료 시청, 학생 할인 혜택부터 써 보세요.</p>`;
    } else {
      subHtml = `${s.mode === "keep" ? `<p class="ai-line">지금 구독은 <b>${s.list.length}개</b>로 적당해요. 새로 하나 더 한다면 이런 선택이 좋아요.</p>` : `<p class="ai-line">${esc(t.name)}에게 어울리는 절약형 구독이에요.</p>`}
        <div class="sub-rec"><b>${esc(s.rec.name)}</b><span>월 약 ${fmtWon(s.rec.price)}</span></div>
        <p class="sub-rec-why">${esc(s.rec.why)} <em>한 번에 1개만, 다 보면 해지!</em></p>`;
    }
    subHtml += `<p class="note">가격은 대략적인 기준이며 바뀔 수 있어요. 가입 전 공식 사이트를 확인하세요.</p>`;

    const orbitEmoji = cats.filter((c) => c !== "기타").slice(0, 2).map((c) => D.CAT_EMOJI[c]);
    const meta = r.meta || {};
    const dataNote = `${meta.isSample ? "" : `총 ${r.meta.txns.length}건의 거래를 읽었어요 · `}분석 기준: ${r.curKey.replace("-", "년 ")}월 · 거래 ${r.txCount}건${r.refundCount ? ` · 취소·환불 ${r.refundCount}건 차감` : ""}${meta.autoClassified ? ` · 자동 분류 ${meta.autoClassified}건` : ""}${meta.skipped ? ` · 건너뜀 ${meta.skipped}건` : ""}`;

    $("result").innerHTML = `
      <div class="res-top"><button class="link-btn" data-act="restart">← 처음으로</button><span>${esc(dataNote)}</span></div>

      <section class="card type-card" style="--tc:${t.color}">
        <div class="type-badge"><i></i>나의 소비 유형</div>
        <div class="char-stage">
          <div id="char-wrap" class="char-wrap"></div>
          <span class="orbit o1" aria-hidden="true">${orbitEmoji[0] || "🫧"}</span>
          <span class="orbit o2" aria-hidden="true">🎀</span>
          <span class="orbit o3" aria-hidden="true">${orbitEmoji[1] || "🫧"}</span>
        </div>
        <h2>${esc(t.name)}</h2>
        <p class="tagline">“${esc(t.tagline)}”</p>
        <p class="desc">${esc(t.desc)}</p>
        <div class="ai-box"><span class="ai-tag">월렛미러의 한마디</span><p>${esc(tx.typeLine)}</p></div>
        <div class="chips">
          <span class="chip">이번 달 지출 <b>${fmtWon(r.total)}</b></span>
          <span class="chip">소득 대비 <b>${pct(r.total / r.income)}</b></span>
          <span class="chip">현금 비중 <b>${pct(r.cashShare)}</b></span>
          <span class="chip">구독 <b>${r.features.subCount}개</b></span>
        </div>
        <h3 class="sub-h">카테고리별 소비 비중 <small>(${r.curKey.replace("-", "년 ")}월)</small></h3>
        ${r.partialMonth ? `<p class="note">📅 ${esc(r.partialMonth.key.replace("-", "년 "))}월은 ${r.partialMonth.days}일까지 거래 ${r.partialMonth.count}건만 있어서, 그 전 달인 ${esc(r.curKey.replace("-", "년 "))}월을 분석했어요.</p>` : ""}
        ${r.transfer && r.transfer.count ? `<p class="note">🔁 본인 계좌 이체 ${r.transfer.count}건(${fmtWon(r.transfer.sum)})은 지출·수입에서 뺐어요. 아래 '분류 근거 확인'에서 바꿀 수 있어요.</p>` : ""}
        <div class="bars">${bars}</div>
        ${dominanceHtml(r)}
        ${unclassifiedHtml(r)}
        ${merchantsHtml(r)}
      </section>

      <section class="card stat-card" id="stat-card" hidden>
        <div class="stat-lead">📊 나와 같은 유형은?</div>
        <div class="stat-main" id="stat-main"></div>
        <div class="stat-bar"><i id="stat-fill"></i></div>
        <ul class="stat-dist" id="stat-dist"></ul>
        <p class="note" id="stat-note"></p>
      </section>

      <section class="card warn-card risk-${r.risk}">
        <h3 class="sec-title">⚠️ 미래 손실 경고 <span class="risk-pill">${riskLabel}</span></h3>
        <p class="ai-line">${esc(tx.warning)}</p>
        <div class="chart">${lineChart(r.proj)}</div>
        <p class="chart-cap">누적 잔액 예측 (소득 − 지출의 누적)</p>
        <div class="miles">${mile("3개월 뒤", r.proj.m3)}${mile("1년 뒤", r.proj.y1)}${mile("3년 뒤", r.proj.y3)}</div>
        <p class="note">월 소득 ${fmtWon(r.income)} · 월 지출 증가율(선형) ${(r.growth * 100).toFixed(1)}% ${r.growthAssumed ? "(내역이 1개월치라 가정값이에요)" : "(최근 지출 변화 기준)"}</p>
      </section>

      ${topTipHtml(r)}

      <section class="card save-card">
        <h3 class="sec-title">💡 절약 플랜</h3>
        <ul class="plan">${planRows}</ul>
        ${p.items.length ? `<div class="plan-total">모두 실천하면 <b>월 ${fmtWon(p.monthly)}</b> 절약</div>` : ""}
        <div class="convert-hero">
          <div class="conv-lead">꾸준히 실천하면 <b>3년 뒤</b> ${fmtWon(p.y3)}</div>
          ${convBlock(r.convY3)}
          <div class="conv-year">1년 뒤(${fmtWon(p.y1)})는 ${esc(L.convText(r.convY1))} 값이에요</div>
        </div>
        <p class="ai-line">${esc(tx.saving)}</p>
      </section>

      <section class="card compat-card">
        <h3 class="sec-title">💞 소비 유형 궁합</h3>
        <div class="compat-grid">
          <div class="compat good"><span class="compat-tag">찰떡 궁합</span><div class="compat-emoji">${other(g).emoji}</div><b>${esc(other(g).name)}</b><p>${esc(r.compat.goodWhy)}</p></div>
          <div class="compat bad"><span class="compat-tag">상극</span><div class="compat-emoji">${other(b).emoji}</div><b>${esc(other(b).name)}</b><p>${esc(r.compat.badWhy)}</p></div>
        </div>
      </section>

      <section class="card sub-card">
        <h3 class="sec-title">📺 맞춤 구독 추천</h3>
        ${subHtml}
      </section>

      <div class="actions">
        <button class="btn primary" data-act="save">🖼️ 유형 카드 이미지로 저장</button>
        <button class="btn ghost" data-act="restart">🔄 다시 하기</button>
      </div>
      <p class="disclaimer">이 결과는 입력한 내역을 바탕으로 한 참고용 시뮬레이션이며, 재무 자문이 아니에요.</p>
    `;
    mountCharacter(r);
  }

  // ---------- 익명 통계: 결과 요약 저장 + 같은 유형 비율 ----------
  // 저장하는 값은 유형명·카테고리 비중뿐. 샘플 데이터 결과는 통계가 오염되지 않도록 저장하지 않고 조회만 해요.
  // 같은 파일을 여러 번 분석해도 한 번만 저장 (이 창이 열려 있는 동안만 기억, 파일 이름·크기·거래 수 기준)
  const savedFiles = new Set();
  async function loadStats(r, opts) {
    const S = WM.stats;
    if (!S || !S.enabled()) return; // 설정 안 했으면 아무 일도 하지 않음 (카드도 숨김 유지)
    const card = $("stat-card");
    if (!card) return;
    card.hidden = false;
    $("stat-main").textContent = "통계를 불러오는 중이에요…";
    const isSample = r.meta && r.meta.isSample;
    const fileKey = state.file ? `${state.file.name}|${state.file.size}|${(r.meta && r.meta.txns || []).length}` : "";
    let saved = false, already = false;
    try {
      if (!isSample && !(opts && opts.noSave)) {
        if (fileKey && savedFiles.has(fileKey)) already = true;
        else {
          if (fileKey) savedFiles.add(fileKey);
          try { await S.save(r); saved = true; } catch (e) { console.warn("[월렛미러] 결과 저장 실패:", e.message); }
        }
      }
      const dist = await S.getDistribution();
      if (state.result !== r) return; // 그 사이 다른 결과로 바뀌었으면 무시
      const total = dist.total;
      if (!total) { $("stat-card").hidden = true; return; }
      const mine = dist.types.find((t) => t.name === r.type.name) || { count: 0 };
      const same = mine.count, p = (same / total) * 100;
      $("stat-main").innerHTML = same > 0
        ? `나와 같은 <b class="stat-type">${esc(r.type.emoji)} ${esc(r.type.name)}</b>은 전체의 <b>${p.toFixed(1)}%</b>예요`
        : `아직 나와 같은 유형이 없어요 <b>(0%)</b>`;
      $("stat-fill").style.width = Math.max(p, same > 0 ? 2 : 0) + "%";
      // 전체 유형 분포 (많은 순, 내 유형 강조)
      const byName = Object.fromEntries(Object.values(D.TYPES).map((t) => [t.name, t]));
      const rank = dist.types.slice().sort((a, b) => b.count - a.count);
      const myRank = rank.findIndex((t) => t.name === r.type.name) + 1;
      $("stat-dist").innerHTML = rank.map((t) => {
        const tp = (t.count / total) * 100, ty = byName[t.name] || {};
        return `<li class="${t.name === r.type.name ? "me" : ""}">
          <span class="sd-name">${esc(ty.emoji || "")} ${esc(t.name)}${t.name === r.type.name ? " <em>나</em>" : ""}</span>
          <span class="sd-track"><i style="width:${tp}%;background:${ty.color || "#ccc"}"></i></span>
          <span class="sd-val">${tp.toFixed(1)}%</span></li>`;
      }).join("");
      const notes = [`${r.type.name} ${same.toLocaleString("ko-KR")}명 / 전체 ${total.toLocaleString("ko-KR")}명${same > 0 ? ` · 8개 유형 중 ${myRank}위` : ""} (익명 통계)`];
      if (isSample) notes.push("샘플 데이터 결과는 통계에 저장하지 않아요.");
      else if (already) notes.push("같은 파일은 한 번만 통계에 저장해요.");
      else if (opts && opts.noSave) notes.push("직접 고친 결과는 통계에 다시 저장하지 않아요. (처음 분석한 결과가 저장돼 있어요)");
      else if (!saved) notes.push("내 결과는 이번 통계에 포함되지 않았어요.");
      if (total < 30) notes.push("참여자가 아직 적어서 숫자가 크게 달라질 수 있어요.");
      $("stat-note").innerHTML = notes.map((n) => `<span>${esc(n)}</span>`).join(" ");
    } catch (e) {
      console.warn("[월렛미러] 통계 조회 실패:", e.message);
      const el = $("stat-card");
      if (el && state.result === r) el.hidden = true; // 실패하면 조용히 숨김
    }
  }

  // ---------- 이미지 저장 (유형 카드) ----------
  function saveCard(r) {
    const W = 1080, H = 1350, t = r.type;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    // 파우더 핑크 → 베이비블루 → 세이지 민트 그라데이션 배경
    const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
    grad.addColorStop(0, "#F6C9D8"); grad.addColorStop(0.55, "#D9E6F7"); grad.addColorStop(1, "#CFE3D6");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    for (let x = 0; x < W; x += 68) ctx.fillRect(x, 0, 34, H * 0.55); // 커튼 주름 느낌
    const rr = (x, y, w, h, rad) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, rad) : ctx.rect(x, y, w, h); };
    ctx.fillStyle = "rgba(255,255,255,.78)"; rr(60, 60, W - 120, H - 120, 56); ctx.fill();
    const font = "'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif";
    ctx.textAlign = "center"; ctx.fillStyle = "#2A2530"; ctx.font = `900 34px ${font}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "10px";
    ctx.fillText("WALLET MIRROR", W / 2 + 5, 150);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillStyle = t.color + "66"; ctx.beginPath(); ctx.arc(W / 2, 400, 205, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 8; ctx.stroke();
    ctx.font = "260px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"; ctx.fillStyle = "#000";
    ctx.fillText(t.emoji, W / 2, 490);
    ctx.font = "90px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
    ctx.fillText("🎀", W / 2 + 250, 250); ctx.fillText("🫧", W / 2 - 270, 520);
    ctx.fillStyle = "#2A2530"; ctx.font = `900 88px ${font}`; ctx.fillText(t.name, W / 2, 700);
    ctx.fillStyle = "#6E6675"; ctx.font = `600 38px ${font}`;
    wrap(ctx, `“${t.tagline}”`, W / 2, 770, W - 260, 52);
    const y1 = r.proj.y1.balance;
    const rows = [
      ["이번 달 지출", fmtWon(r.total)],
      [y1 < 0 ? "1년 뒤 누적 적자" : "1년 뒤 누적 잔액", fmtWon(Math.abs(y1))],
      ["절약하면 3년 뒤", r.convY3 ? `${r.convY3.item.name} ${r.convY3.count}${r.convY3.item.unit}` : fmtWon(r.plan.y3)],
    ];
    rows.forEach((row, i) => {
      const y = 920 + i * 110;
      ctx.fillStyle = "rgba(246,201,216,.5)"; rr(130, y - 62, W - 260, 92, 6); ctx.fill();
      ctx.strokeStyle = "rgba(42,37,48,.3)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = "#6E6675"; ctx.font = `600 32px ${font}`; ctx.fillText(row[0], 170, y);
      ctx.textAlign = "right"; ctx.fillStyle = "#2A2530"; ctx.font = `900 38px ${font}`; ctx.fillText(row[1], W - 170, y);
    });
    ctx.textAlign = "center"; ctx.fillStyle = "#2A2530"; ctx.font = `900 36px ${font}`;
    ctx.fillText("walletmirror", W / 2 - 14, 1260);
    ctx.fillStyle = "#D9608C"; ctx.textAlign = "left";
    ctx.fillText(".", W / 2 + ctx.measureText("walletmirror").width / 2 - 14, 1260);
    try {
      const a = document.createElement("a");
      a.download = `월렛미러_${t.name}.png`; a.href = c.toDataURL("image/png");
      a.click();
    } catch (e) { alert("이미지 저장에 실패했어요. 화면을 캡처해 주세요."); }
  }
  function wrap(ctx, text, x, y, maxW, lh) {
    let line = "", yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; } else line += ch;
    }
    ctx.fillText(line, x, yy);
  }

  // ---------- 이벤트 ----------
  $("file").addEventListener("change", (e) => { loadFile(e.target.files[0]); });
  // 본인 이름을 바꾸면 이미 고른 파일을 다시 읽어서 본인 계좌 이체를 다시 찾음
  $("owner-name").addEventListener("change", () => { if (state.file) loadFile(state.file); });
  const dz = $("dropzone");
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  $("btn-analyze").addEventListener("click", () => run(async () => {
    if (!state.parsed || !state.parsed.txns.length) throw new Error("분석할 수 있는 거래가 없어요. CSV 형식을 확인해 주세요.");
    return state.parsed;
  }));

  // 'CSV 파일 만드는 법' 프롬프트 복사
  const copyBtn = $("btn-copy-prompt");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    const text = $("ai-prompt").textContent.trim();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      // file:// 로 열었거나 권한이 없을 때 대체 방법
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
    }
    copyBtn.textContent = ok ? "✅ 복사됐어요!" : "복사 실패 – 직접 드래그해서 복사해 주세요";
    setTimeout(() => { copyBtn.textContent = "📋 프롬프트 복사"; }, 2000);
  });

  document.querySelectorAll("[data-sample]").forEach((b) => b.addEventListener("click", () =>
    run(async () => ({ txns: L.generateSample(b.dataset.sample), skipped: 0, autoClassified: 0, isSample: true }))));

  // 통계 저장이 켜져 있을 때만 개인정보 안내 문구를 바꿈 (꺼져 있으면 기존 문구 그대로)
  if (WM.stats && WM.stats.enabled()) {
    $("privacy").textContent = "🔒 업로드한 CSV와 소비 내역은 이 브라우저 안에서만 처리되고 저장되지 않아요. 진단 결과 요약(유형명·카테고리 비중)만 익명 통계로 저장돼요. 샘플 체험은 저장하지 않아요.";
  }

  document.querySelectorAll("[data-download]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const blob = new Blob([L.toCSV(L.generateSample(a.dataset.download))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `월렛미러_샘플_${a.dataset.download}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));

  // 분류 직접 고치기 → 같은 가맹점 거래를 모두 바꾸고 결과 다시 계산 (메모리에만 보관)
  const userOverrides = {};
  $("result").addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-merchant]");
    if (!sel || !state.result || !state.result.meta || !state.result.meta.txns) return;
    const name = sel.dataset.merchant;
    userOverrides[name] = sel.value;
    L.setOverrides(userOverrides);
    // 다시 그리기 전에 화면·목록 스크롤 위치와 줄 순서를 기억
    const meta = state.result.meta, y = window.scrollY;
    const ul = document.querySelector("#merchant-check ul");
    const listTop = ul ? ul.scrollTop : 0;
    if (!state.merchantOrder) state.merchantOrder = [...document.querySelectorAll("#merchant-check select[data-merchant]")].map((s) => s.dataset.merchant);
    L.reclassify(meta.txns);
    try {
      state.result = L.analyze(meta.txns, state.result.income);
      state.result.meta = meta;
      state.openMerchants = true;
      renderResult(state.result);
      // 스크롤 위치 복원 → 고치던 자리 그대로
      const ul2 = document.querySelector("#merchant-check ul");
      if (ul2) ul2.scrollTop = listTop;
      window.scrollTo({ top: y, behavior: "instant" });
      const sel2 = [...document.querySelectorAll("#merchant-check select[data-merchant]")].find((s) => s.dataset.merchant === name);
      if (sel2) sel2.focus({ preventScroll: true });
      loadStats(state.result, { noSave: true }); // 바뀐 유형 기준으로 통계만 다시 조회 (저장은 안 함)
    } catch (err) { showError(err.message); }
  });
  $("result").addEventListener("toggle", (e) => {
    if (e.target.id === "merchant-check") state.openMerchants = e.target.open;
  }, true);

  $("result").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "restart") show("start");
    if (act.dataset.act === "save" && state.result) saveCard(state.result);
  });
})();
