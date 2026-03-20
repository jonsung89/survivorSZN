const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const accountId = process.env.R2_ACCOUNT_ID;
const bucketName = process.env.R2_BUCKET_NAME;
const publicUrl = process.env.R2_PUBLIC_URL;

let s3Client = null;

function getClient() {
  if (!s3Client && accountId) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

async function uploadAvatar(userId, buffer, contentType = 'image/jpeg') {
  const client = getClient();
  if (!client) throw new Error('R2 not configured');

  const key = `avatars/${userId}.jpg`;

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `${publicUrl}/${key}`;
}

async function deleteAvatar(userId) {
  const client = getClient();
  if (!client) throw new Error('R2 not configured');

  const key = `avatars/${userId}.jpg`;

  await client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  }));
}

async function uploadProspectHeadshot(espnId, buffer, contentType = 'image/png') {
  const client = getClient();
  if (!client) throw new Error('R2 not configured');

  const key = `prospects/${espnId}.png`;

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `${publicUrl}/${key}`;
}

function getProspectHeadshotUrl(espnId) {
  return `${publicUrl}/prospects/${espnId}.png`;
}

function isConfigured() {
  return !!(accountId && bucketName && publicUrl);
}

module.exports = { uploadAvatar, deleteAvatar, uploadProspectHeadshot, getProspectHeadshotUrl, isConfigured };
