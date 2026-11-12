import { AdminPageState } from "../../shared/admin-page-state";
import type { AccessRequestsResult } from "./contracts";
import { useAccessRequestsData } from "./data/access-requests";
import { AccessRequestsView } from "./views/access-requests-view";

export const AccessRequests = ({ result }: { result: AccessRequestsResult }) => {
  const data = useAccessRequestsData();
  if (result.status !== "ok") {
    return <AdminPageState status={result.status} returnTo="/admin/access-requests" />;
  }
  return <AccessRequestsView requests={result.value} data={data} />;
};
