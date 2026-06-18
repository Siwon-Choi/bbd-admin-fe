# bbd-admin-fe

React + TypeScript frontend for the BBD admin console.

This app is intentionally separate from `bbd-admin-be`. It does not talk to Keycloak Admin REST and it does not keep any admin client secret. Login and provisioning APIs are delegated to the backend.

The console is shaped for company-wide employee administration: list/search employees, open a detail view, and add or edit employees through a modal form. Keycloak user changes and User Service SCIM projection changes are still handled by `bbd-admin-be`.

## Local Run

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5174
```

Default backend URL:

```text
VITE_BBD_ADMIN_API_BASE=http://localhost:8090
```

## Login Flow

The login button sends the browser to:

```text
{VITE_BBD_ADMIN_API_BASE}/oauth2/authorization/keycloak
```

Spring Security handles the Keycloak authorization code flow in `bbd-admin-be`, then redirects back to this app. After that, this app calls backend APIs with `credentials: "include"` so the session cookie is sent.

If the backend redirects back with `auth=admin_required`, the app alerts `관리자 권한이 없습니다. 재 로그인하세요.` and sends the browser through logout before showing the login page again.

## Build

```powershell
npm run build
```
