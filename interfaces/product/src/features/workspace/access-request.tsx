import { useHydrated } from "@tanstack/react-router";

import { WebMessagesProvider } from "../../app/messages";
import { requestAccessData } from "./data/access-request";
import { AccessRequestDialog } from "./views/access-request";

export const RequestAccess = () => {
  const hydrated = useHydrated();
  return (
    <WebMessagesProvider>
      <AccessRequestDialog request={requestAccessData} hydrated={hydrated} />
    </WebMessagesProvider>
  );
};
