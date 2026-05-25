# -------------------------------------------------
# User Pool: gestión de usuarios del sistema
# -------------------------------------------------
resource "aws_cognito_user_pool" "sri" {
  name = "usuarios-facturacion-sri-${var.ambiente}"

  # Política de contraseñas
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # Atributos requeridos al registrarse
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
  }

  # Verificación por email
  auto_verified_attributes = ["email"]

  # Recuperación de cuenta
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Proyecto = "facturacion-electronica"
    Ambiente = var.ambiente
  }
}

# -------------------------------------------------
# User Pool Client: credenciales para el frontend
# -------------------------------------------------
resource "aws_cognito_user_pool_client" "frontend" {
  name         = "cliente-frontend-sri-${var.ambiente}"
  user_pool_id = aws_cognito_user_pool.sri.id

  # Sin client secret (app pública desde el browser)
  generate_secret = false

  # Flujos de autenticación permitidos
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Tokens de acceso
  access_token_validity  = 1    # 1 hora
  id_token_validity      = 1    # 1 hora
  refresh_token_validity = 30   # 30 días

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevenir reutilización de tokens
  prevent_user_existence_errors = "ENABLED"
}