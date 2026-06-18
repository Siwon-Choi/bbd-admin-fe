import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import {
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

function blankPayload(): UserPayload {
  return {
    username: "",
    email: "",
    firstName: "",
    lastName: "",
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
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
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
    setModalMode("create");
    setNotice("");
    setError("");
  }

  function openEditModal() {
    if (!detail) {
      return;
    }
    setForm(payloadFromDetail(detail));
    setModalMode("edit");
    setNotice("");
    setError("");
  }

  function closeModal() {
    setModalMode(null);
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
    setNotice("");

    try {
      const result =
        modalMode === "edit" && selectedId
          ? await updateUser(selectedId, form)
          : await createUser(form);

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
      handleFailure(caught);
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
    if (params.get("auth") !== "admin_required") {
      return false;
    }

    notifyAdminDenied();
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
            placeholder="이름, 이메일, username"
          />
          <button disabled={busy} type="submit">
            검색
          </button>
        </form>
        <button className="primary" type="button" onClick={openCreateModal}>
          직원 추가
        </button>
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
                <dt>Username</dt>
                <dd>{detail.keycloak.username}</dd>
                <dt>사번</dt>
                <dd>{detail.scim?.employeeNumber ?? employeeNumber(detail.keycloak)}</dd>
                <dt>직책</dt>
                <dd>{detail.scim?.position ?? "-"}</dd>
                <dt>권한</dt>
                <dd>{roleLabel(detail.scim?.role)}</dd>
                <dt>소속</dt>
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

              <div className="form-grid">
                <label>
                  Username
                  <input
                    required
                    pattern="[A-Za-z0-9._-]+"
                    value={form.username}
                    onChange={(event) => setFormField("username", event.target.value)}
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setFormField("email", event.target.value)}
                  />
                </label>

                <label>
                  이름
                  <input
                    value={form.firstName}
                    onChange={(event) => setFormField("firstName", event.target.value)}
                  />
                </label>

                <label>
                  성
                  <input
                    value={form.lastName}
                    onChange={(event) => setFormField("lastName", event.target.value)}
                  />
                </label>

                <label>
                  표시 이름
                  <input
                    value={form.displayName}
                    onChange={(event) => setFormField("displayName", event.target.value)}
                  />
                </label>

                <label>
                  사번
                  <input
                    required
                    value={form.employeeNumber}
                    onChange={(event) => setFormField("employeeNumber", event.target.value)}
                  />
                </label>

                <label>
                  직책
                  <input
                    required
                    value={form.position}
                    onChange={(event) => setFormField("position", event.target.value)}
                  />
                </label>

                <label>
                  비밀번호
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setFormField("password", event.target.value)}
                  />
                </label>

                <label>
                  권한
                  <select
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
                  소속
                  <select
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
                  소속명
                  <input
                    required
                    value={form.tenancyName}
                    onChange={(event) => setFormField("tenancyName", event.target.value)}
                  />
                </label>

                <div className="checks span-2">
                  <label>
                    <input
                      checked={form.enabled}
                      type="checkbox"
                      onChange={(event) => setFormField("enabled", event.target.checked)}
                    />
                    Keycloak 활성
                  </label>
                  <label>
                    <input
                      checked={form.emailVerified}
                      type="checkbox"
                      onChange={(event) => setFormField("emailVerified", event.target.checked)}
                    />
                    이메일 인증
                  </label>
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
                  <label>
                    <input
                      checked={form.sourceActive}
                      type="checkbox"
                      onChange={(event) => setFormField("sourceActive", event.target.checked)}
                    />
                    SCIM 활성
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
}

function payloadFromDetail(detail: AdminUserDetail): UserPayload {
  const attrs = detail.keycloak.attributes ?? {};
  return {
    username: detail.keycloak.username ?? "",
    email: detail.keycloak.email ?? "",
    firstName: detail.keycloak.firstName ?? "",
    lastName: detail.keycloak.lastName ?? "",
    displayName: detail.scim?.displayName ?? "",
    password: "",
    temporaryPassword: true,
    enabled: detail.keycloak.enabled !== false,
    emailVerified: detail.keycloak.emailVerified === true,
    employeeNumber:
      detail.scim?.employeeNumber ?? firstAttr(attrs.employee_number) ?? firstAttr(attrs.employeeNumber),
    position: detail.scim?.position ?? firstAttr(attrs.position),
    role: roleValue(detail.scim?.role ?? firstAttr(attrs.role) ?? firstAttr(attrs.erpRole)),
    tenancyType: tenancyValue(
      detail.scim?.tenancyType ?? firstAttr(attrs.tenancy_type) ?? firstAttr(attrs.tenancyType)
    ),
    tenancyName:
      detail.scim?.tenancyName ?? firstAttr(attrs.tenancy_name) ?? firstAttr(attrs.tenancyName),
    sourceActive: detail.scim?.active !== false,
    attributes: {}
  };
}

function displayUserName(user: KeycloakUserSummary) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username;
}

function employeeNumber(user: KeycloakUserSummary) {
  return firstAttr(user.attributes?.employee_number) || firstAttr(user.attributes?.employeeNumber) || "-";
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

function isAdminDenied(caught: unknown) {
  const apiError = caught as Partial<ApiError>;
  return apiError.status === 403 || apiError.code === "ADMIN_ROLE_REQUIRED";
}

function errorMessage(caught: unknown) {
  if (caught instanceof TypeError) {
    return "백엔드 요청에 실패했습니다. VITE_BBD_ADMIN_API_BASE와 FRONTEND_ORIGIN을 확인하세요.";
  }

  const apiError = caught as Partial<ApiError>;
  return apiError.message ?? "요청 처리에 실패했습니다.";
}
