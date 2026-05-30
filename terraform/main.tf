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

locals {
  lambda_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/rol-lambda-facturacion-sri-${var.ambiente}"
}

# -------------------------------------------------
# KMS Key propia para cifrar los secrets
# -------------------------------------------------
resource "aws_kms_key" "sri_secrets" {
  description             = "Clave KMS para secrets del SRI Ecuador"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # 1. Acceso total al owner de la cuenta (obligatorio, sin esto te puedes quedar sin acceso)
      {
        Sid    = "AdministracionCompleta"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },

      # 2. Permiso para que CloudWatch Logs use la key
      {
        Sid    = "CloudWatchLogsEncriptar"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.aws_region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      },

      # 3. Permiso para que Secrets Manager use la key
      {
        Sid    = "SecretsManagerEncriptar"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },

      # 4. Permiso para que S3 use la key
      {
        Sid    = "S3Encriptar"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },

      # 5. Permiso para que el rol Lambda use la key
      {
        Sid    = "LambdaDescifrar"
        Effect = "Allow"
        Principal = {
          #AWS = aws_iam_role.lambda_sri.arn
          AWS = local.lambda_role_arn
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_kms_alias" "sri_secrets" {
  name          = "alias/sri-s9"
  target_key_id = aws_kms_key.sri_secrets.key_id
}

# -------------------------------------------------
# Secret: certificado .p12 (binario)
# -------------------------------------------------
resource "aws_secretsmanager_secret" "certificado_p12" {
  name        = "sri/${var.ambiente}/cert9-p12"
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

  lifecycle {
    ignore_changes = [secret_binary]  # ← Terraform no tocará el valor
  }

}

# -------------------------------------------------
# Secret: password del certificado
# -------------------------------------------------
resource "aws_secretsmanager_secret" "certificado_password" {
  name        = "sri/${var.ambiente}/cert9-password"
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