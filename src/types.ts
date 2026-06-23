export type UserRole =
  | "ADMIN"
  | "HQ_MANAGER"
  | "HQ_STAFF"
  | "BRANCH_MANAGER"
  | "BRANCH_STAFF";

export type TenancyType = "HQ" | "BRANCH";

export type Session = {
  authenticated: boolean;
  admin: boolean;
  subject: string | null;
  username: string | null;
  name: string | null;
  email: string | null;
  roles: string[];
  loginUrl: string;
  logoutUrl: string;
};

export type UserPayload = {
  email: string;
  displayName: string;
  password: string;
  temporaryPassword: boolean;
  enabled: boolean;
  emailVerified: boolean;
  employeeNumber: string;
  position: string;
  role: UserRole;
  tenancyType: TenancyType;
  tenancyName: string;
  sourceActive: boolean;
  attributes: Record<string, string[]>;
};

export type KeycloakUserSummary = {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean | null;
  emailVerified: boolean | null;
  attributes: Record<string, string[]> | null;
};

export type ScimUserSummary = {
  id: string;
  externalId: string;
  userName: string;
  displayName: string | null;
  employeeNumber: string | null;
  position: string | null;
  role: string | null;
  tenancyType: string | null;
  tenancyName: string | null;
  active: boolean | null;
};

export type AdminUserDetail = {
  keycloak: KeycloakUserSummary;
  scim: ScimUserSummary | null;
};

export type ProvisionedUserResponse = {
  keycloakUserId: string;
  scimUserId: string | null;
  username: string;
  email: string | null;
  result: string;
};

export type BulkProvisionedUsersResponse = {
  requested: number;
  users: ProvisionedUserResponse[];
  result: string;
};

export type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: string[];
};
