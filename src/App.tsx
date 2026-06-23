import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import {
  createUsersBulk,
  createUser,
  deactivateUser,
  getAccessToken,
  getSession,
  getUser,
  login,
  logout,
  searchUsers,
  updateUser
} from "./api";
import type {
  AdminUserDetail,
  ApiError,
  KeycloakUserSummary,
  Session,
  TenancyType,
  UserPayload,
  UserRole
} from "./types";
import "./styles.css";

const ADMIN_DENIED_MESSAGE = "관리자 권한이 없습니다. 재 로그인하세요.";

const LOGIN_FAILED_MESSAGE = "로그인 처리가 완료되지 않았습니다. 다시 로그인하세요.";

const roles: UserRole[] = [
  "ADMIN",
  "HQ_MANAGER",
  "HQ_STAFF",
  "BRANCH_MANAGER",
  "BRANCH_STAFF"
];

const roleLabels: Record<UserRole, string> = {
  ADMIN: "전체 관리자",
  HQ_MANAGER: "본사 관리자",
  HQ_STAFF: "본사 직원",
  BRANCH_MANAGER: "지점 관리자",
  BRANCH_STAFF: "지점 직원"
};

const tenancyTypes: TenancyType[] = ["HQ", "BRANCH"];

const tenancyLabels: Record<TenancyType, string> = {
  HQ: "본사",
  BRANCH: "지점"
};

type ModalMode = "create" | "edit";

const bulkSample = `사번,이름,직급,비밀번호,역할,소속 유형,소속명,계정 상태,임시 비밀번호
BR001,이상장,점장,Temp1234,지점 직원,지점,강남지점,활성,true
HQ001,김본사,과장,Temp1234,본사 직원,본사,성수본사,활성,true`;

