output "certificado_p12_arn" {
  description = "ARN del secret del certificado .p12"
  value       = aws_secretsmanager_secret.certificado_p12.arn
}

output "certificado_password_arn" {
  description = "ARN del secret de la password"
  value       = aws_secretsmanager_secret.certificado_password.arn
}

output "kms_key_arn" {
  description = "ARN de la KMS key"
  value       = aws_kms_key.sri_secrets.arn
}

output "lambda_role_arn" {
  description = "ARN del rol IAM para la Lambda"
  value       = aws_iam_role.lambda_sri.arn
}

output "lambda_role_name" {
  description = "Nombre del rol IAM para la Lambda"
  value       = aws_iam_role.lambda_sri.name
}