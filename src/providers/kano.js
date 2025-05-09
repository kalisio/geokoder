import _ from 'lodash'
import makeDebug from 'debug'
import { stripSlashes } from '@feathersjs/commons'
import { filterSources } from '../utils.js'

const debug = makeDebug('geokoder:providers:kano')

export async function createKanoProvider (app) {
  const providers = app.get('providers')
  const config = _.get(providers, 'Kano')
  if (!config) { return null }
  const services = config.services || {}

  const apiPath = app.get('apiPath')

  // Use the catalog service to build a list of sources (ie. feature services we can use)
  async function getSources () {
    const sources = []
    try {
      // Try to use any catalog service available
      if (app.services[stripSlashes(`${apiPath}/catalog`)]) {
        debug('Seeking for sources in catalog')
        const catalogService = app.service(`${apiPath}/catalog`)
        // we need layers with 'service' or 'probeService' and 'featureLabel' properties
        const layers = await catalogService.find({
          paginate: false,
          query: {
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
          // Make sure we don't already expose a source from the same collection
          const known = sources.find((src) => src.collection === collection)
          if (!known) {
            sources.push({ name: `kano:${collection}`, collection, keys: featureLabels })
          }
        })
      }
      // Otherwise try to retrieve available services as if they are
      // authorized in the distribution config it should be exposed
      debug('Seeking for sources in app services')
      const servicePaths = Object.keys(app.services)
      servicePaths.forEach(path => {
        const service = app.service(path)
        // Do not expose catalog or local internal services
        if (!service.remote || (path === stripSlashes(`${apiPath}/catalog`))) return
        const serviceName = stripSlashes(path).replace(stripSlashes(apiPath) + '/', '')
        const configName = _.replace(serviceName, /^.*\//g, '*/')
        // Check if already exposed as a layer
        if (_.find(sources, { name: `kano:${serviceName}` })) return
        // Check if defined in the config
        if (_.every(config.services, (value, key) => {
          return (key !== configName)
        })) return
        if (_.find(sources, { name: `kano:${serviceName}` })) return
        // Retrieve keys from service config
        // FIXME might be automated with https://github.com/kalisio/feathers-distributed/issues/125
        const keys = _.get(services[configName], 'featureLabel', ['properties.name'])
        const baseQuery = _.get(services[configName], 'baseQuery')
        sources.push({ name: `services:${serviceName}`, collection: serviceName, keys, baseQuery })
      })
      debug(`Kano provider: found ${sources.length} sources`, _.map(sources, 'name'))
    } catch (error) {
      debug(error)
    }
    return sources
  }

  return {
    name: 'Kano',

    async capabilities ({ operation }) {
      const sources = await getSources()
      const caps = sources.map((source) => source.name)
      return caps
    },

    async forward ({ search, filter, limit, viewbox }) {
      const sources = await getSources()
      const matchingSources = filterSources(sources, filter)

      // issue requests to discovered services
      const requests = []
      debug(`Requesting ${matchingSources.length} matching sources`, _.map(matchingSources, 'name'))
      for (const source of matchingSources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const searches = source.keys.map((key) => { return { [key]: { $search: search } } })
          const query = source.keys.length === 1 ? searches[0] : { $or: searches }
          if (!_.isNil(limit)) query.$limit = limit
          if (!_.isNil(viewbox)) Object.assign(query, { south: viewbox.minLat, north: viewbox.maxLat, west: viewbox.minLon, east: viewbox.maxLon })
          if (!_.isNil(source.baseQuery)) Object.assign(query, source.baseQuery)
          debug(`Requesting source ${source.name} with query`, query)
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
          debug(`Request to ${source.collection} failed:`, result.reason)
          continue
        }

        const features = result.value.features
        debug(`Request to ${source.collection}: ${features.length} results`)
        for (const feature of features) {
          const name = _.get(feature, source.keys[0])
          response.push({
            source: _.replace(source.name, /^services:.*\//g, 'services:*/'),
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
      const matchingSources = filterSources(sources, filter)

      const requests = []
      debug(`Requesting ${matchingSources.length} matching sources`, _.map(matchingSources, 'name'))
      for (const source of matchingSources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const query = { latitude: lat, longitude: lon, distance }
          if (!_.isNil(limit)) query.$limit = limit
          debug(`Requesting source ${source.name} with query`, query)
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
          debug(`Request to ${source.collection} failed:`, result.reason)
          continue
        }

        const features = result.value.features
        debug(`Retrieved ${features.length} features from source ${source.name}`)
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
