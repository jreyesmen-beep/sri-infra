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
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --delete \
  --cache-control "max-age=31536000,public" \
  --exclude "index.html"

# index.html sin cache para que siempre tome la versión más reciente
aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

echo "🔄  Invalidando caché de CloudFront (en segundo plano)..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "   Invalidación iniciada: $INVALIDATION_ID"
echo "   (No es necesario esperar — el sitio ya está actualizado en S3)"

cd "$TERRAFORM_DIR"
URL=$(terraform output -raw frontend_url)

cd "$TERRAFORM_DIR"
URL=$(terraform output -raw frontend_url)

echo ""
echo "✅  Deploy completo"
echo "🌐  URL: $URL"
echo "⏳  La caché de CloudFront se limpiará en ~2-3 minutos"
echo "   Para verificar el estado de la invalidación:"
echo "   aws cloudfront get-invalidation --distribution-id $CF_ID --id $INVALIDATION_ID"
