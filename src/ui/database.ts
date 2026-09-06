import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  deleteDatabaseProfile,
  emptyProfile,
  listDatabaseProfiles,
  runDatabaseQuery,
  saveDatabaseProfile,
  testDatabaseConnection,
  type DatabaseKind,
  type DatabaseProfile,
  type DatabaseQueryResult,
  type QueryParam,
  type QueryParamType,
} from "../io/database";
import { clear, el, fmtInt, toast } from "./dom";

interface DatabasePanelOptions {
  onLoadDataset: (result: DatabaseQueryResult) => Promise<void>;
}

const PARAM_TYPES: QueryParamType[] = ["text", "number", "boolean", "null"];
const PARAM_TYPE_LABEL: Record<QueryParamType, string> = {
  text: "文字",
  number: "數字",
  boolean: "布林",
  null: "NULL",
};

let profiles: DatabaseProfile[] = [];
let selectedId = "";
let editing: DatabaseProfile = emptyProfile("sqlite");
let lastResult: DatabaseQueryResult | null = null;
let loading = false;

export async function openDatabasePanel(options: DatabasePanelOptions): Promise<void> {
  ensureModal(options);
  await reloadProfiles();
  render(options);
  $("database-modal").hidden = false;
}

function ensureModal(options: DatabasePanelOptions): void {
  if (document.getElementById("database-modal")) return;
  const modal = el("div", { id: "database-modal", class: "modal-backdrop", hidden: "" }, [
    el("div", { class: "modal database-modal" }, [
      el("div", { class: "modal-title-row" }, [
        el("h2", {}, ["資料庫資料源"]),
        el("button", { id: "database-close", class: "btn small" }, ["關閉"]),
      ]),
      el("div", { id: "database-panel" }),
    ]),
  ]);
  document.body.append(modal);
  $("database-close").addEventListener("click", () => {
    $("database-modal").hidden = true;
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) $("database-modal").hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("database-modal").hidden) $("database-modal").hidden = true;
  });
  void options;
}

async function reloadProfiles(): Promise<void> {
  profiles = await listDatabaseProfiles();
  if (!selectedId && profiles.length > 0) selectedId = profiles[0].id;
  const selected = profiles.find((profile) => profile.id === selectedId);
  editing = selected ? cloneProfile(selected) : emptyProfile("sqlite");
}

function render(options: DatabasePanelOptions): void {
  const root = $("database-panel");
  clear(root);
  root.append(
    el("div", { class: "database-grid" }, [
      renderProfiles(options),
      renderEditor(options),
    ]),
  );
}

function renderProfiles(options: DatabasePanelOptions): HTMLElement {
  const profileList = el("div", { class: "profile-list" });
  if (profiles.length === 0) {
    profileList.append(el("p", { class: "muted" }, ["尚未建立連線設定。"]));
  } else {
    for (const profile of profiles) {
      const button = el("button", { class: `profile-item${profile.id === selectedId ? " active" : ""}` }, [
        el("span", { class: "strong" }, [profile.name]),
        el("span", { class: "muted small" }, [profile.kind === "oracle" ? "Oracle" : sqliteFileName(profile.sqlitePath)]),
      ]);
      button.addEventListener("click", () => {
        selectedId = profile.id;
        editing = cloneProfile(profile);
        lastResult = null;
        render(options);
      });
      profileList.append(button);
    }
  }

  const box = el("section", { class: "database-section" }, [
    el("h3", {}, ["連線設定"]),
    profileList,
    el("div", { class: "toolbar" }, [
      el("button", { id: "db-new-sqlite", class: "btn small" }, ["新增 SQLite"]),
      el("button", { id: "db-new-oracle", class: "btn small" }, ["新增 Oracle"]),
    ]),
  ]);
  box.querySelector("#db-new-sqlite")!.addEventListener("click", () => newProfile("sqlite", options));
  box.querySelector("#db-new-oracle")!.addEventListener("click", () => newProfile("oracle", options));
  return box;
}

