#!/bin/bash
set -e

echo "📦 Instalando dependencias..."
cd lambda/facturacion
rm -rf package
mkdir package

pip install \
  -r requirements.txt \
  --target ./package \
  --platform manylinux2014_x86_64 \
  --only-binary=:all: \
  --upgrade

# Copiar el código fuente al package
cp *.py package/

echo "✅ Build completado"