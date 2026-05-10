const STORAGE_KEY = "portfolio_items";
const DB_NAME = "portfolio_photo_store";
const DB_VERSION = 1;
const PHOTO_STORE = "photos";
const MAX_PHOTOS_PER_ITEM = 6;

const multiSubjects = ["幹部經歷", "競賽", "證照", "服務學習", "彈性學習", "社團", "職場學習", "作品成果", "其他"];

const prompts = [
  "今天有沒有哪一刻你想記下來?",
  "上一週你做過什麼小事是別人不知道的?",
  "最近你跟誰討論過什麼有趣的事?",
  "你最近卡在哪裡? 先寫一句就好。",
  "今天上課有哪個例子可以留下來?",
  "有沒有一張照片，可以提醒你做過什麼?",
  "最近哪件事讓你想再試一次?",
  "哪個作業、活動、報告可以先放進來?",
  "你今天有學到一個新詞或新方法嗎?",
  "不用整理好，先把素材留下來。"
];

const typeText = {
  course: "課程學習成果",
  multi: "多元表現"
};

const fieldLabels = {
  course: ["我學到", "有困難", "未來規劃"],
  multi: ["我做了", "我感覺", "我學到"]
};

const placeholders = {
  course: [
    "寫一句你看見的、想到的、學會的",
    "哪裡卡住、哪裡不確定都可以",
    "下次想怎麼做，寫一小步就好"
  ],
  multi: [
    "你做了什麼，簡單寫就好",
    "當下覺得怎樣，不用寫很長",
    "這件事讓你知道了什麼"
  ]
};

let items = [];
let filterType = "all";
let filterSubject = "all";
let expandedId = "";
let dbPromise = null;
let draftPhotos = [];

const els = {
  itemCount: document.querySelector("#itemCount"),
  dailyPrompt: document.querySelector("#dailyPrompt"),
  firstNote: document.querySelector("#firstNote"),
  newItemBtn: document.querySelector("#newItemBtn"),
  firstItemBtn: document.querySelector("#firstItemBtn"),
  itemList: document.querySelector("#itemList"),
  emptyState: document.querySelector("#emptyState"),
  typeFilters: document.querySelector("#typeFilters"),
  subjectFilter: document.querySelector("#subjectFilter"),
  editorView: document.querySelector("#editorView"),
  editorMode: document.querySelector("#editorMode"),
  editorTitle: document.querySelector("#editorTitle"),
  cancelEditBtn: document.querySelector("#cancelEditBtn"),
  clearFormBtn: document.querySelector("#clearFormBtn"),
  form: document.querySelector("#itemForm"),
  itemId: document.querySelector("#itemId"),
  titleInput: document.querySelector("#titleInput"),
  subjectLabel: document.querySelector("#subjectLabel"),
  subjectTextInput: document.querySelector("#subjectTextInput"),
  subjectSelectInput: document.querySelector("#subjectSelectInput"),
  dateInput: document.querySelector("#dateInput"),
  threeThings: document.querySelector("#threeThings"),
  noteInput: document.querySelector("#noteInput"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  printPage: document.querySelector("#printPage"),
  toast: document.querySelector("#toast")
};

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch {
    items = [];
    showToast("資料讀取失敗，先從空白開始");
  }
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    showToast("這台裝置空間不夠，先刪一些資料");
    return false;
  }
}

function openPhotoDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("no indexedDB"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function putPhoto(photo) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(photo);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhoto(id) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deletePhoto(id) {
  try {
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 照片刪除失敗不擋文字資料操作。
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentType() {
  return document.querySelector("input[name='itemType']:checked").value;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setPrompt() {
  const index = Math.floor(Math.random() * prompts.length);
  els.dailyPrompt.textContent = prompts[index];
}

function fillSubjectFilter() {
  const subjects = [...new Set(items
    .filter(item => filterType === "all" || item.type === filterType)
    .map(item => item.subject)
    .filter(Boolean))];
  els.subjectFilter.innerHTML = `<option value="all">全部</option>${subjects.map(subject => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("")}`;
  if (!subjects.includes(filterSubject)) filterSubject = "all";
  els.subjectFilter.value = filterSubject;
}

function fillMultiSubjectSelect(selected = "") {
  els.subjectSelectInput.innerHTML = multiSubjects
    .map(subject => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join("");
  els.subjectSelectInput.value = selected || multiSubjects[0];
}

function renderThreeThings(type, values = {}) {
  els.threeThings.innerHTML = fieldLabels[type].map((label, index) => {
    const key = `field${index + 1}`;
    return `
      <label>
        <span>${label}</span>
        <textarea data-thing="${key}" rows="5" placeholder="${placeholders[type][index]}">${escapeHtml(values[key] || "")}</textarea>
      </label>
    `;
  }).join("");
}

function render() {
  const sorted = [...items].sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
  const filtered = sorted.filter(item => {
    const typeOk = filterType === "all" || item.type === filterType;
    const subjectOk = filterSubject === "all" || item.subject === filterSubject;
    return typeOk && subjectOk;
  });

  els.itemCount.textContent = `已累積 ${items.length} 筆`;
  els.firstNote.hidden = items.length > 0;
  els.emptyState.classList.toggle("active", filtered.length === 0);
  els.itemList.innerHTML = filtered.map(renderItem).join("");
  hydrateListPhotos(filtered);
}

function renderItem(item) {
  const labels = fieldLabels[item.type];
  const isOpen = expandedId === item.id;
  const things = labels.map((label, index) => {
    const text = item.threeThings?.[`field${index + 1}`] || "先空著";
    return `<div class="thing"><b>${label}</b><p>${escapeHtml(text)}</p></div>`;
  }).join("");
  const note = item.note ? `<div class="thing"><b>備註</b><p>${escapeHtml(item.note)}</p></div>` : "";
  const photoCount = item.photos?.length || 0;

  return `
    <article class="item-card" data-id="${escapeHtml(item.id)}">
      <button class="item-summary" type="button" data-action="toggle">
        <div class="item-row">
          <div>
            <h3 class="item-title">${escapeHtml(item.title)}</h3>
            <div class="meta">
              <span class="tag">${typeText[item.type]}</span>
              <span>${escapeHtml(item.subject || "未分類")}</span>
              <span>${escapeHtml(item.date || item.createdAt?.slice(0, 10) || "")}</span>
              ${photoCount ? `<span>${photoCount} 張照片</span>` : ""}
            </div>
          </div>
          <span class="meta">${isOpen ? "收起" : "展開"}</span>
        </div>
      </button>
      <div class="item-detail" ${isOpen ? "" : "hidden"}>
        ${things}
        ${note}
        ${photoCount ? `<div class="photo-strip" data-photo-strip="${escapeHtml(item.id)}"></div>` : ""}
        <div class="item-actions">
          <button class="small-btn" type="button" data-action="edit">編輯</button>
          <button class="small-btn" type="button" data-action="export-pdf">匯出 PDF</button>
          <button class="small-btn delete" type="button" data-action="ask-delete">刪除</button>
        </div>
        <div class="confirm-delete">
          <span>這筆要刪掉嗎?</span>
          <button class="small-btn delete" type="button" data-action="delete">刪掉</button>
          <button class="small-btn" type="button" data-action="cancel-delete">先不要</button>
        </div>
      </div>
    </article>
  `;
}

async function hydrateListPhotos(list) {
  for (const item of list) {
    if (expandedId !== item.id || !item.photos?.length) continue;
    const strip = document.querySelector(`[data-photo-strip="${CSS.escape(item.id)}"]`);
    if (!strip) continue;
    const photos = await loadPhotos(item.photos);
    strip.innerHTML = photos
      .filter(Boolean)
      .slice(0, 6)
      .map(photo => `<img class="photo-thumb" alt="" src="${photo.dataUrl}">`)
      .join("");
  }
}

async function loadPhotos(photoRefs = []) {
  const photos = [];
  for (const ref of photoRefs) {
    try {
      const photo = await getPhoto(ref.id);
      if (photo) photos.push(photo);
    } catch {
      showToast("有照片讀不到");
    }
  }
  return photos;
}

async function openEditor(item = null) {
  const type = item?.type || "course";
  els.editorView.hidden = false;
  els.editorMode.textContent = item ? "編輯素材" : "新增素材";
  els.editorTitle.textContent = item ? "補一下這筆" : "記一筆素材";
  els.itemId.value = item?.id || "";
  els.titleInput.value = item?.title || "";
  els.dateInput.value = item?.date || today();
  els.noteInput.value = item?.note || "";
  els.photoInput.value = "";
  draftPhotos = item?.photos ? [...item.photos] : [];
  document.querySelector(`input[name='itemType'][value='${type}']`).checked = true;
  updateEditorType(type, item?.subject, item?.threeThings);
  await renderPhotoPreview();
  setTimeout(() => els.titleInput.focus(), 40);
}

function closeEditor() {
  els.editorView.hidden = true;
  els.form.reset();
  els.itemId.value = "";
  draftPhotos = [];
  els.photoPreview.innerHTML = "";
}

function updateEditorType(type, selectedSubject = "", things = {}) {
  els.subjectLabel.textContent = type === "course" ? "科目" : "項目";
  els.subjectTextInput.hidden = type !== "course";
  els.subjectSelectInput.hidden = type === "course";
  if (type === "course") {
    els.subjectTextInput.value = selectedSubject || "";
  } else {
    fillMultiSubjectSelect(selectedSubject);
  }
  renderThreeThings(type, things);
}

async function renderPhotoPreview() {
  if (!draftPhotos.length) {
    els.photoPreview.innerHTML = "";
    return;
  }
  const photos = await loadPhotos(draftPhotos);
  els.photoPreview.innerHTML = photos.map(photo => `
    <div class="preview-item" data-photo-id="${escapeHtml(photo.id)}">
      <img class="preview-thumb" alt="" src="${photo.dataUrl}">
      <button class="small-btn delete" type="button" data-action="remove-photo">移除</button>
    </div>
  `).join("");
}

function getSubjectValue(type) {
  if (type === "course") return els.subjectTextInput.value.trim() || "未分類";
  return els.subjectSelectInput.value || "其他";
}

function formDataToItem(existing = null) {
  const type = currentType();
  const threeThings = {};
  document.querySelectorAll("[data-thing]").forEach(field => {
    threeThings[field.dataset.thing] = field.value.trim();
  });

  const now = new Date().toISOString();
  return {
    id: existing?.id || makeId(),
    type,
    title: els.titleInput.value.trim(),
    subject: getSubjectValue(type),
    date: els.dateInput.value || today(),
    threeThings,
    photos: draftPhotos,
    note: els.noteInput.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  const id = els.itemId.value;
  const existing = items.find(item => item.id === id);
  const next = formDataToItem(existing);

  if (!next.title) {
    showToast("標題寫一個詞也可以");
    els.titleInput.focus();
    return;
  }

  if (existing) {
    const removedPhotos = (existing.photos || []).filter(oldPhoto => !next.photos.some(photo => photo.id === oldPhoto.id));
    removedPhotos.forEach(photo => deletePhoto(photo.id));
    items = items.map(item => item.id === id ? next : item);
  } else {
    items = [next, ...items];
    expandedId = next.id;
  }

  if (!saveItems()) return;
  closeEditor();
  fillSubjectFilter();
  render();
  showToast(existing ? achievementText("已更新") : milestoneText(items.length) || achievementText("已存"));
}

function milestoneText(count) {
  return {
    1: "第一筆素材完成。持續累積。",
    10: "累積 10 筆了。",
    30: "30 筆。三年後的你會謝謝你現在的累積。",
    50: "50 筆。素材庫成形了。"
  }[count];
}

function achievementText(prefix) {
  const photoCount = items.reduce((sum, item) => sum + (item.photos?.length || 0), 0);
  if (photoCount) return `${prefix}。已累積 ${items.length} 筆、${photoCount} 張照片。`;
  return `${prefix}。已累積 ${items.length} 筆。`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

async function deleteItem(id) {
  const item = items.find(entry => entry.id === id);
  if (item?.photos?.length) item.photos.forEach(photo => deletePhoto(photo.id));
  items = items.filter(entry => entry.id !== id);
  if (expandedId === id) expandedId = "";
  if (!saveItems()) return;
  fillSubjectFilter();
  render();
  showToast("已刪除");
}

async function handlePhotoInput() {
  const files = [...els.photoInput.files];
  if (!files.length) return;
  const slots = Math.max(0, MAX_PHOTOS_PER_ITEM - draftPhotos.length);
  const selected = files.slice(0, slots);
  if (files.length > slots) showToast(`先放 ${MAX_PHOTOS_PER_ITEM} 張以內，PDF 比較穩`);

  for (const file of selected) {
    try {
      const photo = await compressImage(file);
      await putPhoto(photo);
      draftPhotos.push({ id: photo.id, name: photo.name, size: photo.size });
    } catch {
      showToast("有照片放不進來");
    }
  }
  els.photoInput.value = "";
  await renderPhotoPreview();
  showToast(`已放 ${draftPhotos.length} 張照片。持續累積。`);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        resolve({
          id: makeId(),
          name: file.name,
          type: "image/jpeg",
          size: Math.round(dataUrl.length * 0.75),
          width: canvas.width,
          height: canvas.height,
          dataUrl,
          createdAt: new Date().toISOString()
        });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function exportPdf(id) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  const photos = await Promise.all((await loadPhotos(item.photos || [])).map(ensurePhotoSize));
  const labels = fieldLabels[item.type];
  const sections = labels.map((label, index) => {
    const text = item.threeThings?.[`field${index + 1}`] || "";
    return `
      <section class="print-section">
        <h2>${escapeHtml(label)}</h2>
        <p>${escapeHtml(text || " ")}</p>
      </section>
    `;
  }).join("");
  const note = item.note ? `
    <section class="print-section">
      <h2>備註</h2>
      <p>${escapeHtml(item.note)}</p>
    </section>
  ` : "";
  const photoHtml = photos.length ? `
    <section class="print-section">
      <h2>照片</h2>
      <div class="print-photos">
        ${photos.map(photo => `<img class="${photo.width && photo.height && photo.height > photo.width ? "portrait" : "landscape"}" alt="" src="${photo.dataUrl}">`).join("")}
      </div>
    </section>
  ` : "";

  els.printPage.innerHTML = `
    <h1>${escapeHtml(item.title)}</h1>
    <div class="print-meta">${escapeHtml(typeText[item.type])} / ${escapeHtml(item.subject || "未分類")} / ${escapeHtml(item.date || "")}</div>
    ${sections}
    ${note}
    ${photoHtml}
  `;
  const oldTitle = document.title;
  document.title = pdfFileName(item);
  const restoreTitle = () => {
    document.title = oldTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };
  window.addEventListener("afterprint", restoreTitle);
  showToast("列印視窗開啟後，選儲存成 PDF");
  setTimeout(() => window.print(), 120);
}

async function ensurePhotoSize(photo) {
  if (photo.width && photo.height) return photo;
  const size = await getImageSize(photo.dataUrl);
  return { ...photo, ...size };
}

function getImageSize(dataUrl) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

function pdfFileName(item) {
  const date = (item.date || today()).replaceAll("-", "");
  const safeTitle = (item.title || "學習素材")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 30);
  return `${date}_${safeTitle || "學習素材"}`;
}

function bindEvents() {
  els.newItemBtn.addEventListener("click", () => openEditor());
  els.firstItemBtn.addEventListener("click", () => openEditor());
  els.cancelEditBtn.addEventListener("click", closeEditor);
  els.form.addEventListener("submit", handleSubmit);
  els.photoInput.addEventListener("change", handlePhotoInput);
  els.clearFormBtn.addEventListener("click", () => {
    els.titleInput.value = "";
    els.subjectTextInput.value = "";
    els.noteInput.value = "";
    document.querySelectorAll("[data-thing]").forEach(field => field.value = "");
    showToast("已清空");
  });

  els.photoPreview.addEventListener("click", async event => {
    const button = event.target.closest("[data-action='remove-photo']");
    if (!button) return;
    const item = button.closest("[data-photo-id]");
    const id = item?.dataset.photoId;
    if (!id) return;
    draftPhotos = draftPhotos.filter(photo => photo.id !== id);
    await renderPhotoPreview();
    showToast("照片已移除");
  });

  document.querySelectorAll("input[name='itemType']").forEach(input => {
    input.addEventListener("change", () => updateEditorType(input.value));
  });

  els.typeFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-filter-type]");
    if (!button) return;
    filterType = button.dataset.filterType;
    filterSubject = "all";
    document.querySelectorAll("[data-filter-type]").forEach(btn => btn.classList.toggle("active", btn === button));
    fillSubjectFilter();
    render();
  });

  els.subjectFilter.addEventListener("change", () => {
    filterSubject = els.subjectFilter.value;
    render();
  });

  els.itemList.addEventListener("click", event => {
    const card = event.target.closest("[data-id]");
    const actionTarget = event.target.closest("[data-action]");
    if (!card || !actionTarget) return;
    const id = card.dataset.id;
    const action = actionTarget.dataset.action;

    if (action === "toggle") {
      expandedId = expandedId === id ? "" : id;
      render();
    }
    if (action === "edit") {
      const item = items.find(entry => entry.id === id);
      if (item) openEditor(item);
    }
    if (action === "export-pdf") {
      exportPdf(id);
    }
    if (action === "ask-delete") {
      card.querySelector(".confirm-delete").classList.add("active");
    }
    if (action === "cancel-delete") {
      card.querySelector(".confirm-delete").classList.remove("active");
    }
    if (action === "delete") {
      deleteItem(id);
    }
  });
}

function init() {
  loadItems();
  setPrompt();
  fillSubjectFilter();
  updateEditorType("course");
  bindEvents();
  render();
}

init();
