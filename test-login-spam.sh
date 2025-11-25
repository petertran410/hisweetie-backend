#!/bin/bash
# test-login-spam.sh

BASE_URL="http://localhost:8084"
EMAIL="test@example.com"
PASSWORD="wrongpassword"

echo "Testing login rate limiting..."
echo "Limit: 3 attempts per 15 minutes"
echo "================================"

for i in {1..10}; do
  echo "Attempt $i:"
  
  response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"emailOrPhone\":\"$EMAIL\", \"pass_word\":\"$PASSWORD\"}" \
    "$BASE_URL/api/client-auth/login")
  
  echo "$response"
  echo "---"
  
  # Wait 1 second between requests
  sleep 1
done