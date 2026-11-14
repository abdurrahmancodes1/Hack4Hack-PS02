import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Config = {
  region: process.env.AWS_REGION || "ap-south-1",
};

const accessKeyId =
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_ACCESSKEY_ID ||
  process.env.ACCESS_KEY_ID;

const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY ||
  process.env.AWS_SECRETKEY ||
  process.env.AWS_SECRET_KEY ||
  process.env.SECRET_ACCESS_KEY;

if (accessKeyId && secretAccessKey) {
  s3Config.credentials = {
    accessKeyId,
    secretAccessKey,
  };
}

if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
}

if (process.env.S3_FORCE_PATH_STYLE === "true" || process.env.S3_FORCE_PATH_STYLE === true) {
  s3Config.forcePathStyle = true;
}

export const s3Client = new S3Client(s3Config);
const signingClient = process.env.S3_PUBLIC_ENDPOINT
  ? new S3Client({
      ...s3Config,
      endpoint: process.env.S3_PUBLIC_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || Boolean(process.env.S3_PUBLIC_ENDPOINT),
    })
  : s3Client;

export const getBucketName = () =>
  process.env.AWS_BUCKET ||
  process.env.AWS_BUCKET_NAME ||
  process.env.AWS_S3_BUCKET ||
  process.env.BUCKET_NAME ||
  "hack4hack-submissions";

// Multipart Upload Primitives for Hack4Hack PS2

export const initiateMultipartUpload = async ({ key, contentType }) => {
  const command = new CreateMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType || "application/zip",
  });
  const response = await s3Client.send(command);
  return {
    uploadId: response.UploadId,
    key: response.Key,
  };
};

export const createUploadPartSignedUrl = async ({ key, uploadId, partNumber, expiresIn = 3600 }) => {
  const command = new UploadPartCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return await getSignedUrl(signingClient, command, { expiresIn });
};

export const completeMultipartUpload = async ({ key, uploadId, parts }) => {
  const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  const command = new CompleteMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts.map((p) => ({
        PartNumber: p.PartNumber,
        ETag: p.ETag,
      })),
    },
  });
  return await s3Client.send(command);
};

export const abortMultipartUpload = async ({ key, uploadId }) => {
  const command = new AbortMultipartUploadCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
  });
  return await s3Client.send(command);
};

export const listMultipartParts = async ({ key, uploadId }) => {
  const command = new ListPartsCommand({
    Bucket: getBucketName(),
    Key: key,
    UploadId: uploadId,
  });
  return await s3Client.send(command);
};

// Single-part Presigned Download URL
export const createGetSignedUrl = async ({ key, download = false, filename, expiresIn = 900 }) => {
  if (!key) throw new Error("S3 key is required");
  const disposition = download
    ? `attachment; filename="${encodeURIComponent(filename || "submission.zip")}"`
    : "inline";

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ResponseContentDisposition: disposition,
  });
  return await getSignedUrl(signingClient, command, { expiresIn });
};

export const getS3FileMetaData = async (key) => {
  const command = new HeadObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return await s3Client.send(command);
};

export const deleteS3File = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return await s3Client.send(command);
};

export const deleteS3Files = async (keys) => {
  if (!keys || keys.length === 0) return;
  const command = new DeleteObjectsCommand({
    Bucket: getBucketName(),
    Delete: {
      Objects: keys.map((k) => (typeof k === "string" ? { Key: k } : k)),
      Quiet: false,
    },
  });
  return await s3Client.send(command);
};
