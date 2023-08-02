#!/usr/bin/env bash
set -euxo pipefail

IMAGE=kalisio/geokoder
TAG=latest

# Build docker with version number only on release
if [[ -n "$TRAVIS_TAG" ]]; then
	TAG=$(cat package.json | jq -r '.version')
fi

echo Building geokoder $TAG
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker build -t $IMAGE:$TAG .
docker push $IMAGE:$TAG
