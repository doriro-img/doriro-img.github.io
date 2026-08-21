// 11월 묶음 동기화 — 지정한 slug들의 원고.txt + PNG를 다운로드 폴더로 복사
const fs=require('fs'),path=require('path');
const ROOT='C:/dev/blog-cdn';
const man=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const PNG=path.join(ROOT,'2026',String(new Date().getMonth()+1).padStart(2,'0'));
const DL='C:/Users/park-/Downloads/블로그원고_202611';
let n=0;
for(const s of process.argv.slice(3)){
  const it=man.find(x=>x.slug===s);
  if(!it){console.log('slug 없음:',s);continue;}
  const dir=path.join(DL,it.folder);
  fs.mkdirSync(dir,{recursive:true});
  const txt=it.folder+'_원고.txt';
  const src=path.join(ROOT,'posts',txt);
  if(!fs.existsSync(src)){console.log('원고 없음:',txt);continue;}
  fs.copyFileSync(src,path.join(dir,txt));
  const png=path.join(PNG,s+'.png');
  if(!fs.existsSync(png)){console.log('PNG 없음:',s);continue;}
  fs.copyFileSync(png,path.join(dir,s+'.png'));
  n++;
}
console.log('동기화',n,'건');
