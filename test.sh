echo "Testing debug route..."
for i in {1..5}; do
  echo "Debug Attempt $i:"
  curl -s "http://localhost:8084/api/client-auth/test-throttle"
  echo ""
  sleep 1
done