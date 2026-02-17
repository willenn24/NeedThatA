/* GradeForge — Overkill Grade Calculator (vanilla JS)
   - Multi-class sidebar
   - Step 1: weights (FINAL locked row, add up to 15 rows)
   - Step 2: target grade + current category averages (excluding FINAL)
   - Computes required FINAL score
   - localStorage persistence + export/import
*/

const STORE_KEY = "gradeforge_v1";

const els = {
  classList: document.getElementById("classList"),
  addClassBtn: document.getElementById("addClassBtn"),
  deleteClassBtn: document.getElementById("deleteClassBtn"),
  themeBtn: document.getElementById("themeBtn"),
  themeIcon: document.getElementById("themeIcon"),

  pageTitle: document.getElementById("pageTitle"),
  pageSub: document.getElementById("pageSub"),
  content: document.getElementById("content"),

  modalBackdrop: document.getElementById("modalBackdrop"),
  classNameInput: document.getElementById("classNameInput"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
  createClassBtn: document.getElementById("createClassBtn"),

  toast: document.getElementById("toast"),

  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
};

let state = loadState();
let activeClassId = state.activeClassId ?? null;

/* -------------------- State helpers -------------------- */

function defaultClass(name){
  // 3 rows total at start: 2 blank + FINAL locked
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    step: 1,
    categories: [
      { name: "", weight: "", score: "" },
      { name: "", weight: "", score: "" },
      { name: "FINAL", weight: "", score: "" , locked: true },
    ],
    target: "",
    createdAt: Date.now(),
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return { classes: [], activeClassId: null, theme: "dark" };
    const parsed = JSON.parse(raw);
    return {
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      activeClassId: parsed.activeClassId ?? null,
      theme: parsed.theme === "light" ? "light" : "dark",
    };
  }catch{
    return { classes: [], activeClassId: null, theme: "dark" };
  }
}

