# -------------------------------------------------
# Cola principal: envío de comprobantes al SRI
# -------------------------------------------------
resource "aws_sqs_queue" "cola_sri" {
  name                       = "cola-facturacion-sri-${var.ambiente}"
  delay_seconds              = 0
  max_message_size           = 262144  # 256 KB
  message_retention_seconds  = 86400   # 1 día
  receive_wait_time_seconds  = 20      # Long polling (ahorra costos)
  visibility_timeout_seconds = 300     # 5 min (tiempo max de tu Lambda)

  # Reintentos: si falla 3 veces, va a la cola muerta
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.cola_sri_muerta.arn
    maxReceiveCount     = 3
  })

  # Cifrado con KMS
  kms_master_key_id                 = aws_kms_key.sri_secrets.arn
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# Cola muerta (DLQ): comprobantes que fallaron 3 veces
# -------------------------------------------------
resource "aws_sqs_queue" "cola_sri_muerta" {
  name                      = "cola-facturacion-sri-muerta-${var.ambiente}"
  message_retention_seconds = 1209600  # 14 días para revisar y reintentar

  # Cifrado con la misma KMS key
  kms_master_key_id                 = aws_kms_key.sri_secrets.arn
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# Política de acceso a la cola principal
# -------------------------------------------------
resource "aws_sqs_queue_policy" "cola_sri" {
  queue_url = aws_sqs_queue.cola_sri.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SoloRolLambda"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_sri.arn
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.cola_sri.arn
      }
    ]
  })
}

# -------------------------------------------------
# Política de acceso a la cola muerta
# -------------------------------------------------
resource "aws_sqs_queue_policy" "cola_sri_muerta" {
  queue_url = aws_sqs_queue.cola_sri_muerta.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SoloRolLambda"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_sri.arn
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.cola_sri_muerta.arn
      }
    ]
  })
}

# -------------------------------------------------
# Alarma CloudWatch: mensajes en cola muerta
# -------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "alarma_cola_muerta" {
  alarm_name          = "alarma-sri-cola-muerta-${var.ambiente}"
  alarm_description   = "Hay comprobantes que fallaron 3 veces al enviarse al SRI"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300  # cada 5 minutos
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.cola_sri_muerta.name
  }

  alarm_actions = [aws_sns_topic.alertas_sri.arn]
  ok_actions    = [aws_sns_topic.alertas_sri.arn]

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# SNS Topic: notificaciones por email
# -------------------------------------------------
resource "aws_sns_topic" "alertas_sri" {
  name = "alertas-facturacion-sri-${var.ambiente}"

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_sns_topic_subscription" "email_alertas" {
  topic_arn = aws_sns_topic.alertas_sri.arn
  protocol  = "email"
  endpoint  = var.email_alertas
}