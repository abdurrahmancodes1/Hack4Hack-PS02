import crypto from "node:crypto";
import {
  initiateMultipartUpload,
  createUploadPartSignedUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  listMultipartParts,
  getS3FileMetaData,
  getBucketName,
  s3Client,
} from "../config/s3.js";
import AppError from "../utils/AppError.js";

export const generateSubmissionS3Key = ({
  teamId,
  sessionId,
  extension = ".zip",
}) => {
  const uniqueSuffix = crypto.randomUUID();
  return `submissions/${teamId}/${sessionId}/${uniqueSuffix}${extension}`;
};

export const startMultipartSession = async ({ s3Key, contentType }) => {
  try {
    const { uploadId, key } = await initiateMultipartUpload({
      key: s3Key,
      contentType,
    });
    return { uploadId, key };
  } catch (err) {
    console.error("S3 initiateMultipartUpload failed:", err);
    throw new AppError(
      `Failed to initialize S3 multipart upload: ${err.message}`,
      500,
    );
  }
};

export const generateAllPartSignedUrls = async ({
  key,
  uploadId,
  totalParts,
  expiresIn = 3600,
}) => {
  const urlPromises = [];

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    urlPromises.push(
      createUploadPartSignedUrl({
        key,
        uploadId,
        partNumber,
        expiresIn,
      }).then((presignedUrl) => ({
        partNumber,
        presignedUrl,
      })),
    );
  }

  return await Promise.all(urlPromises);
};

export const generateSinglePartSignedUrl = async ({
  key,
  uploadId,
  partNumber,
  expiresIn = 3600,
}) => {
  return await createUploadPartSignedUrl({
    key,
    uploadId,
    partNumber,
    expiresIn,
  });
};

export const verifyAndCompleteMultipartSession = async ({
  key,
  uploadId,
  clientParts,
}) => {
  try {
    // 1. Query S3 for parts actually received by object store
    const s3PartsResponse = await listMultipartParts({ key, uploadId });
    const s3UploadedParts = s3PartsResponse.Parts || [];

    if (s3UploadedParts.length === 0) {
      throw new AppError(
        "No parts have been uploaded to S3 for this session",
        400,
      );
    }

    if (s3UploadedParts.length !== clientParts.length) {
      throw new AppError(
        `Part count mismatch: S3 recorded ${s3UploadedParts.length} parts, client submitted ${clientParts.length}`,
        400,
      );
    }

    // Map and format for AWS SDK CompleteMultipartUpload
    const formattedParts = clientParts.map((p) => {
      // Clean etags of unescaped quotes if needed
      const rawEtag = p.etag.replace(/^"|"$/g, "");
      return {
        PartNumber: p.partNumber,
        ETag: `"${rawEtag}"`,
      };
    });

    // 2. Complete multipart upload on S3
    const completeResult = await completeMultipartUpload({
      key,
      uploadId,
      parts: formattedParts,
    });

    // 3. Verify final object metadata
    const metadata = await getS3FileMetaData(key);

    return {
      location: completeResult.Location,
      bucket: getBucketName(),
      key,
      contentLengthBytes: metadata.ContentLength,
      etag: metadata.ETag,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Completion may succeed in storage while the API loses the response.
    // If the object exists, return its metadata so the database can catch up.
    try {
      const metadata = await getS3FileMetaData(key);
      return {
        location: null,
        bucket: getBucketName(),
        key,
        contentLengthBytes: metadata.ContentLength,
        etag: metadata.ETag,
      };
    } catch {
      // Keep the original multipart error below.
    }
    console.error("S3 CompleteMultipartUpload failed:", err);
    throw new AppError(
      `Failed to finalize S3 multipart upload: ${err.message}`,
      400,
    );
  }
};

export const cancelMultipartSession = async ({ key, uploadId }) => {
  try {
    await abortMultipartUpload({ key, uploadId });
    return true;
  } catch (err) {
    console.error("S3 abortMultipartUpload warning:", err.message);
    // Non-fatal if S3 already aborted or cleaned up
    return false;
  }
};
