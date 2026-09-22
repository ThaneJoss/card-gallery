/** Deterministic local extraction only. Run from repository root. */
import sharp from 'sharp';
import fs from 'node:fs/promises';
const id=process.argv[2];
if(!id||!/^[a-z0-9-]+$/.test(id))throw new Error('Usage: node assets/card-studio/_processing/extract-layers.mjs <cardId>');
const root=`assets/card-studio/${id}`;
const cfg=JSON.parse(await fs.readFile(`assets/card-studio/_processing/regions/${id}.json`,'utf8'));
const index=JSON.parse(await fs.readFile(`${root}/index.json`,'utf8'));
const {data,info}=await sharp(cfg.hd).removeAlpha().raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height;
if(cfg.cardId!==id||index.width!==W||index.height!==H)throw new Error('高清尺寸或区域配置与卡片索引不一致');
const bg=await sharp(cfg.clean).resize(W,H,{fit:'fill'}).removeAlpha().raw().toBuffer();
const clamp=x=>Math.min(255,Math.max(0,x));
for(const r of cfg.regions){
 const [x,y,w,h]=r.box.map((v,i)=>Math.round(v*(i%2?H:W)));
 const out=Buffer.alloc(w*h*4);
 const rowBg=Array.from({length:h},(_,j)=>{const vs=Array.from({length:w},(_,i)=>data[((y+j)*W+x+i)*3+1]).sort((a,b)=>a-b);return vs[Math.floor(w*.9)];});
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const p=((y+j)*W+x+i)*3,q=(j*w+i)*4;
  const rgb=[data[p],data[p+1],data[p+2]],b=[bg[p],bg[p+1],bg[p+2]];
  let a=clamp((Math.max(...rgb.map((v,k)=>Math.abs(v-b[k])))-35)*7);
  if(r.mode==='blue')a=clamp((rgb[2]-rgb[0]-35)*8);
  if(r.mode==='gold')a=clamp((rgb[0]-rgb[2]-25)*8);
  if(r.mode==='red')a=clamp((rgb[0]-rgb[1]-35)*7);
  if(r.mode==='black')a=clamp((90-Math.max(...rgb))*10);
  if(r.mode==='dark')a=clamp((85-Math.max(...rgb))*10);
  if(r.mode==='white')a=clamp((Math.min(...rgb)-210)*10);
  if(r.mode==='orange-dark')a=clamp((rowBg[j]-rgb[1]-6)*255/6);
  if(r.shape==='circle')a=((i/w-.5)/.46)**2+((j/h-.5)/.46)**2<1?255:0;
  if(r.shape==='ellipse')a=(((x+i)/W-.313)/.291)**2+(((y+j)/H-.488)/.601)**2<1?255:0;
  if(r.shape==='rounded'){const dx=Math.max(.12-i/w,0,i/w-.88),dy=Math.max(.14-j/h,0,j/h-.86);a=dx*dx/.0144+dy*dy/.0196<1?255:0;}
  const inside=([ex,ey,ew,eh])=>(x+i)/W>=ex&&(x+i)/W<ex+ew&&(y+j)/H>=ey&&(y+j)/H<ey+eh;
  if(r.exclude?.some(inside))a=0;
  if(r.excludeDark?.some(inside)&&Math.max(...rgb)<85)a=0;
  out[q]=rgb[0];out[q+1]=rgb[1];out[q+2]=rgb[2];out[q+3]=a;
 }
 const dest=`${root}/layers/${r.id}.png`;
 await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toFile(`${dest}.tmp`);
 await fs.rename(`${dest}.tmp`,dest);
 // A freshly extracted layer needs a fresh refinement baseline as well.
 await fs.rm(`assets/card-studio/_processing/alpha/${id}/${r.id}.png`,{force:true});
}
console.log(`${id}: extracted ${cfg.regions.length} layers. Run refine-layers.mjs and visually inspect before publishing.`);