function renderEditor(options: DatabasePanelOptions): HTMLElement {
  const form = el("section", { class: "database-section database-editor" });
  form.append(
    el("h3", {}, [editing.id ? "編輯連線" : "新增連線"]),
    renderProfileForm(options),
    el("p", { class: "muted small" }, ["提醒：依目前設定，密碼會以本機明文設定檔儲存。"]),
    renderQueryArea(options),
  );
  return form;
}

function renderProfileForm(options: DatabasePanelOptions): HTMLElement {
  const kind = select("db-kind", [
    ["sqlite", "SQLite"],
    ["oracle", "Oracle"],
  ], editing.kind);
  kind.addEventListener("change", () => {
    editing = { ...emptyProfile(kind.value as DatabaseKind), id: editing.id, name: editing.name, createdAt: editing.createdAt };
    lastResult = null;
    render(options);
  });

  const fields = el("div", { class: "database-form" }, [
    label("類型", kind),
    label("連線名稱", input("db-name", editing.name, "例如：本機銷售資料")),
  ]);

  if (editing.kind === "sqlite") {
    fields.append(
      label("SQLite 檔案", el("div", { class: "inline-field" }, [
        input("db-sqlite-path", editing.sqlitePath ?? "", "選擇 .sqlite / .db 檔案", true),
        el("button", { id: "db-pick-sqlite", class: "btn" }, ["選擇檔案"]),
      ])),
    );
  } else {
    fields.append(
      label("主機", input("db-host", editing.host ?? "", "db.example.local")),
      label("連接埠", input("db-port", String(editing.port ?? 1521), "1521")),
      label("服務名稱", input("db-service", editing.serviceName ?? "", "ORCLPDB1")),
      label("帳號", input("db-username", editing.username ?? "", "username")),
      label("密碼", input("db-password", editing.password ?? "", "password", false, "password")),
    );
  }

  const actions = el("div", { class: "toolbar" }, [
    el("button", { id: "db-save", class: "btn primary" }, ["儲存連線"]),
    el("button", { id: "db-test", class: "btn" }, ["測試連線"]),
    el("button", { id: "db-delete", class: "btn" }, ["刪除"]),
  ]);
  const box = el("div", {}, [fields, actions]);

  box.querySelector("#db-save")!.addEventListener("click", () => void saveCurrent(options));
  box.querySelector("#db-test")!.addEventListener("click", () => void testCurrent());
  box.querySelector("#db-delete")!.addEventListener("click", () => void deleteCurrent(options));
  box.querySelector("#db-pick-sqlite")?.addEventListener("click", () => void pickSqlite(options));

  return box;
}

function renderQueryArea(options: DatabasePanelOptions): HTMLElement {
  const textarea = el("textarea", { id: "db-sql", rows: "9", spellcheck: "false" }) as HTMLTextAreaElement;
  textarea.value = "select * from your_table";
  const maxRows = input("db-max-rows", "10000", "10000", false, "number");
  maxRows.setAttribute("min", "1");
  maxRows.setAttribute("max", "100000");

  const preview = el("div", { id: "db-preview", class: "query-preview" });
  renderPreview(preview);

  const box = el("div", { class: "query-area" }, [
    el("h3", {}, ["SQL 查詢"]),
    el("p", { class: "muted small" }, ["只允許單一 SELECT / WITH SELECT 查詢。參數使用 :name 命名。"]),
    textarea,
    el("div", { class: "toolbar" }, [
      label("最多載入列數", maxRows),
      el("button", { id: "db-add-param", class: "btn small" }, ["新增參數"]),
    ]),
    renderParamsTable(),
    el("div", { class: "toolbar" }, [
      el("button", { id: "db-run-query", class: "btn primary" }, ["執行查詢"]),
      el("button", { id: "db-load-result", class: "btn" }, ["載入分析"]),
      el("span", { id: "db-query-status", class: "muted small" }, []),
    ]),
    preview,
  ]);
  box.querySelector("#db-add-param")!.addEventListener("click", () => addParamRow(box.querySelector("tbody")!));
  box.querySelector("#db-run-query")!.addEventListener("click", () => void runQuery());
  box.querySelector("#db-load-result")!.addEventListener("click", () => void loadLastResult(options));
  return box;
}

