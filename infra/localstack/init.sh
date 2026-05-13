#!/usr/bin/env bash
# LocalStack bootstrap for Plot-Twist.
# Auto-executed by LocalStack on container ready (mounted at /etc/localstack/init/ready.d/).
# Idempotent: re-running on top of an existing bucket is safe.

set -euo pipefail

BUCKET="${S3_BUCKET_AVATARS:-plot-twist-avatars}"
REGION="${DEFAULT_REGION:-us-east-1}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:4200}"

echo "[init] ensuring bucket s3://${BUCKET} in ${REGION}"

if ! awslocal s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  awslocal s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  echo "[init] bucket created"
else
  echo "[init] bucket already exists"
fi

echo "[init] applying CORS for ${WEB_ORIGIN}"
awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration "$(cat <<JSON
{
  "CORSRules": [
    {
      "AllowedOrigins": ["${WEB_ORIGIN}"],
      "AllowedMethods": ["GET", "POST", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
JSON
)"

echo "[init] applying lifecycle rule on avatars/pending/"
awslocal s3api put-bucket-lifecycle-configuration --bucket "${BUCKET}" --lifecycle-configuration "$(cat <<JSON
{
  "Rules": [
    {
      "ID": "expire-pending-avatars",
      "Status": "Enabled",
      "Filter": { "Prefix": "avatars/pending/" },
      "Expiration": { "Days": 1 }
    }
  ]
}
JSON
)"

# Note: production AWS S3 honors the Deny statement below for anonymous GETs.
# LocalStack community does NOT enforce Deny against public reads, so locally
# both prefixes return 200. The application layer never exposes a pending URL,
# so this gap is dev-only — but verify the policy on a real bucket before launch.
echo "[init] applying public-read policy on avatars/* (excluding avatars/pending/*)"
awslocal s3api put-bucket-policy --bucket "${BUCKET}" --policy "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadFinalAvatars",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/avatars/*"
    },
    {
      "Sid": "DenyReadPendingAvatars",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/avatars/pending/*"
    }
  ]
}
JSON
)"

echo "[init] done"
