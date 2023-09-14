import fs from 'fs-extra'
import _ from 'lodash'
import makeDebug from 'debug'
import winston from 'winston'
import 'winston-daily-rotate-file'
import cors from 'cors'
import feathers from '@feathersjs/feathers'
import configuration from '@feathersjs/configuration'
import express from '@feathersjs/express'
import distribution from '@kalisio/feathers-distributed'
import { Providers } from './providers.js'
import hooks from './hooks.js'
import routes from './routes.js'
import channels from './channels.js'
import middlewares from './middlewares.js'

// Initialize debugger to be used in feathers
feathers.setDebug(makeDebug)

const debug = makeDebug('geokoder:main')

export async function createServer () {
  const app = express(feathers())

  app.configure(configuration())
  // Get distributed services
  app.configure(distribution(app.get('distribution')))

  app.use(cors(app.get('cors')))

  // Register hooks
  app.hooks(hooks)
  // Set up real-time event channels
  app.configure(channels)
  // Configure API routes
  app.configure(routes)
  // Configure middlewares - always has to be last
  app.configure(middlewares)

  // Logger
  const config = app.get('logs')
  const logPath = _.get(config, 'DailyRotateFile.dirname')
  // This will ensure the log directory does exist
  fs.ensureDirSync(logPath)
  app.logger = winston.createLogger({
    level: (process.env.NODE_ENV === 'development' ? 'verbose' : 'info'),
    transports: [
      new winston.transports.Console(_.get(config, 'Console')),
      new winston.transports.DailyRotateFile(_.get(config, 'DailyRotateFile'))
    ]
  })
  // Top-level error handler
  process.on('unhandledRejection', (reason, p) => {
    console.log(reason, p)
    app.logger.error('Unhandled Rejection: ', reason)
  })

  const port = app.get('port')
  app.logger.info('Configuring HTTP server at port ' + port.toString())
  const server = await app.listen(port)
  server.app = app
  server.app.logger.info('Server started listening')

  await Providers.initialize(app)
  debug('Providers initialized', _.map(Providers.get(), 'name'))

  return server
}
