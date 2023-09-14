import _ from 'lodash'
import makeDebug from 'debug'
import { minimatch } from 'minimatch'
import fetch from 'node-fetch'
import NodeGeocoder from 'node-geocoder'
import { getMappedName } from '../utils.js'

const debug = makeDebug('geokoder:providers:node-geocoder')

export async function createNodeGeocoderProvider (app) {
  const config = app.get('NodeGeocoder')
  const renames = app.get('renames')

  const geocoders = []
  config.forEach((conf) => {
    const sup = {}
    if (conf.headers) {
      sup.fetch = (url, options) => {
        return fetch(url, { ...options, headers: conf.headers })
      }
    }

    const internalName = conf.provider
    geocoders.push({ name: getMappedName(renames, internalName), internalName, impl: NodeGeocoder(Object.assign({}, conf, sup)) })
  })

  debug(`NodeGeocoder provider: found ${geocoders.length} geocoders`)

  return {
    name: 'NodeGeocoder',

    capabilities () {
      const caps = geocoders.map((geocoder) => geocoder.name)
      return caps
    },

    async forward (search, filter) {
      const matchingSources = geocoders.filter(geocoder => minimatch(geocoder.name, filter))

      const requests = []
      // issue requests to geocoders
      debug(`requesting ${matchingSources.length} matching sources`, matchingSources)
      for (const geocoder of matchingSources) {
        const request = geocoder.impl.geocode(search)
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
          debug(`request to ${source.internalName} failed: ${result.reason}`)
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

    async reverse ({ lat, lon, filter }) {
      const matchingSources = geocoders.filter(geocoder => minimatch(geocoder.name, filter))

      const requests = []
      // issue requests to geocoders
      debug(`requesting ${matchingSources.length} matching sources`, matchingSources)
      for (const geocoder of matchingSources) {
        const request = geocoder.impl.reverse({ lat, lon })
        request.source = geocoder
        requests.push(request)
      }

      const response = []
      const results = await Promise.allSettled(requests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        const source = requests[i].source
        if (result.status !== 'fulfilled') {
          return
        }

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
