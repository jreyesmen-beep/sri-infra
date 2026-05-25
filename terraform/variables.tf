variable "aws_region" {
  description = "Region de AWS"
  type        = string
  default     = "us-east-1"
}

variable "certificado_p12_path" {
  description = "Ruta local al archivo .p12"
  type        = string
}

variable "certificado_password" {
  description = "Password del certificado .p12"
  type        = string
  sensitive   = true  # Terraform no lo mostrará en logs
}

variable "ambiente" {
  description = "certificacion o produccion"
  type        = string
  default     = "cert5"
}

variable "s3_bucket_comprobantes" {
  description = "Nombre del bucket S3 para guardar XML y RIDEs"
  type        = string
}

variable "email_alertas" {
  description = "Email para recibir alertas de comprobantes fallidos"
  type        = string
}

variable "sri_url_recepcion" {
  description = "URL SOAP del SRI para recepcion de comprobantes"
  type        = string
}

variable "sri_url_autorizacion" {
  description = "URL SOAP del SRI para autorizacion de comprobantes"
  type        = string
}