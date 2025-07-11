import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import makeDebug from 'debug'
import NodeGeocoder from 'node-geocoder'
import { filterSources } from '../utils.js'

const debug = makeDebug('geokoder:providers:node-geocoder')

export async function createNodeGeocoderProvider (app) {
  const providers = app.get('providers')
  const config = _.get(providers, 'NodeGeocoder')
  if (!config) { return null }

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const packageInfo = fs.readJsonSync(path.join(__dirname, '..', '..', 'package.json'))

  const geocoders = []
  _.keys(config).forEach((key) => {
    if (config[key]) {
      // If not simply is enalbed/disabled flag then we might have additional options for geocoder
      const sup = (typeof config[key] === 'object' ? config[key] : {})
      if (key === 'openstreetmap') {
        // openstreetmap geocoder require either a valid HTTP-referer or User-Agent
        // see https://operations.osmfoundation.org/policies/nominatim/
        sup.fetch = (url, options) => {
          return fetch(url, { ...options, headers: { 'user-agent': `geokoder/${packageInfo.version}` } })
        }
      }

      geocoders.push({ name: key, impl: NodeGeocoder(Object.assign({ provider: key }, sup)) })
    }
  })

  debug(`NodeGeocoder provider: found ${geocoders.length} geocoders`)

  return {
    name: 'NodeGeocoder',

    capabilities ({ operation }) {
      const caps = geocoders.map((geocoder) => geocoder.name)
      return caps
    },

    async forward ({ search, filter, limit, viewbox }) {
      const matchingSources = filterSources(geocoders, filter)

      const requests = []
      // issue requests to geocoders
      debug(`Requesting ${matchingSources.length} matching sources`, _.map(matchingSources, 'name'))
      for (const geocoder of matchingSources) {
        let query = {}
        if (geocoder.name === 'openstreetmap') {
          query.q = search
          if (!_.isNil(limit)) query.limit = limit
          if (!_.isNil(viewbox)) {
            // make a viewbox bounded query
            // cf. https://nominatim.org/release-docs/latest/api/Search/#result-restriction
            query.viewbox = `${viewbox.minLon},${viewbox.minLat},${viewbox.maxLon},${viewbox.maxLat}`
            query.bounded = 1
          }
        } else if (geocoder.name === 'opendatafrance') {
          query.address = search
          if (!_.isNil(limit)) query.limit = limit
          if (!_.isNil(viewbox)) {
            // use lat,lon to focus in the viewbox
            // cf. https://adresse.data.gouv.fr/api-doc/adresse
            query.lat = viewbox.minLat + ((viewbox.maxLat - viewbox.minLat) / 2)
            query.lon = viewbox.minLon + ((viewbox.maxLon - viewbox.minLon) / 2)
          }
        } else {
          query = search
        }
        debug(`Requesting impl ${geocoder.name} with query`, query)
        const request = geocoder.impl.geocode(query)
        request.source = geocoder
        requests.push(request)
      }

      // wait for response and normalize results
      const response = []
      const results = await Promise.allSettled(requests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        const source = requests[i].source
        if (result.status !== 'fulfilled') {
          // skip failed results
          debug(`Request to ${source.name} failed:`, result.reason)
          continue
        }

        for (const entry of result.value) {
          // 'normalize' response
          const norm = { source: source.name }
          if (entry.provider === 'opendatafrance') {
            // https://adresse.data.gouv.fr/api-doc/adresse
            const props = _.omit(entry, ['latitude', 'longitude', 'provider'])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [entry.longitude, entry.latitude] } }
            if (entry.type === 'municipality') {
              norm.matchProp = 'city'
            } else if (entry.type === 'locality') {
              norm.matchProp = 'streetName'
            } else if (entry.type === 'street') {
              norm.matchProp = 'streetName'
            } else if (entry.type === 'housenumber') {
              norm.matchProp = 'streetName'
            }
            norm.match = _.get(entry, norm.matchProp, 'foo')
          } else if (entry.provider === 'openstreetmap') {
            const props = _.omit(entry, ['latitude', 'longitude', 'provider'])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [entry.longitude, entry.latitude] } }
            norm.matchProp = 'formattedAddress'
            norm.match = _.get(entry, norm.matchProp, 'foo')
          } else {
            debug(`Don't know how to normalize results from provider '${entry.provider}'`)
          }
          response.push(norm)
        }
      }

      return response
    },

    async reverse ({ lat, lon, filter, limit }) {
      const matchingSources = filterSources(geocoders, filter)

      const requests = []
      // issue requests to geocoders
      debug(`Requesting ${matchingSources.length} matching sources`, _.map(matchingSources, 'name'))
      for (const geocoder of matchingSources) {
        const query = { lat, lon }
        if (!_.isNil(limit)) query.limit = limit
        const request = geocoder.impl.reverse(query)
        request.source = geocoder
        requests.push(request)
      }

      const response = []
      const results = await Promise.allSettled(requests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        const source = requests[i].source
        if (result.status !== 'fulfilled') {
          // skip failed results
          debug(`Request to ${source.name} failed:`, result.reason)
          continue
        }

        debug(`retrieved ${result.value.length} entries from source ${source.name}`)
        for (const entry of result.value) {
          // 'normalize' response
          const norm = { source: source.name }
          if (entry.provider === 'opendatafrance') {
            // https://adresse.data.gouv.fr/api-doc/adresse
            const props = _.omit(entry, ['latitude', 'longitude', 'provider'])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [entry.longitude, entry.latitude] } }
          } else if (entry.provider === 'openstreetmap') {
            const props = _.omit(entry, ['latitude', 'longitude', 'provider'])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [entry.longitude, entry.latitude] } }
          } else {
            debug(`Don't know how to normalize results from provider '${entry.provider}'`)
          }

          response.push(norm)
        }
      }

      return response
    }
  }
}
