document.documentElement.dataset.theme=localStorage.getItem("collo-theme")||"dark"

const DEFAULT_DATA = {
    title:"Colloscope MP2I — S1 2026-2027",
    weeks:[
      {n:1,start:"2026-09-21",end:"2026-09-25"},{n:2,start:"2026-09-28",end:"2026-10-02"},{n:3,start:"2026-10-05",end:"2026-10-09"},{n:4,start:"2026-10-12",end:"2026-10-16"},{n:5,start:"2026-11-02",end:"2026-11-06"},{n:6,start:"2026-11-09",end:"2026-11-13"},{n:7,start:"2026-11-16",end:"2026-11-20"},{n:8,start:"2026-11-23",end:"2026-11-27"},{n:9,start:"2026-11-30",end:"2026-12-04"},{n:10,start:"2026-12-07",end:"2026-12-11"},{n:11,start:"2026-12-14",end:"2026-12-18"},{n:12,start:"2027-01-04",end:"2027-01-08"},{n:13,start:"2027-01-11",end:"2027-01-15"},{n:14,start:"2027-01-18",end:"2027-01-22"},{n:15,start:"2027-01-25",end:"2027-01-29"}
    ],
    slots:[
      ["Maths","M. Boughagha",1,"17:00","18:00",[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]],
      ["Maths","M. Boughagha",1,"18:00","19:00",[7,8,9,10,11,12,13,14,15,16,17,1,2,13,4]],
      ["Maths","M. Gammelin",2,"16:00","17:00",[0,1,2,3,4,5,6,7,8,9,10,11,12,3,14]],
      ["Maths","M. Moncheaux",2,"16:00","17:00",[6,7,8,9,10,11,12,13,14,15,16,17,0,1,2]],
      ["Maths","M. Moncheaux",2,"17:00","18:00",[3,4,5,6,7,8,9,10,11,12,13,14,11,16,5]],
      ["Maths","M. Shirley",3,"12:00","13:00",[8,9,10,11,12,17,14,15,16,17,9,6,15,8,17]],
      ["Maths","M. Sihrener",3,"16:00","17:00",[10,11,12,13,14,15,16,17,4,1,2,3,4,11,6]],
      ["Maths","M. Sihrener",4,"08:00","09:00",[11,12,13,14,15,16,17,1,2,3,4,5,6,7,8]],
      ["Maths","M. Saumon",4,"16:00","17:00",[12,13,14,15,16,13,1,2,3,4,5,2,7,4,9]],
      ["Maths","M. Sihrener",4,"17:00","18:00",[14,15,16,17,0,1,2,3,0,5,6,7,8,9,10]],
      ["Maths","M. Steenkerste",4,"17:00","18:00",[15,16,17,1,2,3,10,5,6,7,8,9,10,5,12]],
      ["Maths","M. Sihrener",4,"18:00","19:00",[16,17,1,2,3,4,5,6,7,8,1,10,3,12,13]],
      ["Maths","M. Stennkerste",4,"18:00","19:00",[4,5,6,7,8,9,4,11,12,13,14,15,16,17,1]],
      ["Anglais","M. Guiglielmi",1,"17:00","18:00",[4,5,6,7,8,9,0,10,11,12,13,14,15,16,17]],
      ["Anglais","M. Capes",1,"17:00","18:00",[6,7,8,9,13,14,15,16,17,10,11,5,0,1,6]],
      ["Anglais","Mme Gorrias",1,"17:00","18:00",[13,14,15,16,17,10,11,12,13,14,15,16,17,10,0]],
      ["Anglais","Mme Robin",1,"17:00","18:00",[15,16,17,12,0,1,2,3,4,1,2,3,4,9,11]],
      ["Anglais","Mme Robin",1,"18:00","19:00",[0,1,2,3,4,5,6,7,8,9,4,7,6,3,8]],
      ["Anglais","M. Capes",2,"16:00","17:00",[8,9,0,1,2,3,4,5,6,7,8,9,2,7,4]],
      ["Anglais","M. Capes",2,"17:00","18:00",[17,10,11,10,11,12,13,14,15,16,17,12,13,14,15]],
      ["Anglais","M. Guiglielmi",3,"15:00","16:00",[11,12,13,14,15,16,17,1,2,3,0,10,11,12,13]],
      ["Anglais","M. Guilgielmi",3,"16:00","17:00",[2,3,4,5,6,7,8,9,0,5,6,1,8,5,2]],
      ["Physique","M. Machin",1,"17:00","18:00",[5,6,7,8,9,0,10,11,12,13,14,15,16,17,5]],
      ["Physique","M. Machin",1,"18:00","19:00",[3,4,5,6,7,8,9,0,1,2,1,4,5,6,3]],
      ["Physique","M. Simon",1,"17:00","18:00",[14,15,16,17,10,11,12,13,14,15,16,17,10,0,14]],
      ["Physique","M. Labasque",2,"16:00","17:00",[10,11,12,13,14,15,16,17,10,11,12,13,14,15,10]],
      ["Physique","M. Cousin",2,"17:00","18:00",[1,2,3,4,5,2,7,8,9,4,5,2,1,4,1]],
      ["Physique","M. Wallyn",2,"17:00","18:00",[9,0,1,2,3,4,5,6,7,8,9,6,7,2,9]],
      ["Physique","M. Wallyn",2,"18:00","19:00",[16,17,10,0,1,6,3,4,5,6,7,8,3,11,16]],
      ["Physique","M. Huart",3,"18:00","19:00",[12,13,14,15,16,13,1,2,3,0,10,11,12,13,12]],
      ["Physique","M. Simon",4,"17:00","18:00",[7,8,9,11,12,17,14,15,16,17,3,0,9,8,7]]
    ]
  };
  const days=["Lundi","Mardi","Mercredi","Jeudi","Vendredi"]; let data=loadData(); let activeWeek=0; let activeFilter="Toutes";
  const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
  function loadData(){return structuredClone(DEFAULT_DATA)}
  function dateAt(start,offset){const d=new Date(start+"T12:00:00");d.setDate(d.getDate()+offset);return d}
  function sessionsFor(group){const out=[];data.slots.forEach(slot=>{slot[5].forEach((g,i)=>{if(g===group){const w=data.weeks[i];const date=dateAt(w.start,slot[2]);out.push({subject:slot[0],teacher:slot[1],day:slot[2],start:slot[3],end:slot[4],week:w.n,date})}})});return out.sort((a,b)=>a.date-b.date||a.start.localeCompare(b.start))}
  function fmtDate(d,opts={day:"numeric",month:"short"}){return new Intl.DateTimeFormat("fr-FR",opts).format(d).replace(".","")}
  function selectedGroup(){return Number($("#groupSelect").value||0)}
  function render(){const group=selectedGroup(),all=sessionsFor(group),now=new Date(),upcoming=all.find(s=>new Date(`${s.date.toISOString().slice(0,10)}T${s.end}:00`)>=now)||all[0];renderNext(upcoming);renderStats(all);renderWeeks();let shown=all.filter(s=>(!activeWeek||s.week===activeWeek)&&(activeFilter==="Toutes"||s.subject===activeFilter));renderSessions(shown)}
  function renderNext(s){if(!s){$("#nextCard").innerHTML='<div class="next-subject">Aucune colle</div>';return}$("#nextCard").innerHTML=`<div class="next-subject">${s.subject}</div><div class="next-meta"><div>${days[s.day]} ${fmtDate(s.date,{day:"numeric",month:"long"})}</div><div class="next-time">${s.start.replace(":","h")} → ${s.end.replace(":","h")}</div><div>${s.teacher}</div></div>`}
  function renderStats(all){const counts={Maths:0,Physique:0,Anglais:0};all.forEach(s=>counts[s.subject]++);$("#stats").innerHTML=Object.entries(counts).map(([k,v])=>`<article class="stat-card"><div><div class="stat-dot" style="background:var(--${k==="Maths"?"math":k==="Physique"?"phys":"eng"})"></div><div class="stat-value">${v}</div></div><div class="stat-label">colles · ${k.toLowerCase()}</div></article>`).join("")}
  function renderWeeks(){$("#weekStrip").innerHTML=`<button class="week-btn ${activeWeek===0?"active":""}" data-week="0">Tout<span>S1–S15</span></button>`+data.weeks.map(w=>`<button class="week-btn ${activeWeek===w.n?"active":""}" data-week="${w.n}">S${w.n}<span>${fmtDate(new Date(w.start+"T12:00:00"))}</span></button>`).join("");$$('.week-btn').forEach(b=>b.onclick=()=>{activeWeek=Number(b.dataset.week);render()})}
  function renderSessions(items){$("#weekTitle").textContent=activeWeek?`Semaine ${activeWeek}`:"Tout le semestre";$("#resultCount").textContent=`${items.length} colle${items.length!==1?"s":""}`;$("#sessionList").innerHTML=items.length?items.map(s=>`<article class="session"><div class="session-date">${fmtDate(s.date,{day:"2-digit"})}<small>${fmtDate(s.date,{month:"short"})}</small></div><div class="bar ${s.subject.toLowerCase()}"></div><div><div class="subject-line">${s.subject}</div><div class="teacher">S${s.week} · ${days[s.day]} · ${s.teacher}</div></div><div class="session-time">${s.start.replace(":","h")} — ${s.end.replace(":","h")}</div></article>`).join(""):'<div class="empty">Aucune colle avec ces filtres.</div>'}
  for(let i=1;i<=17;i++){const option=`<option value="${i}">G${i}</option>`;$("#groupSelect").insertAdjacentHTML("beforeend",option);$("#welcomeGroup").insertAdjacentHTML("beforeend",option)}
  const GROUP_KEY="collo-group-v2";
  const THEME_KEY="collo-theme";
  function updateThemeButton(){const dark=document.documentElement.dataset.theme!=="light";$("#themeToggle").textContent=dark?"☀️":"🌙";$("#themeToggle").setAttribute("aria-label",dark?"Passer au mode clair":"Passer au mode sombre");document.querySelector('meta[name="theme-color"]').content=dark?"#101827":"#101827"}
  $("#themeToggle").onclick=()=>{const next=document.documentElement.dataset.theme==="light"?"dark":"light";document.documentElement.dataset.theme=next;localStorage.setItem(THEME_KEY,next);updateThemeButton()};
  $("#groupSelect").onchange=()=>{activeWeek=0;localStorage.setItem(GROUP_KEY,$("#groupSelect").value);render()};
  $("#groupDialog").addEventListener("cancel",e=>e.preventDefault());
  $("#confirmGroup").onclick=()=>{const group=$("#welcomeGroup").value;if(!group){$("#welcomeGroup").focus();return}$("#groupSelect").value=group;localStorage.setItem(GROUP_KEY,group);$("#groupDialog").close();activeWeek=0;render()};
  function initGroupChoice(){const saved=localStorage.getItem(GROUP_KEY);if(saved&&Number(saved)>=1&&Number(saved)<=17){$("#groupSelect").value=saved;render()}else{$("#groupDialog").showModal();$("#welcomeGroup").focus()}}
  $$('.filter').forEach(b=>b.onclick=()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;render()});
  function registerModelTools(){const ctx=document.modelContext;if(!ctx?.registerTool)return;const register=tool=>{try{Promise.resolve(ctx.registerTool(tool)).catch(()=>{})}catch{}};
    register({name:"select_group",title:"Choisir un groupe",description:"Sélectionne un groupe de colle entre 1 et 17, le mémorise et actualise le planning visible.",inputSchema:{type:"object",properties:{group:{type:"integer",minimum:1,maximum:17}},required:["group"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute({group}){if(!Number.isInteger(group)||group<1||group>17)throw new Error("Le groupe doit être compris entre 1 et 17");$("#groupSelect").value=String(group);localStorage.setItem(GROUP_KEY,String(group));if($("#groupDialog").open)$("#groupDialog").close();activeWeek=0;render();return{group,sessionCount:sessionsFor(group).length}}});
    register({name:"read_group_schedule",title:"Lire le planning d’un groupe",description:"Renvoie les colles d’un groupe, avec un filtre facultatif par semaine ou matière.",inputSchema:{type:"object",properties:{group:{type:"integer",minimum:1,maximum:17},week:{type:"integer",minimum:1,maximum:15},subject:{type:"string",enum:["Maths","Physique","Anglais"]}},required:["group"],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute({group,week,subject}){if(!Number.isInteger(group)||group<1||group>17)throw new Error("Groupe invalide");return{group,sessions:sessionsFor(group).filter(s=>(!week||s.week===week)&&(!subject||s.subject===subject)).map(s=>({week:s.week,date:s.date.toISOString().slice(0,10),subject:s.subject,start:s.start,end:s.end,teacher:s.teacher}))}}});
  }
  registerModelTools();
  updateThemeButton();
  initGroupChoice();
