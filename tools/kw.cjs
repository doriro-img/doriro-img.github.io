// 자동완성 키워드 수집 — 라인업 확정 단계에서 딱 한 번만 돌린다.
// 네이버 자동완성 + 구글 서제스트를 긁어서 제목·소제목에 박을 "실제로 사람들이 치는 말"을 뽑는다.
//
//   node tools/kw.cjs "종부세" "김장 시기"                    씨앗 직접 지정
//   node tools/kw.cjs --lineup "<...\_00_90편_키워드_라인업.txt>"   라인업 주제명 전량
//   node tools/kw.cjs --lineup <파일> --deep                  2단계 확장까지 (느림)
//   node tools/kw.cjs ... --out tools/kw_202612.json          저장 경로 지정
//
// ★ 못 하는 것: 정확한 월간 검색량. 네이버 검색광고 API 키가 있어야 나온다.
//   여기서 얻는 건 "같이 치는 말"과 그 겹침 빈도까지다. 경쟁도가 아니라 방향을 잡는 용도.

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function naver(q) {
  const u = 'https://ac.search.naver.com/nx/ac?q=' + encodeURIComponent(q) +
    '&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&ans=2&run=2&rev=4&q_enc=UTF-8';
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    return ((j.items || [])[0] || []).map((x) => x[0]).filter(Boolean);
  } catch (e) { return []; }
}

async function google(q) {
  const u = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&ie=utf-8&oe=utf-8&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = JSON.parse(await r.text());
    return (j[1] || []).filter(Boolean);
  } catch (e) { return []; }
}

// 라인업 파일에서 주제명만 긁는다: "07:12  [정부 정책·지원금]  종부세 고지서   →  tc-holdingtax.png"
function fromLineup(file) {
  const t = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/\]\s+(.+?)\s+→\s+(tc-[a-z0-9]+)\.png/);
    if (m) out.push({ seed: m[1].trim().replace(/_/g, ' '), slug: m[2] });
  }
  return out;
}

(async () => {
  const argv = process.argv.slice(2);
  const DEEP = argv.includes('--deep');
  const outIdx = argv.indexOf('--out');
  const OUT = outIdx >= 0 ? argv[outIdx + 1] : path.join(__dirname, 'kw.json');
  const lnIdx = argv.indexOf('--lineup');

  let seeds = [];
  if (lnIdx >= 0) seeds = fromLineup(argv[lnIdx + 1]);
  else seeds = argv.filter((a) => !a.startsWith('--') && a !== OUT).map((s) => ({ seed: s, slug: '' }));
  if (!seeds.length) { console.error('씨앗이 없습니다. 사용법은 파일 맨 위 주석을 보세요.'); process.exit(1); }

  // 합성 주제명("금 달러 투자 세금")은 자동완성이 안 잡힌다.
  // 비면 뒤 어절을 하나씩 떼면서 머리 키워드로 좁혀 재시도한다.
  async function probe(seed) {
    const w = seed.trim().split(/\s+/);
    for (let n = w.length; n >= 1; n--) {
      const q = w.slice(0, n).join(' ');
      const [nv, gg] = await Promise.all([naver(q), google(q)]);
      if (nv.length || gg.length) return { q, nv, gg };
      if (n > 1) await sleep(100);
    }
    // 앞에서 못 찾으면 뒤 어절 조합으로 한 번 더 (예: "국민연금 추후납부" → "추후납부")
    for (let n = 1; n < w.length; n++) {
      const q = w.slice(n).join(' ');
      const [nv, gg] = await Promise.all([naver(q), google(q)]);
      if (nv.length || gg.length) return { q, nv, gg };
      await sleep(100);
    }
    return { q: seed, nv: [], gg: [] };
  }

  const result = [];
  for (const [i, s] of seeds.entries()) {
    const hit = await probe(s.seed);
    const { nv, gg } = hit;

    // 겹침 점수: 네이버 2점(국내 검색 비중), 구글 1점, 양쪽 다 나오면 3점
    const score = {};
    nv.forEach((k) => { score[k] = (score[k] || 0) + 2; });
    gg.forEach((k) => { score[k] = (score[k] || 0) + 1; });

    // 2단계: 네이버 상위 3개를 다시 넣어 롱테일을 판다
    if (DEEP) {
      for (const k of nv.slice(0, 3)) {
        await sleep(120);
        (await naver(k)).forEach((x) => { score[x] = (score[x] || 0) + 1; });
      }
    }

    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    // 롱테일 = 실제로 물린 질의보다 길고 어절이 2개 이상인 것
    const longtail = ranked.filter(([k]) => k.length > hit.q.length && k.trim().split(/\s+/).length >= 2);

    result.push({
      slug: s.slug,
      seed: s.seed,
      hit: hit.q,
      naver: nv,
      google: gg,
      top: ranked.slice(0, 12).map(([k, v]) => ({ k, v })),
      longtail: longtail.slice(0, 8).map(([k]) => k),
    });
    console.log(`${String(i + 1).padStart(3)}/${seeds.length}  ${s.seed}  →  ${ranked.slice(0, 5).map((x) => x[0]).join(' | ') || '(응답 없음)'}`);
    await sleep(150);
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

  // 사람이 읽는 표도 같이 남긴다
  const txt = result.map((r) =>
    `■ ${r.seed}${r.slug ? '  (' + r.slug + ')' : ''}${r.hit !== r.seed ? '   [실제 질의: ' + r.hit + ']' : ''}\n` +
    `  자동완성 : ${r.top.map((x) => x.k).join(' / ') || '(없음)'}\n` +
    `  롱테일   : ${r.longtail.join(' / ') || '(없음)'}\n`
  ).join('\n');
  const txtPath = OUT.replace(/\.json$/, '') + '.txt';
  fs.writeFileSync(txtPath, txt, 'utf8');

  const dead = result.filter((r) => !r.naver.length && !r.google.length).length;
  const exact = result.filter((r) => r.hit === r.seed).length;
  // 3어절 이상 주제가 1어절까지 후퇴했으면 엉뚱한 결과일 수 있다 (예: "12월 달라지는 제도" → "12월")
  const weak = result.filter((r) => r.hit.split(/\s+/).length === 1 && r.seed.split(/\s+/).length >= 3);
  console.log(`\n${result.length}개 수집 · 무응답 ${dead}개 · 씨앗 그대로 ${exact}개 · 축약 재시도 ${result.length - exact}개`);
  if (weak.length) console.log(`  ⚠ 1어절까지 후퇴해 신뢰도가 낮은 것 ${weak.length}개: ${weak.map((r) => r.seed).join(', ')}`);
  console.log(`저장: ${OUT}`);
  console.log(`      ${txtPath}`);
})();
