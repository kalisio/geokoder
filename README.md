# geokoder

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/geokoder?sort=semver&label=latest)](https://github.com/kalisio/geokoder/releases)
[![Build Status](https://app.travis-ci.com/kalisio/geokoder.svg?branch=master)](https://app.travis-ci.com/kalisio/geokoder)
[![Code Climate](https://codeclimate.com/github/kalisio/geokoder/badges/gpa.svg)](https://codeclimate.com/github/kalisio/geokoder)
[![Test Coverage](https://codeclimate.com/github/kalisio/geokoder/badges/coverage.svg)](https://codeclimate.com/github/kalisio/geokoder/coverage)
[![Dependency Status](https://img.shields.io/david/kalisio/geokoder.svg?style=flat-square)](https://david-dm.org/kalisio/geokoder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Kano geocoder service**

**geokoder** is a service that let you perform forward and inverse geocoding in various source.

## API

### /healthcheck (GET)

Check for the health of the service

## Configuring

Here are the environment variables you can use to customize the service:

| Variable  | Description | Defaults |
|-----------| ------------| ------------|

## Building

### Manual build 

You can build the image with the following command:

```bash
docker build -t <your-image-name> .
```

### Automatic build using Travis CI

This project is configured to use **Travis** to build and push the image on the [Kalisio's Docker Hub](https://hub.docker.com/u/kalisio/).
The built image is tagged using the `version` property in the `package.json` file.

To enable Travis to do the job, you must define the following variable in the corresponding Travis project:

| Variable  | Description |
|-----------| ------------|
| `DOCKER_USER` | your username |
| `DOCKER_PASSWORD` | your password |

## Deploying

This image is designed to be deployed using the [Kargo](https://kalisio.github.io/kargo/) project.

## Testing

To run the tests, use the subcommand `test`: 

```bash
yarn test
```

## Contributing

Please read the [Contributing file](./.github/CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Authors

This project is sponsored by 

![Kalisio](https://s3.eu-central-1.amazonaws.com/kalisioscope/kalisio/kalisio-logo-black-256x84.png)

## License

This project is licensed under the MIT License - see the [license file](./LICENSE.md) for details
