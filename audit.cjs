// 원고 발행 전 자동 점검 — STYLE.md / VOICE.md 체크리스트 전량 기계 검사
// 실행: node audit.cjs 202611        (해당 연월 원고만)
//       node audit.cjs 202611 --full (썸네일 짝·다운로드 묶음까지)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS = path.join(ROOT, 'posts');
const ym = (process.argv[2] || '').replace(/\D/g, '');
const FULL = process.argv.includes('--full');
if (!/^\d{6}$/.test(ym)) { console.error('사용법: node audit.cjs 202611 [--full]'); process.exit(1); }

const DL = `C:/Users/park-/Downloads/블로그원고_${ym}`;
const ART = path.join(ROOT, 'art');
const PNG = path.join(ROOT, String(ym.slice(0, 4)), String(new Date().getMonth() + 1).padStart(2, '0'));

// VOICE.md 금지어 + STYLE.md 접속어 금지
const BANNED = ['뿐만 아니라', '더 나아가', '요약하자면', '결론적으로', '라는 점을 기억하세요',
  '신중하게 판단하셔야 합니다', '지금까지', '또한 ', '따라서 ', '종합하면', '핵심은', '여러분'];
// perl 등으로 한글 파일을 건드렸을 때 생기는 깨짐 패턴
const BROKEN = String.fromCharCode(92) + '<p' + String.fromCharCode(92) + '>';
// 세금·금융 주제는 1,800자
const HEAVY = /세금|절세|양도세|상속세|증여|종부세|연말정산|부가가치세|소득세|취득세|중도인출|금리|대출|주담대|배당|ETF|채권투자|연부연납/;

const files = fs.readdirSync(POSTS).filter((n) => n.startsWith('[' + ym));
let bad = 0;
const lens = [];

for (const f of files) {
  const t = fs.readFileSync(path.join(POSTS, f), 'utf8');
  const m = t.match(/여기서부터 복사 ▼▼▼([\s\S]*?)▲▲▲ 여기까지/);
  const body = m ? m[1] : '';
  const issues = [];
  if (!m) issues.push('본문 구분자 없음');

  // VOICE
  const n = (t.match(/더라고요|더라구요/g) || []).length;
  if (n < 2) issues.push(`더라고요 ${n}회`);
  if (t.includes(BROKEN)) issues.push('인코딩 깨짐');
  if (body.includes('—')) issues.push('본문 줄표');
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body)) issues.push('유니코드 이모지');
  for (const w of BANNED) if (body.includes(w)) issues.push(`금지어:${w.trim()}`);

  // STYLE
  if (!body.includes('오늘도 긴 글 읽어주셔서 감사합니다. ^^')) issues.push('시그니처 없음');
  if (/<h4/.test(body)) issues.push('h4 사용');
  const cards = (body.match(/<div style="border:1px solid|<div style="background:linear-gradient|<div style="background:#1b1b1b|<svg /g) || []).length;
  if (cards < 4) issues.push(`도식 ${cards}개`);
  const uls = (body.match(/<ul>/g) || []).length;
  if (uls < 3) issues.push(`ul요약 ${uls}개`);

  // 분량
  const chars = body.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s/g, '').length;
  const min = HEAVY.test(f) ? 1800 : 1500;
  if (chars < min) issues.push(`${chars}자 (기준 ${min})`);
  lens.push(chars);

  // 사실안전 푸터
  for (const sec of ['■ 숫자·사실 출처', '■ 확인 필요']) if (!t.includes(sec)) issues.push(`푸터없음:${sec}`);

  // 썸네일 짝
  if (FULL) {
    const slug = (t.match(/tc-[a-z0-9]+/) || [])[0];
    if (!slug) issues.push('썸네일 slug 없음');
    else {
      if (!/^tc-[a-z0-9]+$/.test(slug)) issues.push(`slug 비ASCII:${slug}`);
      if (!fs.existsSync(path.join(ART, slug + '.html'))) issues.push(`art/${slug}.html 없음`);
      if (!fs.existsSync(path.join(PNG, slug + '.png'))) issues.push(`PNG 없음:${slug}`);
      const folder = f.replace(/_원고\.txt$/, '');
      const dir = path.join(DL, folder);
      if (!fs.existsSync(dir)) issues.push('다운로드 폴더 없음');
      else {
        const got = fs.readdirSync(dir);
        if (got.length !== 2) issues.push(`묶음 ${got.length}개 (2개여야 함)`);
        if (got.some((x) => x.endsWith('.html'))) issues.push('다운로드에 HTML 있음');
      }
    }
  }

  if (issues.length) { console.log(`${f}\n    → ${issues.join(' / ')}`); bad++; }
}

lens.sort((a, b) => a - b);
const mid = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
console.log(`\n${files.length}편 점검 · 문제 ${bad}편 · 중앙값 ${mid}자`);
process.exit(bad ? 1 : 0);
