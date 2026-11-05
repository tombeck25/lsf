/* V9.1: V8-style cumulative-hypothesis handling, session restart, compact diagnostics. */
class ShelfSpeech {
  constructor({onText,onLog,onState}) {
    Object.assign(this,{onText,onLog,onState});
    this.rec=null;this.wanted=false;this.timer=null;this.session=0;this.restarts=0;
    this.saved='';this.sessionText='';this.lastEnd=null;this.lastSpeech=null;
  }
  log(s){this.onLog('['+new Date().toLocaleTimeString()+'] '+s)}
  normalize(s){return String(s||'').replace(/\s+/g,' ').trim()}
  emit(){this.onText([this.saved,this.sessionText].filter(Boolean).join('\n'))}
  start(){
    const C=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!C){this.onState('Speech recognition unavailable; type numbers instead.');return false}
    this.stop();this.wanted=true;this.saved='';this.sessionText='';this.lastEnd=null;this.lastSpeech=null;this.restarts=0;
    this.emit();this.launch(C);return true;
  }
  launch(C){
    if(!this.wanted||this.rec)return;
    const r=new C(),id=++this.session;this.rec=r;
    r.lang='en-US';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
    let latest='',eventCount=0;
    r.onstart=()=>{
      if(this.rec!==r)return;
      const gap=this.lastEnd===null?'':` gap=${Math.round(performance.now()-this.lastEnd)}ms`;
      this.log('START session='+id+gap);this.onState('Listening…');
    };
    r.onresult=e=>{
      if(this.rec!==r)return;
      eventCount++;
      const candidates=[];
      for(let i=0;i<e.results.length;i++){
        const result=e.results[i],t=this.normalize(result?.[0]?.transcript);
        if(t)candidates.push(t);
      }
      let assembled='';
      for(const t of candidates){
        if(!assembled)assembled=t;
        else if(t===assembled||assembled.endsWith(t))continue;
        else if(t.startsWith(assembled))assembled=t;
        else if(assembled.startsWith(t))continue;
        else {
          const a=assembled.toLowerCase().split(/\s+/),b=t.toLowerCase().split(/\s+/);
          let overlap=0;
          for(let n=Math.min(a.length,b.length);n>0;n--){
            if(a.slice(-n).join(' ')===b.slice(0,n).join(' ')){overlap=n;break}
          }
          assembled+=' '+t.split(/\s+/).slice(overlap).join(' ');
        }
      }
      assembled=this.normalize(assembled);
      if(assembled&&assembled!==latest){
        const delta=assembled.startsWith(latest)?this.normalize(assembled.slice(latest.length)):'';
        const revised=latest&&!assembled.startsWith(latest);
        this.log((revised?'REVISED':'HEARD')+' session='+id+' '+(delta&&!revised?'+'+JSON.stringify(delta):JSON.stringify(assembled)));
        latest=assembled;this.sessionText=assembled;this.lastSpeech=performance.now();this.emit();
      }
    };
    r.onerror=e=>{
      if(this.rec!==r)return;
      this.log('ERROR session='+id+' code='+(e.error||'unknown'));
      if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(e.error)){
        this.wanted=false;clearTimeout(this.timer);this.onState('Speech error: '+e.error+'. You can type numbers.');
      }
    };
    r.onend=()=>{
      if(this.rec!==r)return;
      const now=performance.now();this.lastEnd=now;
      this.log('END session='+id+' results='+eventCount+' lastSpeechAgo='+(this.lastSpeech===null?'none':Math.round(now-this.lastSpeech)+'ms')+' desired='+this.wanted);
      if(this.sessionText.trim())this.saved=[this.saved,this.sessionText.trim()].filter(Boolean).join('\n');
      this.sessionText='';this.emit();this.rec=null;
      if(this.wanted){
        this.restarts++;this.onState('Restarting microphone…');
        this.log('RESTART scheduled after 350ms; count='+this.restarts);
        this.timer=setTimeout(()=>{this.timer=null;if(this.wanted)this.launch(C)},350);
      }else this.onState('Microphone stopped');
    };
    try{this.log('START REQUEST session='+id);r.start()}
    catch(e){this.log('START FAILED session='+id+' '+e.message);this.rec=null;
      if(this.wanted){this.onState('Retrying microphone…');this.timer=setTimeout(()=>{this.timer=null;if(this.wanted)this.launch(C)},1000)}
    }
  }
  stop(){
    this.wanted=false;clearTimeout(this.timer);this.timer=null;
    if(this.rec){try{this.rec.stop()}catch(e){this.log('STOP exception: '+e.message)}}
    else this.onState('Microphone stopped');
  }
}
