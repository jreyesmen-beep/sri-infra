# -------------------------------------------------
# Verificar dominio o email en SES
# -------------------------------------------------
resource "aws_ses_email_identity" "emisor" {
  email = var.email_emisor
}

# -------------------------------------------------
# Configuración de envío
# -------------------------------------------------
resource "aws_ses_configuration_set" "facturacion" {
  name = "config-facturacion-sri-${var.ambiente}"

  delivery_options {
    tls_policy = "Require"
  }
}

# -------------------------------------------------
# Alarma: emails rebotados
# -------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "ses_bounces" {
  alarm_name          = "alarma-ses-bounces-${var.ambiente}"
  alarm_description   = "Tasa de rebotes de email supera el 5%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Reputation.BounceRate"
  namespace           = "AWS/SES"
  period              = 300
  statistic           = "Average"
  threshold           = 0.05
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas_sri.arn]

  tags = {
    Proyecto = "billingfact"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# Política IAM para que Lambda envíe emails
# -------------------------------------------------
resource "aws_iam_policy" "lambda_ses" {
  name        = "pol-fact-ses-lambda-sri-${var.ambiente}"
  description = "Permite a la Lambda enviar emails con SES"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnviarEmailSES"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.email_emisor
          }
        }
      }
    ]
  })

  tags = {
    Proyecto = "billingfact"
    Ambiente = var.ambiente
  }
}

resource "aws_iam_role_policy_attachment" "ses" {
  role       = aws_iam_role.lambda_sri.name
  policy_arn = aws_iam_policy.lambda_ses.arn
}