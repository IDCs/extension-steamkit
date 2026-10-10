import { More, tooltip } from "@nexusmods/vortex-api";
import I18next from "i18next";
import * as React from "react";

interface IProps {
  t: typeof I18next.t;
  getSteamWebApiKey: () => Promise<string | undefined>;
  /** Asks for a Steam Web API key and saves it; resolves to whether one was saved. */
  onRequestApiKey: () => Promise<boolean>;
  /** Forgets the Steam Web API key; resolves to whether that worked. */
  onResetApiKey: () => Promise<boolean>;
  /** The Steam account Vortex remembers, if any. */
  getRememberedAccount: () => Promise<string | undefined>;
  onForgetAccount: () => void;
}

function ApiKeyButton({ t, getSteamWebApiKey, onRequestApiKey, onResetApiKey }: IProps) {
  const [hasKey, setHasKey] = React.useState(false);
  React.useEffect(() => {
    let current = true;
    void getSteamWebApiKey().then((key) => {
      if (current) {
        setHasKey(key !== undefined);
      }
    });
    return () => {
      current = false;
    };
  }, []);

  const onClick = async () => {
    if (hasKey) {
      setHasKey(!(await onResetApiKey()));
    } else {
      setHasKey(await onRequestApiKey());
    }
  };
  return (
    <div>
      <tooltip.Button
        tooltip={hasKey ? t("Resets the Steam Web API Key") : t("Sets the Steam Web API Key")}
        onClick={() => void onClick()}
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

function RememberedAccount({ t, getRememberedAccount, onForgetAccount }: IProps) {
  const [account, setAccount] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    void getRememberedAccount().then(setAccount);
  }, [getRememberedAccount]);
  if (account === undefined) {
    return null;
  }
  return (
    <div>
      <p>{t("Vortex remembers your Steam account {{account}}.", { replace: { account } })}</p>
      <tooltip.Button
        tooltip={t("Forgets the Steam account and its sign-in, so Vortex asks you to sign in again")}
        onClick={() => {
          onForgetAccount();
          setAccount(undefined);
        }}
      >
        {t("Forget Steam account")}
      </tooltip.Button>
    </div>
  );
}

export default function Settings(props: IProps) {
  return (
    <div>
      <ApiKeyButton {...props} />
      <RememberedAccount {...props} />
    </div>
  );
}
