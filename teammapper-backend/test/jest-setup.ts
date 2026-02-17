// Disable Yjs feature flag so that MapModule includes the legacy Socket.io
// MapsGateway in its providers. When YJS_ENABLED is true, MapModule excludes
// MapsGateway because both gateways cannot bind to the same HTTP upgrade path
// simultaneously in production. The e2e tests (app.e2e-spec, map-operations-error.e2e-spec)
// rely on the Socket.io gateway for join/addNodes/updateNode events, so it must
// be registered. Unit tests that need Yjs enabled mock configService directly.
process.env.YJS_ENABLED = 'false'
