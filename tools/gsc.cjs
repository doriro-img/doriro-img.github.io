// Google Search Console 성과 조회 — 이 파이프라인의 유일한 사후 지표.
//
//   node tools/gsc.cjs                    최근 28일 요약
//   node tools/gsc.cjs --days 90
//   node tools/gsc.cjs --check 202609     그 달 원고가 색인·노출되는지 대조
//   node tools/gsc.cjs --out tools/gsc_202610.md
//
// ★ 왜 이게 제일 중요한가
//   나머지 도구는 전부 "사전 지표" 다. 검색량·광고 CTR 은 발행 전에 재는 값이고,
//   그게 실제 유입으로 이어졌는지는 알려주지 않는다.
//   90편을 써도 색인이 안 되면 0편이고, 색인돼도 30위면 유입이 0이다.
//
//   GSC 는 두 가지를 준다.
//     1) 색인·노출 여부  — 쓴 글이 검색 결과에 나오기는 하는가
//     2) 실제 게재순위    — 경쟁률을 사전에 못 재도 사후에 알 수 있다
//
//   이 둘이 없으면 파이프라인은 열린 고리(open loop)다. 틀린 방향으로 90편을 쓴다.
//
// ── 준비 (10분, 전부 무료) ────────────────────────────────────────────────
//   1. console.cloud.google.com 에서 프로젝트를 만든다
//   2. "API 및 서비스" → Google Search Console API 사용 설정
//   3. "사용자 인증 정보" → 서비스 계정 만들기 → 키 추가(JSON) → 파일 저장
//   4. search.google.com/search-console 에서 속성 → 설정 → 사용자 및 권한
//      → 위 서비스 계정 이메일(...@....iam.gserviceaccount.com)을 "전체" 로 추가
//   5. 받은 JSON 파일을 레포 루트에 gsc-key.json 으로 두거나 .env 에 경로를 적는다
//
//   .env 예시 (커밋되지 않는다)
//     GSC_KEY_FILE=C:/dev/blog-cdn/gsc-key.json
//     GSC_SITE=https://heelovee.tistory.com/
//       ↑ 속성이 도메인 속성이면 sc-domain:heelovee.tistory.com 으로 적는다

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const DAYS = parseInt(val('--days', '28'), 10);
const CHECK = val('--check', null);      // 'YYYYMM'
const OUT = val('--out', null);

function env() {
  const out = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  }
  return out;
}
const E = env();

function keyFile() {
  const cand = [E.GSC_KEY_FILE, path.join(ROOT, 'gsc-key.json')].filter(Boolean);
  for (const p of cand) if (fs.existsSync(p)) return p;
  return null;
}

function guide() {
  console.error('GSC 자격 증명이 없습니다.');
  console.error('');
  console.error('  1. console.cloud.google.com 에서 프로젝트 생성');
  console.error('  2. Google Search Console API 사용 설정');
  console.error('  3. 서비스 계정 만들고 JSON 키 내려받기');
  console.error('  4. search.google.com/search-console → 속성 → 설정 → 사용자 및 권한');
  console.error('     서비스 계정 이메일을 "전체" 권한으로 추가');
  console.error('  5. JSON 을 C:/dev/blog-cdn/gsc-key.json 으로 저장');
  console.error('');
  console.error('  .env 에 사이트 주소도 적으세요');
  console.error('     GSC_SITE=https://heelovee.tistory.com/');
  console.error('     (도메인 속성이면 sc-domain:heelovee.tistory.com)');
  console.error('');
  console.error('  ★ gsc-key.json 은 .gitignore 대상입니다. 이 레포는 공개입니다.');
  process.exit(1);
}

