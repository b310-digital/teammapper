# @teammapper/mmp

Support for this library was unfortunately discontinued and therefore copied to this project for further development and to make needed changes.

Original library can be found here: https://github.com/cedoor/mmp

## Usage in this repository

The library renders the mind map with d3 and needs a DOM, so only
`teammapper-frontend` depends on it. `tsc` compiles `src/` to `dist/` as ES
modules. Relative imports carry the `.js` extension, so the output loads under
Node's ESM rules as well as in the Angular bundler. Import the public API from
the entry point `@teammapper/mmp`; the `exports` map allows no deeper path.
Build the package with the other workspace packages via
`pnpm run build:packages` from the repository root, or let `pnpm run dev`
rebuild it on every change.

```bash
pnpm --filter @teammapper/mmp run build
pnpm --filter @teammapper/mmp run test
pnpm --filter @teammapper/mmp run lint
```

## Map data

mmp keeps no copy of the map. `create` takes a `MapData`, and mmp reads every
node through the map data and writes through its typed methods. The host owns
the nodes, so a Yjs document, a store or a plain array can back them. mmp
redraws in one listener on every change the map data reports, whether the
change is local, a peer's or an undo, and emits `mapChange` afterwards. mmp
keeps render data only: measured sizes, rings, image loads, the drag preview,
the selection and the view state.

`InMemoryMapData` implements the interface over a `Map`. The mmp specs run
against it, and a host without its own store can use it.

```ts
import { create, InMemoryMapData } from '@teammapper/mmp';

const data = new InMemoryMapData([
  { id: 'root', parent: null, k: 1, name: 'Root', isRoot: true },
]);
const ref = document.getElementById('map');
if (!ref) throw new Error('The page has no #map element');
const map = create('map', ref, undefined, data);

map.instance.on('mapChange', () => console.log(data.nodes().length));

data.batch(() => {
  data.addNodes([{ id: 'child', parent: 'root', k: 1, name: 'Child' }]);
  data.updateNode('child', 'name', 'Renamed');
});
```

The `batch` call above produces one redraw and one `mapChange`. The
`MapData` interface offers `node(id)`, `nodes()`, `mainRootId()`, `addNodes`,
`updateNode`, `removeNode`, `replaceMap`, `batch` and `subscribe`.

## Third-party libs

| Library | Authors or maintainers |                           License                            |       Link        |
| ------- | :--------------------: | :----------------------------------------------------------: | :---------------: |
| D3      |      Mike Bostock      | [BSD-3-Clause](https://github.com/d3/d3/blob/master/LICENSE) | https://d3js.org/ |

## License

- See [LICENSE](https://github.com/cedoor/mmp/blob/master/LICENSE) file

## Contacts

#### Initial Developer

- e-mail : me@cedoor.dev
- github : @cedoor
- website : https://cedoor.dev

#### Further development, refactoring and adjustments in this project

- e-mail : jannik@b310.de
- github : @jannikstreek
- website : https://b310.de
