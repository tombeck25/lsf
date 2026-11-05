(() => {
'use strict';
const $ = id => document.getElementById(id);
let timer = null, rows = [], issues = [], lastParsed = null;
const words = {zero:0,oh:0,o:0,one:1,won:1,two:2,to:2,too:2,three:3,four:4,for:4,five:5,six:6,seven:7,eight:8,ate:8,nine:9};
function digit(w){ return Object.prototype.hasOwnProperty.call(words,w) ? words[w] : null; }
function normalize(s){ return String(s).toLowerCase().replace(/[,;:.!?]/g,' ').replace(/\s+/g,' ').trim(); }
function parse(raw){
  const s=normalize(raw), tokens=s ? s.split(' ') : [];
  let type='',unit='',side='', start=0, warnings=[];
  // Location only at the start of a recording. Do not infer an incomplete location.
  let m=s.match(/^(podium|gift\s*center)\s+(\d+|one|two|to|too|three|four|five|six|seven|eight)\s+side\s+(\d+|one|two|to|too|three|four|for)\b/);
  if(m){
    type=m[1].startsWith('gift')?'Gift Center':'Podium';
    unit=String(digit(m[2]) ?? m[2]); side=String(digit(m[3]) ?? m[3]);
    start=m[0].trim().split(/\s+/).length;
  } else if(s){warnings.push('Location not fully recognized. Select display type, unit and side manually.');}
  const body=tokens.slice(start);
  const out=[];
  let fragments=[];
  function flush(){
    if(!fragments.length)return;
    let value=fragments.join('');
    if(/^\d{5}$/.test(value)) out.push({value,warning:fragments.length>1?'Combined fragments: '+fragments.join(' + ') : ''});
    else if(/^\d+$/.test(value)) out.push({value,warning:'Not five digits — check this number'});
    fragments=[];
  }
  for(let i=0;i<body.length;i++){
    const t=body[i];
    if(t==='next'||t==='and'){flush();continue;}
    let v=/^\d+$/.test(t)?t:null;
    if(v===null){const d=digit(t); if(d!==null)v=String(d);}
    if(v===null){flush();warnings.push('Unrecognized word: '+t);continue;}
    if(v.length===5){flush();out.push({value:v,warning:''});continue;}
    if(v.length>5){flush();out.push({value:v,warning:'More than five digits — check this number'});continue;}
    if(fragments.join('').length+v.length>5)flush();
    fragments.push(v);
    if(fragments.join('').length===5)flush();
  }
  flush();
  return {type,unit,side,sets:out,warnings};
}
function setStatus(){
  const count=rows.length, flagged=rows.filter(r=>!/^\d{5}$/.test(r.value)||r.warning).length;
  const missing=!$('unitType').value||!$('unitNum').value||!$('sideNum').value;
  $('parseStatus').textContent=`${count} set${count===1?'':'s'} · ${flagged} flagged · ${missing?'location needs review':'location specified'}`;
}
function render(){
  const box=$('setList'); box.replaceChildren();
  if(issues.length){const n=document.createElement('div');n.className='note';n.textContent=issues.join(' ');box.append(n);}
  if(!rows.length){const n=document.createElement('p');n.className='hint';n.textContent='No set numbers found yet.';box.append(n);}
  rows.forEach((r,i)=>{
    const line=document.createElement('div');line.className='setrow';
    const label=document.createElement('label');label.textContent=`${i+1}.`;label.htmlFor='set'+i;
    const input=document.createElement('input');input.id='set'+i;input.inputMode='numeric';input.value=r.value;input.setAttribute('aria-label',`Set number ${i+1}`);
    const msg=document.createElement('span');msg.className=r.warning||!/^\d{5}$/.test(r.value)?'flag':'ok';msg.textContent=r.warning||(/^\d{5}$/.test(r.value)?'✓':'Check number');
    input.addEventListener('input',()=>{r.value=input.value.trim();r.warning='';msg.className=/^\d{5}$/.test(r.value)?'ok':'flag';msg.textContent=/^\d{5}$/.test(r.value)?'✓':'Check number';setStatus();});
    const del=document.createElement('button');del.className='remove';del.textContent='Remove';del.addEventListener('click',()=>{rows.splice(i,1);render();});
    line.append(label,input,msg,del);box.append(line);
  });setStatus();
}
function update(){
  const raw=$('transcript').value;
  const parsed=parse(raw);
  lastParsed=raw; rows=parsed.sets;issues=parsed.warnings;
  $('unitType').value=parsed.type;$('unitNum').value=parsed.unit;$('sideNum').value=parsed.side;
  render();
}
function scheduleParse(){clearTimeout(timer);timer=setTimeout(update,400);}
$('parse').addEventListener('click',update);
$('addSet').addEventListener('click',()=>{rows.push({value:'',warning:'Enter five-digit set number'});render();});
for(const id of ['unitType','unitNum','sideNum'])$(id).addEventListener('change',setStatus);
$('copyReview').addEventListener('click',async()=>{
  const type=$('unitType').value, unit=$('unitNum').value, side=$('sideNum').value;
  if(!type||!unit||!side||rows.some(r=>!/^\d{5}$/.test(r.value))){alert('Please complete the location and correct all invalid set numbers first.');return;}
  if(rows.some(r=>r.warning)&&!confirm('Some set numbers were combined from fragments. Have you checked them?'))return;
  const result=`${type} ${unit}, Side ${side}\n`+rows.map(r=>r.value).join('\n');
  try{await navigator.clipboard.writeText(result);$('copyReview').textContent='Copied!';setTimeout(()=>$('copyReview').textContent='Copy reviewed list',1400);}catch(e){prompt('Copy reviewed list:',result);}
});
window.shelfV8={scheduleParse,parse};
update();
})();
