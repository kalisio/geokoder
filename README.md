# geokoder

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/geokoder?sort=semver&label=latest)](https://github.com/kalisio/geokoder/releases)
[![Build Status](https://app.travis-ci.com/kalisio/geokoder.svg?branch=master)](https://app.travis-ci.com/kalisio/geokoder)
[![Code Climate](https://codeclimate.com/github/kalisio/geokoder/badges/gpa.svg)](https://codeclimate.com/github/kalisio/geokoder)
[![Test Coverage](https://codeclimate.com/github/kalisio/geokoder/badges/coverage.svg)](https://codeclimate.com/github/kalisio/geokoder/coverage)
[![Dependency Status](https://img.shields.io/david/kalisio/geokoder.svg?style=flat-square)](https://david-dm.org/kalisio/geokoder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Kano geocoder service**

**geokoder** is a service that let you perform forward and reverse geocoding in various sources.

## API

### /healthcheck (GET)

Check for the health of the service, returns a json object with the name of the service (geokoder) and it's version number.

### /capabilities/:operation (GET)

Returns the list of available geocoding sources according to the target operation, as an array. Available operations are:
* `forward` for forward geocoding
* `reverse` for reverse geocoding

### /forward?q=searchString&sources=filterPattern (GET)

Performs *forward* geocoding. Requires at least the `q` parameter which is the string that'll be searched in the geocoding sources.
The query supports an optional `sources` allowing users to only perform geocoding in matching sources. The source matching is based on [minimatch](https://github.com/isaacs/minimatch#minimatch).

The query returns the list of matching features, as an array. Each feature is given a relevance score, and the returned array is sorted based on this value. The service also add to each feature and additional `geokoder` object containing the following fields:
  - `source` specifies in which source this feature was found
  - `match` indicates which string value was used to compute relevance score
  - `matchProp` indicates which feature property was used to to compute relevance score
  - `score` is the computed relevance score

### /reverse?lat=latValue&lon=lonValue&sources=filterPattern (GET)

Performs *reverse* geocoding at the given point. Requires at least the `lat` and `lon` parameters which is the location that'll be searched in the geocoding sources. The query supports an optional `sources` allowing users to only perform reverse geocoding in matching sources. The source matching is based on [minimatch](https://github.com/isaacs/minimatch#minimatch). Some providers could support additional parameters:
  - `limit` the number of maximum items to get in the response
  - `distance` the maximum distance of items to be included in the response (useful for nearby location query not much for point in polygon query)

The query returns the list of matching features, as an array. The service also add to each feature and additional `geokoder` object containing the following fields:
  - `source` specifies in which source this feature was found

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

You can build a sample MBTiles with sources from [French API Géo](https://github.com/etalab/api-geo) for testing purpose using the provided script after you installed [tippecanoe](https://github.com/mapbox/tippecanoe).

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
