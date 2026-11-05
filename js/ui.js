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

  async function readFileText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("euc-kr").decode(buf); }
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
    const dataNote = `분석 기준: ${r.curKey.replace("-", "년 ")}월 · 거래 ${r.txCount}건${meta.autoClassified ? ` · 자동 분류 ${meta.autoClassified}건` : ""}${meta.skipped ? ` · 건너뜀 ${meta.skipped}건` : ""}`;

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
        <h3 class="sub-h">카테고리별 소비 비중</h3>
        <div class="bars">${bars}</div>
      </section>

      <section class="card stat-card" id="stat-card" hidden>
        <div class="stat-lead">📊 나와 같은 유형은?</div>
        <div class="stat-main" id="stat-main"></div>
        <div class="stat-bar"><i id="stat-fill"></i></div>
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
  async function loadStats(r) {
    const S = WM.stats;
    if (!S || !S.enabled()) return; // 설정 안 했으면 아무 일도 하지 않음 (카드도 숨김 유지)
    const card = $("stat-card");
    if (!card) return;
    card.hidden = false;
    $("stat-main").textContent = "통계를 불러오는 중이에요…";
    let saved = false;
    try {
      if (!(r.meta && r.meta.isSample) && !r.statSaved) {
        r.statSaved = true; // 같은 결과를 두 번 저장하지 않음
        try { await S.save(r); saved = true; } catch (e) { console.warn("[월렛미러] 결과 저장 실패:", e.message); }
      }
      const { total, same } = await S.getTypeShare(r.type.name);
      if (state.result !== r) return; // 그 사이 다른 결과로 바뀌었으면 무시
      if (!total) { $("stat-card").hidden = true; return; }
      const p = (same / total) * 100;
      $("stat-main").innerHTML = same > 0
        ? `나와 같은 유형이 전체의 <b>${p.toFixed(1)}%</b>예요`
        : `아직 나와 같은 유형이 없어요 <b>(0%)</b>`;
      $("stat-fill").style.width = Math.max(p, same > 0 ? 2 : 0) + "%";
      const notes = [`${r.type.name} ${same.toLocaleString("ko-KR")}명 / 전체 ${total.toLocaleString("ko-KR")}명 (익명 통계)`];
      if (r.meta && r.meta.isSample) notes.push("샘플 데이터 결과는 통계에 저장하지 않아요.");
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
  $("file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    state.file = f || null;
    $("file-name").textContent = f ? "✅ " + f.name : "카드·현금 내역 CSV 파일 선택";
    $("btn-analyze").disabled = !f;
    showError("");
  });
  const dz = $("dropzone");
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    state.file = f; $("file-name").textContent = "✅ " + f.name; $("btn-analyze").disabled = false;
  });

  $("btn-analyze").addEventListener("click", () => run(async () => {
    const text = await readFileText(state.file);
    return L.toTransactions(L.parseCSV(text));
  }));

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

  $("result").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "restart") show("start");
    if (act.dataset.act === "save" && state.result) saveCard(state.result);
  });
})();
