/* ============================================================
   월렛미러 익명 통계 (Supabase REST)
   - 저장: 소비 유형명 + 카테고리별 비중 (생성 시각은 DB가 자동 기록)
   - 조회: 전체 건수 / 같은 유형 건수 (개별 행은 가져오지 않음)
   - 거래 내역, CSV, 사용처 이름 등은 이 파일을 거쳐 나가지 않아요.
   - 모든 함수는 실패해도 예외를 밖으로 던지지 않거나, 호출한 쪽에서 무시할 수 있어요.
   ============================================================ */
(function () {
  const WM = window.WM, D = WM.DATA;

  function cfg() {
    const s = (window.WM_CONFIG && window.WM_CONFIG.supabase) || {};
    return {
      url: String(s.url || "").trim().replace(/\/+$/, ""),
      key: String(s.anonKey || "").trim(),
      table: String(s.table || "results").trim(),
    };
  }

  // service_role / secret 키가 실수로 들어오면 사용을 거부 (브라우저에 노출되면 안 되는 키)
  function isSecretKey(key) {
    if (/^sb_secret_/i.test(key)) return true;
    const parts = key.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload.role === "service_role";
      } catch (e) { /* JWT 형식이 아니면 통과 */ }
    }
    return false;
  }

  function enabled() {
    const c = cfg();
    if (!c.url || !c.key) return false;
    if (!/^https:\/\/[^/\s]+$/.test(c.url)) { console.warn("[월렛미러] supabase.url 형식이 올바르지 않아요. 통계 기능을 끕니다."); return false; }
    if (isSecretKey(c.key)) {
      console.error("[월렛미러] config.js 에 service_role/secret 키가 들어 있어요. 사용하지 않고 통계 기능을 끕니다. 키를 지우고 새로 발급(rotate)하세요.");
      return false;
    }
    return true;
  }

  function headers(extra) {
    const c = cfg();
    const h = { apikey: c.key };
    if (/^eyJ/.test(c.key)) h.Authorization = "Bearer " + c.key; // JWT 형식의 anon 키일 때만
    return Object.assign(h, extra || {});
  }

  async function request(url, opts, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 7000);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); }
    finally { clearTimeout(timer); }
  }

  // 진단 결과 요약만 저장: { type_name, category_ratio }
  async function save(result) {
    const c = cfg();
    const ratio = {};
    D.CATEGORIES.forEach((cat) => { ratio[cat] = Math.round(result.cat[cat].share * 1000) / 1000; });
    const body = { type_name: result.type.name, category_ratio: ratio };
    const res = await request(`${c.url}/rest/v1/${encodeURIComponent(c.table)}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("save failed: " + res.status);
  }

  // 행 개수만 센다 (HEAD + Content-Range). typeName 이 없으면 전체.
  async function count(typeName) {
    const c = cfg();
    let url = `${c.url}/rest/v1/${encodeURIComponent(c.table)}?select=id`;
    if (typeName) url += `&type_name=eq.${encodeURIComponent(typeName)}`;
    const res = await request(url, { method: "HEAD", headers: headers({ Prefer: "count=exact" }) });
    if (!res.ok) throw new Error("count failed: " + res.status);
    const m = (res.headers.get("Content-Range") || "").match(/\/(\d+)$/);
    if (!m) throw new Error("count unavailable");
    return Number(m[1]);
  }

  async function getTypeShare(typeName) {
    const [total, same] = await Promise.all([count(), count(typeName)]);
    return { total, same };
  }

  // 유형별 인원 분포 (유형마다 개수만 센다. 개별 행은 가져오지 않음)
  async function getDistribution() {
    const names = Object.values(D.TYPES).map((t) => t.name);
    const [total, ...counts] = await Promise.all([count(), ...names.map((n) => count(n))]);
    return { total, types: names.map((name, i) => ({ name, count: counts[i] })) };
  }

  WM.stats = { enabled, save, count, getTypeShare, getDistribution };
})();
