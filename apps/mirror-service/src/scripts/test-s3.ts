#!/usr/bin/env bun

import { logger } from "@/lib/logger";
import { S3Service } from "@/services/s3";

const main = async () => {
  const s3Service = S3Service.instance;
  const result = await s3Service.uploadFileBuffer(
    "test/test1/test2/test.txt",
    Buffer.from("test123"),
  );

  if (result.isErr()) {
    logger.withError(result.error).error("Error uploading file");
    return;
  }
  logger.info("File uploaded successfully");
  return result.value;
};

main().catch((error) => {
  logger.withError(error).error("Error testing S3");
  process.exit(1);
});
