import { ProviderError } from "@deadlock-mods/common/client-errors";
import { z } from "zod";
import { fetch } from "./fetch";
import { runtimeServiceOrigin } from "./runtime-bootstrap";

const GITHUB_API_ORIGIN = "https://api.github.com";
const CONTRIBUTORS_PATH =
  "/repos/deadlock-mod-manager/deadlock-mod-manager/contributors?per_page=100";

export type CoreMember = {
  name: string;
  login: string;
  role: "creator" | "core";
};

export const CORE_TEAM: CoreMember[] = [
  { name: "Stormix", login: "Stormix", role: "creator" },
  { name: "Chipa", login: "GabrielDieterly", role: "core" },
  { name: "Skeptic", login: "Skeptic-systems", role: "core" },
  { name: "Tylevo", login: "Tylevo", role: "core" },
];

// Automation accounts GitHub reports as regular users.
const AUTOMATION_LOGINS = new Set([
  "actions-user",
  "crowdin-bot",
  "turbobot-temp",
]);

const CORE_LOGINS = new Set(
  CORE_TEAM.map((member) => member.login.toLowerCase()),
);

export const githubAvatarUrl = (login: string, size = 160) =>
  `https://github.com/${login}.png?size=${size}`;

export const githubProfileUrl = (login: string) =>
  `https://github.com/${login}`;

class GitHubContributorsError extends ProviderError {
  constructor(readonly status: number) {
    super(`GitHub contributors request failed with ${status}`);
  }
}

const contributorSchema = z.object({
  login: z.string(),
  avatar_url: z.string(),
  html_url: z.string(),
  contributions: z.number(),
  type: z.string(),
});

export type Contributor = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  contributions: number;
};

/** Community contributors from GitHub, most commits first, without bots or the core team. */
export const getContributors = async (): Promise<Contributor[]> => {
  const origin = runtimeServiceOrigin("github", GITHUB_API_ORIGIN);
  const res = await fetch(`${origin}${CONTRIBUTORS_PATH}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new GitHubContributorsError(res.status);
  }

  return z
    .array(contributorSchema)
    .parse(await res.json())
    .filter(
      (contributor) =>
        contributor.type === "User" &&
        !AUTOMATION_LOGINS.has(contributor.login) &&
        !CORE_LOGINS.has(contributor.login.toLowerCase()),
    )
    .map((contributor) => ({
      login: contributor.login,
      avatarUrl: contributor.avatar_url,
      profileUrl: contributor.html_url,
      contributions: contributor.contributions,
    }));
};
