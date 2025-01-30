import _ from 'lodash'
import fetch from 'node-fetch'
import makeDebug from 'debug'
import { minimatch } from 'minimatch'

const debug = makeDebug('geokoder:providers:geokoder')

export async function createGeokoderProvider (app) {
  const providers = app.get('providers')
  const config = _.get(providers, 'Geokoder')
  if (!config) { return null }

  const proxies = []
  _.keys(config).forEach(async (key) => {
    const conf = config[key]

    debug(`new proxy: ${key} @ ${conf.url}`)
    proxies.push({
      name: key,
      url: conf.url,
      filter: conf.filter || '*',
      headers: conf.headers
    })
  })

  debug(`found ${proxies.length} proxies`)

  async function getSources (op) {
    const sources = []
    const allReqs = []
    for (const proxy of proxies) {
      const promise = fetch(`${proxy.url}/capabilities/${op}`, { headers: proxy.headers })
        .then((response) => {
          if (response.ok) { return response.json() }
          throw new Error(`Capability query failed on proxy ${proxy.name} : fetch status is ${response.status}`)
        }).then((json) => {
          for (const source of json.geocoders) {
            if (minimatch(source, proxy.filter)) {
              sources.push({ name: `${proxy.name}:${source}`, upstreamName: source, proxy })
            }
          }
        }).catch((error) => {
          debug(error)
        })
      allReqs.push(promise)
    }

    await Promise.allSettled(allReqs)
    return sources
  }

  return {
    name: 'Geokoder',

    async capabilities ({ operation }) {
      const sources = await getSources(operation)
      return sources.map((source) => source.name)
    },

    async forward ({ search, filter, limit, viewbox }) {
      const sources = await getSources('forward')
      const matchingSources = sources.filter((source) => minimatch(source.name, filter))

      // group queries by proxy
      const groupedQueries = {}
      for (const source of matchingSources) {
        if (groupedQueries[source.proxy.name] === undefined) groupedQueries[source.proxy.name] = { proxy: source.proxy, filter: source.upstreamName }
        else groupedQueries[source.proxy.name].filter += `|${source.upstreamName}`
      }

      const limitParam = !_.isNil(limit)
        ? `&limit=${limit}`
        : ''
      const viewboxParam = !_.isNil(viewbox)
        ? `&viewbox=${viewbox.minLon},${viewbox.minLat},${viewbox.maxLon},${viewbox.maxLat}`
        : ''

      const response = []
      const allReqs = []
      for (const proxyName in groupedQueries) {
        const query = groupedQueries[proxyName]
        const promise = fetch(`${query.proxy.url}/forward?q=${search}&sources=*(${query.filter})${viewboxParam}${limitParam}`, { headers: query.proxy.headers })
          .then((response) => {
            if (response.ok) { return response.json() }
            throw new Error(`Forward query failed on proxy ${proxyName} : fetch status is ${response.status}`)
          }).then((json) => {
            for (const result of json) {
              response.push({
                feature: _.omit(result, ['geokoder']),
                source: `${proxyName}:${result.geokoder.source}`,
                match: result.geokoder.match,
                matchProp: result.geokoder.matchProp
              })
            }
          }).catch((error) => {
            debug(error)
          })
        allReqs.push(promise)
      }

      await Promise.allSettled(allReqs)
      return response
    },

    async reverse ({ lat, lon, filter, distance, limit }) {
      const sources = await getSources('forward')
      const matchingSources = sources.filter((source) => minimatch(source.name, filter))

      // group queries by proxy
      const groupedQueries = {}
      for (const source of matchingSources) {
        if (groupedQueries[source.proxy.name] === undefined) groupedQueries[source.proxy.name] = { proxy: source.proxy, filter: source.upstreamName }
        else groupedQueries[source.proxy.name].filter += `|${source.upstreamName}`
      }

      const limitParam = !_.isNil(limit)
        ? `&limit=${limit}`
        : ''
      const distanceParam = !_.isNil(distance)
        ? `&distance=${distance}`
        : ''

      const response = []
      const allReqs = []
      for (const proxyName in groupedQueries) {
        const query = groupedQueries[proxyName]
        const promise = fetch(`${query.proxy.url}/reverse?lat=${lat}&lon=${lon}&sources=*(${query.filter})${distanceParam}${limitParam}`, { headers: query.proxy.headers })
          .then((response) => {
            if (response.ok) { return response.json() }
            throw new Error(`Reverse query failed on proxy ${proxyName} : fetch status is ${response.status}`)
          }).then((json) => {
            for (const result of json) {
              response.push({
                feature: _.omit(result, ['geokoder']),
                source: `${proxyName}:${result.geokoder.source}`
              })
            }
          }).catch((error) => {
            debug(error)
          })
        allReqs.push(promise)
      }

      await Promise.allSettled(allReqs)
      return response
    }
  }
}
