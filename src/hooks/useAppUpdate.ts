import { useEffect, useState } from "react";
import { checkForAppUpdate, installPendingUpdate } from "../lib/appUpdate";

export function useAppUpdate() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [bannerVersion, setBannerVersion] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForAppUpdate("silent").then((result) => {
      if (cancelled || result.status !== "available") return;
      setCanInstall(true);
      setBannerVersion(result.version);
      setMessage(`Version ${result.version} is available.`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCheck() {
    setBusy(true);
    setMessage("Checking for updates…");
    setBannerMessage(null);
    const result = await checkForAppUpdate("interactive");
    setBusy(false);
    if (result.status === "available") {
      setCanInstall(true);
      setBannerVersion(result.version);
      setMessage(`Version ${result.version} is available.`);
      return;
    }
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    setCanInstall(false);
    setBannerVersion(null);
    if (result.status === "current") setMessage("You're up to date.");
  }

  async function onInstall() {
    setBusy(true);
    setMessage("Installing update…");
    const result = await installPendingUpdate();
    if (!result.ok) {
      setBusy(false);
      setMessage(result.message);
      setBannerMessage(result.message);
    }
  }

  function onLater() {
    setBannerVersion(null);
    setBannerMessage(null);
  }

  return {
    about: {
      busy,
      message,
      canInstall,
      onCheck: () => void onCheck(),
      onInstall: () => void onInstall(),
    },
    banner: bannerVersion
      ? {
          version: bannerVersion,
          message: bannerMessage,
          busy,
          onInstall: () => void onInstall(),
          onLater,
        }
      : null,
  };
}