function saveState(){
  state.activeClassId = activeClassId;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function getActiveClass(){
  return state.classes.find(c => c.id === activeClassId) || null;
}

function setActiveClass(id){
  activeClassId = id;
  saveState();
  render();
}

/* -------------------- UI helpers -------------------- */

let toastTimer = null;
function toast(msg){
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function openModal(){
  els.modalBackdrop.classList.add("show");
  els.modalBackdrop.setAttribute("aria-hidden","false");
  els.classNameInput.value = "";
  setTimeout(()=> els.classNameInput.focus(), 50);
}

function closeModal(){
  els.modalBackdrop.classList.remove("show");
  els.modalBackdrop.setAttribute("aria-hidden","true");
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

function num(v){
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function round2(x){
  return Math.round(x * 100) / 100;
}

/* -------------------- Rendering -------------------- */

function renderSidebar(){
  els.classList.innerHTML = "";

  if(state.classes.length === 0){
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = `
      <div class="card-title">No classes yet</div>
      <div class="card-sub">Hit <b>Add Class</b> to build a grade calculator for a subject.</div>
    `;
    empty.style.marginTop = "10px";
    els.classList.appendChild(empty);
    return;
  }

  state.classes
    .slice()
    .sort((a,b)=> b.createdAt - a.createdAt)
    .forEach(cls => {
      const item = document.createElement("div");
      item.className = "class-item" + (cls.id === activeClassId ? " active" : "");
      const stepBadge = cls.step === 1 ? "Setup" : "Target";
      const meta = cls.step === 1 ? "Weights" : "Required Final";

      item.innerHTML = `
        <div class="class-left">
          <div class="folder">📁</div>
          <div style="min-width:0;">
            <div class="class-name">${escapeHtml(cls.name)}</div>
            <div class="class-meta">${meta}</div>
          </div>
        </div>
        <div class="badge">${stepBadge}</div>
      `;

      item.addEventListener("click", () => setActiveClass(cls.id));
      els.classList.appendChild(item);
    });
}

function renderMain(){
  const cls = getActiveClass();

  els.deleteClassBtn.disabled = !cls;

  if(!cls){
    els.pageTitle.textContent = "Welcome";
    els.pageSub.textContent = "Create a class to begin.";
    els.content.innerHTML = `
      <div class="card">
        <div class="card-title">Build a beautiful grade calculator</div>
        <div class="card-sub">
          This app helps you set category weights (including a final), then computes what you need on the final to reach a target grade.
          <br/><br/>
          Click <b>Add Class</b> to start.
        </div>
        <div class="actions" style="justify-content:flex-start;">
          <button class="btn btn-primary" id="startNowBtn"><span class="icon">+</span> Add Your First Class</button>
        </div>
      </div>
    `;
    const btn = document.getElementById("startNowBtn");
    btn.addEventListener("click", openModal);
    return;
  }

  els.pageTitle.textContent = cls.name;
  els.pageSub.textContent = cls.step === 1
    ? "Step 1 — Define grade categories + weights (must total 100%)."
    : "Step 2 — Enter current averages + target grade to compute required final score.";

  if(cls.step === 1){
    renderStepWeights(cls);
  }else{
    renderStepTarget(cls);
  }
}

function renderStepWeights(cls){
  const rows = cls.categories;

  els.content.innerHTML = `
    <div class="grid-2">
      <div class="card" id="weightsCard">
        <div class="card-title">Grade Categories</div>
        <div class="card-sub">
          Add categories like <b>Quizzes</b>, <b>Homework</b>, <b>Exams</b>. The <b>FINAL</b> row is locked.
          Add up to <b>15</b> total rows.
        </div>

        <div class="table" id="weightsTable"></div>

        <div class="row" style="justify-content:space-between; margin-top:12px; flex-wrap:wrap; gap:10px;">
          <div class="pill" id="sumPill">Total: —%</div>
          <button class="btn btn-ghost" id="addRowBtn">＋ Add row</button>
        </div>

        <div id="weightError"></div>

        <div class="actions">
          <button class="btn btn-primary" id="nextBtn">Next →</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Pro Tips (Teacher-pleaser)</div>
        <div class="card-sub">
          • Weights must sum to <b>exactly 100%</b>.<br/>
          • Use your syllabus category names.<br/>
          • If your final replaces a test grade, you can model that by adjusting category weights accordingly.<br/><br/>
          <span class="muted">Everything saves automatically. Switch classes anytime.</span>
        </div>

        <hr class="sep"/>

        <div class="card-title">Quick Examples</div>
        <div class="card-sub">
          <b>Example A</b>: Homework 20, Quizzes 30, Exams 30, Final 20<br/>
          <b>Example B</b>: Labs 25, Projects 35, Midterms 20, Final 20
        </div>
      </div>
    </div>
  `;

  const table = document.getElementById("weightsTable");
  const sumPill = document.getElementById("sumPill");
  const errorBox = document.getElementById("weightError");
  const addRowBtn = document.getElementById("addRowBtn");

  function updateSumPill(){
    const total = rows.reduce((acc, r)=> acc + (Number(r.weight) || 0), 0);
    sumPill.textContent = `Total: ${round2(total)}%`;
    sumPill.style.borderColor = (Math.abs(total - 100) < 1e-9) ? "rgba(46,229,157,0.35)" : "";
    sumPill.style.background = (Math.abs(total - 100) < 1e-9) ? "rgba(46,229,157,0.10)" : "";
  }

  function canAddRow(){
    return rows.length < 15;
  }

  function renderRows(){
    table.innerHTML = "";
    rows.forEach((r, idx) => {
      const isFinal = (r.name === "FINAL") || r.locked;
      const rowEl = document.createElement("div");
      rowEl.className = "row";

      const nameHtml = isFinal
        ? `<input class="input-sm grow" value="FINAL" disabled />`
        : `<input class="input-sm grow" placeholder="Category (e.g., Quizzes)" value="${escapeAttr(r.name)}" data-idx="${idx}" data-field="name" />`;

      const weightHtml = `
        <div class="percent-wrap" style="width:160px;">
          <input class="input-sm" placeholder="0" value="${escapeAttr(r.weight)}" data-idx="${idx}" data-field="weight" inputmode="decimal" />
          <div class="suffix">%</div>
        </div>
      `;

      const delHtml = (!isFinal && rows.length > 2)
        ? `<button class="btn btn-ghost" data-action="del" data-idx="${idx}" title="Delete row">🗙</button>`
        : `<button class="btn btn-ghost" disabled title="Locked">🔒</button>`;

      rowEl.innerHTML = nameHtml + weightHtml + delHtml;
      table.appendChild(rowEl);
    });

    // bind inputs
    table.querySelectorAll("input[data-idx]").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const idx = Number(e.target.dataset.idx);
        const field = e.target.dataset.field;
        cls.categories[idx][field] = e.target.value;
        saveState();
        updateSumPill();
      });
    });

    // bind delete
    table.querySelectorAll("button[data-action='del']").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        cls.categories.splice(idx, 1);
        saveState();
        renderRows();
        updateSumPill();
      });
    });

    addRowBtn.disabled = !canAddRow();
  }

  function showError(html, kind="error"){
    errorBox.innerHTML = `<div class="${kind}">${html}</div>`;
  }

  function clearError(){
    errorBox.innerHTML = "";
  }

  function validateWeights(){
    // Must have FINAL row present
    const finalRow = cls.categories.find(r => (r.name || "").toUpperCase() === "FINAL" || r.locked);
    if(!finalRow) return { ok:false, msg:"Missing <b>FINAL</b> row. (This should not happen.)" };

    // Names for non-final must be non-empty
    const nonFinal = cls.categories.filter(r => !((r.name || "").toUpperCase() === "FINAL" || r.locked));
    if(nonFinal.length < 1) return { ok:false, msg:"Add at least <b>one</b> non-final category." };

    for(const r of nonFinal){
      if(!r.name || !r.name.trim()) return { ok:false, msg:"Every non-final category needs a <b>name</b>." };
    }

    // Weights numeric, >=0, sum = 100
    let sum = 0;
    for(const r of cls.categories){
      const w = num(r.weight);
      if(!Number.isFinite(w)) return { ok:false, msg:"All weights must be valid <b>numbers</b>." };
      if(w < 0) return { ok:false, msg:"Weights cannot be <b>negative</b>." };
      sum += w;
    }

    // FINAL weight must be > 0
    const fw = num(finalRow.weight);
    if(!Number.isFinite(fw) || fw <= 0) return { ok:false, msg:"Your <b>FINAL</b> weight must be greater than <b>0%</b>." };

    // exact 100 (allow tiny float error)
    if(Math.abs(sum - 100) > 1e-9){
      return { ok:false, msg:`Your weights total <b>${round2(sum)}%</b>. They must equal <b>100%</b>.` };
    }

    // Also ensure not all weight is in final (silly but valid); allow though.
    return { ok:true };
  }

  document.getElementById("addRowBtn").addEventListener("click", () => {
    if(!canAddRow()) return toast("Max 15 rows reached.");
    // Insert before FINAL row (keep final last)
    const finalIdx = cls.categories.findIndex(r => (r.name || "").toUpperCase() === "FINAL" || r.locked);
    const insertIdx = finalIdx >= 0 ? finalIdx : cls.categories.length;
    cls.categories.splice(insertIdx, 0, { name:"", weight:"", score:"" });
    saveState();
    renderRows();
    updateSumPill();
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    clearError();
    const v = validateWeights();
    if(!v.ok){
      showError(`⚠️ ${v.msg}<br/><span class="muted">Fix the weights and try again.</span>`);
      return;
    }
    // Move to step 2
    cls.step = 2;
    // Clear scores when moving forward, to avoid stale mismatches
    cls.categories.forEach(r => { if(!((r.name||"").toUpperCase()==="FINAL" || r.locked)) r.score = r.score ?? ""; });
    saveState();
    toast("Weights confirmed — moving to target + scores.");
    render();
  });

  renderRows();
  updateSumPill();
}

