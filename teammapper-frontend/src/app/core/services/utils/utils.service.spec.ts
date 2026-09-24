import { Subscription } from 'rxjs';
import { UtilsService } from './utils.service';

/** A drop event carrying the given files and markup. */
const dropEvent = (files: File[], html = ''): DragEvent => {
  const event = new Event('drop', { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, getData: () => html },
  });
  return event;
};

describe('UtilsService.observableDroppedImages', () => {
  let subscription: Subscription;
  let dropped: File[];

  beforeEach(() => {
    dropped = [];
    subscription = UtilsService.observableDroppedImages().subscribe(file =>
      dropped.push(file)
    );
  });

  afterEach(() => {
    subscription.unsubscribe();
  });

  it('emits a dropped photo file', () => {
    const photo = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

    document.body.dispatchEvent(dropEvent([photo]));

    expect(dropped).toEqual([photo]);
  });

  it('ignores an image dragged from another web page', () => {
    document.body.dispatchEvent(
      dropEvent([], '<img src="https://example.com/a.png">')
    );

    expect(dropped).toEqual([]);
  });

  it('ignores a dropped SVG file', () => {
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });

    document.body.dispatchEvent(dropEvent([svg]));

    expect(dropped).toEqual([]);
  });
});