// 서비스 계정 JWT → 액세스 토큰. googleapis 패키지 없이 crypto 만으로 한다.
async function token(key) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${body}.${sig}`,
    }),
  });
  const j = await r.json();
  if (!j.access_token) {
    console.error('토큰 발급 실패: ' + JSON.stringify(j).slice(0, 300));
    console.error('서비스 계정이 GSC 속성에 사용자로 추가돼 있는지 확인하세요.');
    process.exit(1);
  }
  return j.access_token;
}

const ymd = (d) => d.toISOString().slice(0, 10);

async function query(tok, site, dims, days, rowLimit = 25000) {
  const end = new Date(Date.now() - 2 * 864e5);   // GSC 는 이틀쯤 지연된다
  const start = new Date(end - (days - 1) * 864e5);
  const r = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: dims, rowLimit }),
    }
  );
  if (!r.ok) {
    const t = await r.text();
    console.error(`GSC 호출 실패 HTTP ${r.status}\n${t.slice(0, 400)}`);
    if (r.status === 403) console.error('\n서비스 계정에 속성 권한이 없습니다. GSC 설정에서 사용자로 추가하세요.');
    process.exit(1);
  }
  const j = await r.json();
  return j.rows || [];
}

// 원고의 제목·슬러그로 GSC 페이지를 대조한다. 티스토리 URL 은 번호나 슬러그다.
function posts(ym) {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => (ym ? f.startsWith('[' + ym) : f.endsWith('.txt')))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const L = raw.split(/\r?\n/);
      const i = L.findIndex((x) => x.startsWith('■ 제목'));
      const title = i < 0 ? '' : (L[i].includes(':')
        ? L[i].split(':').slice(1).join(':').trim()
        : (L.slice(i + 1).find((x) => x.trim()) || '').trim());
      return { f, title, slug: (raw.match(/tc-[a-z0-9]+/) || [])[0] || '' };
    })
    .filter((x) => x.title);
}

(async () => {
  const kf = keyFile();
  if (!kf) guide();
  const site = E.GSC_SITE;
  if (!site) { console.error('.env 에 GSC_SITE 가 없습니다.'); guide(); }

  const key = JSON.parse(fs.readFileSync(kf, 'utf8'));
  const tok = await token(key);
  console.log(`${site} · 최근 ${DAYS}일 (GSC 는 이틀 지연)`);

  const pages = await query(tok, site, ['page'], DAYS);
  const queries = await query(tok, site, ['query'], DAYS);

  const sum = (a, k) => a.reduce((x, r) => x + (r[k] || 0), 0);
  const clicks = sum(pages, 'clicks'), imp = sum(pages, 'impressions');
  console.log('');
  console.log(`노출 ${imp.toLocaleString()} · 클릭 ${clicks.toLocaleString()} · CTR ${imp ? (clicks / imp * 100).toFixed(2) : '0.00'}%`);
  console.log(`노출된 페이지 ${pages.length}개 · 유입 검색어 ${queries.length}개`);

  // ── 노출 범위 ───────────────────────────────────────────────────────────
  //
  // ★ 원고 파일과 GSC 페이지를 이름으로 대조할 수 없다.
  //   티스토리 URL 이 숫자다(/126). 제목이 URL 에 안 들어간다.
  //   예전에 "제목 앞 8자가 검색어에 있는지" 로 맞춰봤는데 성립하지 않는 방법이었다
  //   (183편 중 1편만 잡혔다. 매칭이 안 되는 게 당연했다).
  //
  //   그래서 "몇 편이 노출되는가" 만 세고, 어느 편인지는 URL 로 직접 본다.
  const P = posts(CHECK);
  console.log('');
  console.log('════ 노출 범위 ════');
  console.log(`  노출된 페이지 ${pages.length}개`);
  if (P.length) console.log(`  레포의 ${CHECK || '전체'} 원고 ${P.length}편 (실제 발행 수는 티스토리 기준)`);

  // 순위는 잡았는데 클릭이 0 이면 제목이 안 눌린 것이다. 글을 다시 쓸 게 아니라 제목만 고치면 된다.
  const dead = pages.filter((r) => r.impressions >= 50 && r.clicks === 0);
  if (dead.length) {
    console.log('');
    console.log(`  ★ 노출 50 이상인데 클릭 0 인 페이지 ${dead.length}개 — 제목을 고칠 자리`);
    dead.sort((a, b) => b.impressions - a.impressions).slice(0, 10).forEach((r) =>
      console.log(`      노출 ${String(r.impressions).padStart(5)} · ${r.position.toFixed(1)}위   ${decodeURIComponent(r.keys[0])}`));
  }

  // ── 순위 분포 ───────────────────────────────────────────────────────────
  // 경쟁률을 사전에 못 재는 대신 여기서 사후로 안다.
  console.log('');
  console.log('════ 게재순위 분포 (검색어 기준) ════');
  const band = [[1, 3, '1~3위'], [4, 10, '4~10위'], [11, 20, '11~20위'], [21, 50, '21~50위'], [51, 999, '51위+']];
  for (const [lo, hi, name] of band) {
    const g = queries.filter((r) => r.position >= lo && r.position <= hi);
    const c = sum(g, 'clicks');
    console.log(`  ${name.padEnd(8)} 검색어 ${String(g.length).padStart(5)}개 · 노출 ${String(sum(g, 'impressions')).padStart(7)} · 클릭 ${String(c).padStart(5)}`);
  }

  console.log('');
  console.log('════ 클릭 상위 15 검색어 ════');
  queries.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 15).forEach((r) =>
    console.log(`  클릭 ${String(r.clicks).padStart(4)} · 노출 ${String(r.impressions).padStart(6)} · ${r.position.toFixed(1)}위   ${r.keys[0]}`));

  console.log('');
  console.log('════ 노출은 큰데 클릭이 안 나오는 검색어 (제목을 고칠 자리) ════');
  queries.filter((r) => r.impressions >= 100 && r.clicks / r.impressions < 0.01)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 12).forEach((r) =>
      console.log(`  노출 ${String(r.impressions).padStart(6)} · 클릭 ${String(r.clicks).padStart(3)} · ${r.position.toFixed(1)}위   ${r.keys[0]}`));

  if (OUT) {
    const t = (a) => a.map((r) => `| ${r.keys[0]} | ${r.clicks} | ${r.impressions} | ${(r.clicks / r.impressions * 100).toFixed(2)}% | ${r.position.toFixed(1)} |`).join('\n');
    fs.writeFileSync(OUT,
      `# GSC 성과 — ${site} · 최근 ${DAYS}일\n\n` +
      `노출 ${imp.toLocaleString()} · 클릭 ${clicks.toLocaleString()} · CTR ${imp ? (clicks / imp * 100).toFixed(2) : '0.00'}%\n\n` +
      `## 검색어 ${queries.length}개\n\n| 검색어 | 클릭 | 노출 | CTR | 평균순위 |\n|---|---|---|---|---|\n` +
      t(queries.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 300)) + '\n');
    console.log('');
    console.log('저장: ' + OUT);
  }
})();
