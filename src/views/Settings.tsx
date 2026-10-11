import { More, tooltip } from "@nexusmods/vortex-api";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";

import { NS } from "../constants";
import { hasWebApiKey, protectedAccount } from "../util/steamAccount";

interface ISettingsProps {
  /** Asks for a Steam Web API key and saves it. */
  onRequestApiKey: () => Promise<boolean>;
  /** Forgets the Steam Web API key. */
  onResetApiKey: () => Promise<boolean>;
  /** The Steam account Vortex remembers, if any. */
  getRememberedAccount: () => Promise<string | undefined>;
  onForgetAccount: () => void;
}

function ApiKeyButton({ onRequestApiKey, onResetApiKey }: ISettingsProps) {
  const { t } = useTranslation(NS);
  const hasKey = useSelector(hasWebApiKey);
  return (
    <div>
      <tooltip.Button
        tooltip={hasKey ? t("Resets the Steam Web API Key") : t("Sets the Steam Web API Key")}
        onClick={() => void (hasKey ? onResetApiKey() : onRequestApiKey())}
      >
        {hasKey ? t("Reset Steam Web API Key") : t("Set Steam Web API Key")}
      </tooltip.Button>
      <More id="steamkit-reset-api" name={t("Steam Web API Key")}>
        {t(
          "Vortex requires a Steam Web API key In order for Vortex to pull " +
            "Steam Workshop mods information; this is generated via Steam's developer " +
            "portal.",
        )}
      </More>
    </div>
  );
}

function RememberedAccount({ getRememberedAccount, onForgetAccount }: ISettingsProps) {
  const { t } = useTranslation(NS);
  const keptAccount = useSelector(protectedAccount);
  const [account, setAccount] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (keptAccount === undefined) {
      return undefined;
    }
    let current = true;
    void getRememberedAccount().then((readAccount) => {
      if (current) {
        setAccount(readAccount);
      }
    });
    return () => {
      current = false;
    };
  }, [keptAccount]);
  if (keptAccount === undefined || account === undefined) {
    return null;
  }
  return (
    <div>
      <p>{t("Vortex remembers your Steam account {{account}}.", { replace: { account } })}</p>
      <tooltip.Button
        tooltip={t("Forgets the Steam account and its sign-in, so Vortex asks you to sign in again")}
        onClick={onForgetAccount}
      >
        {t("Forget Steam account")}
      </tooltip.Button>
    </div>
  );
}

export default function Settings(props: ISettingsProps) {
  return (
    <div>
      <ApiKeyButton {...props} />
      <RememberedAccount {...props} />
    </div>
  );
}
