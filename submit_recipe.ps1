$headers = @{
  Authorization = "Token 42a2bf573eb8aa6d904cd91814b4b42cae4e2f50"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Uri "http://localhost:8000/api/recipes/add_recipe/" `
  -Method Post `
  -Headers $headers `
  -Body (Get-Content ".\recipe_test_payload.json" -Raw)