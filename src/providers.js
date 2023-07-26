import _ from 'lodash'
import makeDebug from 'debug'
import fetch from 'node-fetch'
import NodeGeocoder from 'node-geocoder'

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
    capabilities () {
      return [
        { name: 'kano', source: sources.map((source) => source.name) }
      ]
    },

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
        for (const feature of features) {
          const name = _.get(feature, source.keys[0])
          response.push({
            provider: 'kano',
            source: source.name,
            match: name,
            // TODO: might not be this one
            matchProp: source.keys[0],
            // omit internal _id prop
            feature: _.omit(feature, [ '_id' ]),
          })
        }
      }

      return response
    },

    async reverse ({ lat, lon }) {
      const point = { type: 'Feature', geometry: { type: 'Point', coordinates: [ lon, lat ] } }

      let requests = []
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
          const name = _.get(feature, source.keys[0])
          response.push({
            provider: 'kano',
            source: source.name,
            // omit internal _id prop
            feature: _.omit(feature, [ '_id' ]),
          })
        }
      }

      return response
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
    capabilities () {
      return [
        { name: 'opendatafrance', source: [ 'municipality', 'locality', 'street', 'housenumber' ] },
        { name: 'openstreetmap', source: [ 'default' ] }
      ]
    },

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
          const feat = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
          const norm = {
            provider: entry.provider,
            source: entry.type,
            feature: feat
          }
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
          return norm
        } else if (entry.provider === 'openstreetmap') {
          const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
          const feat = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
          const norm = {
            provider: entry.provider,
            source: entry.type,
            feature: feat
          }
          norm.matchProp = 'foo'
          norm.match = _.get(entry, norm.matchProp, 'foo')
          return norm
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
          const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
          const feat = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
          const norm = {
            provider: entry.provider,
            source: entry.type,
            feature: feat
          }
          return norm
        } else if (entry.provider === 'openstreetmap') {
          const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
          const feat = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
          const norm = {
            provider: entry.provider,
            source: entry.type,
            feature: feat
          }
          return norm
        } else {
          debug(`Don't know how to normalize results from provider '${entry.provider}'`)
        }

        return entry
      })
    }
  }
}
