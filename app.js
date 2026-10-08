
const API_URL="https://script.google.com/macros/s/AKfycbweWiIT17nffheBUsbJdVjyPFnI9non4T-tQ1B8Z_JjwMKi8_7pDI7NzhYTSjMmBOBLng/exec";
const state={budget:[],launches:[],month:10,year:new Date().getFullYear()};
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v)||0);
const signed=(tipo,v)=>tipo==="DESPESA"?-Math.abs(Number(v)||0):Math.abs(Number(v)||0);
const monthName=m=>new Date(2000,m-1,1).toLocaleDateString("pt-BR",{month:"long"});
const norm=s=>String(s??"").trim().toLowerCase();
let loading=false;
let editingBudgetId=null;

const filters={search:"",month:"",type:"",item:""};

function parseDateParts(value){
  if(!value) return {year:state.year,month:state.month,date:""};
  const s=String(value);
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return {year:Number(s.slice(0,4)),month:Number(s.slice(5,7)),date:s.slice(0,10)};
  const d=new Date(value);
  if(!Number.isNaN(d.getTime())) return {year:d.getFullYear(),month:d.getMonth()+1,date:d.toISOString().slice(0,10)};
  return {year:state.year,month:state.month,date:""};
}

function mapApiData(payload){
  const orc=Array.isArray(payload.orcamento)?payload.orcamento:[];
  const lan=Array.isArray(payload.lancamentos)?payload.lancamentos:[];
  state.budget=orc.map(x=>({
    id:Number(x.linha),
    year:state.year,
    month:Number(x.mes)||0,
    tipo:String(x.tipo||"").toUpperCase(),
    item:String(x.item||""),
    estimated:Number(x.estimado)||0
  }));
  state.launches=lan.map(x=>{
    const p=parseDateParts(x.data);
    return {
      id:Number(x.linha),
      date:p.date,
      year:p.year,
      month:Number(x.mes)||p.month,
      tipo:String(x.tipo||"").toUpperCase(),
      item:String(x.item||""),
      value:Number(x.valor)||0,
      obs:String(x.observacao||"")
    };
  });
}

