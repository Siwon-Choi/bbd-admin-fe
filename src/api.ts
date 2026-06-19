import type {
  AdminUserDetail,
  ApiError,
  KeycloakUserSummary,
  ProvisionedUserResponse,
  Session,
  UserPayload
} from "./types";

const configuredApiBase =
  import.meta.env.VITE_BBD_ADMIN_API_BASE ?? import.meta.env.VITE_HDP_API_BASE;

const API_BASE = (
  configuredApiBase ??
  (import.meta.env.DEV ? "http://localhost:8090" : "")
).replace(/\/$/, "");

export function login() {
  window.location.href = `${API_BASE}/oauth2/authorization/keycloak`;
}

export function logout() {
  window.location.href = `${API_BASE}/logout`;
}

export async function getSession(): Promise<Session> {
  return request<Session>("/api/session/me");
}

export async function getAccessToken(): Promise<string> {
  return requestText("/api/auth/token");
}

export async function searchUsers(search: string): Promise<KeycloakUserSummary[]> {
  const query = new URLSearchParams();
  if (search.trim()) {
    query.set("search", search.trim());
  }
  query.set("first", "0");
  query.set("max", "100");
  return request<KeycloakUserSummary[]>(`/api/admin/users?${query.toString()}`);
}

export async function getUser(userId: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`);
}

export async function createUser(payload: UserPayload): Promise<ProvisionedUserResponse> {
  return request<ProvisionedUserResponse>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(cleanPayload(payload))
  });
}

export async function updateUser(
  userId: string,
  payload: UserPayload
): Promise<ProvisionedUserResponse> {
  return request<ProvisionedUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify(cleanPayload(payload))
  });
}

export async function deactivateUser(userId: string): Promise<ProvisionedUserResponse> {
  return request<ProvisionedUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let error: ApiError = {
      status: response.status,
      code: "HTTP_ERROR",
      message: response.statusText
    };
    try {
      error = await response.json();
    } catch {
      // Keep the generic error.
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      message = await response.text();
    } catch {
      // Keep the generic error.
    }
    throw {
      status: response.status,
      code: "HTTP_ERROR",
      message
    } satisfies ApiError;
  }

  return response.text();
}

function cleanPayload(payload: UserPayload) {
  return {
    ...payload,
    email: blankToNull(payload.email),
    firstName: blankToNull(payload.firstName),
    lastName: blankToNull(payload.lastName),
    displayName: blankToNull(payload.displayName),
    password: blankToNull(payload.password),
    position: blankToNull(payload.position),
    tenancyName: blankToNull(payload.tenancyName),
    attributes: Object.keys(payload.attributes).length ? payload.attributes : null
  };
}

function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
