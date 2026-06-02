#!/bin/bash
set -e

# Rutas absolutas para evitar problemas
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"
DIST_DIR="$SCRIPT_DIR/dist"

echo "🏗️  Construyendo el frontend..."
cd "$SCRIPT_DIR"
npm run build

echo "🔍  Obteniendo configuración de Terraform..."
cd "$TERRAFORM_DIR"
BUCKET=$(terraform output -raw s3_bucket_frontend)
CF_ID=$(terraform output -raw cloudfront_id)

# Verificar que las variables no estén vacías
if [ -z "$BUCKET" ]; then
  echo "❌ Error: no se pudo obtener el nombre del bucket S3"
  echo "   Verifica con: terraform output s3_bucket_frontend"
  exit 1
fi

if [ -z "$CF_ID" ]; then
  echo "❌ Error: no se pudo obtener el ID de CloudFront"
  echo "   Verifica con: terraform output cloudfront_id"
  exit 1
fi

echo "   Bucket  : $BUCKET"
echo "   CloudFront: $CF_ID"

echo "📦  Subiendo a S3..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" --delete

echo "🔄  Invalidando caché de CloudFront..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*"

echo "✅  Deploy completo"
cd "$TERRAFORM_DIR"
URL=$(terraform output -raw frontend_url)
echo "🌐  URL: $URL"