function renderStepTarget(cls){
  const finalRow = cls.categories.find(r => (r.name || "").toUpperCase() === "FINAL" || r.locked);
  const finalWeight = num(finalRow?.weight);

  const nonFinal = cls.categories.filter(r => !((r.name || "").toUpperCase() === "FINAL" || r.locked));

  els.content.innerHTML = `
    <div class="grid-2">
      <div class="card" id="targetCard">
        <div class="card-title">Target + Current Averages</div>
        <div class="card-sub">
          Enter your current average <b>in each category</b> (excluding FINAL).
          Then set your <b>target course grade</b> to calculate what you need on the final.
        </div>

        <label class="label">Target Course Grade</label>
        <div class="percent-wrap" style="max-width:220px;">
          <input class="input" id="targetInput" placeholder="e.g., 90" value="${escapeAttr(cls.target)}" inputmode="decimal"/>
          <div class="suffix">%</div>
        </div>

        <hr class="sep"/>

        <div class="card-title">Current Category Averages</div>
        <div class="card-sub muted">These are your averages so far in each category.</div>

        <div class="table" id="scoreTable"></div>

        <div id="calcError"></div>

        <div class="actions">
          <button class="btn btn-ghost" id="backBtn">← Back</button>
          <button class="btn btn-primary" id="recalcBtn">Recalculate</button>
        </div>
      </div>

      <div class="card" id="resultsCard">
        <div class="card-title">Results</div>
        <div class="card-sub">Live computation of the final exam score you need.</div>

        <div id="resultsArea" style="margin-top:12px;"></div>

        <hr class="sep"/>

        <div class="card-title">What-If Mode</div>
        <div class="card-sub">
          Drag to see your final course grade for a hypothetical final exam score.
        </div>

        <label class="label">Assumed Final Exam Score</label>
        <input type="range" id="whatIfRange" min="0" max="100" value="85" />
        <div class="row" style="margin-top:10px; justify-content:space-between;">
          <div class="pill" id="whatIfPill">Final: 85%</div>
          <div class="pill" id="whatIfOutcome">Course: —%</div>
        </div>

      </div>
    </div>
  `;

  const scoreTable = document.getElementById("scoreTable");
  const calcError = document.getElementById("calcError");
  const resultsArea = document.getElementById("resultsArea");
  const targetInput = document.getElementById("targetInput");

  function showError(html, kind="error"){
    calcError.innerHTML = `<div class="${kind}">${html}</div>`;
  }
  function clearError(){ calcError.innerHTML = ""; }

  function renderScores(){
    scoreTable.innerHTML = "";
    nonFinal.forEach((r, i) => {
      const idx = cls.categories.indexOf(r);
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      rowEl.innerHTML = `
        <input class="input-sm grow" value="${escapeAttr(r.name)}" disabled />
        <div class="percent-wrap" style="width:160px;">
          <input class="input-sm" placeholder="0" value="${escapeAttr(r.score)}" data-idx="${idx}" inputmode="decimal"/>
          <div class="suffix">%</div>
        </div>
        <div class="pill" title="Weight">${escapeHtml(String(r.weight))}%</div>
      `;
      scoreTable.appendChild(rowEl);
    });

    scoreTable.querySelectorAll("input[data-idx]").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const idx = Number(e.target.dataset.idx);
        cls.categories[idx].score = e.target.value;
        saveState();
        computeAndRender();
      });
    });
  }

  function computeRequiredFinal(target){
    // Weighted contribution from non-final categories:
    let nonFinalContribution = 0;
    for(const r of nonFinal){
      const w = num(r.weight);
      const s = num(r.score);
      if(!Number.isFinite(w)) return { ok:false, msg:"One of your weights is invalid. Go back to step 1." };
      if(!Number.isFinite(s)) return { ok:false, msg:`Enter a valid number for <b>${escapeHtml(r.name)}</b>.` };
      if(s < 0 || s > 100) return { ok:false, msg:`<b>${escapeHtml(r.name)}</b> must be between 0 and 100.` };
      nonFinalContribution += (w * s) / 100;
    }

    if(!Number.isFinite(finalWeight) || finalWeight <= 0){
      return { ok:false, msg:"FINAL weight must be > 0. Go back to step 1." };
    }

    const fw = finalWeight / 100;
    const requiredFinal = (target - nonFinalContribution) / fw;

    return {
      ok:true,
      nonFinalContribution,
      requiredFinal
    };
  }

  function renderRing(value, label){
    const v = clamp(value, 0, 100);
    const r = 36;
    const c = 2 * Math.PI * r;
    const dash = (v/100) * c;
    return `
      <div class="ring">
        <svg width="92" height="92" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r="${r}" fill="transparent" stroke="rgba(255,255,255,0.12)" stroke-width="10"></circle>
          <circle cx="46" cy="46" r="${r}" fill="transparent" stroke="rgba(124,92,255,0.85)" stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray="${dash} ${c - dash}">
          </circle>
        </svg>
        <div class="center">
          <div class="big">${round2(v)}%</div>
          <div class="small">${label}</div>
        </div>
      </div>
    `;
  }

  function computeAndRender(){
    clearError();

    const target = num(targetInput.value);
    cls.target = targetInput.value;
    saveState();

    if(!Number.isFinite(target)){
      showError("Enter a valid <b>target course grade</b> (0–100).");
      resultsArea.innerHTML = `<div class="muted">Waiting for target grade…</div>`;
      return;
    }
    if(target < 0 || target > 100){
      showError("Target grade must be between <b>0</b> and <b>100</b>.");
      return;
    }

    const calc = computeRequiredFinal(target);
    if(!calc.ok){
      showError(`⚠️ ${calc.msg}`);
      resultsArea.innerHTML = `<div class="muted">Fix inputs to compute…</div>`;
      return;
    }

    const nonFinalContribution = calc.nonFinalContribution;
    const req = calc.requiredFinal;

    // Messaging
    let statusClass = "ok";
    let headline = "✅ You’re on track";
    let detail = `To finish with <b>${round2(target)}%</b>, you need <b>${round2(req)}%</b> on the final.`;

    if(req > 100){
      statusClass = "error";
      headline = "⚠️ Unrealistic target (with current averages)";
      detail = `You would need <b>${round2(req)}%</b> on the final. That’s above 100%.`;
    }else if(req < 0){
      statusClass = "ok";
      headline = "🎉 Target already secured";
      detail = `Even a <b>0%</b> on the final would still keep you at or above <b>${round2(target)}%</b>.`;
    }else if(req >= 90){
      statusClass = "warn";
      headline = "🟡 High final required";
      detail = `You need <b>${round2(req)}%</b> on the final to hit <b>${round2(target)}%</b>.`;
    }

    resultsArea.innerHTML = `
      <div class="${statusClass}">
        <div style="font-weight:900; margin-bottom:6px;">${headline}</div>
        <div>${detail}</div>
      </div>

      <div class="ring-wrap">
        ${renderRing(req, "Needed")}
        <div class="kpi">
          <div class="kpi-row"><span class="muted">Non-final contribution</span><span>${round2(nonFinalContribution)}%</span></div>
          <div class="kpi-row"><span class="muted">Final weight</span><span>${round2(finalWeight)}%</span></div>
          <div class="kpi-row"><span class="muted">Target course grade</span><span>${round2(target)}%</span></div>
          <div class="kpi-row"><span class="muted">Required final score</span><span>${round2(req)}%</span></div>
        </div>
      </div>

      <hr class="sep"/>

      <div class="card-sub">
        <b>Formula</b>: Required Final =
        (Target − NonFinalContribution) ÷ (FinalWeight)
        <br/>
        <span class="muted">Where FinalWeight is in decimal form (e.g., 20% → 0.20).</span>
      </div>
    `;

    // What-if mode update
    updateWhatIf();
  }

  function computeCourseForFinal(finalScore){
    // course grade = nonFinalContribution + finalWeight * finalScore
    let nonFinalContribution = 0;
    for(const r of nonFinal){
      const w = num(r.weight);
      const s = num(r.score);
      if(!Number.isFinite(w) || !Number.isFinite(s)) return NaN;
      nonFinalContribution += (w * s) / 100;
    }
    return nonFinalContribution + (finalWeight/100) * finalScore;
  }

  const whatIfRange = document.getElementById("whatIfRange");
  const whatIfPill = document.getElementById("whatIfPill");
  const whatIfOutcome = document.getElementById("whatIfOutcome");

  function updateWhatIf(){
    const f = Number(whatIfRange.value);
    whatIfPill.textContent = `Final: ${f}%`;
    const course = computeCourseForFinal(f);
    if(Number.isFinite(course)){
      whatIfOutcome.textContent = `Course: ${round2(course)}%`;
    }else{
      whatIfOutcome.textContent = `Course: —%`;
    }
  }

  whatIfRange.addEventListener("input", updateWhatIf);

  document.getElementById("backBtn").addEventListener("click", () => {
    cls.step = 1;
    saveState();
    render();
  });

  document.getElementById("recalcBtn").addEventListener("click", () => {
    computeAndRender();
    toast("Recalculated.");
  });

  targetInput.addEventListener("input", () => computeAndRender());

  renderScores();
  computeAndRender();
}

