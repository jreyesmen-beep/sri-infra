# -------------------------------------------------
# Bucket S3 para comprobantes XML y RIDEs
# -------------------------------------------------
resource "aws_s3_bucket" "comprobantes" {
  bucket = var.s3_bucket_comprobantes

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_s3_bucket_versioning" "comprobantes" {
  bucket = aws_s3_bucket.comprobantes.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "comprobantes" {
  bucket = aws_s3_bucket.comprobantes.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.sri_secrets.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "comprobantes" {
  bucket                  = aws_s3_bucket.comprobantes.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -------------------------------------------------
# CloudWatch Log Group para la Lambda
# -------------------------------------------------
resource "aws_cloudwatch_log_group" "lambda_sri" {
  name              = "/aws/lambda/facturacion-sri-${var.ambiente}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.sri_secrets.arn

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# Empaquetar el código Python automáticamente
# -------------------------------------------------
resource "null_resource" "build_lambda" {
  triggers = {
    # Se re-empaqueta si cambia algún archivo Python
    handler        = filemd5("${path.module}/../lambda/facturacion/handler.py")
    sri_client     = filemd5("${path.module}/../lambda/facturacion/sri_client.py")
    xml_builder    = filemd5("${path.module}/../lambda/facturacion/xml_builder.py")
    firma_xml      = filemd5("${path.module}/../lambda/facturacion/firma_xml.py")
    secrets        = filemd5("${path.module}/../lambda/facturacion/secrets_manager.py")
    requirements   = filemd5("${path.module}/../lambda/facturacion/requirements.txt")
  }

  provisioner "local-exec" {
    command = "bash ${path.module}/../lambda/build.sh"
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/facturacion/package"
  output_path = "${path.module}/../lambda/facturacion.zip"

  depends_on = [null_resource.build_lambda]
}

# -------------------------------------------------
# Lambda Function
# -------------------------------------------------
resource "aws_lambda_function" "facturacion_sri" {
  function_name    = "facturacion-sri-${var.ambiente}"
  description      = "Procesa comprobantes electronicos y los envia al SRI Ecuador"
  role             = aws_iam_role.lambda_sri.arn
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime          = "python3.12"
  handler          = "handler.lambda_handler"
  timeout          = 300   # 5 minutos (el SRI puede ser lento)
  memory_size      = 512   # MB

  environment {
    variables = {
      AMBIENTE                  = var.ambiente
      SECRET_CERTIFICADO_P12    = aws_secretsmanager_secret.certificado_p12.name
      SECRET_CERTIFICADO_PASS   = aws_secretsmanager_secret.certificado_password.name
      S3_BUCKET_COMPROBANTES    = var.s3_bucket_comprobantes
      SQS_COLA_URL              = aws_sqs_queue.cola_sri.id
      SRI_URL_RECEPCION         = var.sri_url_recepcion
      SRI_URL_AUTORIZACION      = var.sri_url_autorizacion
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda_sri,
    data.archive_file.lambda_zip
  ]

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# Trigger: Lambda se activa con mensajes de SQS
# -------------------------------------------------
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn                   = aws_sqs_queue.cola_sri.arn
  function_name                      = aws_lambda_function.facturacion_sri.arn
  batch_size                         = 1      # Un comprobante a la vez
  maximum_batching_window_in_seconds = 0
  enabled                            = true
}