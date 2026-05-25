# -------------------------------------------------
# REST API
# -------------------------------------------------
resource "aws_api_gateway_rest_api" "sri" {
  name        = "api-facturacion-sri-${var.ambiente}"
  description = "API para emision de comprobantes electronicos SRI Ecuador"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# Autorizador Cognito
# -------------------------------------------------
resource "aws_api_gateway_authorizer" "cognito" {
  name          = "autorizador-cognito-${var.ambiente}"
  rest_api_id   = aws_api_gateway_rest_api.sri.id
  type          = "COGNITO_USER_POOLS"
  provider_arns = [aws_cognito_user_pool.sri.arn]

  identity_source = "method.request.header.Authorization"
}

# -------------------------------------------------
# Rol IAM: permite a API Gateway escribir en SQS
# -------------------------------------------------
resource "aws_iam_role" "apigateway_sqs" {
  name = "rol-apigateway-sqs-sri-${var.ambiente}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "APIGatewayAssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_iam_role_policy" "apigateway_sqs" {
  name = "politica-apigateway-sqs-${var.ambiente}"
  role = aws_iam_role.apigateway_sqs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EnviarMensajesSQS"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.cola_sri.arn
      },
      {
        Sid      = "UsarKMS"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = aws_kms_key.sri_secrets.arn
      },
      {
        Sid      = "EscribirLogsAPIGW"
        Effect   = "Allow"
        Action   = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# =================================================
# RECURSO: /facturas
# =================================================
resource "aws_api_gateway_resource" "facturas" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  parent_id   = aws_api_gateway_rest_api.sri.root_resource_id
  path_part   = "facturas"
}

# -------------------------------------------------
# POST /facturas → SQS (enviar comprobante)
# -------------------------------------------------
resource "aws_api_gateway_method" "post_factura" {
  rest_api_id   = aws_api_gateway_rest_api.sri.id
  resource_id   = aws_api_gateway_resource.facturas.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_validator_id = aws_api_gateway_request_validator.sri.id

  request_models = {
    "application/json" = aws_api_gateway_model.factura.name
  }
}

# Integración directa API Gateway → SQS (sin Lambda)
resource "aws_api_gateway_integration" "post_factura_sqs" {
  rest_api_id             = aws_api_gateway_rest_api.sri.id
  resource_id             = aws_api_gateway_resource.facturas.id
  http_method             = aws_api_gateway_method.post_factura.http_method
  type                    = "AWS"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${var.aws_region}:sqs:path/${data.aws_caller_identity.current.account_id}/${aws_sqs_queue.cola_sri.name}"
  credentials             = aws_iam_role.apigateway_sqs.arn

  request_parameters = {
    "integration.request.header.Content-Type" = "'application/x-www-form-urlencoded'"
  }

  # Mapea el body del request al formato que espera SQS
  request_templates = {
    "application/json" = "Action=SendMessage&MessageBody=$util.urlEncode($input.body)"
  }

  passthrough_behavior = "NEVER"
}

# Respuesta 200 del método
resource "aws_api_gateway_method_response" "post_factura_200" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  resource_id = aws_api_gateway_resource.facturas.id
  http_method = aws_api_gateway_method.post_factura.http_method
  status_code = "200"

  response_models = {
    "application/json" = "Empty"
  }
}

# Respuesta 400 del método
resource "aws_api_gateway_method_response" "post_factura_400" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  resource_id = aws_api_gateway_resource.facturas.id
  http_method = aws_api_gateway_method.post_factura.http_method
  status_code = "400"

  response_models = {
    "application/json" = "Empty"
  }
}

# Mapear respuesta exitosa de SQS → 200
resource "aws_api_gateway_integration_response" "post_factura_200" {
  rest_api_id       = aws_api_gateway_rest_api.sri.id
  resource_id       = aws_api_gateway_resource.facturas.id
  http_method       = aws_api_gateway_method.post_factura.http_method
  status_code       = "200"
  selection_pattern = "^2[0-9][0-9]"

  response_templates = {
    "application/json" = jsonencode({
      mensaje      = "Comprobante recibido y en cola de procesamiento"
      estado       = "EN_PROCESO"
    })
  }

  depends_on = [aws_api_gateway_integration.post_factura_sqs]
}

# Mapear error de SQS → 400
resource "aws_api_gateway_integration_response" "post_factura_400" {
  rest_api_id       = aws_api_gateway_rest_api.sri.id
  resource_id       = aws_api_gateway_resource.facturas.id
  http_method       = aws_api_gateway_method.post_factura.http_method
  status_code       = "400"
  selection_pattern = "^4[0-9][0-9]"

  response_templates = {
    "application/json" = jsonencode({
      mensaje = "Error al encolar el comprobante"
      estado  = "ERROR"
    })
  }

  depends_on = [aws_api_gateway_integration.post_factura_sqs]
}

# =================================================
# RECURSO: /facturas/{claveAcceso}
# =================================================
resource "aws_api_gateway_resource" "factura_detalle" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  parent_id   = aws_api_gateway_resource.facturas.id
  path_part   = "{claveAcceso}"
}

# -------------------------------------------------
# GET /facturas/{claveAcceso} → Lambda consulta S3
# -------------------------------------------------
resource "aws_api_gateway_method" "get_factura" {
  rest_api_id   = aws_api_gateway_rest_api.sri.id
  resource_id   = aws_api_gateway_resource.factura_detalle.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.claveAcceso" = true
  }
}

