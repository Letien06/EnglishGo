#!/usr/bin/env sh
set -eu

echo "Starting EnglishGo with Java:"
echo "PORT=${PORT:-}"
command -v java
java -version

exec java -jar /app/app.jar
