# geokoder

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/geokoder?sort=semver&label=latest)](https://github.com/kalisio/geokoder/releases)
[![CI](https://github.com/kalisio/geokoder/actions/workflows/main.yaml/badge.svg)](https://github.com/kalisio/geokoder/actions/workflows/main.yaml)
[![Code Climate](https://codeclimate.com/github/kalisio/geokoder/badges/gpa.svg)](https://codeclimate.com/github/kalisio/geokoder)
[![Test Coverage](https://codeclimate.com/github/kalisio/geokoder/badges/coverage.svg)](https://codeclimate.com/github/kalisio/geokoder/coverage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Kalisio geocoder service**

**geokoder** is a service that let you perform forward and reverse geocoding in various sources exposed by a provider. The following providers are currently supported:
  * `Kano` to expose [Kano](https://kalisio.github.io/kano/) catalog layers as sources,
  * `NodeGeocoder` to expose [node-geocoder](https://nchaulet.github.io/node-geocoder/) providers as sources,
  * `MBTiles` to expose layers from [MBTiles](https://wiki.openstreetmap.org/wiki/MBTiles) as sources.
  * `Geokoder` to proxy request to another geokoder instance, exposing the proxied sources locally with a prefix.
  
## API

### /healthcheck (GET)

Checks for the health of the service, returns a json object with the name of the service (geokoder) and it's version number.

### /capabilities/:operation (GET)

Returns the list of available geocoding sources according to the target operation, as an array. Available operations are:
* `forward` for forward geocoding
* `reverse` for reverse geocoding

### /forward?q=searchString[&sources=filterPattern][&viewbox=lon1,lat1,lon2,lat2][&limit=10] (GET)

Performs *forward* geocoding. Requires at least the `q` parameter which is the string that'll be searched in the geocoding sources.
Additional query parameters include:
  - `sources`: allows users to only perform geocoding in matching sources. The source matching is based on [minimatch](https://github.com/isaacs/minimatch#minimatch).
  - `viewbox`: specify a bounding box to restrict returned matching features. Any two corner points of the box are accepted as long as they make a proper box, but it needs to be ordered `lon,lat,lon,lat`.
  - `limit`: limit the number of results returned **per source**. That means if you have a total of `5` sources and you query using a limit of `2`, you'll get at most 10 results.

> [!NOTE]
> The `NodeGeocoder` sources (`opendatafrance`, `openstreetmap`, ...) use a limit of 10 results per source by default if none is specified in the query.

The query returns the list of matching features, as an array. Each feature is given a relevance score, and the returned array is sorted based on this value. The service also add to each feature and additional `geokoder` object containing the following fields:
  - `source` specifies in which source this feature was found
  - `match` indicates which string value was used to compute relevance score
  - `matchProp` indicates which feature property was used to to compute relevance score
  - `score` is the computed relevance score

### /reverse?lat=latValue&lon=lonValue&sources=filterPattern (GET)

Performs *reverse* geocoding at the given point. Requires at least the `lat` and `lon` parameters which is the location that'll be searched in the geocoding sources.
Additional query parameters include:
  - `sources`: allows users to only perform reverse geocoding in matching sources. The source matching is based on [minimatch](https://github.com/isaacs/minimatch#minimatch).
  - `limit` the number of maximum items to get in the response
  - `distance` the maximum distance of items to be included in the response (useful for nearby location query not much for point in polygon query)

The query returns the list of matching features, as an array. The service also add to each feature and additional `geokoder` object containing the following fields:
  - `source` specifies in which source this feature was found

## Configuring

### local.cjs

By default, **geokoder** does not expose any sources. You are responsible to write a `local.cjs` file to declare the different sources you want to expose.

Here is an example file that exposes all the sources from the **Kano** provider, `opendatafrance` from the **NodeGeocoder** provider, `api-geo` dataset sources from the **MBTiles** provider and all the sources matching `*hubeau*` from a remote geokoder instance:

```js
module.exports = {
  providers: {
    Kano: {},
    NodeGeocoder: {
      opendatafrance: true
    },
    MBTiles: {
      'api-geo': { filepath: '/mnt/data/api-geo-5m.mbtiles', layers: ['communes5m', 'epci5m', 'departements5m', 'regions5m'] }
    },
    Geokoder: {
      'some-name': { url: 'https://some.remote.url/blabla', filter: '*hubeau*', headers: { 'Authorization': 'Bearer eyblablablablablabla' } }
    }
  }
}
```

#### Kano

For now, each layer in the catalog exposing the `featureLabel` property will be taken into account. This property can be a single string value or an array of strings to target multiple fields.

#### NodeGeocoder

Each key is a geocoder to instanciate in [node-geocoder](https://github.com/nchaulet/node-geocoder). If value is false-ish, it won't be instanciated. If you'd like to pass additional options to the geocoder instance then it could be an object containing the options.

```js
NodeGeocoder: {
  opendatafrance: true,
  openstreetmap: false
}
```

#### MBtiles

Each key will be a new dataset based on the provided file and exposing some layers as sources such as: 

`admin-express': { filepath: path.join(__dirname, '../data/mbtiles/admin-express.mbtiles'), layers: ['commune', 'departement']`. 

> NOTE
> 
> For performance reason each layer in a dataset should have the same max zoom level, if not two different datasets should be created for now.

#### Geokoder

Each key will generate all the sources that match the defined source `filter` on the remote geokoder instance.
Eg, if you have a remote geokoder located at `https://some.remote.url/blabla` exposing sources `hubeau-hydro`, `hubeau-piezo`, `opendatafrance` and `api-geo` sources, then the following configuration:

```
'some-name': { url: 'https://some.remote.url/blabla', filter: '*hubeau*', headers: { 'Authorization': 'Bearer eyblablablablablabla' } }
```

will expose on the local geokoder `some-name:hubeau-hydro` and `some-name:hubeau-piezo` as if they were local sources.

### i18n

**geokoder** allows you to declare **i18n** files which can be used to name the different exposed sources in an understandable way. This description is returned within an `i18n` object when requestring the capabilities.

An i18n file consists in a javascript file strucuted as below: 

```js
module.exports = {
  i18n: {
    fr: {
      Geocoders: {
        'kano:hubeau-hydro-stations': 'Hub\'Eau Hydrométrie',
        'kano:hubeau-piezo-stations': 'Hub\'Eau Piezométrie',
        'kano:icos-stations': 'Réseau ICOS',
        'opendatafrance': 'BAN'
        // ... 
      }
    },
    en: {
      Geocoders: {     
        'kano:hubeau-hydro-stations': 'Hub\'Eau Hydrometry',
        'kano:hubeau-piezo-stations': 'Hub\'Eau Piezometry',        
        'kano:icos-stations': 'ICOS Network',
        'opendatafrance': 'BAN'
        // ...
      }
    }
  }
}
```

### Environment variables

Here are the environment variables you can use to customize the service:

| Variable  | Description | Defaults |
|-----------| ------------| ------------|
| `PORT` | The port to be used when exposing the service |  `8080` |
| `HOSTNAME` | The hostname to be used when exposing the service | `localhost` |
| `BASE_URL` | The url used when exposing the service | `localhost:8080` |
| `API_PATH` | The path to the API |

> Note
>
> Most of these variables are defined for convenience in order to run the tests.

## Building

### Manual build 

You can build the image with the following command:

```bash
docker build -t <your-image-name> .
```

You can build a sample MBTiles with sources from [French API Géo](https://github.com/etalab/api-geo) for testing purpose using the provided script after you installed [tippecanoe](https://github.com/mapbox/tippecanoe).

### Automatic build

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

## License

This project is licensed under the MIT License - see the [license file](./LICENSE.md) for details

## Authors

This project is sponsored by 

![Kalisio](https://s3.eu-central-1.amazonaws.com/kalisioscope/kalisio/kalisio-logo-black-256x84.png)

