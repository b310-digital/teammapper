import { TestBed } from '@angular/core/testing';
import { MapNodeSettings } from '@teammapper/shared';
import { HttpService } from '../../../http/http.service';
import { ImageUploadError } from '../../mmp/node-images';
import { RemoteMapStore } from './remote-map-store';

const REFERENCE = 'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('RemoteMapStore', () => {
  let store: RemoteMapStore;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      postForm: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    TestBed.configureTestingModule({
      providers: [
        RemoteMapStore,
        { provide: HttpService, useValue: httpService },
      ],
    });

    store = TestBed.inject(RemoteMapStore);
  });

  describe('createMap', () => {
    it('posts the root node and returns the created map', async () => {
      const rootNode = { name: 'Root' } as MapNodeSettings;
      const created = { map: { uuid: 'map-1' }, adminId: 'admin-1' };
      httpService.post.mockResolvedValueOnce(jsonResponse(201, created));

      expect(await store.createMap(rootNode)).toEqual(created);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/',
        JSON.stringify({ rootNode })
      );
    });
  });

  describe('getMap', () => {
    const serverMap = { uuid: 'test-uuid', writable: true };

    it('sends the secret in X-Map-Modification-Secret and keeps the URL bare', async () => {
      httpService.get.mockResolvedValueOnce(jsonResponse(200, serverMap));

      expect(await store.getMap('test-uuid', 'my-secret')).toEqual(serverMap);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/test-uuid',
        { 'x-map-modification-secret': 'my-secret' }
      );
    });

    it('omits the secret header when modification secret is empty', async () => {
      httpService.get.mockResolvedValueOnce(jsonResponse(200, serverMap));

      await store.getMap('test-uuid', '');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/test-uuid',
        {}
      );
    });

    it('resolves to null on an error status', async () => {
      httpService.get.mockResolvedValueOnce(jsonResponse(404, {}));

      expect(await store.getMap('test-uuid', '')).toBeNull();
    });
  });

  describe('listMaps', () => {
    it('turns each listed map into a cached admin entry', async () => {
      httpService.get.mockResolvedValueOnce(
        jsonResponse(200, [
          {
            uuid: 'map-1',
            adminId: 'admin-1',
            modificationSecret: 'secret-1',
            ttl: '2026-02-01T00:00:00.000Z',
            rootName: 'Root',
          },
          {
            uuid: 'map-2',
            adminId: 'admin-2',
            modificationSecret: 'secret-2',
            ttl: null,
            rootName: null,
          },
        ])
      );

      expect(await store.listMaps()).toEqual([
        {
          id: 'map-1',
          cachedAdminMapValue: {
            adminId: 'admin-1',
            modificationSecret: 'secret-1',
            ttl: new Date('2026-02-01T00:00:00.000Z'),
            rootName: 'Root',
          },
        },
        {
          id: 'map-2',
          cachedAdminMapValue: {
            adminId: 'admin-2',
            modificationSecret: 'secret-2',
            ttl: null,
            rootName: null,
          },
        },
      ]);
      expect(httpService.get).toHaveBeenCalledWith(expect.anything(), '/maps');
    });

    it('resolves to an empty list on an error status', async () => {
      httpService.get.mockResolvedValueOnce(jsonResponse(500, {}));

      expect(await store.listMaps()).toEqual([]);
    });
  });

  describe('deleteMap', () => {
    it('sends the admin id for the given map', async () => {
      httpService.delete.mockResolvedValueOnce({ ok: true } as Response);

      expect(await store.deleteMap('map-1', 'admin-1')).toBe(true);
      expect(httpService.delete).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/map-1',
        JSON.stringify({ adminId: 'admin-1' })
      );
    });

    it('resolves to false on an error status', async () => {
      httpService.delete.mockResolvedValueOnce({ ok: false } as Response);

      expect(await store.deleteMap('map-1', 'admin-1')).toBe(false);
    });

    it('resolves to false when the request fails', async () => {
      httpService.delete.mockRejectedValueOnce(new TypeError('offline'));

      expect(await store.deleteMap('map-1', 'admin-1')).toBe(false);
    });
  });

  describe('node images', () => {
    it('resolves a reference to the image endpoint of the map', () => {
      expect(store.imageUrl('map-uuid', REFERENCE)).toBe(
        'api/maps/map-uuid/images/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
      );
    });

    it('preloads nothing', async () => {
      await expect(store.preloadImages('map-uuid')).resolves.toBeUndefined();
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('posts the file with the secret in X-Map-Modification-Secret', async () => {
      httpService.postForm.mockResolvedValueOnce(
        jsonResponse(201, { reference: REFERENCE })
      );

      const reference = await store.uploadImage(
        'map-uuid',
        new Blob(['x']),
        'secret'
      );

      expect(reference).toBe(REFERENCE);
      const [, endpoint, form, headers] = httpService.postForm.mock.calls[0];
      expect(endpoint).toBe('/maps/map-uuid/images');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(headers).toEqual({ 'x-map-modification-secret': 'secret' });
    });

    it('sends no secret header without a secret', async () => {
      httpService.postForm.mockResolvedValueOnce(
        jsonResponse(201, { reference: REFERENCE })
      );

      await store.uploadImage('map-uuid', new Blob(['x']), '');

      expect(httpService.postForm.mock.calls[0][3]).toEqual({});
    });

    it('throws the status of a rejected upload', async () => {
      httpService.postForm.mockResolvedValueOnce(jsonResponse(413, {}));

      await expect(
        store.uploadImage('map-uuid', new Blob(['x']), 'secret')
      ).rejects.toEqual(new ImageUploadError(413));
    });

    it('throws status 0 when the request fails', async () => {
      httpService.postForm.mockRejectedValueOnce(new TypeError('offline'));

      await expect(
        store.uploadImage('map-uuid', new Blob(['x']), 'secret')
      ).rejects.toEqual(new ImageUploadError(0));
    });

    it('rejects a response that carries no reference', async () => {
      httpService.postForm.mockResolvedValueOnce(
        jsonResponse(201, { reference: 'https://example.com/a.png' })
      );

      await expect(
        store.uploadImage('map-uuid', new Blob(['x']), 'secret')
      ).rejects.toBeInstanceOf(ImageUploadError);
    });
  });
});
