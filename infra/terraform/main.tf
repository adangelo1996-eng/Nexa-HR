terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "documents" {
  bucket = var.documents_bucket_name
}

resource "aws_ecr_repository" "api_repo" {
  name = "payday-api"
}

resource "aws_ecr_repository" "web_repo" {
  name = "payday-web"
}
