# geokoder

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/geokoder?sort=semver&label=latest)](https://github.com/kalisio/geokoder/releases)
[![CI](https://github.com/kalisio/geokoder/actions/workflows/main.yaml/badge.svg)](https://github.com/kalisio/geokoder/actions/workflows/main.yaml)
[![Quality Gate Status](https://sonar.portal.kalisio.com/api/project_badges/measure?project=kalisio-geokoder&metric=alert_status&token=sqb_6dfe76ab4298a1833ec9e5f3610ca5fe0064eafb)](https://sonar.portal.kalisio.com/dashboard?id=kalisio-geokoder)
[![Maintainability Issues](https://sonar.portal.kalisio.com/api/project_badges/measure?project=kalisio-geokoder&metric=software_quality_maintainability_issues&token=sqb_6dfe76ab4298a1833ec9e5f3610ca5fe0064eafb)](https://sonar.portal.kalisio.com/dashboard?id=kalisio-geokoder)
[![Coverage](https://sonar.portal.kalisio.com/api/project_badges/measure?project=kalisio-geokoder&metric=coverage&token=sqb_6dfe76ab4298a1833ec9e5f3610ca5fe0064eafb)](https://sonar.portal.kalisio.com/dashboard?id=kalisio-geokoder)
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
  - `limit`: limit the number of results returned. If not provided in the query it'll use the value defined in the `paginate.default.forward` config key. It's also capped using the `paginate.max.forward` value.

> [!NOTE]
> The `NodeGeocoder` sources (`opendatafrance`, `openstreetmap`, ...) use a limit of 10 results per source by default if none is specified in the query.

The query returns the list of matching features, as an array. Each feature is given a relevance score, and the returned array is sorted based on this value. The service also add to each feature and additional `geokoder` object containing the following fields:
  - `source` specifies in which source this feature was found
  - `match` indicates which string value was used to compute relevance score
  - `matchProp` indicates which feature property was used to to compute relevance score
  - `score` is the computed relevance score. This score is included in the `[0, 1]` range, with `1.0` being the most relevant result. The score computation is based on the [Jaro-Winkler distance](https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance).

### /reverse?lat=latValue&lon=lonValue&sources=filterPattern (GET)

Performs *reverse* geocoding at the given point. Requires at least the `lat` and `lon` parameters which is the location that'll be searched in the geocoding sources.
Additional query parameters include:
  - `sources`: allows users to only perform reverse geocoding in matching sources. The source matching is based on [minimatch](https://github.com/isaacs/minimatch#minimatch).
  - `distance` the maximum distance of items to be included in the response (useful for nearby location query not much for point in polygon query)
  - `limit`: limit the number of results in the response. If not provided in the query it'll use the value defined in the `paginate.default.reverse` config key. It's also capped using the `paginate.max.reverse` value.

The query returns the list of matching features, as an array. Each feature is given a relevance score, and the returned array is sorted based on this value. The service also add to each feature and additional `geokoder` object containing the following fields:
  - `source` specifies in which source this feature was found
  - `distance` indicates the distance between the query location and the feature (currently only computed when the feature is a point).
  - `score` is the computed relevance score. This score is included in the `[0, 1]` range, with `1.0` being the most relevant result. The score computation is based on the feature distance to the query location.

## Configuring

### local.cjs

By default, **geokoder** does not expose any sources. You are responsible to write a `local.cjs` file to declare the different sources you want to expose.

Here is an example file that exposes all the sources from the **Kano** provider, `opendatafrance` from the **NodeGeocoder** provider, `api-geo` dataset sources from the **MBTiles** provider and all the sources matching `*hubeau*` from a remote geokoder instance:

```js
module.exports = {
  providers: {
    Kano: {
      catalogFilter: 'hubeau-*'
    },
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

Each layer in the `catalog` service exposing the `featureLabel` property will be taken into account. This property can be a single string value or an array of strings to target multiple fields.

These *catalog* layers can be filtered using the configuration key `catalogFilter`. This string is a [minimatch](https://github.com/isaacs/minimatch#minimatch) expression, the layer's service name will be matched against the expression.

``` js
Kano: {
  catalogFilter: 'hubeau-*'
}
```

In addition to using exposed **Kano** layers from the `catalog` service, it is also possible to use additional distributed services. Services are declared using the following formalism:

```js
services: {
  'service_name': {
     featureLabel: ['properties.fiel_name'],  // Default value is ['properties.name']
     baseQuery: { query }  // Default value is undefined
  }
}
```

> [!NOTE]
> When dealing with [KDK](https://kalisio.github.io/kdk/)-based applications and wanting to use contextual distributed services, you need to declare the services such as the following example:
> ```js
> services: {
>   '*/measures': {
>      featureLabel: ['properties.location']
>   }
> }
> ```

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

> [!NOTE]
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

> [!NOTE]
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

