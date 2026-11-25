terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  registry = "${var.region}-docker.pkg.dev/${var.project_id}/engineering-notebook"
  secrets = toset([
    "better-auth-secret",
    "internal-service-secret",
    "google-client-secret",
    "github-client-secret",
    "discord-client-secret",
    "linkedin-client-secret",
  ])
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "engineering-notebook"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_storage_bucket" "notebook_assets" {
  name                        = "${var.project_id}-notebook-assets"
  location                    = var.region
  uniform_bucket_level_access = true
  depends_on                  = [google_project_service.apis]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "compile_jobs" {
  name       = "notebook-jobs-compile"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "judge_jobs" {
  name       = "notebook-jobs-judge"
  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "core" {
  name     = "core"
  location = var.region
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = "${local.registry}/core:${var.image_tag}"
      ports { container_port = 8080 }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.notebook_assets.name
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "collab" {
  name     = "collab"
  location = var.region
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = "${local.registry}/collab:${var.image_tag}"
      ports { container_port = 1234 }
      env {
        name  = "CORE_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "website" {
  name     = "website"
  location = var.region
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = "${local.registry}/website:${var.image_tag}"
      ports { container_port = 3000 }
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = var.app_url
      }
      env {
        name  = "BETTER_AUTH_URL"
        value = var.app_url
      }
      env {
        name  = "NEXT_PUBLIC_CORE_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "CORE_INTERNAL_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "NEXT_PUBLIC_COLLAB_URL"
        value = google_cloud_run_v2_service.collab.uri
      }
      env {
        name = "BETTER_AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["better-auth-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["google-client-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "GITHUB_CLIENT_ID"
        value = var.github_client_id
      }
      env {
        name = "GITHUB_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["github-client-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "DISCORD_CLIENT_ID"
        value = var.discord_client_id
      }
      env {
        name = "DISCORD_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["discord-client-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "LINKEDIN_CLIENT_ID"
        value = var.linkedin_client_id
      }
      env {
        name = "LINKEDIN_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["linkedin-client-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

output "website_url" {
  value = google_cloud_run_v2_service.website.uri
}

output "core_url" {
  value = google_cloud_run_v2_service.core.uri
}

output "collab_url" {
  value = google_cloud_run_v2_service.collab.uri
}
