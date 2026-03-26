import { AuthorVerificationRepository, db } from "@deadlock-mods/database";
import { randomBytes } from "node:crypto";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "gamebanana-verification",
});

const GB_API_V11_BASE = "https://gamebanana.com/apiv11";
const GB_API_OLD_BASE = "https://api.gamebanana.com";
const VERIFICATION_CODE_PREFIX = "dlmm-";
const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

type GBMemberProfile = {
  _idRow: number;
  _sName: string;
  _sUserTitle: string;
  _aBio: Array<{ _sTitle: string; _sValue: string }>;
};

type GBContactInfoEntry = {
  _sTitle: string;
  _sValue: string;
  _sIconClasses?: string;
};

type GBOldApiMemberData = {
  name: string;
  "DefinitionList().aContactInfo()": GBContactInfoEntry[] | null;
};

const repository = new AuthorVerificationRepository(db);

function generateVerificationCode(): string {
  return `${VERIFICATION_CODE_PREFIX}${randomBytes(4).toString("hex")}`;
}

export function extractMemberId(input: string): number | null {
  const numericMatch = input.match(/^\d+$/);
  if (numericMatch) {
    return Number.parseInt(numericMatch[0], 10);
  }

  const urlMatch = input.match(/gamebanana\.com\/members\/(\d+)/i);
  if (urlMatch) {
    return Number.parseInt(urlMatch[1], 10);
  }

  return null;
}

async function fetchMemberProfile(
  memberId: number,
): Promise<GBMemberProfile | null> {
  const response = await fetch(`${GB_API_V11_BASE}/Member/${memberId}`);
  if (!response.ok) return null;
  return (await response.json()) as GBMemberProfile;
}

async function fetchMemberDiscordContact(
  memberId: number,
): Promise<string | null> {
  const url = `${GB_API_OLD_BASE}/Core/Item/Data?itemtype=Member&itemid=${memberId}&fields=name,DefinitionList().aContactInfo()&return_keys=true`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as GBOldApiMemberData;
  const contactInfo = data["DefinitionList().aContactInfo()"];
  if (!contactInfo) return null;

  const discordEntry = contactInfo.find(
    (entry) => entry._sTitle.toLowerCase() === "discord",
  );
  return discordEntry?._sValue ?? null;
}

export type VerifyStartResult =
  | { outcome: "already_verified"; gamebananaUsername: string }
  | { outcome: "auto_verified"; gamebananaUsername: string }
  | {
      outcome: "pending";
      gamebananaUsername: string;
      verificationCode: string;
    }
  | { outcome: "member_not_found" }
  | { outcome: "already_claimed"; gamebananaUsername: string };

export async function startVerification(
  discordUserId: string,
  discordUsername: string,
  gamebananaMemberIdOrUrl: string,
): Promise<VerifyStartResult> {
  const memberId = extractMemberId(gamebananaMemberIdOrUrl);
  if (!memberId) {
    return { outcome: "member_not_found" };
  }

  const existing = await repository.findByGamebananaMemberId(memberId);
  if (existing?.status === "verified") {
    if (existing.discordUserId === discordUserId) {
      return {
        outcome: "already_verified",
        gamebananaUsername: existing.gamebananaUsername,
      };
    }
    return {
      outcome: "already_claimed",
      gamebananaUsername: existing.gamebananaUsername,
    };
  }

  const profile = await fetchMemberProfile(memberId);
  if (!profile) {
    return { outcome: "member_not_found" };
  }

  const gbDiscordUsername = await fetchMemberDiscordContact(memberId);

  if (
    gbDiscordUsername &&
    gbDiscordUsername.toLowerCase() === discordUsername.toLowerCase()
  ) {
    logger
      .withMetadata({ discordUserId, memberId })
      .info("Auto-verified via Discord contact info match");

    const userId = await repository.resolveUserIdFromDiscord(discordUserId);

    const row = await repository.upsertPending({
      discordUserId,
      userId,
      gamebananaMemberId: memberId,
      gamebananaUsername: profile._sName,
      verificationCode: generateVerificationCode(),
      status: "verified",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + VERIFICATION_EXPIRY_MS),
    });

    if (userId) {
      await repository.linkGamebananaMemberToUser(userId, memberId);
    }

    logger
      .withMetadata({
        verificationId: row.id,
        userId,
        memberId,
      })
      .info("Author verification completed (auto)");

    return { outcome: "auto_verified", gamebananaUsername: profile._sName };
  }

  const code = generateVerificationCode();

  await repository.upsertPending({
    discordUserId,
    userId: null,
    gamebananaMemberId: memberId,
    gamebananaUsername: profile._sName,
    verificationCode: code,
    status: "pending",
    expiresAt: new Date(Date.now() + VERIFICATION_EXPIRY_MS),
  });

  logger
    .withMetadata({ discordUserId, memberId })
    .info("Verification challenge created");

  return {
    outcome: "pending",
    gamebananaUsername: profile._sName,
    verificationCode: code,
  };
}

export type VerifyConfirmResult =
  | { outcome: "verified"; gamebananaUsername: string }
  | { outcome: "code_not_found" }
  | { outcome: "no_pending" }
  | { outcome: "expired" }
  | { outcome: "fetch_failed" };

export async function confirmVerification(
  discordUserId: string,
): Promise<VerifyConfirmResult> {
  const pending = await repository.findPendingByDiscordUserId(discordUserId);
  if (!pending) {
    return { outcome: "no_pending" };
  }

  if (pending.expiresAt < new Date()) {
    return { outcome: "expired" };
  }

  const profile = await fetchMemberProfile(pending.gamebananaMemberId);
  if (!profile) {
    return { outcome: "fetch_failed" };
  }

  const codeFound = profile._aBio?.some((entry) =>
    entry._sValue.includes(pending.verificationCode),
  );

  if (!codeFound) {
    return { outcome: "code_not_found" };
  }

  const userId = await repository.resolveUserIdFromDiscord(discordUserId);

  await repository.markVerified(pending.id, userId);

  if (userId) {
    await repository.linkGamebananaMemberToUser(
      userId,
      pending.gamebananaMemberId,
    );
  }

  logger
    .withMetadata({
      verificationId: pending.id,
      userId,
      memberId: pending.gamebananaMemberId,
    })
    .info("Author verification completed (manual)");

  return {
    outcome: "verified",
    gamebananaUsername: pending.gamebananaUsername,
  };
}

export type VerifyStatusResult =
  | { outcome: "verified"; gamebananaUsername: string; verifiedAt: Date | null }
  | {
      outcome: "pending";
      gamebananaUsername: string;
      verificationCode: string;
      expiresAt: Date;
    }
  | { outcome: "none" };

export async function getVerificationStatus(
  discordUserId: string,
): Promise<VerifyStatusResult> {
  const verified = await repository.findVerifiedByDiscordUserId(discordUserId);
  if (verified) {
    return {
      outcome: "verified",
      gamebananaUsername: verified.gamebananaUsername,
      verifiedAt: verified.verifiedAt,
    };
  }

  const pending = await repository.findPendingByDiscordUserId(discordUserId);
  if (pending) {
    return {
      outcome: "pending",
      gamebananaUsername: pending.gamebananaUsername,
      verificationCode: pending.verificationCode,
      expiresAt: pending.expiresAt,
    };
  }

  return { outcome: "none" };
}