async function apiGet(action){
  const url=`${API_URL}?action=${encodeURIComponent(action)}`;
  const r=await fetch(url,{method:"GET",cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data=await r.json();
  if(data.sucesso===false) throw new Error(data.erro||"Erro na API");
  return data;
}

async function apiPost(action,payload){
  const r=await fetch(API_URL,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({action,...payload})
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data=await r.json();
  if(data.sucesso===false) throw new Error(data.erro||"Erro na API");
  return data;
}

function setBusy(value){
  loading=value;
  document.querySelectorAll("button").forEach(b=>b.disabled=value);
  document.body.style.cursor=value?"wait":"";
}

function showError(message){
  console.error(message);
  alert(`Não foi possível concluir a operação.\n\n${message}`);
}

async function loadData(){
  setBusy(true);
  try{
    const data=await apiGet("dados");
    mapApiData(data);
    populateFilters();
    setupMonth();
    render();
  }catch(err){
    showError(`${err.message}\n\nVerifique se você está conectado à Conta Google autorizada a acessar o aplicativo.`);
  }finally{
    setBusy(false);
  }
}

function extraList(){
  return state.launches.filter(x=>x.year===state.year&&x.month===state.month&&x.tipo==="DESPESA"&&!state.budget.some(b=>b.month===x.month&&b.tipo==="DESPESA"&&norm(b.item)===norm(x.item)));
}

function populateFilters(){
  const month=document.querySelector("#filterMonth");
  const item=document.querySelector("#filterItem");
  const oldMonth=filters.month, oldItem=filters.item;
  month.innerHTML='<option value="">Todos os meses</option>'+Array.from({length:12},(_,i)=>`<option value="${i+1}">${monthName(i+1).replace(/^./,c=>c.toUpperCase())}</option>`).join("");
  const items=[...new Set(state.budget.map(x=>x.item).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  item.innerHTML='<option value="">Todos os itens</option>'+items.map(x=>`<option value="${x.replace(/"/g,"&quot;")}">${x}</option>`).join("");
  month.value=oldMonth; item.value=oldItem;
}

function filteredBudget(){
  const q=filters.search.trim().toLowerCase();
  return state.budget.filter(b=>{
    const okMonth=!filters.month||String(b.month)===String(filters.month);
    const okType=!filters.type||b.tipo===filters.type;
    const okItem=!filters.item||b.item===filters.item;
    const okSearch=!q||b.item.toLowerCase().includes(q);
    return okMonth&&okType&&okItem&&okSearch;
  });
}

function render(){
  const ls=state.launches.filter(x=>x.year===state.year&&x.month===state.month);
  const ent=ls.filter(x=>x.tipo==="ENTRADA").reduce((a,x)=>a+x.value,0);
  const desp=-ls.filter(x=>x.tipo==="DESPESA").reduce((a,x)=>a+x.value,0);
  const ex=-extraList().reduce((a,x)=>a+x.value,0);
  document.querySelector("#entradas").textContent=money(ent);
  document.querySelector("#despesas").textContent=money(desp);
  document.querySelector("#saldo").textContent=money(ent-desp);
  document.querySelector("#extras").textContent=money(ex);
  document.querySelector("#periodTitle").textContent=`${monthName(state.month).replace(/^./,c=>c.toUpperCase())} ${state.year}`;

  const items=state.budget.filter(b=>b.year===state.year&&b.month===state.month&&b.tipo==="DESPESA"&&["Combustível","Supermercado","Café Fora","EXTRAS"].includes(b.item));
  document.querySelector("#indicators").innerHTML=items.map(b=>{
    const paid=-ls.filter(x=>x.tipo==="DESPESA"&&norm(x.item)===norm(b.item)).reduce((a,x)=>a+x.value,0);
    const pct=b.estimated?Math.min(100,paid/b.estimated*100):0;
    return `<article class="indicator"><div class="indicator-top"><b>${b.item}</b><span class="amount">${money(paid)}</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="indicator-foot"><span>Limite ${money(b.estimated)}</span><span>${Math.round(pct)}%</span></div></article>`;
  }).join("");

  document.querySelector("#budget").innerHTML=filteredBudget().filter(b=>b.year===state.year&&(filters.month||b.month===state.month)).map(b=>{
    const same=ls.filter(x=>x.tipo===b.tipo&&norm(x.item)===norm(b.item));
    const paid=b.tipo==="DESPESA"?-same.reduce((a,x)=>a+x.value,0):same.reduce((a,x)=>a+x.value,0);
    const rest=b.estimated-paid;
    return `<tr class="budget-row" data-budget="${b.id}" title="Clique para editar"><td>${b.tipo}</td><td><b>${b.item}</b></td><td>${money(b.estimated)}</td><td class="${b.tipo==="DESPESA"?"negative":"positive"}">${money(paid)}</td><td>${money(rest)}</td></tr>`;
  }).join("");

  const monthly=Array.from({length:12},(_,i)=>{
    const m=i+1;
    const ml=state.launches.filter(x=>x.year===state.year&&x.month===m);
    const entry=ml.filter(x=>x.tipo==="ENTRADA").reduce((a,x)=>a+x.value,0);
    const paid=-ml.filter(x=>x.tipo==="DESPESA").reduce((a,x)=>a+x.value,0);
    const forecast=state.budget.filter(x=>x.year===state.year&&x.month===m&&x.tipo==="DESPESA").reduce((a,x)=>a+x.estimated,0);
    return {m,entry,forecast,paid};
  });
  const maxChart=Math.max(1,...monthly.flatMap(x=>[x.entry,x.forecast,x.paid]));
  document.querySelector("#chart").innerHTML=monthly.map(x=>{
    const h=v=>Math.max(2,Math.round((v/maxChart)*178));
    return `<div class="barcol"><div class="month-bars" title="Entrada: ${money(x.entry)} | Previsão: ${money(x.forecast)} | Pago: ${money(x.paid)}"><i class="entry" style="height:${h(x.entry)}px"></i><i class="forecast" style="height:${h(x.forecast)}px"></i><i class="paid" style="height:${h(x.paid)}px"></i></div><label>${String(x.m).padStart(2,"0")}</label></div>`;
  }).join("");

  const budgets=filteredBudget().filter(x=>x.year===state.year&&(filters.month||x.month===state.month));
  const forecast=budgets.filter(x=>x.tipo==="DESPESA").reduce((a,x)=>a+x.estimated,0);
  const paid=-ls.filter(x=>x.tipo==="DESPESA").reduce((a,x)=>a+x.value,0);
  document.querySelector("#budgetTotal").textContent=money(forecast);
  document.querySelector("#budgetPaid").textContent=money(paid);
  document.querySelector("#budgetRemaining").textContent=money(forecast-paid);
  bindBudgetRows();
}

function setupMonth(){
  const select=document.querySelector("#month");
  select.innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===state.month?"selected":""}>${monthName(i+1).replace(/^./,c=>c.toUpperCase())}</option>`).join("");
  select.value=String(state.month);
  select.onchange=e=>{state.month=+e.target.value;render()};
}

function showScreen(id){
  document.getElementById("dashboardScreen").classList.toggle("active",id==="dashboardScreen");
  document.getElementById("budgetScreen").classList.toggle("active",id==="budgetScreen");
  document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));
  window.scrollTo({top:0,behavior:"smooth"});
}

function openBudgetEditor(item){
  const modal=document.querySelector("#budgetEditModal");
  const form=document.querySelector("#budgetEditForm");
  editingBudgetId=item.id;
  form.elements.tipo.value=item.tipo;
  form.elements.item.value=item.item;
  form.elements.estimated.value=item.estimated;
  form.elements.mes.innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===item.month?"selected":""}>${monthName(i+1).replace(/^./,c=>c.toUpperCase())}</option>`).join("");
  document.querySelector("#editTitle").textContent=item.item;
  modal.classList.remove("hidden");
}
function closeBudgetEditor(){editingBudgetId=null;document.querySelector("#budgetEditModal").classList.add("hidden")}
function bindBudgetRows(){
  document.querySelectorAll("[data-budget]").forEach(row=>row.onclick=()=>{
    const item=state.budget.find(x=>x.id===Number(row.dataset.budget));
    if(item) openBudgetEditor(item);
  });
}

async function saveLaunch(e){
  e.preventDefault();
  if(loading) return;
  const f=new FormData(e.target),d=f.get("data"),tipo=f.get("tipo");
  const item=String(f.get("item")||"").trim();
  const valor=Math.abs(Number(f.get("valor"))||0);
  if(!d||!item||!valor){showError("Preencha data, item e valor.");return}
  setBusy(true);
  try{
    await apiPost("adicionarLancamento",{data:d,mes:Number(d.slice(5,7)),tipo,item,valor,observacao:String(f.get("obs")||"")});
    e.target.reset();
    document.querySelector("#modal").classList.add("hidden");
    await loadData();
  }catch(err){showError(err.message)}finally{setBusy(false)}
}

async function saveBudget(e){
  e.preventDefault();
  if(loading||editingBudgetId==null) return;
  const item=state.budget.find(x=>x.id===editingBudgetId);
  if(!item) return;
  const f=new FormData(e.target);
  const novo={linha:item.id,tipo:String(f.get("tipo")),item:String(f.get("item")||"").trim(),mes:Number(f.get("mes")),estimado:Math.abs(Number(f.get("estimated"))||0)};
  if(!novo.item||!novo.mes||novo.estimado<0){showError("Preencha os dados do orçamento.");return}
  setBusy(true);
  try{
    await apiPost("editarOrcamento",novo);
    closeBudgetEditor();
    await loadData();
  }catch(err){showError(err.message)}finally{setBusy(false)}
}

async function deleteBudget(){
  if(loading||editingBudgetId==null) return;
  const item=state.budget.find(x=>x.id===editingBudgetId);
  if(!item) return;
  const linked=state.launches.filter(x=>x.month===item.month&&x.tipo===item.tipo&&norm(x.item)===norm(item.item));
  if(linked.length){alert(`"${item.item}" possui ${linked.length} lançamento(s) vinculado(s). Exclua ou altere esses lançamentos antes de excluir o orçamento.`);return}
  if(!confirm(`Excluir o orçamento de "${item.item}"?`)) return;
  setBusy(true);
  try{
    await apiPost("excluirOrcamento",{linha:item.id});
    closeBudgetEditor();
    await loadData();
  }catch(err){showError(err.message)}finally{setBusy(false)}
}

document.querySelector("#refresh").onclick=loadData;
document.querySelector("#add").onclick=()=>document.querySelector("#modal").classList.remove("hidden");
document.querySelector("#cancel").onclick=document.querySelector("#cancel2").onclick=()=>document.querySelector("#modal").classList.add("hidden");
document.querySelector("#form").onsubmit=saveLaunch;
document.querySelector("#editCancel").onclick=closeBudgetEditor;
document.querySelector("#editCancel2").onclick=closeBudgetEditor;
document.querySelector("#budgetEditForm").onsubmit=saveBudget;
document.querySelector("#editDelete").onclick=deleteBudget;
document.querySelector("#budgetEditModal").addEventListener("click",e=>{if(e.target.id==="budgetEditModal")closeBudgetEditor()});
document.querySelectorAll(".bottom-nav button").forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
document.querySelector("#filterSearch").oninput=e=>{filters.search=e.target.value;render()};
document.querySelector("#filterMonth").onchange=e=>{filters.month=e.target.value;render()};
document.querySelector("#filterType").onchange=e=>{filters.type=e.target.value;render()};
document.querySelector("#filterItem").onchange=e=>{filters.item=e.target.value;render()};
document.querySelector("#clearFilters").onclick=()=>{filters.search="";filters.month="";filters.type="";filters.item="";document.querySelector("#filterSearch").value="";document.querySelector("#filterMonth").value="";document.querySelector("#filterType").value="";document.querySelector("#filterItem").value="";render()};

populateFilters();
setupMonth();
showScreen("dashboardScreen");
loadData();
