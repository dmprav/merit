import type { RequestAccess } from "../contracts";
import { requestAccess } from "./server/access-request.functions";

export const requestAccessData: RequestAccess = (input) => requestAccess({ data: input });
