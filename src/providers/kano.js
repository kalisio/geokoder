import _ from 'lodash'
import makeDebug from 'debug'
import { minimatch } from 'minimatch'
import { getMappedName } from '../utils.js'

const debug = makeDebug('geokoder:providers')

export async function createKanoProvider (app) {
  const apiPath = app.get('apiPath')
  const renames = app.get('renames')
  // Available sources from Kano catalog
  let sources = []

  // Use the catalog service to build a list of sources (ie. feature services we can use)
  async function refreshSources () {
    sources = []
    try {
      const catalog = app.service(`${apiPath}/catalog`)
      if (catalog) {
        // we need layers with 'service' or 'probeService' and 'featureLabel' properties
        const layers = await catalog.find(
          {
            paginate: false,
            query:
            {
              $and: [
                { $or: [{ service: { $exists: true } }, { probeService: { $exists: true } }] },
                { featureLabel: { $exists: true } }
              ]
            }
          })
        layers.forEach((layer) => {
          // use probeService in priority when available
          const collection = _.get(layer, 'probeService', layer.service)
          // featureLabel refers to feature properties
          const featureLabels = _.castArray(layer.featureLabel).map((prop) => `properties.${prop}`)
          const internalName = `kano:${collection}`
          sources.push({ name: getMappedName(renames, internalName), internalName, collection, keys: featureLabels })
        })
      }
      debug(`Kano provider: found ${sources.length} sources`)
    } catch (error) {
      debug(error)
    }
  }

  app.on('service', async service => {
    // When catalog is available request sources
    if (service.path.includes('catalog')) await refreshSources()
  })

  return {
    name: 'Kano',

    capabilities () {
      const caps = sources.map((source) => source.name)
      return caps
    },

    async forward (search, filter) {
      const matchingSources = filter ? sources.filter((source) => minimatch(source.name, filter)) : sources

      // issue requests to discovered services
      const requests = []
      for (const source of matchingSources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const searches = source.keys.map((key) => { return { [key]: { $search: search } } })
          const query = source.keys.length === 1 ? searches[0] : { $or: searches }
          const request = service.find({ query })
          request.source = source
          requests.push(request)
        } catch (error) {
          debug(error)
        }
      }

      // fetch response, score them and sort by score
      const response = []
      const results = await Promise.allSettled(requests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        const source = requests[i].source
        if (result.status !== 'fulfilled') {
          // skip failed results
          debug(`request to ${source.collection} failed: ${result.reason}`)
          continue
        }

        const features = result.value.features
        debug(`request to ${source.collection}: ${features.length} results`)
        for (const feature of features) {
          const name = _.get(feature, source.keys[0])
          response.push({
            source: source.name,
            match: name,
            // TODO: might not be this one
            matchProp: source.keys[0],
            // omit internal _id prop
            feature: _.omit(feature, ['_id'])
          })
        }
      }

      return response
    },

    async reverse ({ lat, lon }) {
      const requests = []
      for (const source of sources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const query = { latitude: lat, longitude: lon, distance: 1000 }
          const request = service.find({ query })
          request.source = source
          requests.push(request)
        } catch (error) {
          debug(error)
        }
      }

      const response = []
      const results = await Promise.allSettled(requests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        const source = requests[i].source
        if (result.status !== 'fulfilled') {
          // skip failed results
          debug(`request to ${source.collection} failed: ${result.reason}`)
          continue
        }

        const features = result.value.features
        for (const feature of features) {
          response.push({
            source: source.name,
            // omit internal _id prop
            feature: _.omit(feature, ['_id'])
          })
        }
      }

      return response
    }
  }
}