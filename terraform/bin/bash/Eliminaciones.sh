# Eliminar el permiso antiguo del estado
terraform state rm aws_lambda_permission.apigateway_lambda

# Eliminar el permiso en AWS si existe
aws lambda remove-permission \
  --function-name facturacion-sri-certificacion \
  --statement-id AllowAPIGatewayInvoke \
  --region us-east-1 2>/dev/null || echo "Ya no existía"