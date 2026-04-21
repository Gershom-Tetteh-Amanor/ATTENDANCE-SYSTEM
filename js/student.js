/* ============================================
   student.js — Student check-in flow
   Decodes session from QR URL, captures
   fingerprint on screen, writes check-in.
   ============================================ */
'use strict';

const STU = (() => {
  const S = { session:null, cdTimer:null, stuLat:null, stuLng:null, fingerprint:null };

  async function init(ciParam) {
    try {
      const data=JSON.parse(UI.b64d(decodeURIComponent(ciParam)));_hideAll();
      if(!data?.id||!data?.token){_invalid('Invalid QR code','Malformed QR. Ask your lecturer for a new one.');return;}
      if(Date.now()>data.expiresAt){_invalid('Session expired',`The sign-in window for <strong>${UI.esc(data.code)}</strong> has closed.`);return;}
      S.session=data;UI.Q('s-code').textContent=data.code;UI.Q('s-course').textContent=data.course;UI.Q('s-date').textContent=data.date;UI.Q('stu-form').style.display='block';
      if(data.locEnabled&&data.lat!=null){UI.Q('loc-btn-row').style.display='flex';UI.Q('no-loc-row').style.display='none';_setLoc('idle','Location required — tap to get your location');}
      else{UI.Q('loc-btn-row').style.display='none';UI.Q('no-loc-row').style.display='block';_setLoc('idle','Location not required for this session');}
      _cdTick();clearInterval(S.cdTimer);S.cdTimer=setInterval(_cdTick,1000);
    }catch(e){console.error(e);_hideAll();_invalid('Could not read QR code','Please scan again.');}
  }

  function _hideAll(){['loading','invalid','done'].forEach(n=>UI.Q('stu-'+n)?.classList.remove('show'));const f=UI.Q('stu-form');if(f)f.style.display='none';}
  function _invalid(title,msg){clearInterval(S.cdTimer);S.cdTimer=null;UI.Q('stu-invalid').classList.add('show');UI.Q('inv-title').textContent=title;UI.Q('inv-msg').innerHTML=msg;}

  function _cdTick(){
    if(!S.session)return;const rem=Math.max(0,S.session.expiresAt-Date.now()),el=UI.Q('s-cd');if(!el)return;
    if(rem===0){el.textContent='Session expired';el.className='countdown exp';clearInterval(S.cdTimer);S.cdTimer=null;_invalid('Session expired','The sign-in window has closed.');return;}
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s=Math.floor((rem%60000)/1000);
    el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(s)}s left`:`${m}:${UI.pad(s)} left`;el.className='countdown '+(rem<180000?'warn':'ok');
  }

  async function captureFingerprint(){
    const area=UI.Q('fp-scan-area'),status=UI.Q('fp-status-txt'),btn=UI.Q('fp-btn'),icon=UI.Q('fp-icon');
    area.classList.remove('done');area.classList.add('capturing');if(icon)icon.textContent='⏳';if(status)status.textContent='Capturing fingerprint… please wait';btn.disabled=true;btn.innerHTML='<span class="spin"></span>Capturing…';
    await new Promise(r=>setTimeout(r,600));
    const signals=[navigator.userAgent,navigator.language,(navigator.languages||[]).join(','),`${screen.width}x${screen.height}x${screen.colorDepth}x${screen.pixelDepth}`,new Date().getTimezoneOffset(),Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.hardwareConcurrency||0,navigator.deviceMemory||0,navigator.platform||'',navigator.vendor||'',String(navigator.cookieEnabled),String(typeof window.indexedDB!=='undefined')];
    try{const cv=document.createElement('canvas');cv.width=240;cv.height=48;const ctx=cv.getContext('2d');ctx.fillStyle='#006b3f';ctx.fillRect(0,0,240,48);ctx.font='14px Arial';ctx.fillStyle='#fcd116';ctx.fillText(`UG QR Attendance – ${navigator.platform}`,8,30);signals.push(cv.toDataURL());}catch{}
    try{const gl=document.createElement('canvas').getContext('webgl');if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');if(ext){signals.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));signals.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));}}}catch{}
    const raw=signals.join('|||');let h1=0x811c9dc5,h2=0x6b3a9559;
    for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);h1^=c;h1=Math.imul(h1,0x01000193)>>>0;h2^=c;h2=Math.imul(h2,0x00000193)>>>0;}
    for(let i=raw.length-1;i>=0;i--){const c=raw.charCodeAt(i);h1^=(c<<5)^h2;h1=Math.imul(h1,0x01000193)>>>0;h2^=(c<<3)^h1;h2=Math.imul(h2,0x00000193)>>>0;}
    S.fingerprint=(h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
    area.classList.remove('capturing');area.classList.add('done');if(icon)icon.textContent='✅';if(status)status.textContent='Fingerprint captured ✓';
    const fpRes=UI.Q('fp-result'),fpVal=UI.Q('fp-val');if(fpVal)fpVal.textContent=S.fingerprint;if(fpRes)fpRes.style.display='block';
    btn.disabled=false;btn.textContent='🔄 Re-capture';
  }

  function getLocation(){
    _setLoc('busy','Fetching your location…');
    if(!navigator.geolocation){_simLoc();return;}
    navigator.geolocation.getCurrentPosition(p=>{S.stuLat=p.coords.latitude;S.stuLng=p.coords.longitude;_setLoc('ok',`Location acquired: ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)}`);},()=>_simLoc(),{timeout:10000,maximumAge:0});
  }
  function _simLoc(){const inside=Math.random()>0.3,base=S.session?.lat?[S.session.lat,S.session.lng]:[5.6505,-0.1875],d=inside?0.0003:0.004;S.stuLat=base[0]+(Math.random()-.5)*d*2;S.stuLng=base[1]+(Math.random()-.5)*d*2;_setLoc('ok',`Location acquired (demo): ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)}`);}
  function _setLoc(cls,msg){const b=UI.Q('ls-box');if(!b)return;b.className='loc-status '+cls;UI.Q('ls-text').textContent=msg;}

  async function checkIn(){
    const nameEl=UI.Q('s-name'),sidEl=UI.Q('s-sid');const name=nameEl?.value.trim(),sid=sidEl?.value.trim();
    nameEl?.classList.remove('err');sidEl?.classList.remove('err');UI.Q('res-ok').style.display='none';UI.Q('res-err').style.display='none';
    if(!S.fingerprint){_err('Fingerprint required — tap "Capture fingerprint" first (Step 1).');return;}
    if(!name){nameEl?.classList.add('err');_err('Please enter your full name.');return;}
    if(!sid){sidEl?.classList.add('err');_err('Student ID is required.');return;}
    if(!S.session){_err('No session found. Scan the QR code again.');return;}
    if(Date.now()>S.session.expiresAt){_err('This session has expired.');return;}
    ['ci-btn','ci-btn-loc'].forEach(id=>{const b=UI.Q(id);if(b){b.disabled=true;b.innerHTML='<span class="spin"></span>Checking in…';}});
    const sessId=S.session.id,normSid=sid.toUpperCase().trim();
    try{
      if(await DB.SESSION.hasDevice(sessId,S.fingerprint)){const recs=await DB.SESSION.getRecords(sessId),who=recs.find(r=>r.fingerprint===S.fingerprint);await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Device used by ${who?.name||'another student'}`,time:UI.nowTime()});_err(`Device already checked in${who?' as '+who.name:''}.`);_resetBtns();return;}
      if(await DB.SESSION.hasSid(sessId,normSid)){const recs=await DB.SESSION.getRecords(sessId),who=recs.find(r=>r.studentId.toUpperCase()===normSid);await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Student ID used by ${who?.name||'another'}`,time:UI.nowTime()});sidEl?.classList.add('err');_err(`Student ID "${sid}" already registered${who?' under '+who.name:''}.`);_resetBtns();return;}
      const existing=await DB.SESSION.getRecords(sessId);if(existing.find(r=>r.name.toLowerCase()===name.toLowerCase())){await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:'Name already checked in',time:UI.nowTime()});_err(`${name} has already checked in this session.`);_resetBtns();return;}
      let locNote='';
      if(S.session.locEnabled&&S.session.lat!=null){if(S.stuLat===null){_err('Location required — tap "Get my location" first.');_resetBtns();return;}const dist=UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng);if(dist>S.session.radius){await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Too far: ${dist}m (limit ${S.session.radius}m)`,time:UI.nowTime()});_err(`You are ${dist}m from the classroom. Must be within ${S.session.radius}m.`);_resetBtns();return;}locNote=`${dist}m`;}
      await Promise.all([DB.SESSION.addDevice(sessId,S.fingerprint),DB.SESSION.addSid(sessId,normSid),DB.SESSION.pushRecord(sessId,{name,studentId:sid,fingerprint:S.fingerprint,locNote,time:UI.nowTime(),checkedAt:Date.now()})]);
      clearInterval(S.cdTimer);S.cdTimer=null;_hideAll();UI.Q('stu-done').classList.add('show');UI.Q('done-msg').textContent=`Attendance for ${S.session.code} — ${S.session.course} on ${S.session.date} recorded successfully.`;
    }catch(err){_err('Error: '+(err.message||'Something went wrong.'));_resetBtns();}
  }

  function _err(msg){const el=UI.Q('res-err');if(!el)return;el.innerHTML=`<strong>✗ Check-in failed</strong><br>${UI.esc(msg)}`;el.style.display='block';}
  function _resetBtns(){['ci-btn','ci-btn-loc'].forEach(id=>{const b=UI.Q(id);if(b){b.disabled=false;b.textContent='Check in';}});}

  return { init, captureFingerprint, getLocation, checkIn };
})();
