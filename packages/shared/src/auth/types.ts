export interface OIDCState {
  returnTo: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
}

export interface OIDCUser {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  isAdmin?: boolean;
}

export interface OIDCSession {
  user: OIDCUser;
}
