// 재방문 판정 — 예전에 쓴 주제를 다시 써야 하나, 기존 글을 고쳐야 하나, 그냥 둬야 하나.
//
//   node tools/revisit.cjs                 12개월 지난 주제 전부
//   node tools/revisit.cjs --months 6      기준 개월 수 변경
//   node tools/revisit.cjs --out tools/revisit_202610.md
//
// ★ 왜 필요한가
//   중복 차단이 "같은 주제 영구 금지" 가 되면 안 된다. 제도는 해마다 바뀐다.
//   기준액·요율·신청 기간이 달라지면 작년 글은 틀린 글이 된다.
//
//   그런데 "정책이 바뀌었나" 를 기계가 알 수는 없다. 대신 잴 수 있는 게 있다.
//   **연도를 붙인 검색어에 수요가 있는가.**
//
//   실측 2026-08-23:
//     자녀장려금   → "2026 자녀장려금"  100,190   ← 연 1회 신청. 해마다 새로 찾는다
//     국민연금     → "2026 국민연금"        100   ← 상시 제도. 연도를 안 붙인다
//     연말정산     → "2026 연말정산"        210
//     건강보험료   → "2026 건강보험료"       60
//
//   ★ 어느 쪽이든 "새 글" 은 쓰지 않는다. 기존 글을 고친다.
//
//     매년 새 URL 을 파면 작년 URL 이 쌓은 신호(백링크·체류·순위 이력)를 통째로 버리고
//     0 에서 다시 시작한다. 그리고 두 URL 이 같은 주제로 공존하면 서로 순위를 깎는다
//     (카니발라이제이션). 옛 글에서 새 글로 링크를 걸어도 이건 해결되지 않는다.
//
//     티스토리는 문자 주소가 글 생성 시점에 정해지고 제목을 고쳐도 URL 이 안 바뀐다.
//     그래서 제목의 연도만 올려 쓰면 URL 을 유지한 채 최신 글이 된다.
//       "2026 자녀장려금 기준과 지급일" → "2027 자녀장려금 기준과 지급일"
//
//   판정은 "무엇을 고칠 것인가" 로 갈린다.
//     연도 수요 있음  → 제목의 연도 + 본문 수치를 갱신
//     연도 수요 없음  → 본문 수치만 갱신 (제목에 연도를 넣지 않는다)
//     둘 다 작음      → 그냥 둔다
//
//   완전히 새 글을 쓰는 건 "각도가 다를 때" 뿐이다.
//   (예: "자녀장려금 신청 방법" 이 있는데 "자녀장려금 감액 사유" 를 새로 쓰는 것)

const fs = require('fs');
const path = require('path');
const { volume } = require('./advol.cjs');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const MONTHS = parseInt(val('--months', '12'), 10);
const OUT = val('--out', null);
const NOW = val('--now', null);   // 시험용. 'YYYYMM'

// posts/ 에서 주제와 작성 시점을 뽑는다. 파일명 형식이 두 가지다.
function written() {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
    let ym = null, topic = null;
    // [20260823_0714] = YYYYMM(6) + DD(2) + _ + HHMM(4)
    let m = f.match(/^\[(\d{6})\d{2}_\d{4}\]_(.+?)_원고\.txt$/);
    if (m) { ym = m[1]; topic = m[2].replace(/_/g, ' '); }
    else {
      m = f.match(/^(\d{4})-(\d{2})-\d{2}-(.+)\.txt$/);
      if (m) { ym = m[1] + m[2]; topic = m[3]; }   // 옛 형식은 슬러그가 영문이다
    }
    if (!ym || !topic) continue;
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const L = raw.split(/\r?\n/);
    const i = L.findIndex((x) => x.startsWith('■ 제목'));
    const title = i < 0 ? '' : (L[i].includes(':')
      ? L[i].split(':').slice(1).join(':').trim()
      : (L.slice(i + 1).find((x) => x.trim()) || '').trim());
    out.push({ f, ym, topic, title, ko: /[가-힣]/.test(topic) });
  }
  return out;
}

const ymNum = (ym) => +ym.slice(0, 4) * 12 + +ym.slice(4);