/* -------------------- Events -------------------- */

els.addClassBtn.addEventListener("click", openModal);
els.closeModalBtn.addEventListener("click", closeModal);
els.cancelModalBtn.addEventListener("click", closeModal);

els.modalBackdrop.addEventListener("click", (e) => {
  if(e.target === els.modalBackdrop) closeModal();
});

els.classNameInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter") createClassFromModal();
  if(e.key === "Escape") closeModal();
});

els.createClassBtn.addEventListener("click", createClassFromModal);

function createClassFromModal(){
  const name = els.classNameInput.value.trim();
  if(!name){
    toast("Type a class name first.");
    els.classNameInput.focus();
    return;
  }
  const cls = defaultClass(name);
  state.classes.push(cls);
  activeClassId = cls.id;
  saveState();
  closeModal();
  toast(`Created "${name}".`);
  render();
}

els.deleteClassBtn.addEventListener("click", () => {
  const cls = getActiveClass();
  if(!cls) return;
  const ok = confirm(`Delete "${cls.name}"? This cannot be undone.`);
  if(!ok) return;

  state.classes = state.classes.filter(c => c.id !== cls.id);
  activeClassId = state.classes[0]?.id ?? null;
  saveState();
  toast("Class deleted.");
  render();
});

els.themeBtn.addEventListener("click", () => {
  state.theme = (state.theme === "dark") ? "light" : "dark";
  saveState();
  applyTheme();
  toast(`Theme: ${state.theme}`);
});

