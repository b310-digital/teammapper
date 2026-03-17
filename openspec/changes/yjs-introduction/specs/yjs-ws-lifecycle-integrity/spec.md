## ADDED Requirements

### Requirement: Persistence service graceful shutdown

`YjsPersistenceService` SHALL implement `OnModuleDestroy`. On module destruction, the service SHALL clear all active debounce timers, unregister all doc update observers, and perform a best-effort flush of pending persistence for docs that had active timers. The flush SHALL have a maximum timeout of 5 seconds.

#### Scenario: Clean shutdown with pending debounce timers

- **WHEN** the server shuts down while debounce timers are active
- **THEN** all timers are cleared, observers are unregistered, and pending docs are flushed to the database

#### Scenario: Shutdown flush timeout

- **WHEN** the best-effort flush takes longer than 5 seconds during shutdown
- **THEN** the shutdown completes without waiting further and remaining unflushed data is accepted as lost

#### Scenario: No timers fire after shutdown

- **WHEN** `onModuleDestroy` completes
- **THEN** no debounce timer callbacks execute after the database connection is closed

### Requirement: Awaited async operations in close handler

The gateway's close handler SHALL handle the async `decrementClientCount` call with explicit error handling via `.catch()`. Persistence errors during client disconnect SHALL be logged rather than silently swallowed.

#### Scenario: Successful decrement with persistence

- **WHEN** a client disconnects and `decrementClientCount` triggers `persistImmediately`
- **THEN** the persistence completes and is logged

#### Scenario: Persistence error during disconnect

- **WHEN** `decrementClientCount` fails due to a database error
- **THEN** the error is logged with context (mapId) and the close handler completes without crashing

### Requirement: Grace timer race condition prevention

The gateway SHALL ensure that if `handleConnection` fails after `getOrCreateDoc` but before the connection is fully tracked and the client count is incremented, the doc manager's eviction mechanism is not left in an inconsistent state. The grace timer that was canceled by `getOrCreateDoc` SHALL be restored if the connection setup does not complete.

#### Scenario: Error between getOrCreateDoc and incrementClientCount

- **WHEN** `handleConnection` throws after `getOrCreateDoc` succeeds but before `incrementClientCount` is called
- **THEN** the doc remains eligible for grace-period eviction (the grace timer is restored or the doc is otherwise not orphaned)

#### Scenario: Successful connection setup

- **WHEN** `handleConnection` completes the full sequence (getOrCreateDoc → trackConnection → incrementClientCount)
- **THEN** the grace timer remains canceled and the client count accurately reflects the active connection

### Requirement: Unified client count tracking

The gateway SHALL be the single source of truth for client counts per map. The client count SHALL be derived from the size of the connection set (`mapConnections.get(mapId).size`) rather than maintained as a separate counter in the doc manager. The doc manager SHALL accept the connection count from the gateway when determining eviction eligibility.

#### Scenario: Client count matches connection set size

- **WHEN** multiple clients connect to and disconnect from a map
- **THEN** the client count reported for that map always equals the number of entries in the connection set

#### Scenario: No drift between counter and connections

- **WHEN** an error occurs during connection setup or teardown
- **THEN** the client count remains accurate because it is derived from the connection set, not independently tracked

#### Scenario: Eviction triggered at zero connections

- **WHEN** the last connection for a map is removed from the connection set
- **THEN** the doc manager receives a count of 0 and initiates the grace-period eviction timer

### Requirement: Async deleteMap with awaited database call

`MapsService.deleteMap` SHALL return `Promise<void>` and SHALL `await` the repository delete operation. All callers (REST controller and Socket.IO gateway) SHALL `await` the result. Database errors during deletion SHALL propagate to callers.

#### Scenario: Successful map deletion

- **WHEN** `deleteMap` is called with a valid map ID
- **THEN** the repository delete is awaited and the promise resolves after the database operation completes

#### Scenario: Database error during deletion

- **WHEN** the repository delete fails with a database error
- **THEN** the error propagates to the caller as a rejected promise

#### Scenario: Callers await deleteMap

- **WHEN** the REST controller or Socket.IO gateway calls `deleteMap`
- **THEN** the call is awaited so errors are caught by the caller's error handling
