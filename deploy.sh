#!/usr/bin/env bash
# Usage: ./deploy.sh [stack-name]   (needs the AWS CLI configured)
set -euo pipefail
STACK=${1:-sleeper-power-rankings}
cd "$(dirname "$0")"
aws cloudformation deploy --stack-name "$STACK" --template-file infra/template.yaml
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out BucketName); DIST=$(out DistributionId)
aws s3 sync web "s3://$BUCKET" --delete --exclude test.html
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' >/dev/null
echo "Deployed: $(out Url)"