function renderParamsTable(): HTMLElement {
  const tbody = el("tbody");
  addParamRow(tbody);
  return el("div", { class: "table-scroll params-scroll" }, [
    el("table", { class: "data-table param-table" }, [
      el("thead", {}, [el("tr", {}, ["名稱", "值", "型別", ""].map((text) => el("th", {}, [text])))]),
      tbody,
    ]),
  ]);
}

function addParamRow(tbody: HTMLElement): void {
  const typeSelect = select("", PARAM_TYPES.map((type) => [type, PARAM_TYPE_LABEL[type]]), "text");
  const row = el("tr", {}, [
    el("td", {}, [input("", "", "name")]),
    el("td", {}, [input("", "", "value")]),
    el("td", {}, [typeSelect]),
    el("td", {}, [el("button", { class: "btn small" }, ["移除"])]),
  ]);
  row.querySelector("button")!.addEventListener("click", () => row.remove());
  tbody.append(row);
}

async function saveCurrent(options: DatabasePanelOptions): Promise<void> {
  await runPanelTask(async () => {
    collectProfileForm();
    const saved = await saveDatabaseProfile(editing);
    selectedId = saved.id;
    await reloadProfiles();
    lastResult = null;
    render(options);
    toast("已儲存資料庫連線設定");
  });
}

async function testCurrent(): Promise<void> {
  await runPanelTask(async () => {
    collectProfileForm();
    const profile = editing.id ? await saveDatabaseProfile(editing) : await saveDatabaseProfile(editing);
    selectedId = profile.id;
    editing = profile;
    await testDatabaseConnection(profile.id);
    toast("資料庫連線測試成功");
  });
}

async function deleteCurrent(options: DatabasePanelOptions): Promise<void> {
  if (!editing.id) {
    newProfile("sqlite", options);
    return;
  }
  await runPanelTask(async () => {
    await deleteDatabaseProfile(editing.id);
    selectedId = "";
    await reloadProfiles();
    lastResult = null;
    render(options);
    toast("已刪除資料庫連線設定");
  });
}

async function pickSqlite(options: DatabasePanelOptions): Promise<void> {
  const selected = await openDialog({
    multiple: false,
    filters: [
      { name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] },
      { name: "所有檔案", extensions: ["*"] },
    ],
  });
  if (!selected) return;
  const path = String(selected);
  const pathInput = $("db-sqlite-path") as HTMLInputElement;
  pathInput.value = path;
  if (!($("db-name") as HTMLInputElement).value.trim()) {
    ($("db-name") as HTMLInputElement).value = sqliteFileName(path);
  }
  collectProfileForm();
  render(options);
}

async function runQuery(): Promise<void> {
  await runPanelTask(async () => {
    collectProfileForm();
    const profile = editing.id ? await saveDatabaseProfile(editing) : await saveDatabaseProfile(editing);
    selectedId = profile.id;
    editing = profile;
    const sql = ($("db-sql") as HTMLTextAreaElement).value;
    const maxRows = Number(($("db-max-rows") as HTMLInputElement).value || "10000");
    lastResult = await runDatabaseQuery(profile.id, sql, collectParams(), maxRows);
    const preview = $("db-preview");
    renderPreview(preview);
    $("db-query-status").textContent = `查詢完成：${fmtInt(lastResult.rowCount)} 列${lastResult.truncated ? "，已達上限" : ""}`;
    toast("資料庫查詢完成");
  });
}

async function loadLastResult(options: DatabasePanelOptions): Promise<void> {
  if (!lastResult) {
    toast("請先執行查詢", true);
    return;
  }
  await runPanelTask(async () => {
    await options.onLoadDataset(lastResult!);
    $("database-modal").hidden = true;
  });
}

