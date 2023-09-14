import _ from 'lodash'
import makeDebug from 'debug'

import {
  createKanoProvider,
  createNodeGeocoderProvider,
  createMBTilesProvider
} from './providers/index.js'

const debug = makeDebug('geokoder:providers')

export const Providers = {
  async initialize (app) {
    this.app = app
    this.providers = []
    const results = await Promise.allSettled([
      createKanoProvider(app),
      createNodeGeocoderProvider(app),
      createMBTilesProvider(app)
    ])
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        this.app.logger.error(result.reason.toString())
        return
      }

      this.providers.push(result.value)
    })
  },
  get () {
    return this.providers
  }
}