function blankPayload(): UserPayload {
  return {
    email: "",
    displayName: "",
    password: "",
    temporaryPassword: true,
    enabled: true,
    emailVerified: false,
    employeeNumber: "",
    position: "",
    role: "HQ_STAFF",
    tenancyType: "HQ",
    tenancyName: "",
    sourceActive: true,
    attributes: {}
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<KeycloakUserSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [form, setForm] = useState<UserPayload>(() => blankPayload());
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState(bulkSample);
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const adminDeniedAlerted = useRef(false);

  useEffect(() => {
    if (consumeLoginError()) {
      return;
    }
    void refreshSession();
  }, []);

  useEffect(() => {
    if (session?.authenticated && session.admin) {
      void loadUsers();
    }
  }, [session?.authenticated, session?.admin]);

  async function refreshSession() {
    setBusy(true);
    try {
      const currentSession = await getSession();
      setSession(currentSession);
      if (currentSession.authenticated && !currentSession.admin) {
        setUsers([]);
        setSelectedId(null);
        setDetail(null);
      }
      setError("");
    } catch (caught) {
      setSession(null);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function loadUsers() {
    setBusy(true);
    setError("");
    try {
      setUsers(await searchUsers(search));
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  }

  async function selectUser(userId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setSelectedId(userId);
    setDetail(null);
    try {
      const loaded = await getUser(userId);
      setDetail(loaded);
      setForm(payloadFromDetail(loaded));
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  }

  function openCreateModal() {
    setForm(blankPayload());
    setBulkModalOpen(false);
    setModalMode("create");
    setNotice("");
    setError("");
    setModalError("");
  }

  function openBulkModal() {
    setBulkText(bulkSample);
    setModalMode(null);
    setBulkModalOpen(true);
    setNotice("");
    setError("");
    setModalError("");
  }

  function openEditModal() {
    if (!detail) {
      return;
    }
    setForm(payloadFromDetail(detail));
    setModalMode("edit");
    setNotice("");
    setError("");
    setModalError("");
  }

  function closeModal() {
    setModalMode(null);
    setBulkModalOpen(false);
    setModalError("");
    if (detail) {
      setForm(payloadFromDetail(detail));
    } else {
      setForm(blankPayload());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setModalError("");
    setNotice("");

    try {
      const payload = payloadForSubmit(form);
      if (modalMode !== "edit" || payload.password.trim()) {
        assertPasswordPolicy(payload.password);
      }

      const result =
        modalMode === "edit" && selectedId
          ? await updateUser(selectedId, payload)
          : await createUser(payload);

      setNotice(
        modalMode === "edit"
          ? `${result.username} 직원 정보를 수정했습니다.`
          : `${result.username} 직원을 추가했습니다.`
      );
      setModalMode(null);
      setSelectedId(result.keycloakUserId);
      await loadUsers();
      await selectUser(result.keycloakUserId);
    } catch (caught) {
      setModalError(isAdminDenied(caught) ? ADMIN_DENIED_MESSAGE : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setModalError("");
    setNotice("");

    try {
      const parsedUsers = parseBulkUsers(bulkText);
      const result = await createUsersBulk(parsedUsers);
      setNotice(`${result.requested}명 직원을 대량 추가했습니다.`);
      setBulkModalOpen(false);
      await loadUsers();
      if (result.users[0]?.keycloakUserId) {
        setSelectedId(result.users[0].keycloakUserId);
        await selectUser(result.users[0].keycloakUserId);
      }
    } catch (caught) {
      setModalError(isAdminDenied(caught) ? ADMIN_DENIED_MESSAGE : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateSelected() {
    if (!selectedId || !detail) {
      return;
    }
    if (!window.confirm("선택한 직원을 비활성화할까요?")) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await deactivateUser(selectedId);
      setNotice(`${result.username} 직원을 비활성화했습니다.`);
      await loadUsers();
      await selectUser(selectedId);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  }

  function handleFailure(caught: unknown) {
    if (isAdminDenied(caught)) {
      setError(ADMIN_DENIED_MESSAGE);
      return;
    }
    setError(errorMessage(caught));
  }

  function notifyAdminDenied() {
    if (adminDeniedAlerted.current) {
      return;
    }
    adminDeniedAlerted.current = true;
    window.alert(ADMIN_DENIED_MESSAGE);
  }

  function consumeLoginError() {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth !== "admin_required" && auth !== "login_failed") {
      return false;
    }

    if (auth === "admin_required") {
      notifyAdminDenied();
    } else {
      setError(LOGIN_FAILED_MESSAGE);
    }
    params.delete("auth");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${
      window.location.hash
    }`;
    window.history.replaceState({}, document.title, nextUrl);
    return true;
  }

  async function loadAccessToken() {
    setBusy(true);
    setError("");
    setAccessToken("");
    try {
      setAccessToken(await getAccessToken());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!session || !session.authenticated) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div>
            <p className="eyebrow">BBD</p>
            <h1>직원 관리</h1>
            <p className="muted">회사 관리자 계정으로 로그인</p>
          </div>
          <button className="primary wide" type="button" onClick={login}>
            로그인
          </button>
          {error && <p className="inline-error">{error}</p>}
          {busy && !error && <p className="muted">세션 확인 중</p>}
        </section>
      </main>
    );
  }

  if (!session.admin) {
    return (
      <main className="login-shell">
        <section className="login-panel access-denied-panel">
          <div>
            <p className="eyebrow">BBD Admin</p>
            <h1>권한이 없습니다</h1>
            <p className="muted">{session.name || session.username || "current user"}</p>
          </div>

          {error && <p className="inline-error">{error}</p>}

          <div className="access-actions">
            <button disabled={busy} type="button" onClick={() => void loadAccessToken()}>
              Access token 보기
            </button>
            <button className="primary" type="button" onClick={logout}>
              로그아웃
            </button>
          </div>

          {accessToken && (
            <textarea className="token-box" readOnly value={accessToken} />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">BBD Admin</p>
          <h1>직원 관리</h1>
        </div>
        <div className="session">
          <span>{session.name || session.username || "admin"}</span>
          <button type="button" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      <section className="toolbar">
        <form
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            void loadUsers();
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="이름, 이메일, 사번"
          />
          <button disabled={busy} type="submit">
            검색
          </button>
        </form>
        <div className="toolbar-actions">
          <button type="button" onClick={openBulkModal}>
            대량 추가
          </button>
          <button className="primary" type="button" onClick={openCreateModal}>
            직원 추가
          </button>
        </div>
      </section>

      {(notice || error) && (
        <section className={`banner ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="workspace">
        <aside className="employee-list">
          <div className="panel-heading">
            <h2>전체 직원</h2>
            <span>{busy ? "동기화 중" : `${users.length}명`}</span>
          </div>
          <div className="rows">
            {users.map((user) => (
              <button
                className={`employee-row ${user.id === selectedId ? "selected" : ""}`}
                key={user.id}
                type="button"
                onClick={() => void selectUser(user.id)}
              >
                <span className="row-main">{displayUserName(user)}</span>
                <span className="row-sub">{user.email ?? user.username}</span>
                <span className="row-meta">{employeeNumber(user)}</span>
                <span className={`status ${user.enabled === false ? "off" : "on"}`}>
                  {user.enabled === false ? "비활성" : "활성"}
                </span>
              </button>
            ))}
            {!users.length && <p className="empty">조회된 직원이 없습니다.</p>}
          </div>
        </aside>

        <section className="detail-panel">
          <div className="panel-heading">
            <h2>직원 정보</h2>
            <span>{detail?.keycloak.id ?? "선택 없음"}</span>
          </div>

          {detail ? (
            <div className="detail-body">
              <div className="identity">
                <div className="avatar">{avatarText(detail)}</div>
                <div>
                  <h3>{detail.scim?.displayName || displayUserName(detail.keycloak)}</h3>
                  <p>{detail.keycloak.email ?? "이메일 없음"}</p>
                </div>
                <span className={`status ${detail.keycloak.enabled === false ? "off" : "on"}`}>
                  {detail.keycloak.enabled === false ? "비활성" : "활성"}
                </span>
              </div>

              <dl className="detail-grid">
                <dt>Keycloak 로그인 ID</dt>
                <dd>{detail.keycloak.username}</dd>
                <dt>사번</dt>
                <dd>{detail.scim?.employeeNumber ?? employeeNumber(detail.keycloak)}</dd>
                <dt>직급</dt>
                <dd>{detail.scim?.position ?? "-"}</dd>
                <dt>역할</dt>
                <dd>{roleLabel(detail.scim?.role)}</dd>
                <dt>소속 유형</dt>
                <dd>{tenancyLabel(detail.scim?.tenancyType)}</dd>
                <dt>소속명</dt>
                <dd>{detail.scim?.tenancyName ?? "-"}</dd>
                <dt>SCIM ID</dt>
                <dd>{detail.scim?.id ?? "-"}</dd>
                <dt>Keycloak ID</dt>
                <dd>{detail.keycloak.id}</dd>
              </dl>

              <div className="detail-actions">
                <button className="primary" disabled={busy} type="button" onClick={openEditModal}>
                  정보 수정
                </button>
                <button disabled={busy} type="button" onClick={deactivateSelected}>
                  비활성화
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>직원을 선택하세요</h3>
            </div>
          )}
        </section>
      </section>

      {modalMode && (
        <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
          <section aria-modal="true" className="modal" role="dialog">
            <form className="modal-form" onSubmit={submit}>
              <div className="modal-heading">
                <h2>{modalMode === "create" ? "직원 추가" : "직원 정보 수정"}</h2>
                <button aria-label="닫기" type="button" onClick={closeModal}>
                  닫기
                </button>
              </div>

              {modalError && <section className="modal-message error">{modalError}</section>}

              <div className="form-grid">
                <label>
                  {fieldLabel("사번 (Keycloak 로그인 ID)", true)}
                  <input
                    required
                    pattern={"[A-Za-z0-9._\\-]+"}
                    title="영문, 숫자, 마침표, 밑줄, 하이픈만 입력할 수 있습니다."
                    placeholder="예: BR001"
                    value={form.employeeNumber}
                    onChange={(event) => setFormField("employeeNumber", event.target.value)}
                  />
                </label>

                <label>
                  {fieldLabel("이름", true)}
                  <input
                    required
                    placeholder="예: 이상장"
                    value={form.displayName}
                    onChange={(event) => setFormField("displayName", event.target.value)}
                  />
                </label>

                <label>
                  {fieldLabel("직급", true)}
                  <input
                    required
                    placeholder="예: 점장"
                    value={form.position}
                    onChange={(event) => setFormField("position", event.target.value)}
                  />
                </label>

                <label>
                  이메일
                  <input
                    type="email"
                    placeholder="예: staff@bbd.com"
                    value={form.email}
                    onChange={(event) => setFormField("email", event.target.value)}
                  />
                </label>

                <label>
                  {fieldLabel("비밀번호", modalMode === "create")}
                  <input
                    required={modalMode === "create"}
                    placeholder={modalMode === "create" ? "예: 초기 비밀번호" : "변경할 때만 입력"}
                    type="password"
                    value={form.password}
                    onChange={(event) => setFormField("password", event.target.value)}
                  />
                </label>

                <label>
                  {fieldLabel("역할", true)}
                  <select
                    required
                    value={form.role}
                    onChange={(event) => setFormField("role", event.target.value as UserRole)}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {fieldLabel("소속 유형", true)}
                  <select
                    required
                    value={form.tenancyType}
                    onChange={(event) =>
                      setFormField("tenancyType", event.target.value as TenancyType)
                    }
                  >
                    {tenancyTypes.map((type) => (
                      <option key={type} value={type}>
                        {tenancyLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="span-2">
                  {fieldLabel("소속명", true)}
                  <input
                    required
                    placeholder={form.tenancyType === "HQ" ? "예: 본사" : "예: 강남 1지점"}
                    value={form.tenancyName}
                    onChange={(event) => setFormField("tenancyName", event.target.value)}
                  />
                </label>

                <label>
                  계정 상태
                  <select
                    value={accountStatus(form)}
                    onChange={(event) => setAccountStatus(event.target.value as AccountStatus)}
                  >
                    <option value="ACTIVE">활성</option>
                    <option value="SUSPENDED">비활성</option>
                  </select>
                </label>

                <div className="checks">
                  <label>
                    <input
                      checked={form.temporaryPassword}
                      type="checkbox"
                      onChange={(event) =>
                        setFormField("temporaryPassword", event.target.checked)
                      }
                    />
                    임시 비밀번호
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button disabled={busy} type="button" onClick={closeModal}>
                  취소
                </button>
                <button className="primary" disabled={busy} type="submit">
                  {modalMode === "create" ? "추가" : "저장"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {bulkModalOpen && (
        <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
          <section aria-modal="true" className="modal" role="dialog">
            <form className="modal-form" onSubmit={submitBulk}>
              <div className="modal-heading">
                <h2>직원 대량 추가</h2>
                <button aria-label="닫기" type="button" onClick={closeModal}>
                  닫기
                </button>
              </div>

              {modalError && <section className="modal-message error">{modalError}</section>}

              <div className="form-grid">
                <label className="span-2">
                  {fieldLabel("직원 목록", true)}
                  <textarea
                    className="bulk-textarea"
                    required
                    spellCheck={false}
                    value={bulkText}
                    onChange={(event) => setBulkText(event.target.value)}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button disabled={busy} type="button" onClick={closeModal}>
                  취소
                </button>
                <button className="primary" disabled={busy} type="submit">
                  대량 추가
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function setFormField<K extends keyof UserPayload>(key: K, value: UserPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setAccountStatus(status: AccountStatus) {
    const active = status === "ACTIVE";
    setForm((current) => ({ ...current, enabled: active }));
  }
}

type AccountStatus = "ACTIVE" | "SUSPENDED";

function payloadForSubmit(payload: UserPayload): UserPayload {
  const employeeNumber = payload.employeeNumber.trim();
  const displayName = payload.displayName.trim();

  return {
    ...payload,
    employeeNumber,
    displayName
  };
}

function accountStatus(payload: UserPayload): AccountStatus {
  return payload.enabled === false ? "SUSPENDED" : "ACTIVE";
}

function payloadFromDetail(detail: AdminUserDetail): UserPayload {
  const attrs = detail.keycloak.attributes ?? {};
  return {
    email: detail.keycloak.email ?? "",
    displayName:
      detail.scim?.displayName ||
      firstAttr(attrs.displayName) ||
      displayUserName(detail.keycloak),
    password: "",
    temporaryPassword: true,
    enabled: detail.keycloak.enabled !== false,
    emailVerified: detail.keycloak.emailVerified === true,
    employeeNumber:
      detail.scim?.employeeNumber ||
      firstAttr(attrs.employee_number) ||
      firstAttr(attrs.employeeNumber) ||
      detail.keycloak.username,
    position: detail.scim?.position || firstAttr(attrs.position),
    role: roleValue(detail.scim?.role || firstAttr(attrs.role) || firstAttr(attrs.erpRole)),
    tenancyType: tenancyValue(
      detail.scim?.tenancyType || firstAttr(attrs.tenancy_type) || firstAttr(attrs.tenancyType)
    ),
    tenancyName:
      detail.scim?.tenancyName || firstAttr(attrs.tenancy_name) || firstAttr(attrs.tenancyName),
    sourceActive: detail.scim?.active !== false,
    attributes: {}
  };
}

function displayUserName(user: KeycloakUserSummary) {
  const attributeDisplayName = firstAttr(user.attributes?.displayName);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return attributeDisplayName || fullName || user.username;
}

function employeeNumber(user: KeycloakUserSummary) {
  return (
    firstAttr(user.attributes?.employee_number) ||
    firstAttr(user.attributes?.employeeNumber) ||
    user.username ||
    "-"
  );
}

function fieldLabel(text: string, required = false) {
  return (
    <span className="field-label">
      {text}
      {required && (
        <span aria-label="필수" className="required-mark">
          *
        </span>
      )}
    </span>
  );
}

function avatarText(detail: AdminUserDetail) {
  const name = detail.scim?.displayName || displayUserName(detail.keycloak);
  return name.trim().slice(0, 2).toUpperCase() || "BB";
}

function roleLabel(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return roles.includes(value as UserRole) ? roleLabels[value as UserRole] : value;
}

function tenancyLabel(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return tenancyTypes.includes(value as TenancyType)
    ? tenancyLabels[value as TenancyType]
    : value;
}

function firstAttr(value: string[] | undefined) {
  return value?.[0] ?? "";
}

function roleValue(value: string | null | undefined): UserRole {
  return roles.includes(value as UserRole) ? (value as UserRole) : "HQ_STAFF";
}

function tenancyValue(value: string | null | undefined): TenancyType {
  return tenancyTypes.includes(value as TenancyType) ? (value as TenancyType) : "HQ";
}

function parseBulkUsers(text: string): UserPayload[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("대량 추가할 직원 목록을 입력하세요.");
  }

  const dataLines = isBulkHeader(lines[0]) ? lines.slice(1) : lines;
  if (!dataLines.length) {
    throw new Error("헤더 외에 직원 데이터가 없습니다.");
  }

  const users = dataLines.map((line, index) => {
    const columns = parseCsvLine(line).map((column) => column.trim());
    if (columns.length !== 9) {
      throw new Error(
        `${index + 1}번째 데이터 줄의 컬럼 수가 맞지 않습니다. 9개 컬럼이 필요합니다.`
      );
    }

    const [
      employeeNumber,
      displayName,
      position,
      password,
      role,
      tenancyType,
      tenancyName,
      accountStatusValue,
      temporaryPasswordValue
    ] = columns;

    const requiredValues = { employeeNumber, displayName, position, password, role, tenancyType, tenancyName };
    Object.entries(requiredValues).forEach(([key, value]) => {
      if (!value.trim()) {
        throw new Error(`${index + 1}번째 데이터 줄의 ${key} 값이 비어 있습니다.`);
      }
    });
    if (!/^[A-Za-z0-9._-]+$/.test(employeeNumber)) {
      throw new Error(
        `${index + 1}번째 데이터 줄의 사번은 영문, 숫자, 마침표, 밑줄, 하이픈만 입력할 수 있습니다.`
      );
    }
    assertPasswordPolicy(password, `${index + 1}번째 데이터 줄의 비밀번호`);

    return {
      email: "",
      displayName,
      password,
      temporaryPassword: booleanValue(temporaryPasswordValue),
      enabled: accountStatusFromInput(accountStatusValue) === "ACTIVE",
      emailVerified: false,
      employeeNumber,
      position,
      role: roleValueFromInput(role),
      tenancyType: tenancyValueFromInput(tenancyType),
      tenancyName,
      sourceActive: true,
      attributes: {}
    } satisfies UserPayload;
  });

  const employeeNumbers = new Set<string>();
  const duplicates = new Set<string>();
  users.forEach((user) => {
    if (employeeNumbers.has(user.employeeNumber)) {
      duplicates.add(user.employeeNumber);
    }
    employeeNumbers.add(user.employeeNumber);
  });
  if (duplicates.size) {
    throw new Error(`중복 사번이 있습니다: ${Array.from(duplicates).join(", ")}`);
  }

  return users;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function isBulkHeader(line: string) {
  return line.includes("사번") || line.toLowerCase().includes("employeenumber");
}

function roleValueFromInput(value: string): UserRole {
  const normalized = value.trim();
  const matched = roles.find((role) => role === normalized || roleLabels[role] === normalized);
  if (!matched) {
    throw new Error(`역할 값이 올바르지 않습니다: ${value}`);
  }
  return matched;
}

function tenancyValueFromInput(value: string): TenancyType {
  const normalized = value.trim();
  const matched = tenancyTypes.find(
    (type) => type === normalized || tenancyLabels[type] === normalized
  );
  if (!matched) {
    throw new Error(`소속 유형 값이 올바르지 않습니다: ${value}`);
  }
  return matched;
}

function accountStatusFromInput(value: string): AccountStatus {
  const normalized = value.trim().toUpperCase();
  if (["활성", "ACTIVE", "TRUE", "Y", "YES"].includes(normalized)) {
    return "ACTIVE";
  }
  if (["비활성", "SUSPENDED", "INACTIVE", "FALSE", "N", "NO"].includes(normalized)) {
    return "SUSPENDED";
  }
  throw new Error(`계정 상태 값이 올바르지 않습니다: ${value}`);
}

function booleanValue(value: string) {
  const normalized = value.trim().toUpperCase();
  if (["TRUE", "Y", "YES", "1", "임시", "예"].includes(normalized)) {
    return true;
  }
  if (["FALSE", "N", "NO", "0", "아니오"].includes(normalized)) {
    return false;
  }
  throw new Error(`임시 비밀번호 값이 올바르지 않습니다: ${value}`);
}

function assertPasswordPolicy(password: string, label = "비밀번호") {
  const trimmed = password.trim();
  const violations: string[] = [];

  if (trimmed.length < 8) {
    violations.push("8자 이상");
  }
  if (!/[0-9]/.test(trimmed)) {
    violations.push("숫자 1개 이상");
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    violations.push("영문 1개 이상");
  }

  if (violations.length) {
    throw new Error(`${label}는 ${violations.join(", ")} 조건을 만족해야 합니다.`);
  }
}

function isAdminDenied(caught: unknown) {
  const apiError = caught as Partial<ApiError>;
  return apiError.status === 403 || apiError.code === "ADMIN_ROLE_REQUIRED";
}

function errorMessage(caught: unknown) {
  if (caught instanceof TypeError) {
    return "백엔드 요청에 실패했습니다. VITE_BBD_ADMIN_API_BASE와 FRONTEND_ORIGIN을 확인하세요.";
  }
  if (caught instanceof Error) {
    return caught.message;
  }

  const apiError = caught as Partial<ApiError>;
  const passwordMessage = keycloakPasswordMessage(apiError.message);
  if (passwordMessage) {
    return passwordMessage;
  }

  if (apiError.details?.length) {
    return `${apiError.message ?? "요청 처리에 실패했습니다."}\n${apiError.details.join("\n")}`;
  }

  return apiError.message ?? "요청 처리에 실패했습니다.";
}

function keycloakPasswordMessage(message: string | undefined) {
  if (!message) {
    return "";
  }

  if (
    message.includes("invalidPasswordHistoryMessage") ||
    message.includes("must not be equal to any of last")
  ) {
    return "최근 사용한 비밀번호는 다시 사용할 수 없습니다. 다른 비밀번호를 입력하세요.";
  }
  if (
    message.includes("invalidPasswordMinLengthMessage") ||
    message.includes("minimum length") ||
    message.includes("length")
  ) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }
  if (
    message.includes("invalidPasswordMinDigitsMessage") ||
    message.includes("digits") ||
    message.includes("digit")
  ) {
    return "비밀번호에는 숫자가 1개 이상 포함되어야 합니다.";
  }
  if (
    message.includes("invalidPasswordRegexPatternMessage") ||
    message.includes("regular expression") ||
    message.includes("regex")
  ) {
    return "비밀번호에는 영문자가 1개 이상 포함되어야 합니다.";
  }

  return "";
}
