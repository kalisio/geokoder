ARG DEBIAN_VERSION=bookworm
ARG NODE_VERSION=20

# Use a builder
FROM node:${NODE_VERSION}-${DEBIAN_VERSION}-slim AS builder

COPY . /geokoder
WORKDIR /geokoder
# Required while we don't have a release of KDK v2.x
RUN apt-get update && apt-get install --yes git
RUN yarn install

# Copy build to slim image
FROM node:${NODE_VERSION}-${DEBIAN_VERSION}-slim

LABEL maintainer="<contact@kalisio.xyz>"
COPY --from=builder --chown=node:node /geokoder /geokoder
WORKDIR /geokoder
USER node
EXPOSE 8080
CMD [ "npm", "run", "prod" ]
