import _ from 'lodash'
import makeDebug from 'debug'
import fetch from 'node-fetch'
import NodeGeocoder from 'node-geocoder'
import { scoreResult } from './scoring.js'

const debug = makeDebug('geokoder:providers')

export async function createKanoProvider (app) {
  const apiPath = app.get('apiPath')

  // use the catalog service to build a list of sources (ie. feature services we can use)
  let sources = []
  try {
    const catalog = app.service(`${apiPath}/catalog`)
    if (catalog) {
      // we need layers with 'service' or 'probeService' and 'featureLabel' properties
      const layers = await catalog.find(
        { paginate: false, query:
          { $and: [
            { $or: [{ service: { $exists: true } }, { probeService: { $exists: true } }] },
            { featureLabel: { $exists: true } }
          ] }
        })
      layers.forEach((layer) => {
        // use probeService in priority when available
        const collection = _.get(layer, 'probeService', layer.service)
        // featureLabel refers to feature properties
        const featureLabels = _.castArray(layer.featureLabel).map((prop) => `properties.${prop}`)
        sources.push({ name: layer.name, collection, keys: featureLabels })
      })
    }
  } catch (error) {
    debug(error)
  }

  debug(`Kano provider: found ${sources.length} sources`)

  return {
    async forward (search) {
      // issue requests to discovered services
      let requests = []
      for (const source of sources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const searches = source.keys.map((key) => { return { [key]: { $search: search } } })
          const query = source.keys.length === 1 ? searches[0] : { $or: searches }
          const request = service.find({ query })
          request.source = source
          requests.push(request)
        } catch (error) {}
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

        const features = _.get(result.value, 'type') === 'FeatureCollection' ? result.value.features : [ result.value ]
        for (const feature of features) {
          const name = _.get(feature, source.keys[0])
          response.push({
            provider: 'kano',
            source: source.name,
            name,
            location: feature.geometry.coordinates,
            score: scoreResult(search.toUpperCase(), name.toUpperCase())
          })
        }
      }

      response.sort((a, b) => { return a.score < b.score ? 1 : a.score > b.score ? -1 : 0 })
      return response
    },

    async reverse ({ lat, lon }) {
      const point = { type: 'Feature', geometry: { type: 'Point', coordinates: [ lon, lat ] } }

      let requests = []
      for (const source of sources) {
        try {
          const service = app.service(`${apiPath}/${source.collection}`)
          const query = { latitude: lat, longitude: lon, distance: 1 }
          const request = service.find({ query })
          request.source = source
          requests.push(request)
        } catch (error) {}
      }

      // const response = []
      const results = await Promise.allSettled(requests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        const source = requests[i].source
        if (result.status !== 'fulfilled') {
          // skip failed results
          debug(`request to ${source.collection} failed: ${result.reason}`)
          continue
        }

        const features = _.get(result.value, 'type') === 'FeatureCollection' ? result.value.features : [ result.value ]
        /*
        for (const feature of features) {
          const name = _.get(feature, source.keys[0])
          response.push({
            provider: 'kano',
            source: source.name,
            name,
            location: feature.geometry.coordinates,
            score: scoreResult(search.toUpperCase(), name.toUpperCase())
          })
        }
        */
      }

      // response.sort((a, b) => { return a.score < b.score ? 1 : a.score > b.score ? -1 : 0 })
      // return response

      return features
    }
  }
}

export async function createNodeGeocoderProvider (app) {
  const config = app.get('geocoders')
  const geocoders = []
  config.forEach((conf) => {
    const sup = {}
    if (conf.headers) {
      sup.fetch = (url, options) => {
        return fetch(url, { ...options, headers: conf.headers })
      }
    }
    geocoders.push(NodeGeocoder(Object.assign({}, conf, sup)))
  })

  return {
    async forward (search) {
      const requests = []
      geocoders.forEach((geocoder) => {
        requests.push(geocoder.geocode(search))
      })

      const response = []
      const results = await Promise.allSettled(requests)
      results.forEach((result) => {
        if (result.status !== 'fulfilled') {
          return
        }

        response.splice(-1, 0, ...result.value)
      })

      return response.map((entry) => {
        // 'normalize' response
        if (entry.provider === 'opendatafrance') {
          // https://adresse.data.gouv.fr/api-doc/adresse
          const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
          const feat = { type: 'Feature', properties: props, geometry: { coordinates: [ entry.longitude, entry.latitude ] } }
          const norm = {
            provider: 'node-geocoder',
            source: entry.provider,
            name: entry.type === 'municipality' ? entry.city : entry.type === 'street' ? entry.streetName : 'foo',
            location: feat.geometry.coordinates
          }
          // return norm
        } else if (entry.provider === 'openstreetmap') {
        } else {
          debug(`Don't know how to normalize results from provider '${entry.provider}'`)
        }

        return entry
      })
    },

    async reverse ({ lat, lon }) {
      const requests = []
      geocoders.forEach((geocoder) => {
        requests.push(geocoder.reverse({ lat, lon }))
      })

      const response = []
      const results = await Promise.allSettled(requests)
      results.forEach((result) => {
        if (result.status !== 'fulfilled') {
          return
        }

        response.splice(-1, 0, ...result.value)
      })

      return response.map((entry) => {
        // 'normalize' response
        if (entry.provider === 'opendatafrance') {
          // https://adresse.data.gouv.fr/api-doc/adresse
        } else if (entry.provider === 'openstreetmap') {
        } else {
          debug(`Don't know how to normalize results from provider '${entry.provider}'`)
        }

        return entry
      })
    }
  }
}
