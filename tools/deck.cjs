// 발행 보드 — 원고를 읽어 복사 버튼이 달린 정적 HTML 한 장으로 뽑는다.
// 203줄짜리 본문을 드래그로 잡는 대신 버튼 한 번으로 클립보드에 넣는 것이 목적이다.
//
//   node tools/deck.cjs 202608
//   node tools/deck.cjs 202608 --out <경로.html>
//
// 결과는 기본으로 다운로드 월 폴더에 _00_발행보드.html 로 떨어진다.
// 라인업 파일 옆에 두면 업로드하러 갈 때 같이 눈에 띈다.
//
// ★ file:// 로 열리므로 navigator.clipboard 가 막힌다. execCommand 폴백을 같이 넣는다.
// ★ 발행 체크는 localStorage 에 남는다. 파일을 다시 뽑아도 체크가 유지된다.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POSTS = path.join(ROOT, 'posts');
const args = process.argv.slice(2);
const ym = args.find((a) => /^\d{6}$/.test(a));
if (!ym) { console.error('사용법: node tools/deck.cjs 202608 [--out <경로>]'); process.exit(1); }
const DL = `C:/Users/park-/Downloads/블로그원고_${ym}`;
const OUT = args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : path.join(DL, '_00_발행보드.html');

const one = (t, re) => ((t.match(re) || [])[1] || '').trim();

const items = [];
for (const f of fs.readdirSync(POSTS).filter((n) => n.startsWith('[' + ym)).sort()) {
  const t = fs.readFileSync(path.join(POSTS, f), 'utf8');
  const body = (t.match(/여기서부터 복사 ▼▼▼([\s\S]*?)▲▲▲ 여기까지/) || [])[1];
  if (!body) { console.log('본문 구분자 없음, 건너뜀:', f); continue; }
  const slug = (t.match(/tc-[a-z0-9]+/) || [])[0] || '';
  const folder = f.replace(/_원고\.txt$/, '');
  const b = body.trim();

  // PNG 는 다운로드 묶음 안에 있다. 보드가 같은 폴더에 놓이므로 상대경로로 걸린다.
  const rel = `./${folder}/${slug}.png`;
  const abs = path.join(DL, folder, slug + '.png');

  items.push({
    file: f, folder, slug,
    title: one(t, /■ 제목:\s*(.+)/),
    cat: one(t, /■ 카테고리:\s*(.+)/),
    tags: one(t, /■ 태그:\s*(.+)/),
    when: one(t, /■ 예약 발행 일시:\s*(.+)/),
    body: b,
    png: fs.existsSync(abs) ? rel : '',
    pngPath: path.join(DL, folder).replace(/\//g, '\\'),
    chars: b.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s/g, '').length,
    blocks: (b.match(/margin\s*:\s*24px\s+0/g) || []).length + (b.match(/<blockquote>/g) || []).length,
    svg: (b.match(/<svg[\s>]/g) || []).length,
    uls: (b.match(/<ul>/g) || []).length,
    tagN: one(t, /■ 태그:\s*(.+)/).split(',').filter((x) => x.trim()).length,
  });
}
if (!items.length) { console.error(`posts/ 에 [${ym} 로 시작하는 원고가 없습니다.`); process.exit(1); }

const CAT_COLOR = { '정부': '#1e3a8a', '금융': '#047857', '생활': '#374151' };
const catColor = (c) => CAT_COLOR[Object.keys(CAT_COLOR).find((k) => c.includes(k))] || '#374151';

// </script> 로 빠져나가지 못하게 < 를 이스케이프한다
const json = JSON.stringify(items).replace(/</g, '\\u003c');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cards = items.map((it, i) => `
<article class="card" data-i="${i}" data-slug="${esc(it.slug)}">
  <header>
    <label class="done"><input type="checkbox" data-done="${esc(it.slug)}" /><span>발행완료</span></label>
    <div class="when">${esc(it.when)}</div>
    <div class="cat" style="background:${catColor(it.cat)}">${esc(it.cat)}</div>
    <div class="slug">${esc(it.slug)}</div>
  </header>

  <div class="row">
    <div class="lbl">제목</div>
    <div class="val">${esc(it.title)}</div>
    <button class="cp" data-cp="title" data-i="${i}">복사</button>
  </div>

  <div class="row">
    <div class="lbl">태그 <em>${it.tagN}개</em></div>
    <div class="val">${esc(it.tags)}</div>
    <button class="cp" data-cp="tags" data-i="${i}">복사</button>
  </div>

  <div class="row big">
    <div class="lbl">본문 HTML</div>
    <div class="val stat">
      <span>${it.chars.toLocaleString()}자</span>
      <span class="${it.blocks >= 5 ? 'ok' : 'ng'}">도식 ${it.blocks}</span>
      <span class="${it.svg > 0 ? 'ok' : 'ng'}">svg ${it.svg}</span>
      <span class="${it.uls >= 3 ? 'ok' : 'ng'}">ul ${it.uls}</span>
    </div>
    <button class="cp main" data-cp="body" data-i="${i}">본문 복사</button>
  </div>

  <div class="thumb">
    ${it.png ? `<img src="${esc(it.png)}" alt="${esc(it.slug)}" />` : '<div class="nopng">PNG 없음</div>'}
    <div class="tpath">
      <div>대표이미지는 직접 업로드해야 합니다</div>
      <code>${esc(it.pngPath)}</code>
      <button class="cp mini" data-cp="pngPath" data-i="${i}">경로 복사</button>
    </div>
  </div>

  <button class="toggle" data-tg="${i}">본문 미리보기 펼치기</button>
  <div class="preview" id="pv${i}"></div>
</article>`).join('');

