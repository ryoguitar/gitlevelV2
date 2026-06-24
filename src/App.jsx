import { useState, useRef, useEffect, useCallback } from "react";

const T = {
  bg:"#0e0e10", surface:"#18181c", border:"#2a2a32",
  amber:"#f5a623", amberDim:"#7a5110",
  green:"#3ecf6e", red:"#e8455a", blue:"#4a9eff",
  textHi:"#f0ede8", textMid:"#9896a0", textLo:"#50505a",
};

const uid = () => Math.random().toString(36).slice(2,9);
const fmt = v => v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
const fmtAbs = v => v.toFixed(1);
const rmsToDb = rms => rms <= 0 ? -Infinity : 20 * Math.log10(rms);

// ── CSV export ────────────────────────────────────────────────
function exportCsv(guitars) {
  const rows = [["ギター","プリセット","基準","差分(dB)"]];
  guitars.forEach(g => g.presets.forEach(p =>
    rows.push([g.name, p.name, p.id===g.basePresetId?"✓":"", fmt(p.db)])
  ));
  const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`giglevel_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── CSV import ────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.trim().split("\n").map(l=>l.split(",").map(c=>c.replace(/^"|"$/g,"").trim()));
  const header = lines[0].map(h=>h.toLowerCase());
  const iGuitar=header.findIndex(h=>h.includes("ギター")||h.includes("guitar"));
  const iPreset=header.findIndex(h=>h.includes("プリセット")||h.includes("preset"));
  const iBase=header.findIndex(h=>h.includes("基準")||h.includes("base"));
  const iDb=header.findIndex(h=>h.includes("差分")||h.includes("db"));
  if(iGuitar<0||iPreset<0) return null;
  const byGuitar = {};
  lines.slice(1).forEach(row=>{
    const gName = row[iGuitar]||""; const pName = row[iPreset]||"";
    if(!gName||!pName) return;
    if(!byGuitar[gName]) byGuitar[gName]={name:gName,presets:[]};
    const isBase = iBase>=0 && (row[iBase]==="✓"||row[iBase]==="true"||row[iBase]==="1");
    const db = iDb>=0 ? parseFloat(row[iDb].replace("+",""))||0 : 0;
    byGuitar[gName].presets.push({name:pName,isBase,db});
  });
  return Object.values(byGuitar).map(g=>{
    const baseId = uid();
    const presets = g.presets.map(p=>({
      id: p.isBase ? baseId : uid(),
      name: p.name, db: p.db, history:[],
    }));
    const basePreset = presets.find(p=>p.id===baseId)||presets[0];
    return {id:uid(), name:g.name, icon:"🎸", basePresetId:basePreset.id, baseAbsDb:null, presets};
  });
}

// ── Default templates ─────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {id:uid(), name:"Standard 4", presets:["Clean","Crunch","Lead","Solo"]},
  {id:uid(), name:"Simple 3",   presets:["Clean","Drive","Boost"]},
  {id:uid(), name:"Jazz",       presets:["Clean","Soft","Rhythm","Solo"]},
];

// ── Init guitars ──────────────────────────────────────────────
const mkGuitar = (name, presetNames) => {
  const baseId=uid();
  const presets=presetNames.map((n,i)=>({id:i===0?baseId:uid(),name:n,db:0,history:[]}));
  return {id:uid(),name,icon:"🎸",basePresetId:baseId,baseAbsDb:null,presets};
};
const INIT_GUITARS=[mkGuitar("Strat SSH",["Clean","Crunch","Lead"]),mkGuitar("Telecaster",["Clean","Crunch","Lead"])];

// ── Sub-components ────────────────────────────────────────────
function DbBadge({value,size=14}){
  const color=value>0?T.red:value<0?T.blue:T.green;
  return <span style={{fontFamily:"'SF Mono','Fira Mono',monospace",fontSize:size,fontWeight:700,color,letterSpacing:"0.02em"}}>{fmt(value)} dB</span>;
}

function VuMeter({level}){
  const bars=20, filled=Math.round(level*bars);
  return(
    <div style={{display:"flex",gap:2,alignItems:"flex-end",height:32}}>
      {Array.from({length:bars}).map((_,i)=>{
        const active=i<filled;
        const color=active?(i>=bars*0.85?T.red:i>=bars*0.65?T.amber:T.green):T.border;
        return <div key={i} style={{width:6,height:8+i*1.1,background:color,borderRadius:2,transition:"background 0.08s"}}/>;
      })}
    </div>
  );
}

// ── Selector: Guitar + Preset (reusable) ──────────────────────
function GuitarPresetSelector({guitars,activeGuitarId,activePresetId,onSelectGuitar,onSelectPreset,hidePreset=false}){
  const guitar=guitars.find(g=>g.id===activeGuitarId);
  return(
    <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,padding:12,marginBottom:16}}>
      <div style={{fontSize:11,color:T.textMid,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>ギター</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:hidePreset?0:12}}>
        {guitars.map(g=>(
          <button key={g.id} onClick={()=>onSelectGuitar(g.id)} style={{
            padding:"5px 12px",borderRadius:16,border:`1px solid ${g.id===activeGuitarId?T.amber:T.border}`,
            background:g.id===activeGuitarId?T.amberDim:"transparent",
            color:g.id===activeGuitarId?T.amber:T.textMid,
            fontWeight:g.id===activeGuitarId?700:400,fontSize:12,cursor:"pointer",
          }}>{g.name}</button>
        ))}
      </div>
      {!hidePreset && guitar && (
        <>
          <div style={{fontSize:11,color:T.textMid,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>プリセット</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {guitar.presets.map(p=>(
              <button key={p.id} onClick={()=>onSelectPreset(p.id)} style={{
                padding:"5px 12px",borderRadius:16,
                border:`1px solid ${p.id===activePresetId?T.amber:T.border}`,
                background:p.id===activePresetId?T.amberDim:"transparent",
                color:p.id===activePresetId?T.amber:T.textMid,
                fontWeight:p.id===activePresetId?700:400,fontSize:12,cursor:"pointer",
              }}>
                {p.id===guitar.basePresetId&&<span style={{color:T.amber,marginRight:3}}>★</span>}
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function App(){
  const [guitars,setGuitars]=useState(INIT_GUITARS);
  const [templates,setTemplates]=useState(DEFAULT_TEMPLATES);
  const [activeGuitarId,setActiveGuitarId]=useState(INIT_GUITARS[0].id);
  const [activePresetId,setActivePresetId]=useState(INIT_GUITARS[0].presets[0].id);
  const [tab,setTab]=useState("manage");
  const [measuring,setMeasuring]=useState(false);
  const [liveDb,setLiveDb]=useState(null);
  const [measurePhase,setMeasurePhase]=useState("idle");
  const [resultDiff,setResultDiff]=useState(null);
  const [resultAbs,setResultAbs]=useState(null);
  const [measureMode,setMeasureMode]=useState("solo");
  const [compareMode,setCompareMode]=useState("absolute");
  const [comparePresetName,setComparePresetName]=useState("Clean");
  const [selectedHistory,setSelectedHistory]=useState([]);
  const [selectMode,setSelectMode]=useState(false);
  const [modal,setModal]=useState(null);
  const [inputName,setInputName]=useState("");
  const [selectedTemplate,setSelectedTemplate]=useState(null);
  const [newTemplateName,setNewTemplateName]=useState("");

  const audioCtxRef=useRef(null);
  const analyserRef=useRef(null);
  const streamRef=useRef(null);
  const rafRef=useRef(null);
  const silenceTimerRef=useRef(null);
  const samplesBufferRef=useRef([]);

  const guitar=guitars.find(g=>g.id===activeGuitarId);
  const preset=guitar?.presets.find(p=>p.id===activePresetId);
  const basePreset=guitar?.presets.find(p=>p.id===guitar?.basePresetId);

  // ── Audio ────────────────────────────────────────────────────
  const stopAudio=useCallback(()=>{
    cancelAnimationFrame(rafRef.current);
    clearTimeout(silenceTimerRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    audioCtxRef.current?.close();
    audioCtxRef.current=null; analyserRef.current=null; streamRef.current=null;
    setMeasuring(false);
  },[]);

  const startAudio=useCallback(async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      audioCtxRef.current=ctx;
      const src=ctx.createMediaStreamSource(stream);
      const analyser=ctx.createAnalyser(); analyser.fftSize=2048;
      src.connect(analyser); analyserRef.current=analyser;
      setMeasuring(true); return true;
    }catch{ alert("マイクへのアクセスが必要です。"); return false; }
  },[]);

  const getRms=useCallback(()=>{
    const analyser=analyserRef.current; if(!analyser) return 0;
    const buf=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum=0; for(let i=0;i<buf.length;i++) sum+=buf[i]*buf[i];
    return Math.sqrt(sum/buf.length);
  },[]);

  // Live meter
  useEffect(()=>{
    if(!measuring){setLiveDb(null);return;}
    const loop=()=>{setLiveDb(rmsToDb(getRms()));rafRef.current=requestAnimationFrame(loop);};
    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[measuring,getRms]);

  // ── Silence-detection recording ───────────────────────────────
  // Records until 3s of silence detected, returns average RMS
  const recordUntilSilence=useCallback(()=>new Promise(resolve=>{
    const SILENCE_DB=-50; // threshold
    const SILENCE_DURATION=3000;
    const samples=[];
    let silenceStart=null;
    samplesBufferRef.current=samples;
    const loop=()=>{
      const rms=getRms();
      const db=rmsToDb(rms);
      samples.push(rms);
      if(db<SILENCE_DB){
        if(!silenceStart) silenceStart=performance.now();
        else if(performance.now()-silenceStart>=SILENCE_DURATION){
          // drop the last 3s of silence samples
          const trimCount=Math.floor(SILENCE_DURATION/16.67);
          const valid=samples.slice(0,Math.max(1,samples.length-trimCount));
          resolve(valid);
          return;
        }
      } else { silenceStart=null; }
      rafRef.current=requestAnimationFrame(loop);
    };
    rafRef.current=requestAnimationFrame(loop);
  }),[getRms]);

  const avgRms=samples=>{
    const sum=samples.reduce((a,b)=>a+b,0);
    return sum/Math.max(1,samples.length);
  };

  // ── Measurement ───────────────────────────────────────────────
  const handleMeasure=async()=>{
    if(!guitar||!preset) return;
    const ok=await startAudio(); if(!ok) return;

    if(measureMode==="baseOnly"){
      setMeasurePhase("measure");
      const samples=await recordUntilSilence();
      const baseDbVal=rmsToDb(avgRms(samples));
      setMeasurePhase("done"); setResultAbs(baseDbVal); setResultDiff(null);
      stopAudio();
      setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,baseAbsDb:baseDbVal}));
      return;
    }

    if(measureMode==="solo"){
      setMeasurePhase("measure");
      const samples=await recordUntilSilence();
      const tgtDbVal=rmsToDb(avgRms(samples));
      const diff=tgtDbVal-(guitar.baseAbsDb??0);
      setMeasurePhase("done"); setResultDiff(diff); setResultAbs(null);
      stopAudio();
      setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,
        presets:g.presets.map(p=>p.id!==activePresetId?p:{...p,db:diff,
          history:[...p.history,{id:uid(),at:new Date().toISOString(),db:diff}].slice(-20)})}));
      return;
    }

    // full mode
    setMeasurePhase("calibrate");
    const baseSamples=await recordUntilSilence();
    const baseDbVal=rmsToDb(avgRms(baseSamples));

    setMeasurePhase("measure");
    const tgtSamples=await recordUntilSilence();
    const tgtDbVal=rmsToDb(avgRms(tgtSamples));
    const diff=tgtDbVal-baseDbVal;

    setMeasurePhase("done"); setResultDiff(diff); setResultAbs(null);
    stopAudio();
    setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,baseAbsDb:baseDbVal,
      presets:g.presets.map(p=>p.id!==activePresetId?p:{...p,db:diff,
        history:[...p.history,{id:uid(),at:new Date().toISOString(),db:diff}].slice(-20)})}));
  };

  const resetMeasure=()=>{setMeasurePhase("idle");setResultDiff(null);setResultAbs(null);};

  // ── CRUD ──────────────────────────────────────────────────────
  const selectGuitar=id=>{
    setActiveGuitarId(id);
    const g=guitars.find(x=>x.id===id);
    if(g) setActivePresetId(g.presets[0].id);
  };

  const addGuitar=()=>{
    if(!inputName.trim()) return;
    const tpl=selectedTemplate?templates.find(t=>t.id===selectedTemplate):null;
    const presetNames=tpl?tpl.presets:["Clean"];
    const g=mkGuitar(inputName.trim(),presetNames);
    setGuitars(prev=>[...prev,g]);
    setActiveGuitarId(g.id); setActivePresetId(g.presets[0].id);
    setModal(null); setInputName(""); setSelectedTemplate(null);
  };

  const addPreset=()=>{
    if(!inputName.trim()||!guitar) return;
    const id=uid();
    setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,
      presets:[...g.presets,{id,name:inputName.trim(),db:0,history:[]}]}));
    setActivePresetId(id); setModal(null); setInputName("");
  };

  const saveTemplate=()=>{
    if(!guitar||!newTemplateName.trim()) return;
    const t={id:uid(),name:newTemplateName.trim(),presets:guitar.presets.map(p=>p.name)};
    setTemplates(prev=>[...prev,t]);
    setNewTemplateName(""); setModal(null);
  };

  const deleteTemplate=id=>setTemplates(prev=>prev.filter(t=>t.id!==id));

  const setBase=presetId=>setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,basePresetId:presetId}));

  // History
  const toggleHistorySelect=(presetId,historyId)=>setSelectedHistory(prev=>{
    const exists=prev.some(s=>s.presetId===presetId&&s.historyId===historyId);
    return exists?prev.filter(s=>!(s.presetId===presetId&&s.historyId===historyId)):[...prev,{presetId,historyId}];
  });
  const deleteSelectedHistory=()=>{
    setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,
      presets:g.presets.map(p=>({...p,history:p.history.filter(h=>!selectedHistory.some(s=>s.presetId===p.id&&s.historyId===h.id))}))}));
    setSelectedHistory([]); setSelectMode(false);
  };
  const deleteSingleHistory=(presetId,historyId)=>setGuitars(prev=>prev.map(g=>g.id!==activeGuitarId?g:{...g,
    presets:g.presets.map(p=>p.id!==presetId?p:{...p,history:p.history.filter(h=>h.id!==historyId)})}));

  // CSV import
  const handleImport=e=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const result=parseCsv(ev.target.result);
      if(!result||result.length===0){alert("CSVの読み込みに失敗しました。フォーマットを確認してください。");return;}
      setGuitars(prev=>[...prev,...result]);
      alert(`${result.length}件のギターを読み込みました。`);
    };
    reader.readAsText(file,"UTF-8");
    e.target.value="";
  };

  // Compare
  const allPresetNames=[...new Set(guitars.flatMap(g=>g.presets.map(p=>p.name)))];
  const compareRows=guitars.map(g=>{
    const p=g.presets.find(p=>p.name===comparePresetName); if(!p) return null;
    const hasAbs=g.baseAbsDb!==null&&g.baseAbsDb!==undefined;
    return{guitar:g.name,relDb:p.db,absDb:hasAbs?g.baseAbsDb+p.db:null,hasAbs};
  }).filter(Boolean);

  const vuLevel=liveDb!==null?Math.max(0,Math.min(1,(liveDb+60)/60)):0;

  // ── Render ────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.textHi,fontFamily:"'Inter',system-ui,sans-serif",fontSize:14}}>

      {/* Header */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>🎸</span>
          <div>
            <div style={{fontWeight:700,fontSize:16,letterSpacing:"-0.01em"}}>GigLevel</div>
            <div style={{color:T.textMid,fontSize:11}}>Guitar Volume Manager</div>
          </div>
        </div>
        {liveDb!==null&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <VuMeter level={vuLevel}/>
            <span style={{fontFamily:"monospace",fontSize:12,color:T.amber}}>{fmtAbs(liveDb)} dB</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
        {[["manage","管理"],["measure","測定"],["compare","比較"]].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{
            flex:1,padding:"10px 0",background:"none",border:"none",
            borderBottom:tab===key?`2px solid ${T.amber}`:"2px solid transparent",
            color:tab===key?T.amber:T.textMid,fontWeight:tab===key?700:400,
            fontSize:13,cursor:"pointer",transition:"color 0.15s",
          }}>{label}</button>
        ))}
      </div>

      <div style={{padding:16,maxWidth:480,margin:"0 auto"}}>

        {/* ── MANAGE TAB ── */}
        {tab==="manage"&&(
          <div>
            {/* Guitar selector */}
            <div style={{marginBottom:12}}>
              <div style={{color:T.textMid,fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>ギター</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {guitars.map(g=>(
                  <button key={g.id} onClick={()=>selectGuitar(g.id)} style={{
                    padding:"6px 14px",borderRadius:20,
                    border:`1px solid ${g.id===activeGuitarId?T.amber:T.border}`,
                    background:g.id===activeGuitarId?T.amberDim:"transparent",
                    color:g.id===activeGuitarId?T.amber:T.textMid,
                    fontWeight:g.id===activeGuitarId?700:400,cursor:"pointer",fontSize:13,
                  }}>{g.icon} {g.name}</button>
                ))}
                <button onClick={()=>setModal("guitar")} style={{
                  padding:"6px 14px",borderRadius:20,border:`1px dashed ${T.border}`,
                  background:"transparent",color:T.textLo,cursor:"pointer",fontSize:13,
                }}>＋ 追加</button>
              </div>
            </div>

            {/* CSV import */}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <label style={{
                flex:1,padding:"8px 0",borderRadius:10,border:`1px dashed ${T.border}`,
                background:"transparent",color:T.textMid,cursor:"pointer",fontSize:12,
                textAlign:"center",display:"block",
              }}>
                ⬆ CSVインポート
                <input type="file" accept=".csv" onChange={handleImport} style={{display:"none"}}/>
              </label>
              <button onClick={()=>exportCsv(guitars)} style={{
                flex:1,padding:"8px 0",borderRadius:10,border:`1px solid ${T.border}`,
                background:"transparent",color:T.textMid,cursor:"pointer",fontSize:12,
              }}>⬇ CSV出力</button>
            </div>

            {/* Preset list */}
            {guitar&&(
              <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:15}}>{guitar.icon} {guitar.name}</span>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setModal("saveTemplate")} style={{
                      background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,
                      padding:"4px 10px",color:T.textMid,fontSize:11,cursor:"pointer",
                    }}>テンプレ保存</button>
                    <button onClick={()=>setModal("preset")} style={{
                      background:T.amberDim,border:"none",borderRadius:8,
                      padding:"4px 12px",color:T.amber,fontSize:12,fontWeight:700,cursor:"pointer",
                    }}>＋ プリセット</button>
                  </div>
                </div>

                {guitar.presets.map(p=>{
                  const isBase=p.id===guitar.basePresetId;
                  const isActive=p.id===activePresetId;
                  const lastHistory=p.history[p.history.length-1];
                  return(
                    <div key={p.id} onClick={()=>setActivePresetId(p.id)} style={{
                      padding:"12px 16px",borderBottom:`1px solid ${T.border}`,
                      display:"flex",alignItems:"center",justifyContent:"space-between",
                      background:isActive?"#20202a":"transparent",cursor:"pointer",transition:"background 0.1s",
                    }}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:8,height:8,borderRadius:4,background:isBase?T.amber:isActive?T.green:T.border}}/>
                        <div>
                          <div style={{fontWeight:isActive?700:400,fontSize:14}}>
                            {p.name}
                            {isBase&&<span style={{fontSize:10,color:T.amber,marginLeft:6,background:T.amberDim,padding:"1px 6px",borderRadius:4}}>基準</span>}
                          </div>
                          {lastHistory&&<div style={{fontSize:10,color:T.textLo,marginTop:1}}>最終測定: {new Date(lastHistory.at).toLocaleDateString("ja-JP")}</div>}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <DbBadge value={p.db}/>
                        {!isBase&&(
                          <button onClick={e=>{e.stopPropagation();setBase(p.id);}} style={{
                            background:"none",border:`1px solid ${T.border}`,borderRadius:6,
                            padding:"2px 8px",color:T.textMid,fontSize:10,cursor:"pointer",
                          }}>基準にする</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* History */}
            {preset&&preset.history.length>0&&(
              <div style={{marginTop:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{color:T.textMid,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em"}}>{preset.name} — 測定履歴</div>
                  <div style={{display:"flex",gap:8}}>
                    {selectMode&&selectedHistory.length>0&&(
                      <button onClick={deleteSelectedHistory} style={{background:T.red,border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>削除 ({selectedHistory.length})</button>
                    )}
                    <button onClick={()=>{setSelectMode(m=>!m);setSelectedHistory([]);}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 10px",color:T.textMid,fontSize:11,cursor:"pointer"}}>{selectMode?"完了":"選択"}</button>
                  </div>
                </div>
                <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                  {[...preset.history].reverse().slice(0,10).map(h=>{
                    const isChecked=selectedHistory.some(s=>s.presetId===preset.id&&s.historyId===h.id);
                    return(
                      <div key={h.id} style={{padding:"8px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          {selectMode&&<input type="checkbox" checked={isChecked} onChange={()=>toggleHistorySelect(preset.id,h.id)} style={{width:16,height:16,accentColor:T.amber,cursor:"pointer"}}/>}
                          <span style={{color:T.textMid,fontSize:12}}>{new Date(h.at).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <DbBadge value={h.db} size={12}/>
                          {!selectMode&&<button onClick={()=>deleteSingleHistory(preset.id,h.id)} style={{background:"none",border:"none",color:T.textLo,fontSize:14,cursor:"pointer",padding:"2px 4px"}}>✕</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MEASURE TAB ── */}
        {tab==="measure"&&(
          <div>
            {/* Guitar/Preset selector */}
            <GuitarPresetSelector
              guitars={guitars} activeGuitarId={activeGuitarId} activePresetId={activePresetId}
              onSelectGuitar={selectGuitar} onSelectPreset={setActivePresetId}
              hidePreset={measureMode==="baseOnly"}
            />

            {/* Mode toggle */}
            <div style={{display:"flex",gap:6,marginBottom:16,background:T.surface,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
              <button onClick={()=>setMeasureMode("baseOnly")} style={{
                flex:1,padding:"8px 4px",borderRadius:8,border:"none",
                background:measureMode==="baseOnly"?T.amberDim:"transparent",
                color:measureMode==="baseOnly"?T.amber:T.textMid,
                fontWeight:measureMode==="baseOnly"?700:400,fontSize:12,cursor:"pointer",
              }}>基準のみ</button>
              <button onClick={()=>setMeasureMode("solo")}
                disabled={!guitar?.baseAbsDb}
                style={{
                  flex:1,padding:"8px 4px",borderRadius:8,border:"none",
                  background:measureMode==="solo"?T.amberDim:"transparent",
                  color:!guitar?.baseAbsDb?T.textLo:measureMode==="solo"?T.amber:T.textMid,
                  fontWeight:measureMode==="solo"?700:400,fontSize:12,
                  cursor:!guitar?.baseAbsDb?"not-allowed":"pointer",
                }}>対象のみ</button>
              <button onClick={()=>setMeasureMode("full")} style={{
                flex:1,padding:"8px 4px",borderRadius:8,border:"none",
                background:measureMode==="full"?T.amberDim:"transparent",
                color:measureMode==="full"?T.amber:T.textMid,
                fontWeight:measureMode==="full"?700:400,fontSize:12,cursor:"pointer",
              }}>基準＋対象</button>
            </div>

            {/* Status card */}
            <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,padding:12,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{color:T.textMid,fontSize:12}}>基準</span>
                <span style={{color:T.amber,fontWeight:700}}>{basePreset?.name??"—"}</span>
              </div>
              {measureMode!=="baseOnly"&&(
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:T.textMid,fontSize:12}}>測定対象</span>
                  <span style={{fontWeight:700}}>{preset?.name??"—"}</span>
                </div>
              )}
              {guitar?.baseAbsDb&&(
                <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                  <span style={{color:T.textMid,fontSize:12}}>保存済み基準</span>
                  <span style={{fontFamily:"monospace",fontSize:12,color:T.textMid}}>{fmtAbs(guitar.baseAbsDb)} dB</span>
                </div>
              )}
            </div>

            {/* Phase UI */}
            {measurePhase==="idle"&&(
              <div style={{textAlign:"center"}}>
                <p style={{color:T.textMid,fontSize:13,lineHeight:1.7,marginBottom:20}}>
                  {measureMode==="full"&&<>① {basePreset?.name}を弾く（弾き終えたら止める）<br/>② {preset?.name}に切り替えて弾く<br/>3秒の無音で自動的に区切ります。</>}
                  {measureMode==="solo"&&<>{preset?.name}を弾いてください。<br/>3秒の無音で自動終了し、保存済みの基準と比較します。</>}
                  {measureMode==="baseOnly"&&<>{basePreset?.name}を弾いてください。<br/>3秒の無音で自動終了し、基準音量を更新します。</>}
                </p>
                <button onClick={handleMeasure} style={{
                  background:T.amber,border:"none",borderRadius:12,
                  padding:"14px 40px",color:"#0e0e10",fontSize:16,fontWeight:800,cursor:"pointer",
                }}>測定開始</button>
              </div>
            )}

            {measurePhase==="calibrate"&&(
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:12}}>🎸</div>
                <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>基準を弾いてください</div>
                <div style={{color:T.amber,fontWeight:700,fontSize:15,marginBottom:16}}>{basePreset?.name} — 3秒の無音で次へ</div>
                <VuMeter level={vuLevel}/>
                {liveDb!==null&&<div style={{marginTop:8,fontFamily:"monospace",color:T.textMid}}>{fmtAbs(liveDb)} dB</div>}
              </div>
            )}

            {measurePhase==="measure"&&(
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:12}}>🔴</div>
                <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>
                  {measureMode==="full"?"プリセットを切り替えて弾いてください":"弾いてください"}
                </div>
                <div style={{color:T.green,fontWeight:700,fontSize:15,marginBottom:16}}>
                  {measureMode==="baseOnly"?basePreset?.name:preset?.name} — 3秒の無音で自動終了
                </div>
                <VuMeter level={vuLevel}/>
                {liveDb!==null&&<div style={{marginTop:8,fontFamily:"monospace",color:T.textMid}}>{fmtAbs(liveDb)} dB</div>}
              </div>
            )}

            {measurePhase==="done"&&resultAbs!==null&&(
              <div>
                <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,padding:20,marginBottom:16,textAlign:"center"}}>
                  <div style={{color:T.textMid,fontSize:12,marginBottom:4}}>基準を更新しました</div>
                  <div style={{fontSize:48,fontFamily:"monospace",fontWeight:800,color:T.amber}}>{fmtAbs(resultAbs)} dB</div>
                  <div style={{color:T.textMid,fontSize:12,marginTop:8}}>{basePreset?.name}（基準）の絶対音量</div>
                </div>
                <button onClick={resetMeasure} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.textMid,fontSize:14,cursor:"pointer"}}>もう一度</button>
              </div>
            )}

            {measurePhase==="done"&&resultDiff!==null&&(
              <div>
                <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,padding:20,marginBottom:16}}>
                  <div style={{textAlign:"center",marginBottom:16}}>
                    <div style={{color:T.textMid,fontSize:12,marginBottom:4}}>測定完了</div>
                    <div style={{fontSize:48,fontFamily:"monospace",fontWeight:800,color:resultDiff>0?T.red:resultDiff<0?T.blue:T.green}}>{fmt(resultDiff)} dB</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {[["基準",basePreset?.name,"0.0 dB"],["現在",preset?.name,`${fmt(resultDiff)} dB`],["推奨補正","",`${fmt(-resultDiff)} dB調整`]].map(([label,name,val],i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<2?`1px solid ${T.border}`:"none"}}>
                        <div><span style={{color:T.textMid,fontSize:11}}>{label}</span>{name&&<span style={{marginLeft:8,fontWeight:600}}>{name}</span>}</div>
                        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:i===2?T.amber:T.textHi}}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={resetMeasure} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.textMid,fontSize:14,cursor:"pointer"}}>もう一度</button>
              </div>
            )}
          </div>
        )}

        {/* ── COMPARE TAB ── */}
        {tab==="compare"&&(
          <div>
            {/* Guitar selector (no preset — preset chosen by name below) */}
            <GuitarPresetSelector
              guitars={guitars} activeGuitarId={activeGuitarId} activePresetId={activePresetId}
              onSelectGuitar={selectGuitar} onSelectPreset={setActivePresetId}
              hidePreset={true}
            />

            {/* Preset name selector for comparison */}
            <div style={{marginBottom:12}}>
              <div style={{color:T.textMid,fontSize:11,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>比較するプリセット</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {allPresetNames.map(name=>(
                  <button key={name} onClick={()=>setComparePresetName(name)} style={{
                    padding:"5px 12px",borderRadius:16,
                    border:`1px solid ${name===comparePresetName?T.amber:T.border}`,
                    background:name===comparePresetName?T.amberDim:"transparent",
                    color:name===comparePresetName?T.amber:T.textMid,
                    fontWeight:name===comparePresetName?700:400,fontSize:12,cursor:"pointer",
                  }}>{name}</button>
                ))}
              </div>
            </div>

            {/* Absolute / Relative toggle */}
            <div style={{display:"flex",gap:8,marginBottom:12,background:T.surface,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
              <button onClick={()=>setCompareMode("absolute")} style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",background:compareMode==="absolute"?T.amberDim:"transparent",color:compareMode==="absolute"?T.amber:T.textMid,fontWeight:compareMode==="absolute"?700:400,fontSize:12,cursor:"pointer"}}>絶対音量</button>
              <button onClick={()=>setCompareMode("relative")} style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",background:compareMode==="relative"?T.amberDim:"transparent",color:compareMode==="relative"?T.amber:T.textMid,fontWeight:compareMode==="relative"?700:400,fontSize:12,cursor:"pointer"}}>ギター内差分</button>
            </div>

            {/* Bar comparison */}
            <div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:16}}>
              {compareRows.length===0&&<div style={{padding:24,textAlign:"center",color:T.textLo}}>同名プリセットが見つかりません</div>}
              {(()=>{
                const usable=compareMode==="absolute"?compareRows.filter(r=>r.hasAbs):compareRows;
                if(usable.length===0) return <div style={{padding:16,textAlign:"center",color:T.textLo,fontSize:12}}>基準が未測定のギターは絶対比較に含まれません</div>;
                const valueOf=r=>compareMode==="absolute"?r.absDb:r.relDb;
                const sorted=[...usable].sort((a,b)=>valueOf(b)-valueOf(a));
                const vals=usable.map(valueOf);
                const max=Math.max(...vals.map(Math.abs),1);
                const min=compareMode==="absolute"?Math.min(...vals,0):0;
                return sorted.map((r,i)=>{
                  const v=valueOf(r);
                  const pct=compareMode==="absolute"?((v-min)/(max-min||1))*100:(Math.abs(v)/max)*100;
                  return(
                    <div key={i} style={{padding:"12px 16px",borderBottom:i<sorted.length-1?`1px solid ${T.border}`:"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontWeight:600}}>{r.guitar}</span>
                        {compareMode==="absolute"
                          ?<span style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:T.amber}}>{fmtAbs(v)} dB</span>
                          :<DbBadge value={v}/>}
                      </div>
                      <div style={{height:4,background:T.border,borderRadius:2}}>
                        <div style={{height:"100%",borderRadius:2,width:`${pct}%`,background:compareMode==="absolute"?T.amber:v>0?T.red:v<0?T.blue:T.green,transition:"width 0.3s"}}/>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Matrix */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:T.textMid,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em"}}>全プリセット一覧</div>
              <button onClick={()=>exportCsv(guitars)} style={{background:T.amberDim,border:"none",borderRadius:8,padding:"4px 12px",color:T.amber,fontSize:11,fontWeight:700,cursor:"pointer"}}>⬇ CSV</button>
            </div>
            {guitars.map(g=>(
              <div key={g.id} style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,marginBottom:10,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{g.icon} {g.name}</span>
                  {!g.baseAbsDb&&<span style={{fontSize:10,color:T.textLo}}>基準未測定</span>}
                </div>
                {g.presets.map(p=>(
                  <div key={p.id} style={{padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:6,height:6,borderRadius:3,background:p.id===g.basePresetId?T.amber:T.border}}/>
                      <span style={{color:T.textMid,fontSize:13}}>{p.name}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {g.baseAbsDb&&<span style={{fontFamily:"monospace",fontSize:11,color:T.textLo}}>{fmtAbs(g.baseAbsDb+p.db)} dB</span>}
                      <DbBadge value={p.db} size={12}/>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={()=>{setModal(null);setInputName("");setSelectedTemplate(null);}}>
          <div style={{background:T.surface,borderRadius:"16px 16px 0 0",padding:24,width:"100%",maxWidth:480,border:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>

            {/* Add guitar */}
            {modal==="guitar"&&(
              <>
                <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>ギターを追加</div>
                <input autoFocus value={inputName} onChange={e=>setInputName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addGuitar()}
                  placeholder="例: Les Paul"
                  style={{width:"100%",boxSizing:"border-box",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",color:T.textHi,fontSize:15,marginBottom:14,outline:"none"}}/>

                {/* Template selection */}
                <div style={{marginBottom:14}}>
                  <div style={{color:T.textMid,fontSize:12,marginBottom:8}}>プリセットテンプレート</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>setSelectedTemplate(null)} style={{
                      padding:"5px 12px",borderRadius:12,fontSize:12,cursor:"pointer",
                      border:`1px solid ${!selectedTemplate?T.amber:T.border}`,
                      background:!selectedTemplate?T.amberDim:"transparent",
                      color:!selectedTemplate?T.amber:T.textMid,
                    }}>なし（Cleanのみ）</button>
                    {templates.map(t=>(
                      <button key={t.id} onClick={()=>setSelectedTemplate(t.id)} style={{
                        padding:"5px 12px",borderRadius:12,fontSize:12,cursor:"pointer",
                        border:`1px solid ${selectedTemplate===t.id?T.amber:T.border}`,
                        background:selectedTemplate===t.id?T.amberDim:"transparent",
                        color:selectedTemplate===t.id?T.amber:T.textMid,
                      }}>{t.name}</button>
                    ))}
                  </div>
                  {selectedTemplate&&(
                    <div style={{color:T.textLo,fontSize:11,marginTop:6}}>
                      プリセット: {templates.find(t=>t.id===selectedTemplate)?.presets.join(" / ")}
                    </div>
                  )}
                </div>

                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setModal(null);setInputName("");setSelectedTemplate(null);}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.textMid,cursor:"pointer",fontSize:14}}>キャンセル</button>
                  <button onClick={addGuitar} style={{flex:1,background:T.amber,border:"none",borderRadius:10,padding:12,color:"#0e0e10",fontWeight:800,cursor:"pointer",fontSize:14}}>追加</button>
                </div>
              </>
            )}

            {/* Add preset */}
            {modal==="preset"&&(
              <>
                <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>プリセットを追加</div>
                <input autoFocus value={inputName} onChange={e=>setInputName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addPreset()}
                  placeholder="例: Solo"
                  style={{width:"100%",boxSizing:"border-box",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",color:T.textHi,fontSize:15,marginBottom:14,outline:"none"}}/>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setModal(null);setInputName("");}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.textMid,cursor:"pointer",fontSize:14}}>キャンセル</button>
                  <button onClick={addPreset} style={{flex:1,background:T.amber,border:"none",borderRadius:10,padding:12,color:"#0e0e10",fontWeight:800,cursor:"pointer",fontSize:14}}>追加</button>
                </div>
              </>
            )}

            {/* Save template */}
            {modal==="saveTemplate"&&(
              <>
                <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>テンプレートとして保存</div>
                <div style={{color:T.textMid,fontSize:12,marginBottom:16}}>
                  {guitar?.name}のプリセット構成（{guitar?.presets.map(p=>p.name).join(" / ")}）を保存します
                </div>
                <input autoFocus value={newTemplateName} onChange={e=>setNewTemplateName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&saveTemplate()}
                  placeholder="例: Standard 4"
                  style={{width:"100%",boxSizing:"border-box",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",color:T.textHi,fontSize:15,marginBottom:14,outline:"none"}}/>

                {/* Existing templates */}
                {templates.length>0&&(
                  <div style={{marginBottom:14}}>
                    <div style={{color:T.textMid,fontSize:11,marginBottom:8}}>既存のテンプレート</div>
                    {templates.map(t=>(
                      <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                        <div>
                          <span style={{fontSize:13}}>{t.name}</span>
                          <span style={{color:T.textLo,fontSize:11,marginLeft:8}}>{t.presets.join(" / ")}</span>
                        </div>
                        <button onClick={()=>deleteTemplate(t.id)} style={{background:"none",border:"none",color:T.textLo,fontSize:13,cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setModal(null);setNewTemplateName("");}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.textMid,cursor:"pointer",fontSize:14}}>キャンセル</button>
                  <button onClick={saveTemplate} style={{flex:1,background:T.amber,border:"none",borderRadius:10,padding:12,color:"#0e0e10",fontWeight:800,cursor:"pointer",fontSize:14}}>保存</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
