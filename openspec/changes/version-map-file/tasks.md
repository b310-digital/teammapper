## 1. Shared

- [x] 1.1 `MAP_FILE_VERSION` and `MapExport.version`
- [x] 1.2 `parseMapFile` reads a file by its version and throws `MapFileError` with the field at fault
- [x] 1.3 `validateMapFile` and `formatMapFileReport` report errors and warnings
- [x] 1.4 The `validate-map-file` script

## 2. Renderer

- [x] 2.1 The mmp loader checks nodes against `LoadableNodeSchema`

## 3. Frontend

- [x] 3.1 The JSON export writes the version
- [x] 3.2 The JSON import calls `parseMapFile`
- [x] 3.3 The toolbar shows `IMPORT_NEWER_VERSION` for a newer release's file
