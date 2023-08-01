import _ from 'lodash'
import winston from 'winston'
import cors from 'cors'
import feathers from '@feathersjs/feathers'
import configuration from '@feathersjs/configuration'
import express from '@feathersjs/express'
import distribution from '@kalisio/feathers-distributed'
import hooks from './hooks.js'
import routes from './routes.js'
// import channels from './channels.js'
// import middlewares from './middlewares.js'

export default async function createServer () {
  const app = express(feathers())

  app.configure(configuration())
  // Get distributed services
  app.configure(distribution(app.get('distribution')))

  app.use(cors(app.get('cors')))

  // Register hooks
  app.hooks(hooks)
  // Set up real-time event channels
  // app.configure(channels)
  // Configure API routes
  await app.configure(routes)
  // Configure middlewares - always has to be last
  // app.configure(middlewares)

  // debugger

  // Logger
  const config = app.get('logs')
  // const logPath = _.get(config, 'DailyRotateFile.dirname')
  // This will ensure the log directory does exist
  // fs.ensureDirSync(logPath)
  app.logger = winston.createLogger({
    level: (process.env.NODE_ENV === 'development' ? 'verbose' : 'info'),
    transports: [
      new winston.transports.Console(_.get(config, 'Console')),
      // new winston.transports.DailyRotateFile(_.get(config, 'DailyRotateFile'))
    ]
  })
  // Top-level error handler
  // process.on('unhandledRejection', (reason, p) =>
  //   app.logger.error('Unhandled Rejection: ', reason)
  // )

  const port = app.get('port')
  app.logger.info('Configuring HTTP server at port ' + port.toString())
  const server = await app.listen(port)
  server.app = app
  server.app.logger.info('Server started listening')

  return server
}
