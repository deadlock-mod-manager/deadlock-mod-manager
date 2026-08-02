import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Input } from "@deadlock-mods/ui/components/input";
import { UserSearch } from "@deadlock-mods/ui/icons";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

/** SteamID64s start here; anything smaller is already a Steam3 account id. */
const STEAM_ID64_BASE = 76_561_197_960_265_728n;

/**
 * Accepts a SteamID64, a Steam3 account id or a profile URL and reduces it to the
 * account id deadlock-api uses.
 */
export const parseAccountId = (input: string): number | null => {
  const digits = input.trim().match(/(\d{5,20})/)?.[1];
  if (!digits) {
    return null;
  }

  const value = BigInt(digits);
  const accountId = value >= STEAM_ID64_BASE ? value - STEAM_ID64_BASE : value;
  return accountId > 0n && accountId < 0xffff_ffffn ? Number(accountId) : null;
};

interface AccountPromptProps {
  onSubmit: (accountId: number) => void;
}

/**
 * Shown when no local Steam account could be read - Deadlock only ships through
 * Steam, so this is mostly a portable-install / permissions fallback.
 */
export const AccountPrompt = ({ onSubmit }: AccountPromptProps) => {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const parsed = parseAccountId(value);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed !== null) {
      onSubmit(parsed);
    }
  };

  return (
    <Empty className='py-16'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          <UserSearch className='h-16 w-16' />
        </EmptyMedia>
        <EmptyTitle>{t("stats.noAccountTitle")}</EmptyTitle>
        <EmptyDescription>{t("stats.noAccountDescription")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form className='flex w-full gap-2' onSubmit={handleSubmit}>
          <Input
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("stats.accountPlaceholder")}
            value={value}
          />
          <Button disabled={parsed === null} type='submit'>
            {t("stats.accountSubmit")}
          </Button>
        </form>
      </EmptyContent>
    </Empty>
  );
};
