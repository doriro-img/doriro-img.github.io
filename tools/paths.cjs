// 경로 계산 공용 — 연도·월을 하드코딩하지 않는다.
//
// ★ 왜 있나
//   PNG 는 "굽던 시점" 의 연·월 폴더에 들어간다. 검사하려는 달과 다를 수 있다.
//   9월 원고를 8월에 구우면 파일은 2026/08/ 에 있다.
//
//   예전 코드는 이랬다.
//     path.join(ROOT, '2026', String(new Date().getMonth() + 1).padStart(2, '0'))
//   두 군데가 틀렸다.
//     1) 연도 '2026' 하드코딩 — 2027년 1월이 되면 통째로 깨진다
//     2) 월을 인자가 아니라 "오늘 날짜" 에서 가져옴 — 8월에 9월 원고를 검사하면 2026/08 을 본다
//
//   그래서 연도 폴더를 전부 훑어 실제로 있는 곳을 찾는다.

const fs = require('fs');
const path = require('path');

// 레포에 있는 연도 폴더 (2026, 2027, …) 를 최신순으로
function yearDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((d) => /^\d{4}$/.test(d) && fs.statSync(path.join(root, d)).isDirectory())
    .sort().reverse();
}

// 슬러그의 PNG 를 어느 연·월 폴더에 있든 찾는다. 없으면 빈 문자열.
function findPng(root, slug) {
  for (const y of yearDirs(root)) {
    const yd = path.join(root, y);
    for (const m of fs.readdirSync(yd).sort().reverse()) {
      const p = path.join(yd, m, slug + '.png');
      if (fs.existsSync(p)) return p;
    }
  }
  return '';
}

// 새로 구울 때 넣을 자리. ym 은 'YYYYMM'.
// 인자를 안 주면 오늘 기준이지만, 그건 마지막 수단이다 — 되도록 ym 을 넘겨라.
function pngDir(root, ym) {
  if (ym && /^\d{6}$/.test(ym)) return path.join(root, ym.slice(0, 4), ym.slice(4));
  const d = new Date();
  return path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'));
}

// 다운로드 폴더. 사용자 홈 밑이라 하드코딩된 이름만 조립한다.
function downloadDir(ym) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, 'Downloads', `블로그원고_${ym}`);
}

module.exports = { yearDirs, findPng, pngDir, downloadDir };
