import _ from 'lodash'
import makeDebug from 'debug'
import { minimatch } from 'minimatch'

const debug = makeDebug('geokoder:providers:kano')

export async function createKanoProvider (app) {
  const providers = app.get('providers')
  const config = _.get(providers, 'Kano')
  if (!config) { return null }

  const apiPath = app.get('apiPath')
  
  // Use the catalog service to build a list of sources (ie. feature services we can use)
  async function getSources () {
    const sources = []
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
          sources.push({ name: `kano:${collection}`, collection, keys: featureLabels })
        })
      }
      debug(`Kano provider: found ${sources.length} sources`)
    } catch (error) {
      debug(error)
    }
    return sources
  }

  return {
    name: 'Kano',

    async capabilities () {
      const sources = await getSources()
      const caps = sources.map((source) => source.name)
      return caps
    },

    async forward (search, filter) {
      const sources = await getSources()
      const matchingSources = sources.filter((source) => minimatch(source.name, filter))

      // issue requests to discovered services
      const requests = []
      debug(`requesting ${matchingSources.length} matching sources`, _.map(matchingSources, 'name'))
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

    async reverse ({ lat, lon, filter, distance, limit }) {
      const sources = await getSources()
      const matchingSources = sources.filter((source) => minimatch(source.name, filter))

      const requests = []
      debug(`requesting ${matchingSources.length} matching sources`, _.map(matchingSources, 'name'))
      for (const source of matchingSources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const query = { latitude: lat, longitude: lon, distance }
          if (!_.isNil(limit)) query.$limit = limit
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
        debug(`retrieved ${features.length} features from source ${source.name}`)
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
