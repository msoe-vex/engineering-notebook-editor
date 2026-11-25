# Non-secret Terraform input variables.
# Set these in `terraform.tfvars` (or pass via `-var` in `.github/workflows/deploy.yml`).
# Never put client secrets or API keys here — those live in GCP Secret Manager (`main.tf`).

variable "project_id" {
  description = "GCP Project ID (e.g. my-notebook-prod). Passed by deploy.yml from GitHub Secret GCP_PROJECT_ID."
  type        = string
}

variable "region" {
  description = "GCP Region for Cloud Run, Artifact Registry, and GCS (default: us-central1)."
  type        = string
  default     = "us-central1"
}

variable "image_tag" {
  description = "Docker image tag deployed to Cloud Run. Passed by deploy.yml as github.sha."
  type        = string
  default     = "latest"
}

variable "app_url" {
  description = "Public HTTPS URL for the Next.js website (e.g. https://app.yourdomain.com). Passed by deploy.yml from GitHub Secret APP_URL."
  type        = string
}

variable "google_client_id" {
  description = "Public Google OAuth 2.0 Client ID (from GCP Console -> Credentials). Secret goes in Secret Manager: google-client-secret."
  type        = string
  default     = ""
}

variable "github_client_id" {
  description = "Public GitHub OAuth App Client ID (from GitHub Developer Settings). Secret goes in Secret Manager: github-client-secret."
  type        = string
  default     = ""
}

variable "discord_client_id" {
  description = "Public Discord Application Client ID (from Discord Developer Portal). Secret goes in Secret Manager: discord-client-secret."
  type        = string
  default     = ""
}

variable "linkedin_client_id" {
  description = "Public LinkedIn App Client ID (from LinkedIn Developer Portal). Secret goes in Secret Manager: linkedin-client-secret."
  type        = string
  default     = ""
}