const html = `<!doctype html>
<meta charset="utf-8" />
<title>발행 보드 ${ym}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#eef0f3;font-family:'Pretendard','Malgun Gothic',-apple-system,sans-serif;color:#212529;padding:24px 16px 80px}
  .wrap{max-width:820px;margin:0 auto}
  h1{font-size:20px;margin-bottom:4px}
  .sub{font-size:13px;color:#6c757d;margin-bottom:16px}
  .bar{position:sticky;top:0;z-index:5;background:#fff;border:1px solid #e9ecef;border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 4px rgba(0,0,0,.04)}
  .bar b{font-size:15px}
  .bar button{border:1px solid #dee2e6;background:#fff;border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer}
  .bar button.on{background:#374151;color:#fff;border-color:#374151}
  .card{background:#fff;border:1px solid #e9ecef;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 2px 4px rgba(0,0,0,.04)}
  .card.hide{display:none}
  .card.finished{opacity:.45}
  header{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
  .done{display:flex;align-items:center;gap:5px;font-size:12px;color:#6c757d;cursor:pointer;user-select:none}
  .when{font-size:13px;font-weight:700}
  .cat{color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px}
  .slug{font-size:12px;color:#adb5bd;font-family:ui-monospace,Consolas,monospace;margin-left:auto}
  .row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #f1f3f5}
  .row.big{align-items:center}
  .lbl{flex:0 0 78px;font-size:12px;color:#868e96}
  .lbl em{font-style:normal;color:#adb5bd}
  .val{flex:1;font-size:14px;line-height:1.45;word-break:break-all}
  .val.stat{display:flex;gap:8px;font-size:12px;color:#495057}
  .val.stat span{background:#f1f3f5;padding:3px 8px;border-radius:5px}
  .val.stat .ok{background:#ecfdf5;color:#047857}
  .val.stat .ng{background:#fff1f2;color:#be123c}
  button.cp{flex:0 0 auto;border:1px solid #dee2e6;background:#f8f9fa;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap}
  button.cp:hover{background:#e9ecef}
  button.cp.main{background:#374151;color:#fff;border-color:#374151;padding:8px 16px;font-size:13px;font-weight:700}
  button.cp.mini{padding:4px 8px;font-size:11px}
  button.cp.done{background:#047857!important;color:#fff!important;border-color:#047857!important}
  .thumb{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid #f1f3f5}
  .thumb img{width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid #e9ecef}
  .nopng{width:96px;height:96px;border-radius:8px;background:#fff1f2;color:#be123c;font-size:11px;display:flex;align-items:center;justify-content:center}
  .tpath{font-size:12px;color:#868e96;line-height:1.7}
  .tpath code{display:block;background:#f8f9fa;padding:5px 8px;border-radius:5px;font-size:11px;color:#495057;margin:3px 0;word-break:break-all}
  .toggle{width:100%;border:1px dashed #dee2e6;background:#fff;border-radius:8px;padding:8px;font-size:12px;color:#868e96;cursor:pointer;margin-top:6px}
  .preview{display:none;margin-top:10px}
  .preview.open{display:block}
  .preview iframe{width:100%;height:520px;border:1px solid #e9ecef;border-radius:8px;background:#fff}
  .toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#212529;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .18s;pointer-events:none;z-index:20}
  .toast.on{opacity:1}
</style>

<div class="wrap">
  <h1>발행 보드 · ${ym}</h1>
  <p class="sub">복사 버튼으로 클립보드에 넣고 티스토리 [HTML] 모드에 붙여넣습니다. 대표이미지와 예약 시간은 수동입니다.</p>

  <div class="bar">
    <b id="cnt"></b>
    <button data-f="all" class="on">전체</button>
    <button data-f="todo">미발행만</button>
    <button data-f="done">발행완료</button>
    <button id="reset" style="margin-left:auto">체크 초기화</button>
  </div>

  ${cards}
</div>

<div class="toast" id="toast"></div>

<script id="data" type="application/json">${json}</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const KEY = 'deck_${ym}_done';
const toast = document.getElementById('toast');

function say(m){ toast.textContent = m; toast.classList.add('on'); clearTimeout(say._t); say._t = setTimeout(()=>toast.classList.remove('on'), 1300); }

// file:// 에서는 navigator.clipboard 가 막힌다. execCommand 로 떨어진다.
function copy(text){
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(()=>true).catch(()=>fallback(text));
  }
  return Promise.resolve(fallback(text));
}
function fallback(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch(e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

document.addEventListener('click', (e) => {
  const cp = e.target.closest('button.cp');
  if (cp) {
    const it = DATA[+cp.dataset.i];
    const val = it[cp.dataset.cp];
    Promise.resolve(copy(val)).then((ok) => {
      if (!ok) { say('복사 실패 — 브라우저가 막았습니다'); return; }
      const label = { title:'제목', tags:'태그', body:'본문 HTML', pngPath:'폴더 경로' }[cp.dataset.cp];
      say(label + ' 복사됨' + (cp.dataset.cp === 'body' ? ' (' + it.chars.toLocaleString() + '자)' : ''));
      const t0 = cp.textContent; cp.textContent = '복사됨'; cp.classList.add('done');
      setTimeout(()=>{ cp.textContent = t0; cp.classList.remove('done'); }, 1200);
    });
    return;
  }

  const tg = e.target.closest('button.toggle');
  if (tg) {
    const i = +tg.dataset.tg, pv = document.getElementById('pv' + i);
    if (pv.classList.contains('open')) { pv.classList.remove('open'); pv.innerHTML = ''; tg.textContent = '본문 미리보기 펼치기'; }
    else {
      const css = 'body{margin:0;padding:20px;font-family:Pretendard,\\'Malgun Gothic\\',sans-serif;max-width:700px}h2{font-size:20px;margin:22px 0 10px}h3{font-size:17px;margin:16px 0 8px}p{line-height:1.75;margin:0 0 12px}ul{line-height:1.7;margin:0 0 14px;padding-left:20px}blockquote{border-left:4px solid #374151;margin:16px 0;padding:8px 14px;background:#f8f9fa}';
      const f = document.createElement('iframe');
      f.srcdoc = '<!doctype html><meta charset="utf-8"><style>' + css + '</style>' + DATA[i].body;
      pv.appendChild(f); pv.classList.add('open'); tg.textContent = '본문 미리보기 접기';
    }
    return;
  }

  const f = e.target.closest('[data-f]');
  if (f) {
    document.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b === f));
    const mode = f.dataset.f;
    document.querySelectorAll('.card').forEach(c => {
      const fin = c.classList.contains('finished');
      c.classList.toggle('hide', mode === 'todo' ? fin : mode === 'done' ? !fin : false);
    });
    return;
  }

  if (e.target.id === 'reset') {
    if (!confirm('발행완료 체크를 전부 지웁니다.')) return;
    localStorage.removeItem(KEY);
    document.querySelectorAll('[data-done]').forEach(cb => { cb.checked = false; cb.closest('.card').classList.remove('finished'); });
    count();
  }
});

document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-done]');
  if (!cb) return;
  const set = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  cb.checked ? set.add(cb.dataset.done) : set.delete(cb.dataset.done);
  localStorage.setItem(KEY, JSON.stringify([...set]));
  cb.closest('.card').classList.toggle('finished', cb.checked);
  count();
});

function count(){
  const n = document.querySelectorAll('.card.finished').length;
  document.getElementById('cnt').textContent = '발행 ' + n + ' / ' + DATA.length + '편';
}

(function init(){
  const set = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  document.querySelectorAll('[data-done]').forEach(cb => {
    if (set.has(cb.dataset.done)) { cb.checked = true; cb.closest('.card').classList.add('finished'); }
  });
  count();
})();
</script>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const bad = items.filter((i) => i.blocks < 5 || i.svg === 0 || i.uls < 3 || !i.png);
console.log(`${items.length}편 · ${Math.round(fs.statSync(OUT).size / 1024)}KB`);
if (bad.length) console.log(`  ⚠ 지표 미달 ${bad.length}편: ${bad.map((i) => i.slug).join(', ')}`);
console.log('저장:', OUT);
