import { Options } from 'qr-code-styling';

export const qrcodeStyling: Options = {
  type: 'svg',
  image: '',
  dotsOptions: {
    color: '#000000',
    type: 'dots',
  },
  cornersSquareOptions: {
    type: 'square',
  },
  cornersDotOptions: {
    type: 'dot',
  },
  backgroundOptions: {
    color: '#fff',
  },
  imageOptions: {
    crossOrigin: 'anonymous',
    margin: 20,
  },
};
