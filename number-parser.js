/* Set-number-only parser. Never interprets location words or unit numbers. */
const ShelfNumbers=(()=>{
  const digits={zero:'0',oh:'0',o:'0',one:'1',won:'1',two:'2',to:'2',too:'2',three:'3',four:'4',for:'4',five:'5',six:'6',seven:'7',eight:'8',ate:'8',nine:'9'};
  function parse(text){
    const tokens=String(text||'').toLowerCase().replace(/[,;:.!?\n]+/g,' next ').split(/\s+/).filter(Boolean);
    const numbers=[],warnings=[];let fragments=[];
    function flush(){
      if(!fragments.length)return;
      const value=fragments.join('');
      if(/^\d{5}$/.test(value))numbers.push(value);
      else warnings.push('Check incomplete number: '+fragments.join(' + '));
      fragments=[];
    }
    for(const t of tokens){
      if(t==='next'||t==='and'){flush();continue}
      const v=/^\d+$/.test(t)?t:digits[t];
      if(v===undefined){flush();warnings.push('Unrecognized word: '+t);continue}
      if(v.length===5){flush();numbers.push(v);continue}
      if(v.length>5){flush();warnings.push('Check number longer than five digits: '+v);continue}
      if(fragments.join('').length+v.length>5)flush();
      fragments.push(v);
      if(fragments.join('').length===5)flush();
    }
    flush();
    return {nums:[...new Set(numbers)].sort(),warnings};
  }
  return {parse};
})();
