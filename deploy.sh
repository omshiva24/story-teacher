#!/usr/bin/env bash
# One-command deploy to Google Cloud Run.
# Usage: ./deploy.sh YOUR_PROJECT_ID
# The Gemini API key is stored in Secret Manager (asked once, hidden as you type).
set -euo pipefail

PROJECT_ID="${1:?Usage: ./deploy.sh YOUR_PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-story-teacher}"
MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"
SECRET="gemini-key"

echo "==> Using project $PROJECT_ID in $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling Cloud Run, Cloud Build, Artifact Registry and Secret Manager"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  read -rsp "Paste your Gemini API key (it will not be shown): " GEMINI_KEY
  echo
  printf '%s' "$GEMINI_KEY" | gcloud secrets create "$SECRET" --data-file=-
  unset GEMINI_KEY
else
  echo "==> Secret '$SECRET' already exists (to change it: gcloud secrets versions add $SECRET --data-file=-)"
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "==> Letting the service read the secret"
gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

echo "==> Building and deploying (takes 2-4 minutes)"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-secrets "GEMINI_API_KEY=${SECRET}:latest" \
  --set-env-vars "GEMINI_MODEL=${MODEL},NODE_ENV=production" \
  --memory 512Mi \
  --timeout 120

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "Live at: $URL"
echo "Health:  $URL/health"
