terraform {
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

# -------------------------------------------------
# KMS Key propia para cifrar los secrets
# -------------------------------------------------
resource "aws_kms_key" "sri_secrets" {
  description             = "Clave KMS para secrets del SRI Ecuador"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Proyecto  = "facturacion-electronica"
    Ambiente  = var.ambiente
  }
}

resource "aws_kms_alias" "sri_secrets" {
  name          = "alias/sri-secrets"
  target_key_id = aws_kms_key.sri_secrets.key_id
}

# -------------------------------------------------
# Secret: certificado .p12 (binario)
# -------------------------------------------------
resource "aws_secretsmanager_secret" "certificado_p12" {
  name        = "sri/${var.ambiente}/certificado-p12"
  description = "Certificado de firma electronica SRI Ecuador"
  kms_key_id  = aws_kms_key.sri_secrets.arn

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_secretsmanager_secret_version" "certificado_p12" {
  secret_id     = aws_secretsmanager_secret.certificado_p12.id
  secret_binary = filebase64(var.certificado_p12_path)  # Lee el .p12 local
}

# -------------------------------------------------
# Secret: password del certificado
# -------------------------------------------------
resource "aws_secretsmanager_secret" "certificado_password" {
  name        = "sri/${var.ambiente}/certificado-password"
  description = "Password del certificado .p12 SRI Ecuador"
  kms_key_id  = aws_kms_key.sri_secrets.arn

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_secretsmanager_secret_version" "certificado_password" {
  secret_id = aws_secretsmanager_secret.certificado_password.id
  secret_string = jsonencode({
    password = var.certificado_password
  })
}