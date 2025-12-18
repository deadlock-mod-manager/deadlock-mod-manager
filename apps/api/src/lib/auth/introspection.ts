import { env } from "../env";

export interface UserInfo {
  id: string;
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  given_name?: string;
  family_name?: string;
  isAdmin?: boolean;
}

interface OIDCUserInfo {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  given_name?: string;
  family_name?: string;
  isAdmin?: boolean;
}

export async function introspectToken(
  accessToken: string,
): Promise<UserInfo | null> {
  try {
    const response = await fetch(`${env.AUTH_URL}/api/auth/oauth2/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const oidcUserInfo = (await response.json()) as OIDCUserInfo;

    return {
      ...oidcUserInfo,
      id: oidcUserInfo.sub,
    };
  } catch {
    return null;
  }
}
