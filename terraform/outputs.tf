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

output "cola_sri_url" {
  description = "URL de la cola SQS principal"
  value       = aws_sqs_queue.cola_sri.id
}

output "cola_sri_arn" {
  description = "ARN de la cola SQS principal"
  value       = aws_sqs_queue.cola_sri.arn
}

output "cola_sri_muerta_url" {
  description = "URL de la cola muerta (DLQ)"
  value       = aws_sqs_queue.cola_sri_muerta.id
}

output "cola_sri_muerta_arn" {
  description = "ARN de la cola muerta (DLQ)"
  value       = aws_sqs_queue.cola_sri_muerta.arn
}