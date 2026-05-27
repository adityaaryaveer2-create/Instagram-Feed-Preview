import { useState, useRef, useCallback, useEffect } from "react";

const GRID_SIZE = 9;

function getDominantColorFromImage(imgEl) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 50; canvas.height = 50;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, 50, 50);
    const data = ctx.getImageData(0,0,50,50).data;
    let r=0,g=0,b=0,count=0;
    for(let i=0;i<data.length;i+=16){
      r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++;
    }
    r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);
    return `rgb(${r},${g},${b})`;
  } catch(e) { return null; }
}

function getBrightness(imgEl) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 20; canvas.height = 20;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, 20, 20);
    const data = ctx.getImageData(0,0,20,20).data;
    let total=0,count=0;
    for(let i=0;i<data.length;i+=4){
      total += (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114);
      count++;
    }
    return Math.round(total/count);
  } catch(e) { return 128; }
}

function getContrast(imgEl) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 20; canvas.height = 20;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, 20, 20);
    const data = ctx.getImageData(0,0,20,20).data;
    let vals=[];
    for(let i=0;i<data.length;i+=4){
      vals.push(data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114);
    }
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const std=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    return Math.round(std);
  } catch(e) { return 50; }
}

async function analyzeWithClaude(images) {
  const imageData = images.map((img,i) => ({
    index: i,
    brightness: img.brightness,
    contrast: img.contrast,
    dominantColor: img.dominantColor,
  }));

  const prompt = `You are an expert Instagram aesthetic consultant. Analyze this feed data and provide specific, actionable feedback.

Feed data (${images.length} posts):
${imageData.map(d => `Post ${d.index+1}: brightness=${d.brightness}/255, contrast=${d.contrast}/100, dominantColor=${d.dominantColor}`).join('\n')}

Respond ONLY with a JSON object (no markdown, no backticks):
{
  "overallScore": <number 1-100>,
  "colorPalette": "<2-3 word description of the overall palette vibe>",
  "weakThumbnails": [<array of 0-based indices of posts that are too dark/low contrast/washed out>],
  "colorConsistencyScore": <number 1-100>,
  "colorConsistencyFeedback": "<one sentence about color harmony>",
  "topInsight": "<most important single insight about this feed, 1 sentence>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"],
  "bestCoverIndex": <0-based index of best post to use as profile cover>
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  const text = data.content.map(c => c.text||"").join("");
  const clean = text.replace(/```json|```/g,"").trim();
  return JSON.parse(clean);
}

const ScoreRing = ({ score, size=64, label }) => {
  const r = (size/2)-6;
  const circ = 2*Math.PI*r;
  const dash = (score/100)*circ;
  const color = score>=75?"#4ade80":score>=50?"#facc15":"#f87171";
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e1e2e" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 1s ease"}}/>
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
          style={{transform:"rotate(90deg)",transformOrigin:`${size/2}px ${size/2}px`,
          fill:"#e2e8f0",fontSize:size>48?15:11,fontFamily:"'DM Mono',monospace",fontWeight:700}}>
          {score}
        </text>
      </svg>
      {label && <span style={{fontSize:10,color:"#94a3b8",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:1}}>{label}</span>}
    </div>
  );
};

export default function App() {
  const [posts, setPosts] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activePost, setActivePost] = useState(null);
  const [tab, setTab] = useState("feed");
  const fileRef = useRef();
  const imgRefs = useRef({});

  const processFiles = useCallback((files) => {
    const imgs = Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0, GRID_SIZE - posts.length);
    imgs.forEach(file => {
      const url = URL.createObjectURL(file);
      const id = Math.random().toString(36).slice(2);
      setPosts(prev => [...prev, { id, url, file, brightness:128, contrast:50, dominantColor:"#888" }]);
    });
  }, [posts.length]);

  useEffect(() => {
    posts.forEach(post => {
      const el = imgRefs.current[post.id];
      if(el && el.complete && post.brightness===128) {
        const brightness = getBrightness(el);
        const contrast = getContrast(el);
        const dominantColor = getDominantColorFromImage(el);
        setPosts(prev => prev.map(p => p.id===post.id ? {...p,brightness,contrast,dominantColor:dominantColor||"#888"} : p));
      }
    });
  }, [posts]);

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const removePost = (id) => {
    setPosts(prev => prev.filter(p=>p.id!==id));
    setAnalysis(null);
  };

  const runAnalysis = async () => {
    if(posts.length<3) return;
    setAnalyzing(true);
    try {
      const result = await analyzeWithClaude(posts);
      setAnalysis(result);
      setTab("insights");
    } catch(e) { console.error(e); }
    setAnalyzing(false);
  };

  const isWeak = (idx) => analysis?.weakThumbnails?.includes(idx);
  const isBest = (idx) => analysis?.bestCoverIndex===idx;

  const filledSlots = [...posts, ...Array(Math.max(0, GRID_SIZE-posts.length)).fill(null)].slice(0,GRID_SIZE);

  return (
    <div style={{
      minHeight:"100vh", background:"#0a0a0f",
      fontFamily:"'DM Mono', 'Fira Mono', monospace",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"32px 16px",
    }}>
      <div style={{textAlign:"center",marginBottom:32,maxWidth:600}}>
        <div style={{
          display:"inline-flex",alignItems:"center",gap:8,
          background:"linear-gradient(135deg,#e91e8c,#7c3aed)",
          borderRadius:12,padding:"6px 16px",marginBottom:12,
        }}>
          <span style={{fontSize:18}}>◈</span>
          <span style={{color:"#fff",fontSize:11,letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>Feed Preview</span>
        </div>
        <h1 style={{
          color:"#f1f5f9",fontSize:"clamp(22px,5vw,36px)",margin:"0 0 8px",
          fontFamily:"'DM Serif Display','Georgia',serif",fontWeight:400,letterSpacing:-1,
        }}>Instagram Grid Analyzer</h1>
        <p style={{color:"#64748b",fontSize:13,margin:0,lineHeight:1.6}}>
          Upload up to 9 posts · AI detects weak thumbnails · color consistency scoring
        </p>
      </div>

      <div style={{display:"flex",gap:2,marginBottom:24,background:"#12121a",borderRadius:10,padding:4}}>
        {["feed","insights"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:"8px 20px",borderRadius:7,border:"none",cursor:"pointer",
            background:tab===t?"#1e1e2e":"transparent",
            color:tab===t?"#e2e8f0":"#475569",
            fontSize:12,letterSpacing:2,textTransform:"uppercase",transition:"all 0.2s",
          }}>{t}</button>
        ))}
      </div>

      {tab==="feed" && (
        <div style={{width:"100%",maxWidth:520}}>
          <div style={{
            display:"flex",alignItems:"center",gap:12,
            background:"#12121a",borderRadius:14,padding:"14px 18px",marginBottom:16,
          }}>
            <div style={{
              width:48,height:48,borderRadius:"50%",
              background:"linear-gradient(135deg,#e91e8c,#7c3aed)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:20,flexShrink:0,
            }}>◈</div>
            <div>
              <div style={{color:"#e2e8f0",fontSize:14,fontWeight:700}}>your_feed</div>
              <div style={{color:"#475569",fontSize:11}}>{posts.length} posts uploaded</div>
            </div>
            {posts.length>=3 && (
              <button onClick={runAnalysis} disabled={analyzing} style={{
                marginLeft:"auto",
                background:analyzing?"#1e1e2e":"linear-gradient(135deg,#e91e8c,#7c3aed)",
                border:"none",borderRadius:8,padding:"8px 16px",
                color:"#fff",fontSize:11,letterSpacing:1,textTransform:"uppercase",
                cursor:analyzing?"not-allowed":"pointer",transition:"all 0.2s",
                opacity:analyzing?0.7:1,
              }}>
                {analyzing?"Analyzing…":"Analyze ✦"}
              </button>
            )}
          </div>

          <div style={{
            display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3,
            borderRadius:14,overflow:"hidden",
          }}>
            {filledSlots.map((post, idx) => (
              <div key={post?.id||`empty-${idx}`} style={{
                position:"relative",aspectRatio:"1",
                background:"#12121a",cursor:post?"pointer":"default",
                overflow:"hidden",
              }}
                onClick={()=>post&&setActivePost(post)}
                onDrop={!post?handleDrop:undefined}
                onDragOver={!post?(e=>{e.preventDefault();setDragging(true)}):undefined}
                onDragLeave={!post?(()=>setDragging(false)):undefined}
              >
                {post ? (
                  <>
                    <img
                      ref={el=>{if(el)imgRefs.current[post.id]=el}}
                      src={post.url} alt=""
                      crossOrigin="anonymous"
                      onLoad={()=>{
                        const el=imgRefs.current[post.id];
                        if(el){
                          const brightness=getBrightness(el);
                          const contrast=getContrast(el);
                          const dominantColor=getDominantColorFromImage(el);
                          setPosts(prev=>prev.map(p=>p.id===post.id?{...p,brightness,contrast,dominantColor:dominantColor||"#888"}:p));
                        }
                      }}
                      style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                    />
                    <div style={{position:"absolute",top:4,right:4,display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}>
                      {isWeak(idx) && (
                        <span style={{
                          background:"rgba(239,68,68,0.9)",color:"#fff",
                          fontSize:9,padding:"2px 6px",borderRadius:4,letterSpacing:1,
                        }}>WEAK</span>
                      )}
                      {isBest(idx) && (
                        <span style={{
                          background:"rgba(234,179,8,0.9)",color:"#000",
                          fontSize:9,padding:"2px 6px",borderRadius:4,letterSpacing:1,fontWeight:700,
                        }}>★ COVER</span>
                      )}
                    </div>
                    <button onClick={e=>{e.stopPropagation();removePost(post.id)}} style={{
                      position:"absolute",top:4,left:4,
                      background:"rgba(0,0,0,0.7)",border:"none",borderRadius:"50%",
                      width:20,height:20,color:"#fff",cursor:"pointer",
                      fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",
                      opacity:0,transition:"opacity 0.2s",
                    }}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1}
                      onMouseLeave={e=>e.currentTarget.style.opacity=0}
                    >✕</button>
                  </>
                ) : (
                  <div
                    onClick={()=>fileRef.current.click()}
                    style={{
                      width:"100%",height:"100%",
                      display:"flex",flexDirection:"column",
                      alignItems:"center",justifyContent:"center",
                      color:dragging?"#7c3aed":"#2d2d3d",
                      border:`1.5px dashed ${dragging?"#7c3aed":"#1e1e2e"}`,
                      transition:"all 0.2s",cursor:"pointer",gap:4,
                    }}>
                    <span style={{fontSize:22,opacity:0.5}}>+</span>
                    <span style={{fontSize:9,letterSpacing:1,textTransform:"uppercase",opacity:0.5}}>add</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}}
            onChange={e=>processFiles(e.target.files)}/>

          {posts.length===0 && (
            <div style={{textAlign:"center",marginTop:20,color:"#334155",fontSize:12,letterSpacing:1}}>
              Click any slot or drag &amp; drop images to start
            </div>
          )}
          {posts.length>0 && posts.length<3 && (
            <div style={{textAlign:"center",marginTop:12,color:"#475569",fontSize:11,letterSpacing:1}}>
              Add at least {3-posts.length} more post{3-posts.length>1?"s":""} to run analysis
            </div>
          )}
        </div>
      )}

      {tab==="insights" && (
        <div style={{width:"100%",maxWidth:520}}>
          {!analysis ? (
            <div style={{
              background:"#12121a",borderRadius:14,padding:32,textAlign:"center",
            }}>
              <div style={{fontSize:32,marginBottom:12}}>◈</div>
              <p style={{color:"#475569",fontSize:13}}>
                {posts.length<3?"Upload at least 3 posts, then":"Switch to Feed tab and"} click <strong style={{color:"#e2e8f0"}}>Analyze</strong> to get AI insights.
              </p>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[
                  {score:analysis.overallScore, label:"Overall"},
                  {score:analysis.colorConsistencyScore, label:"Color"},
                  {score:Math.max(0,100-analysis.weakThumbnails.length*25), label:"Quality"},
                ].map(s=>(
                  <div key={s.label} style={{background:"#12121a",borderRadius:12,padding:"16px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                    <ScoreRing score={s.score} size={64} label={s.label}/>
                  </div>
                ))}
              </div>

              <div style={{
                background:"linear-gradient(135deg,rgba(233,30,140,0.1),rgba(124,58,237,0.1))",
                border:"1px solid rgba(233,30,140,0.2)",
                borderRadius:12,padding:16,
              }}>
                <div style={{color:"#e91e8c",fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Key Insight</div>
                <p style={{color:"#e2e8f0",fontSize:13,margin:0,lineHeight:1.6}}>{analysis.topInsight}</p>
              </div>

              <div style={{background:"#12121a",borderRadius:12,padding:16}}>
                <div style={{color:"#64748b",fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Palette Vibe</div>
                <span style={{background:"rgba(255,255,255,0.05)",borderRadius:20,padding:"4px 12px",color:"#cbd5e1",fontSize:12,letterSpacing:1}}>
                  {analysis.colorPalette}
                </span>
                <p style={{color:"#64748b",fontSize:12,margin:"10px 0 0",lineHeight:1.6}}>{analysis.colorConsistencyFeedback}</p>
              </div>

              {analysis.weakThumbnails.length>0 && (
                <div style={{background:"#12121a",borderRadius:12,padding:16}}>
                  <div style={{color:"#f87171",fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>⚠ Weak Thumbnails</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {analysis.weakThumbnails.map(i=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:36,height:36,borderRadius:6,overflow:"hidden",border:"2px solid #f87171",flexShrink:0}}>
                          {posts[i] && <img src={posts[i].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>}
                        </div>
                        <span style={{color:"#94a3b8",fontSize:11}}>Post {i+1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.bestCoverIndex!=null && posts[analysis.bestCoverIndex] && (
                <div style={{background:"#12121a",borderRadius:12,padding:16,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:52,height:52,borderRadius:10,overflow:"hidden",border:"2px solid #facc15",flexShrink:0}}>
                    <img src={posts[analysis.bestCoverIndex].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                  </div>
                  <div>
                    <div style={{color:"#facc15",fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>★ Best Cover Image</div>
                    <div style={{color:"#cbd5e1",fontSize:12}}>Post {analysis.bestCoverIndex+1} — strongest visual impact for a profile cover.</div>
                  </div>
                </div>
              )}

              <div style={{background:"#12121a",borderRadius:12,padding:16}}>
                <div style={{color:"#64748b",fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Suggestions</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {analysis.suggestions.map((s,i)=>(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{color:"#7c3aed",fontSize:11,marginTop:1,flexShrink:0,fontWeight:700}}>{String(i+1).padStart(2,"0")}</span>
                      <span style={{color:"#94a3b8",fontSize:12,lineHeight:1.6}}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={()=>{setAnalysis(null);setTab("feed")}} style={{
                background:"transparent",border:"1px solid #1e1e2e",borderRadius:10,
                padding:"10px",color:"#475569",fontSize:11,letterSpacing:2,
                textTransform:"uppercase",cursor:"pointer",transition:"all 0.2s",
              }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#334155";e.currentTarget.style.color="#64748b"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#1e1e2e";e.currentTarget.style.color="#475569"}}
              >← Back to Feed</button>
            </div>
          )}
        </div>
      )}

      {activePost && (
        <div onClick={()=>setActivePost(null)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:100,padding:20,backdropFilter:"blur(6px)",
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#12121a",borderRadius:16,overflow:"hidden",
            maxWidth:380,width:"100%",boxShadow:"0 40px 80px rgba(0,0,0,0.6)",
          }}>
            <img src={activePost.url} style={{width:"100%",display:"block",maxHeight:380,objectFit:"cover"}} alt=""/>
            <div style={{padding:16,display:"flex",gap:16,justifyContent:"space-around"}}>
              {[
                {label:"Brightness",val:activePost.brightness,max:255,color:"#facc15"},
                {label:"Contrast",val:activePost.contrast,max:100,color:"#4ade80"},
              ].map(m=>(
                <div key={m.label} style={{textAlign:"center"}}>
                  <div style={{color:"#64748b",fontSize:10,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{m.label}</div>
                  <div style={{width:80,height:6,background:"#1e1e2e",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${(m.val/m.max)*100}%`,height:"100%",background:m.color,borderRadius:3,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{color:"#94a3b8",fontSize:11,marginTop:4}}>{m.val}</div>
                </div>
              ))}
              <div style={{textAlign:"center"}}>
                <div style={{color:"#64748b",fontSize:10,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Color</div>
                <div style={{width:32,height:32,borderRadius:"50%",background:activePost.dominantColor,margin:"0 auto",border:"2px solid #1e1e2e"}}/>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

