import _ from 'lodash'
import makeDebug from 'debug'
import { minimatch } from 'minimatch'
import MBTiles from '@mapbox/mbtiles'
import vtquery from '@mapbox/vtquery'
import zlib from 'zlib'
import { long2tile, lat2tile } from '../utils.js'

// http://localhost:8080/reverse?lat=43.31091&lon=1.94750

const debug = makeDebug('geokoder:providers:mbtiles')

export async function createMBTilesProvider (app) {
  const providers = app.get('providers')
  const config = _.get(providers, 'MBTiles')
  if (!config) { return null }

  const datasets = []
  _.keys(config).forEach(async (key) => {
    const conf = config[key]
    const mbtiles = await new Promise((resolve, reject) => {
      return new MBTiles(`${conf.filepath}?mode=ro`, (err, mbtiles) => {
        debug(`Loaded ${conf.filepath}`)
        if (err) reject(err)
        else resolve(mbtiles)
      })
    })
    const metadata = await new Promise((resolve, reject) => {
      mbtiles.getInfo((err, info) => {
        if (err) reject(err)
        else resolve(info)
      })
    })
    debug(`Metadata for ${conf.filepath}`, metadata)
    datasets.push({
      name: key,
      mbtiles,
      layers: metadata.vector_layers.filter(layer => conf.layers.includes(layer.id))
    })
  })

  debug(`MBTiles provider: found ${datasets.length} datasets`)

  return {
    name: 'MBTiles',

    capabilities () {
      return _.reduce(datasets,
        (sources, dataset) => sources.concat(dataset.layers.map(layer => `${dataset.name}:${layer.id}`)),
        [])
    },

    async reverse ({ lat, lon, filter, distance, limit }) {
      const matchingDatasets = datasets.filter(dataset => {
        // Check if dataset has at least a matching layer
        for (const layer of dataset.layers) {
          const name = `${dataset.name}:${layer.id}`
          if (minimatch(name, filter || '*')) return true
        }
        return false
      })

      let responses = []
      debug(`Requesting ${matchingDatasets.length} matching datasets`, _.map(matchingDatasets, 'name'))
      for (const dataset of matchingDatasets) {
        // Find tile for position
        // FIXME: we assume the same zoom level for all layers
        const z = _.get(dataset, 'layers[0].maxzoom')
        const x = long2tile(lon, z)
        const y = lat2tile(lat, z)
        // Load tile
        const gzip = await new Promise((resolve, reject) => {
          dataset.mbtiles.getTile(z, x, y, (err, data, headers) => {
            debug(`Retrieved tile ${x}, ${y}, ${z} for location (${lon}, ${lat})`)
            if (err) reject(err)
            else resolve(data)
          })
        })
        // For debug purpose
        // fs.writeFileSync('test.mvt.gz', gzip)
        const data = await new Promise((resolve, reject) => {
          zlib.unzip(gzip, (err, data) => {
            if (err) reject(err)
            else resolve(data)
          })
        })
        // For debug purpose
        // fs.writeFileSync('test.mvt', data)
        // Take filter into account
        const layers = dataset.layers.filter(layer => minimatch(`${dataset.name}:${layer.id}`, filter)).map(layer => layer.id)
        // Defaults to "point in polygon" query, otherwise specify a distance to search for nearby locations
        const radius = _.isNil(distance) ? 0 : distance
        limit = _.isNil(limit) ? 10 : limit
        debug(`Requesting layers ${layers} with radius ${radius} and limit ${limit}`)
        // Then return a feature
        const geoJson = await new Promise((resolve, reject) => {
          vtquery([{
            buffer: data, x, y, z
          }], [lon, lat], {
            radius, limit, layers
          }, (err, result) => {
            if (err) reject(err)
            else resolve(result)
          })
        })
        const features = geoJson.features.map(feature => {
          const source = `${dataset.name}:${_.get(feature, 'properties.tilequery.layer')}`
          return Object.assign({ source }, { feature: _.omit(feature, ['properties.tilequery']) })
        })
        responses = responses.concat(features)
        debug(`Retrieved ${features.length} features from dataset ${dataset.name}`)
      }
      return responses
    }
  }
}
