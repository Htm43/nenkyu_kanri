const $ = (id) => document.getElementById(id);

let state = {
  settings: {
    totalDays: 20,
    hoursPerDay: 8,
    deadline: "",
    deductLunchBreak: false,
    lunchStart: "12:00",
    lunchEnd: "13:00"
  },
  records: []
};

let fileHandle = null;
let persistQueue = Promise.resolve();

const DB_NAME = "nenkyu_manager";
const DB_STORE = "handles";
const DB_KEY = "lastFile";

function calcTotalHours() {
  return state.settings.totalDays * state.settings.hoursPerDay;
}

function toMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function calcPartialHours(startTime, endTime) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null || end <= start) return 0;

  let diffMin = end - start;
  if (state.settings.deductLunchBreak) {
    const lunchStart = toMinutes(state.settings.lunchStart);
    const lunchEnd = toMinutes(state.settings.lunchEnd);
    if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
      const overlap = Math.max(0, Math.min(end, lunchEnd) - Math.max(start, lunchStart));
      diffMin -= overlap;
    }
  }

  return Math.max(0, diffMin) / 60;
}

function calcHours(record) {
  if (record.type === "full") return state.settings.hoursPerDay;
  return calcPartialHours(record.startTime, record.endTime);
}

function sumAcquired() {
  return state.records.reduce((sum, record) => sum + calcHours(record), 0);
}

function fmtH(hours) {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function toJSON() {
  return JSON.stringify({ settings: state.settings, records: state.records }, null, 2);
}

function fromJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed.settings || !Array.isArray(parsed.records)) {
    throw new Error("データ形式が不正です。");
  }

  state.settings = {
    totalDays: Number(parsed.settings.totalDays ?? 20),
    hoursPerDay: Number(parsed.settings.hoursPerDay ?? 8),
    deadline: parsed.settings.deadline ?? "",
    deductLunchBreak: Boolean(parsed.settings.deductLunchBreak ?? false),
    lunchStart: parsed.settings.lunchStart ?? "12:00",
    lunchEnd: parsed.settings.lunchEnd ?? "13:00"
  };

  if (parsed.settings.totalDays === undefined && parsed.settings.totalHours !== undefined) {
    const safePerDay = state.settings.hoursPerDay > 0 ? state.settings.hoursPerDay : 8;
    state.settings.totalDays = Number(parsed.settings.totalHours) / safePerDay;
  }

  state.records = parsed.records.map((r) => ({
    id: r.id ?? crypto.randomUUID(),
    date: r.date,
    type: r.type,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null
  }));
}

function render() {
  renderSummary();
  renderTable();
  renderChart();
}

function renderSummary() {
  const acquired = sumAcquired();
  const total = calcTotalHours();
  const perDay = state.settings.hoursPerDay;
  const remaining = total - acquired;
  const days = perDay > 0 && total > 0 ? remaining / perDay : null;
  const ratio = total > 0 ? Math.min(acquired / total, 1) : 0;

  $("sAcquired").innerHTML = `${fmtH(acquired)}<span class="sum-unit">h</span>`;

  const remainingEl = $("sRemaining");
  if (total > 0) {
    remainingEl.innerHTML = `${fmtH(remaining)}<span class="sum-unit">h</span>`;
    remainingEl.className = `sum-val${remaining < 0 ? " is-danger" : remaining < perDay ? " is-warn" : ""}`;
  } else {
    remainingEl.textContent = "-";
    remainingEl.className = "sum-val";
  }

  const dayEl = $("sDays");
  if (days !== null) {
    dayEl.innerHTML = `${fmtH(days)}<span class="sum-unit">日</span>`;
    dayEl.className = `sum-val${days < 0 ? " is-danger" : days < 1 ? " is-warn" : ""}`;
  } else {
    dayEl.textContent = "-";
    dayEl.className = "sum-val";
  }

  const deadlineEl = $("sDeadline");
  const deadline = state.settings.deadline;
  if (deadline) {
    const diff = Math.ceil((new Date(deadline) - new Date(todayStr())) / 86400000);
    deadlineEl.innerHTML = `${diff}<span class="sum-unit">日</span>`;
    deadlineEl.className = `sum-val${diff < 0 ? " is-danger" : diff < 14 ? " is-warn" : ""}`;
  } else {
    deadlineEl.textContent = "-";
    deadlineEl.className = "sum-val";
  }

  const takenEl = $("gaugeTaken");
  const takenLbl = $("gaugeTakenLbl");
  const restLbl  = $("gaugeRestLbl");
  const pct = ratio * 100;
  takenEl.style.width = `${pct}%`;
  takenEl.className = `gauge-taken${ratio >= 1 ? " is-danger" : ratio >= 0.8 ? " is-warn" : ""}`;
  takenLbl.textContent = pct > 20 ? `${fmtH(acquired)}h 取得済` : "";
  restLbl.textContent  = total > 0 && pct < 88 ? `残 ${fmtH(remaining)}h` : "";
}

