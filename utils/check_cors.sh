#!/bin/bash

API_ID="blgg29wto5"

# Get all resources
resources=$(aws apigateway get-resources --rest-api-id $API_ID)

# Extract resource IDs
resource_ids=$(echo $resources | jq -r '.items[].id')

# Function to check CORS for a resource
check_cors() {
    local resource_id=$1
    echo "Checking CORS for resource: $resource_id"
    
    # Check if OPTIONS method exists
    options_method=$(aws apigateway get-method --rest-api-id $API_ID --resource-id $resource_id --http-method OPTIONS 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Extract CORS headers
        allow_headers=$(echo $options_method | jq -r '.methodResponses."200".responseParameters."method.response.header.Access-Control-Allow-Headers"')
        allow_methods=$(echo $options_method | jq -r '.methodResponses."200".responseParameters."method.response.header.Access-Control-Allow-Methods"')
        allow_origin=$(echo $options_method | jq -r '.methodResponses."200".responseParameters."method.response.header.Access-Control-Allow-Origin"')
        
        echo "  Access-Control-Allow-Headers: $allow_headers"
        echo "  Access-Control-Allow-Methods: $allow_methods"
        echo "  Access-Control-Allow-Origin: $allow_origin"
    else
        echo "  No OPTIONS method found (CORS might not be enabled)"
    fi
    echo
}

# Check CORS for each resource
for resource_id in $resource_ids; do
    check_cors $resource_id
done