Each section is one pull request and leaves `main` releasable. PR 1 adds storage and the endpoints while every frontend still writes data URLs. PR 2 adds the cleanup job. PR 3 switches the frontend to references. No feature flag is needed, because nothing user-visible changes until PR 3.

## 1. PR 1: image storage and endpoints

- [ ] 1.1 Accept `image:<uuid>` in `sanitizeImageSrc` and in the node image type in `packages/shared`
- [ ] 1.2 Add the upload response schema `{ reference }` to `packages/shared`
- [ ] 1.3 Add the entities and the migration for `mmp_image` and `mmp_image_data`
- [ ] 1.4 Add `ImageStore` and its database implementation
- [ ] 1.5 Add the image service: cap check, bytes, then metadata row
- [ ] 1.6 Add the settings `MAX_IMAGE_BYTES_PER_MAP`, `UPLOAD_IMAGE_MAX_SIZE_BYTES`, `UPLOAD_IMAGE_RATE_LIMIT` and `UPLOAD_IMAGE_RATE_WINDOW_MS`, and document them
- [ ] 1.7 Add `@nestjs/throttler` for the upload route and set Express `trust proxy` from `WS_TRUST_PROXY`
- [ ] 1.8 Add `POST /api/maps/:id/images`
- [ ] 1.9 Add `GET /api/maps/:id/images/:imageId`
- [ ] 1.10 Copy images on map duplication and delete them on map deletion
- [ ] 1.11 Tests for the backend scenarios in the specs

## 2. PR 2: cleanup of unused images

- [ ] 2.1 Add the daily job in `tasks.service.ts`
- [ ] 2.2 Tests for the cleanup scenarios

## 3. PR 3: upload, render and export references

- [ ] 3.1 Add the image URL resolver to `packages/mmp`, and keep `node.image.src` on a failed load
- [ ] 3.2 Register resolver and upload from `MapSyncService` on `MmpService`
- [ ] 3.3 Upload in `addNodeImage`, with the error messages in every language file
- [ ] 3.4 Route image drop through the toolbar's resize and `addNodeImage`, files only
- [ ] 3.5 Inline references in all exports
- [ ] 3.6 Update the glossary entry **Image**, and add **Image reference**
- [ ] 3.7 Unit and E2E tests for the frontend scenarios in the specs