function renderChart() {
  const chartEl = $("monthChart");
  if (!state.records.length) {
    chartEl.innerHTML = '<div class="mc-empty">記録がありません</div>';
    return;
  }

  // 月別集計
  const byMonth = {};
  for (const rec of state.records) {
    const ym = rec.date.slice(0, 7);
    byMonth[ym] = (byMonth[ym] || 0) + calcHours(rec);
  }

  // 表示範囲：最初の記録月 〜 期限月 or 当月（遅いほう）
  const today = todayStr();
  const currentYM = today.slice(0, 7);
  const deadline = state.settings.deadline;
  const dataMonths = Object.keys(byMonth).sort();
  const startYM = dataMonths[0];
  const endYM = deadline
    ? [deadline.slice(0, 7), currentYM].sort().reverse()[0]
    : currentYM;

  const allMonths = [];
  let cur = startYM;
  while (cur <= endYM) {
    allMonths.push(cur);
    const [y, m] = cur.split("-").map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  const BAR_MAX_PX = 56;
  const maxH = Math.max(...allMonths.map(m => byMonth[m] || 0), 0.001);

  chartEl.innerHTML = allMonths.map(ym => {
    const h = byMonth[ym] || 0;
    const barH = h > 0 ? Math.max(3, Math.round((h / maxH) * BAR_MAX_PX)) : 2;
    const mo = ym.slice(5).replace(/^0/, "") + "月";
    const isCurrent = ym === currentYM;
    const barCls   = "mc-bar" + (isCurrent ? " mc-current" : h > 0 ? " mc-data" : "");
    const valCls   = "mc-val"   + (isCurrent ? " mc-current" : "");
    const monthCls = "mc-month" + (isCurrent ? " mc-current" : "");
    return `<div class="mc-col">${h > 0 ? `<span class="${valCls}">${fmtH(h)}h</span>` : ""}
      <div class="${barCls}" style="height:${barH}px"></div>
      <div class="${monthCls}">${mo}</div></div>`;
  }).join("");
}

function renderTable() {
  const tbody = $("recTbody");
  const empty = $("emptyMsg");
  const countEl = $("recCount");
  const editingId = $("editId").value;
  const sorted = [...state.records].sort((a, b) => a.date.localeCompare(b.date));

  countEl.textContent = `${sorted.length} 件`;

  if (sorted.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  tbody.innerHTML = sorted.map((record) => {
    const hours = calcHours(record);
    const badge = record.type === "full"
      ? '<span class="badge badge-full">終日</span>'
      : '<span class="badge badge-partial">時間単位</span>';

    return `<tr class="${record.id === editingId ? "is-editing-row" : ""}">
      <td class="mono">${record.date}</td>
      <td>${badge}</td>
      <td class="mono">${record.startTime ?? "-"}</td>
      <td class="mono">${record.endTime ?? "-"}</td>
      <td class="num">${fmtH(hours)} h</td>
      <td class="ops">
        <button class="btn btn-row btn-row-edit" data-action="edit" data-id="${record.id}">編集</button>
        <button class="btn btn-row btn-row-del" data-action="delete" data-id="${record.id}">削除</button>
      </td>
    </tr>`;
  }).join("");
}

function onTypeChange() {
  const partial = $("iType").value === "partial";
  $("iStart").disabled = !partial;
  $("iEnd").disabled = !partial;
  if (!partial) {
    $("iStart").value = "";
    $("iEnd").value = "";
  }
  $("formErr").textContent = "";
}

function validate() {
  const date = $("iDate").value;
  const type = $("iType").value;
  const start = $("iStart").value;
  const end = $("iEnd").value;
  const errEl = $("formErr");

  if (!date) {
    errEl.textContent = "取得日を入力してください。";
    return null;
  }

  if (type === "partial") {
    if (!start || !end) {
      errEl.textContent = "開始時刻と終了時刻を入力してください。";
      return null;
    }
    const rawStart = toMinutes(start);
    const rawEnd = toMinutes(end);
    if (rawStart === null || rawEnd === null || rawEnd <= rawStart) {
      errEl.textContent = "終了時刻は開始時刻より後にしてください。";
      return null;
    }

    const hours = calcPartialHours(start, end);
    if (hours <= 0) {
      errEl.textContent = "休憩控除後の取得時間が0時間以下です。開始・終了または休憩設定を確認してください。";
      return null;
    }

    const perDay = state.settings.hoursPerDay;
    if (hours > perDay) {
      errEl.textContent = `取得時間（${fmtH(hours)}h）が終日時間（${perDay}h）を超えています。`;
      return null;
    }
  }

  errEl.textContent = "";
  return {
    date,
    type,
    startTime: type === "partial" ? start : null,
    endTime: type === "partial" ? end : null
  };
}

async function submitForm() {
  const data = validate();
  if (!data) return;

  const editId = $("editId").value;
  if (editId) {
    const index = state.records.findIndex((record) => record.id === editId);
    if (index !== -1) state.records[index] = { ...state.records[index], ...data };
    cancelEdit();
  } else {
    state.records.push({ id: crypto.randomUUID(), ...data });
    resetForm();
  }

  render();
  await persist();
}

function startEdit(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  $("editId").value = id;
  $("iDate").value = record.date;
  $("iType").value = record.type;

  const partial = record.type === "partial";
  $("iStart").disabled = !partial;
  $("iEnd").disabled = !partial;
  $("iStart").value = record.startTime ?? "";
  $("iEnd").value = record.endTime ?? "";

  $("formTitle").textContent = "編集";
  $("btnSubmit").textContent = "更新";
  $("btnCancel").style.display = "inline-flex";
  $("formCard").classList.add("is-editing");
  $("formErr").textContent = "";

  $("formCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  renderTable();
}

function cancelEdit() {
  $("editId").value = "";
  resetForm();
  $("formTitle").textContent = "新規登録";
  $("btnSubmit").textContent = "登録";
  $("btnCancel").style.display = "none";
  $("formCard").classList.remove("is-editing");
  renderTable();
}

function resetForm() {
  $("iDate").value = todayStr();
  $("iType").value = "full";
  $("iStart").value = "";
  $("iEnd").value = "";
  $("iStart").disabled = true;
  $("iEnd").disabled = true;
  $("formErr").textContent = "";
}

async function deleteRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  if (!confirm(`${record.date} の記録を削除しますか？`)) return;

  state.records = state.records.filter((item) => item.id !== id);
  if ($("editId").value === id) cancelEdit();
  render();
  await persist();
}

function openSettings() {
  if (!fileHandle) return;
  $("sTotalDays").value = state.settings.totalDays;
  $("sPerDay").value = state.settings.hoursPerDay;
  $("sDeadlineInput").value = state.settings.deadline ?? "";
  $("sDeductLunch").checked = state.settings.deductLunchBreak;
  $("sLunchStart").value = state.settings.lunchStart ?? "12:00";
  $("sLunchEnd").value = state.settings.lunchEnd ?? "13:00";
  syncLunchInputs();
  $("modalOverlay").classList.add("open");
}

function closeSettings() {
  $("modalOverlay").classList.remove("open");
}

async function saveSettings() {
  state.settings = {
    totalDays: Number($("sTotalDays").value) || 0,
    hoursPerDay: Number($("sPerDay").value) || 8,
    deadline: $("sDeadlineInput").value,
    deductLunchBreak: $("sDeductLunch").checked,
    lunchStart: $("sLunchStart").value || "12:00",
    lunchEnd: $("sLunchEnd").value || "13:00"
  };
  closeSettings();
  render();
  await persist();
}

function syncLunchInputs() {
  const enabled = $("sDeductLunch").checked;
  $("sLunchStart").disabled = !enabled;
  $("sLunchEnd").disabled = !enabled;
}

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeHandle(handle) {
  try {
    const db = await openDB();
    db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(handle, DB_KEY);
  } catch (_) {
    // ignore
  }
}

async function loadStoredHandle() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

function setFileBadge(message) {
  $("fileBadge").textContent = message;
}

async function persistNow() {
  if (!fileHandle) return;
  const writable = await fileHandle.createWritable();
  await writable.write(toJSON());
  await writable.close();

  setFileBadge(`${fileHandle.name} ✓`);
  clearTimeout($("fileBadge")._saveTimer);
  $("fileBadge")._saveTimer = setTimeout(() => {
    setFileBadge(fileHandle.name);
  }, 1200);
}

function persist() {
  persistQueue = persistQueue
    .then(() => persistNow())
    .catch((error) => {
      setFileBadge(`保存失敗: ${error.message}`);
      console.error("保存失敗:", error);
    });
  return persistQueue;
}

async function readAndShow() {
  const file = await fileHandle.getFile();
  fromJSON(await file.text());
  await storeHandle(fileHandle);
  onFileReady();
}

function onFileReady() {
  setFileBadge(fileHandle.name);
  $("mainContent").style.display = "flex";
  $("noFileScreen").style.display = "none";
  $("btnRestore").style.display = "none";
  $("btnSettings").disabled = false;
  cancelEdit();
  render();
}

async function openFile() {
  try {
    const options = {
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    };
    if (fileHandle) options.startIn = fileHandle;

    [fileHandle] = await window.showOpenFilePicker(options);
    const permission = await fileHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      fileHandle = null;
      alert("書き込み権限が必要です。");
      return;
    }

    await readAndShow();
  } catch (error) {
    if (error.name !== "AbortError") alert(`読み込み失敗: ${error.message}`);
  }
}

async function newFile() {
  try {
    const options = {
      suggestedName: "nenkyuu.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    };
    if (fileHandle) options.startIn = fileHandle;

    fileHandle = await window.showSaveFilePicker(options);
    state = {
      settings: {
        totalDays: 20,
        hoursPerDay: 8,
        deadline: "",
        deductLunchBreak: false,
        lunchStart: "12:00",
        lunchEnd: "13:00"
      },
      records: []
    };

    await persistNow();
    await storeHandle(fileHandle);
    onFileReady();
  } catch (error) {
    if (error.name !== "AbortError") alert(`新規作成失敗: ${error.message}`);
  }
}

async function restoreFile() {
  const stored = await loadStoredHandle();
  if (!stored) return;

  const permission = await stored.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    alert("前回ファイルへのアクセス権限が必要です。\n権限が拒否されたため、手動で「開く」を使ってください。");
    return;
  }

  fileHandle = stored;
  await readAndShow();
}

async function tryAutoRestoreOnLaunch() {
  const stored = await loadStoredHandle();
  if (!stored) return;

  $("restoreName").textContent = stored.name;
  $("restoreHint").style.display = "block";
  $("btnRestore").style.display = "inline-flex";

  const permission = await stored.queryPermission({ mode: "readwrite" });
  if (permission === "granted") {
    fileHandle = stored;
    await readAndShow();
  }
}

function bindEvents() {
  $("btnOpen").addEventListener("click", openFile);
  $("btnOpenStart").addEventListener("click", openFile);
  $("btnNew").addEventListener("click", newFile);
  $("btnNewStart").addEventListener("click", newFile);
  $("btnRestore").addEventListener("click", restoreFile);

  $("btnSettings").addEventListener("click", openSettings);
  $("btnModalClose").addEventListener("click", closeSettings);
  $("btnModalCancel").addEventListener("click", closeSettings);
  $("btnSaveSettings").addEventListener("click", saveSettings);
  $("sDeductLunch").addEventListener("change", syncLunchInputs);

  $("btnCancel").addEventListener("click", cancelEdit);
  $("btnSubmit").addEventListener("click", submitForm);
  $("iType").addEventListener("change", onTypeChange);

  $("recTbody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;

    if (button.dataset.action === "edit") {
      startEdit(id);
      return;
    }
    if (button.dataset.action === "delete") {
      await deleteRecord(id);
    }
  });

  $("modalOverlay").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeSettings();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });
}

async function init() {
  resetForm();
  bindEvents();
  await tryAutoRestoreOnLaunch();
}