function collectProfileForm(): void {
  const kind = ($("db-kind") as HTMLSelectElement).value as DatabaseKind;
  editing = {
    ...editing,
    kind,
    name: ($("db-name") as HTMLInputElement).value.trim(),
    host: kind === "oracle" ? ($("db-host") as HTMLInputElement).value.trim() : null,
    port: kind === "oracle" ? Number(($("db-port") as HTMLInputElement).value || "1521") : null,
    serviceName: kind === "oracle" ? ($("db-service") as HTMLInputElement).value.trim() : null,
    username: kind === "oracle" ? ($("db-username") as HTMLInputElement).value.trim() : null,
    password: kind === "oracle" ? ($("db-password") as HTMLInputElement).value : null,
    sqlitePath: kind === "sqlite" ? ($("db-sqlite-path") as HTMLInputElement).value.trim() : null,
  };
}

function collectParams(): QueryParam[] {
  return [...document.querySelectorAll<HTMLTableRowElement>(".param-table tbody tr")]
    .map((row) => {
      const inputs = row.querySelectorAll<HTMLInputElement>("input");
      const valueType = row.querySelector<HTMLSelectElement>("select")!.value as QueryParamType;
      return {
        name: inputs[0].value.trim(),
        value: inputs[1].value,
        valueType,
      };
    })
    .filter((param) => param.name !== "");
}

function renderPreview(preview: HTMLElement): void {
  clear(preview);
  if (!lastResult) {
    preview.append(el("p", { class: "muted" }, ["尚未執行查詢。"]));
    return;
  }
  const shown = lastResult.rows.slice(0, 50);
  preview.append(
    el("p", { class: "muted small" }, [`${fmtInt(lastResult.rowCount)} 列 × ${fmtInt(lastResult.columns.length)} 欄${lastResult.truncated ? "，結果已達載入上限" : ""}`]),
    el("div", { class: "table-scroll" }, [
      el("table", { class: "data-table scroll" }, [
        el("thead", {}, [el("tr", {}, [el("th", {}, ["#"]), ...lastResult.columns.map((col) => el("th", {}, [col]))])]),
        el("tbody", {}, shown.map((row, index) =>
          el("tr", {}, [
            el("td", { class: "muted" }, [fmtInt(index + 1)]),
            ...lastResult!.columns.map((_, colIndex) => el("td", {}, [row[colIndex] ?? ""])),
          ]),
        )),
      ]),
    ]),
  );
}

function newProfile(kind: DatabaseKind, options: DatabasePanelOptions): void {
  selectedId = "";
  editing = emptyProfile(kind);
  lastResult = null;
  render(options);
}

async function runPanelTask(fn: () => Promise<void>): Promise<void> {
  if (loading) return;
  loading = true;
  document.body.classList.add("busy");
  try {
    await fn();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), true);
  } finally {
    loading = false;
    document.body.classList.remove("busy");
  }
}

function cloneProfile(profile: DatabaseProfile): DatabaseProfile {
  return JSON.parse(JSON.stringify(profile)) as DatabaseProfile;
}

function label(text: string, control: HTMLElement): HTMLElement {
  return el("label", { class: "field-label" }, [
    el("span", {}, [text]),
    control,
  ]);
}

function input(id: string, value: string, placeholder: string, readonly = false, type = "text"): HTMLInputElement {
  const attrs: Record<string, string> = { class: "input", value, placeholder, type };
  if (id) attrs.id = id;
  if (readonly) attrs.readonly = "readonly";
  return el("input", attrs) as HTMLInputElement;
}

function select(id: string, options: [string, string][], value: string): HTMLSelectElement {
  const attrs: Record<string, string> = { class: "select" };
  if (id) attrs.id = id;
  const node = el("select", attrs, options.map(([v, labelText]) => el("option", { value: v }, [labelText]))) as HTMLSelectElement;
  node.value = value;
  return node;
}

function sqliteFileName(path: string | null): string {
  if (!path) return "SQLite";
  return path.split(/[\\/]/).pop() ?? path;
}

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}
