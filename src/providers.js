import _ from 'lodash'
import makeDebug from 'debug'
import { minimatch } from 'minimatch'
import fetch from 'node-fetch'
import NodeGeocoder from 'node-geocoder'

const debug = makeDebug('geokoder:providers')

function getMappedName (renames, internalName) {
  let regex = null
  const mapping = renames.find((item) => {
    if (!item.regex)
      return item.from === internalName

    const r = new RegExp(item.from)
    const m = internalName.match(r)
    if (m) regex = r
    debug(`match ${item.from} on ${internalName} yields ${m ? m.join(','): 'nothing'}`)
    return m != null
  })
  if (!mapping) return internalName
  return mapping.regex ? internalName.replace(regex, mapping.to) : mapping.to
}

export async function createKanoProvider (app) {
  const apiPath = app.get('apiPath')
  const renames = app.get('renames')

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
        const internalName = `kano:${collection}`
        const mapping = renames.find((item) => item.from === internalName)
        sources.push({ name: getMappedName(renames, internalName), internalName, collection, keys: featureLabels })
      })
    }
  } catch (error) {
    debug(error)
  }

  debug(`Kano provider: found ${sources.length} sources`)

  return {
    capabilities () {
      const caps = sources.map((source) => source.name )
      return caps
    },

    async forward (search, filter) {
      const matchingSources = filter ? sources.filter((source) => minimatch(source.name, filter)) : sources

      // issue requests to discovered services
      let requests = []
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

  return {
    capabilities () {
      const caps = geocoders.map((geocoder) => geocoder.name)
      return caps
    },

    async forward (search, filter) {
      const matchingSources = filter ? geocoders.filter((source) => minimatch(source.name, filter)) : geocoders

      const requests = []
      // issue requests to geocoders
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
            const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
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
            const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
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

    async reverse ({ lat, lon }) {
      const requests = []
      geocoders.forEach((geocoder) => {
        const request = geocoder.impl.reverse({ lat, lon })
        request.source = geocoder
        requests.push(request)
      })

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
            const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
          } else if (entry.provider === 'openstreetmap') {
            const props = _.omit(entry, [ 'latitude', 'longitude', 'provider' ])
            norm.feature = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [ entry.longitude, entry.latitude ] } }
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