(async () => {
  const now = NOW && /^\d{6}$/.test(NOW) ? NOW
    : (() => { const d = new Date(); return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0'); })();
  const nowN = ymNum(now);
  // 재작성 시점의 "그 해" 를 본다. 2027년에 다시 쓰면 사람들은 "2027 OOO" 를 친다.
  // 4분기에는 다음 해 검색도 붙기 시작하므로 둘 다 재서 큰 쪽을 쓴다.
  const curYear = +now.slice(0, 4);
  const nextYear = curYear + 1;

  const all = written();
  // 영문 슬러그(옛 형식)는 검색어가 아니라 그대로 못 쓴다. 제목에서 주제를 못 뽑으면 건너뛴다.
  const aged = all.filter((r) => r.ko && nowN - ymNum(r.ym) >= MONTHS);
  console.log(`원고 ${all.length}편 · ${MONTHS}개월 지난 한글 주제 ${aged.length}개  (기준 ${now})`);
  if (!aged.length) {
    console.log('');
    console.log('아직 재방문할 만큼 오래된 글이 없습니다.');
    console.log(`--months 를 줄이거나 --now 로 시점을 바꿔서 시험해보세요 (예: --now ${nextYear}09).`);
    return;
  }

  // 주제 자체 + 다음 해를 붙인 것을 같이 잰다
  const q = new Set();
  for (const r of aged) { q.add(r.topic); q.add(`${curYear} ${r.topic}`); q.add(`${nextYear} ${r.topic}`); }
  console.log(`검색량 조회 ${q.size}개…`);
  const { out } = await volume([...q], { onProgress: (a, b) => process.stdout.write(`\r  ${a}/${b}`) });
  process.stdout.write('\r' + ' '.repeat(30) + '\r');

  const V = (k) => (out.get(k) || {}).total ?? null;
  const rows = aged.map((r) => {
    const base = V(r.topic);
    const y1 = V(`${curYear} ${r.topic}`), y2 = V(`${nextYear} ${r.topic}`);
    const yr = Math.max(y1 ?? 0, y2 ?? 0) || null;
    // 연도 접두 수요가 실질적으로 있으면 새 글. 없으면 기존 글 수정.
    // 1,000 은 저수요 기준선과 같게 맞췄다.
    const verdict = yr != null && yr >= 1000 ? '제목+본문 갱신'
      : base != null && base >= 2000 ? '본문 갱신'
        : '그냥 둠';
    return { ...r, base, yr, verdict };
  });
  const g = (v) => rows.filter((r) => r.verdict === v);

  console.log('');
  console.log(`제목+본문 갱신 ${g('제목+본문 갱신').length}  ·  본문 갱신 ${g('본문 갱신').length}  ·  그냥 둠 ${g('그냥 둠').length}`);
  console.log('※ 전부 기존 글을 고치는 작업입니다. 새 URL 을 파지 마세요.');
  console.log('');
  for (const [v, why] of [['제목+본문 갱신', `"${curYear} OOO" 수요가 있다. 제목의 연도를 올리고 수치를 갱신한다`],
    ['본문 갱신', '연도를 안 붙이는 상시 제도다. 제목은 두고 본문 수치만 고친다'],
    ['그냥 둠', '수요가 작다. 손댈 이유가 없다']]) {
    const a = g(v);
    if (!a.length) continue;
    console.log(`════ ${v} ${a.length}개 — ${why} ════`);
    a.sort((x, z) => (z.yr || 0) - (x.yr || 0) || (z.base || 0) - (x.base || 0))
      .slice(0, 20).forEach((r) => console.log(
        `  ${r.ym}  ${r.topic.padEnd(20)} 본말 ${String(r.base ?? '-').padStart(7)} · ${curYear}+ ${String(r.yr ?? '-').padStart(6)}`));
    console.log('');
  }

  console.log('★ 전부 티스토리에서 기존 글을 여는 작업입니다. 새로 발행하지 마세요.');
  console.log('  같은 주제로 URL 이 둘이 되면 서로 순위를 깎고, 옛 URL 의 누적 신호도 버립니다.');
  console.log('  티스토리는 제목을 고쳐도 주소가 안 바뀌므로 연도만 올려 쓰면 됩니다.');

  if (OUT) {
    const tbl = (a) => a.map((r) => `| ${r.topic} | ${r.ym} | ${r.base ?? '-'} | ${r.yr ?? '-'} | ${r.f} |`).join('\n');
    fs.writeFileSync(OUT,
      `# 재방문 판정 — 기준 ${now} · ${MONTHS}개월 경과분\n\n` +
      `"정책이 바뀌었나" 는 기계가 못 봅니다. 대신 **그 해 연도를 붙인 검색 수요**를 쟀습니다.\n` +
      `연 1회 신청하는 제도는 해마다 연도를 붙여 찾고, 상시 제도는 안 붙입니다.\n\n` +
      `## ★ 전부 기존 글 수정입니다\n\n` +
      `새 URL 을 파면 작년 URL 의 누적 신호를 버리고 두 글이 서로 순위를 깎습니다.\n` +
      `티스토리는 제목을 고쳐도 주소가 안 바뀌므로 제목의 연도만 올려 쓰면 됩니다.\n\n` +
      ['제목+본문 갱신', '본문 갱신', '그냥 둠'].map((v) =>
        `## ${v} ${g(v).length}개\n\n| 주제 | 쓴 시점 | 본말 검색량 | 연도 검색량 | 파일 |\n|---|---|---|---|---|\n${tbl(g(v))}\n`).join('\n'));
    console.log('');
    console.log('저장: ' + OUT);
  }
})();