function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.theme);
  els.themeIcon.textContent = (state.theme === "dark") ? "☾" : "☀";
}

/* Export / Import */
els.exportBtn.addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "GradeForge",
    version: 1,
    classes: state.classes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gradeforge-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported JSON.");
});

els.importBtn.addEventListener("click", () => els.importFile.click());

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  if(!file) return;
  try{
    const text = await file.text();
    const payload = JSON.parse(text);
    if(!payload || !Array.isArray(payload.classes)) throw new Error("Invalid file");
    // Merge
    const incoming = payload.classes.filter(c => c && c.id && c.name);
    // Avoid ID collisions by re-IDing if needed
    const existingIds = new Set(state.classes.map(c => c.id));
    for(const c of incoming){
      if(existingIds.has(c.id)) c.id = crypto.randomUUID();
    }
    state.classes = [...incoming, ...state.classes];
    activeClassId = state.classes[0]?.id ?? null;
    saveState();
    toast("Imported classes.");
    render();
  }catch{
    toast("Import failed (invalid JSON).");
  }finally{
    els.importFile.value = "";
  }
});

/* -------------------- Utils -------------------- */

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){
  return escapeHtml(str).replaceAll('"',"&quot;");
}

/* -------------------- Render root -------------------- */

function render(){
  applyTheme();

  // If active class missing, pick first
  if(activeClassId && !state.classes.some(c => c.id === activeClassId)){
    activeClassId = state.classes[0]?.id ?? null;
    saveState();
  }

  renderSidebar();
  renderMain();
}

render();
