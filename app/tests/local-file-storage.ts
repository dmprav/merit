import { AwsClient } from "aws4fetch";

export const localFileStorage = {
  FILE_STORAGE_ENDPOINT: "http://127.0.0.1:8333",
  FILE_STORAGE_BUCKET: "merit-files",
  FILE_STORAGE_REGION: "us-east-1",
  FILE_STORAGE_ACCESS_KEY_ID: "merit-local",
  FILE_STORAGE_SECRET_ACCESS_KEY: "merit-local-storage",
};

export const deleteLocalTestFile = async (key: string) => {
  const local = localFileStorage;
  const client = new AwsClient({
    accessKeyId: local.FILE_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: local.FILE_STORAGE_SECRET_ACCESS_KEY,
    region: local.FILE_STORAGE_REGION,
    service: "s3",
  });
  const url = local.FILE_STORAGE_ENDPOINT + "/" + local.FILE_STORAGE_BUCKET + "/" + key;
  return (await client.fetch(url, { method: "DELETE" })).ok;
};
