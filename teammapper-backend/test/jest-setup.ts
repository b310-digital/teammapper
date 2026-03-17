// Disable Yjs feature flag so that MapModule includes the legacy Socket.io
// MapsGateway and excludes all Yjs providers (YjsGateway, YjsDocManagerService,
// YjsPersistenceService, WsConnectionLimiterService). The e2e tests
// (app.e2e-spec, map-operations-error.e2e-spec) rely on the Socket.io gateway
// for join/addNodes/updateNode events. Unit tests that need Yjs enabled mock
// configService directly.
process.env.YJS_ENABLED = 'false'
