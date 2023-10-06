# Use a builder
FROM node:16-bookworm-slim AS builder

COPY . /geokoder
WORKDIR /geokoder
# Required while we don't have a release of KDK v2.x
RUN apt-get update && apt-get install --yes git
RUN yarn install

# Copy build to slim image
FROM node:16-bookworm-slim

LABEL maintainer "<contact@kalisio.xyz>"
COPY --from=builder --chown=node:node /geokoder /geokoder
WORKDIR /geokoder
USER node
EXPOSE 8080
CMD npm run prod
