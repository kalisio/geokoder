import _ from 'lodash'
import makeDebug from 'debug'
import MBTiles from '@mapbox/mbtiles'
import vtquery from '@mapbox/vtquery'
import zlib from 'zlib'
import { getMappedName, long2tile, lat2tile } from './utils.js'

// http://localhost:8080/reverse?lat=43.31091&lon=1.94750

const debug = makeDebug('geokoder:providers:mbtiles')

export async function createMBTilesProvider (app) {
  const config = app.get('MBTiles')
  const renames = app.get('renames')

  const datasets = []
  for (let i = 0; i < config.length; i++) {
    const conf = config[i]
    const internalName = conf.provider
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
      name: getMappedName(renames, internalName),
      internalName,
      mbtiles,
      layers: metadata.vector_layers.filter(layer => conf.layers.includes(layer.id))
    })
  }

  debug(`MBTiles provider: found ${datasets.length} sources`)

  return {
    capabilities () {
      const caps = datasets.map((file) => file.name)
      return caps
    },

    async forward (search, filter) {
      throw new Error('Not supported')
    },

    async reverse ({ lat, lon }) {
      let responses = []
      for (const dataset of datasets) {
        // Find tile for position
        // FIXME: we assume the same zoom level for all layers
        const z = _.get(dataset, 'layers[0].maxzoom')
        const x = long2tile(lon, z)
        const y = lat2tile(lat, z)
        // Load tile
        const gzip = await new Promise((resolve, reject) => {
          dataset.mbtiles.getTile(z, x, y, (err, data, headers) => {
            debug(`Retrieved tile ${x}, ${y}, ${z}`)
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
        // Then return a feature
        const geoJson = await new Promise((resolve, reject) => {
          vtquery([{
            buffer: data, x, y, z
          }], [lon, lat], {
            radius: 0, limit: 10, geometry: 'polygon', layers: dataset.layers.map(layer => layer.id)
          }, (err, result) => {
            if (err) reject(err)
            else resolve(result)
          })
        })
        responses = responses.concat(geoJson.features.map(feature => {
          const source = `${dataset.name}:${_.get(feature, 'properties.tilequery.layer')}`
          return Object.assign({ source }, { feature: _.omit(feature, ['properties.tilequery']) })
        }))
      }
      return responses
    }
  }
}
