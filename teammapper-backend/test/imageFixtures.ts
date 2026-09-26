import { readFileSync } from 'fs'
import { join } from 'path'

const ICONS_DIR = join(__dirname, '../../teammapper-frontend/src/assets/icons')

/** The TeamMapper logo, 72x72 pixels. */
export const LOGO_PNG = readFileSync(join(ICONS_DIR, 'icon-72x72.png'))

/** The TeamMapper logo, 128x128 pixels: a second, distinct image. */
export const LARGE_LOGO_PNG = readFileSync(join(ICONS_DIR, 'icon-128x128.png'))

/** Builds a base64 data URL with the MIME type `image/<type>`. */
export const dataUrl = (type: string, bytes: Buffer): string =>
  `data:image/${type};base64,${bytes.toString('base64')}`

export const LOGO_URL = dataUrl('png', LOGO_PNG)
export const LARGE_LOGO_URL = dataUrl('png', LARGE_LOGO_PNG)

/** The PNG logo declared as a JPEG. */
export const MISMATCH_URL = dataUrl('jpeg', LOGO_PNG)