resource "aws_api_gateway_integration" "get_factura_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.sri.id
  resource_id             = aws_api_gateway_resource.factura_detalle.id
  http_method             = aws_api_gateway_method.get_factura.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.facturacion_sri.invoke_arn
}

# Permiso para que API Gateway invoque la Lambda
resource "aws_lambda_permission" "apigateway_lambda" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.facturacion_sri.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.sri.execution_arn}/*/*"
}

# =================================================
# Validador de requests
# =================================================
resource "aws_api_gateway_request_validator" "sri" {
  rest_api_id           = aws_api_gateway_rest_api.sri.id
  name                  = "validador-body-sri"
  validate_request_body = true
}

# =================================================
# Modelo JSON Schema para validar el body
# =================================================
resource "aws_api_gateway_model" "factura" {
  rest_api_id  = aws_api_gateway_rest_api.sri.id
  name         = "ModeloFactura"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    type      = "object"
    required  = [
      "clave_acceso", "ruc", "razon_social",
      "id_comprador", "items"
    ]
    properties = {
      clave_acceso    = { type = "string", minLength = 49, maxLength = 49 }
      ruc             = { type = "string", minLength = 13, maxLength = 13 }
      razon_social    = { type = "string" }
      id_comprador    = { type = "string" }
      items           = {
        type     = "array"
        minItems = 1
        items    = {
          type     = "object"
          required = ["codigo", "descripcion", "cantidad", "precio_unitario"]
          properties = {
            codigo          = { type = "string" }
            descripcion     = { type = "string" }
            cantidad        = { type = "number" }
            precio_unitario = { type = "number" }
          }
        }
      }
    }
  })
}

# =================================================
# CORS para el frontend
# =================================================
resource "aws_api_gateway_method" "options_facturas" {
  rest_api_id   = aws_api_gateway_rest_api.sri.id
  resource_id   = aws_api_gateway_resource.facturas.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_facturas" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  resource_id = aws_api_gateway_resource.facturas.id
  http_method = aws_api_gateway_method.options_facturas.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_facturas_200" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  resource_id = aws_api_gateway_resource.facturas.id
  http_method = aws_api_gateway_method.options_facturas.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options_facturas" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  resource_id = aws_api_gateway_resource.facturas.id
  http_method = aws_api_gateway_method.options_facturas.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_facturas]
}

# =================================================
# Deployment y Stage
# =================================================
resource "aws_api_gateway_deployment" "sri" {
  rest_api_id = aws_api_gateway_rest_api.sri.id

  # Fuerza nuevo deployment si cambia cualquier recurso
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.facturas,
      aws_api_gateway_resource.factura_detalle,
      aws_api_gateway_method.post_factura,
      aws_api_gateway_method.get_factura,
      aws_api_gateway_integration.post_factura_sqs,
      aws_api_gateway_integration.get_factura_lambda,
    ]))
  }

  depends_on = [
    aws_api_gateway_integration.post_factura_sqs,
    aws_api_gateway_integration.get_factura_lambda,
    aws_api_gateway_integration_response.post_factura_200,
    aws_api_gateway_integration_response.post_factura_400,
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "sri" {
  rest_api_id   = aws_api_gateway_rest_api.sri.id
  deployment_id = aws_api_gateway_deployment.sri.id
  stage_name    = var.ambiente

  # Logs en CloudWatch
<<<<<<< HEAD
  #access_log_destination_arn = aws_cloudwatch_log_group.apigw_logs.arn
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_logs.arn

    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      caller                  = "$context.identity.caller"
      user                    = "$context.identity.user"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      resourcePath            = "$context.resourcePath"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })

  }
=======
  access_log_destination_arn = aws_cloudwatch_log_group.apigw_logs.arn
>>>>>>> 63016457d0b1b3cea0a36bd343fb498988f5c451

  xray_tracing_enabled = true

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_cloudwatch_log_group" "apigw_logs" {
  name              = "/aws/apigateway/facturacion-sri-${var.ambiente}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.sri_secrets.arn

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# Throttling por stage
resource "aws_api_gateway_method_settings" "sri" {
  rest_api_id = aws_api_gateway_rest_api.sri.id
  stage_name  = aws_api_gateway_stage.sri.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled        = true
    logging_level          = "INFO"
    throttling_burst_limit = 50   # máx requests simultáneos
    throttling_rate_limit  = 100  # requests por segundo
  }
<<<<<<< HEAD
}

# -------------------------------------------------
# Rol IAM para que API Gateway escriba en CloudWatch
# (se configura una vez a nivel de cuenta)
# -------------------------------------------------
resource "aws_iam_role" "apigateway_cloudwatch" {
  name = "rol-apigateway-cloudwatch-${var.ambiente}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "APIGatewayAssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

resource "aws_iam_role_policy_attachment" "apigateway_cloudwatch" {
  role       = aws_iam_role.apigateway_cloudwatch.name

  # Política administrada de AWS específica para esto
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# -------------------------------------------------
# Configuración a nivel de cuenta AWS
# Solo necesita aplicarse una vez
# -------------------------------------------------
resource "aws_api_gateway_account" "sri" {
  cloudwatch_role_arn = aws_iam_role.apigateway_cloudwatch.arn

  depends_on = [
    aws_iam_role_policy_attachment.apigateway_cloudwatch
  ]
=======
>>>>>>> 63016457d0b1b3cea0a36bd343fb498988f5c451
}