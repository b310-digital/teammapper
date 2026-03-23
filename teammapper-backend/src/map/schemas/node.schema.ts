import * as v from 'valibot'

const CssColorSchema = v.nullable(
  v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{3,8}$/))
)

export const ColorSchema = v.partial(
  v.object({
    name: CssColorSchema,
    background: CssColorSchema,
    branch: CssColorSchema,
  })
)

export const CoordinatesSchema = v.object({
  x: v.number(),
  y: v.number(),
})

export const FontSchema = v.partial(
  v.object({
    style: v.nullable(v.pipe(v.string(), v.maxLength(20))),
    size: v.nullable(v.number()),
    weight: v.nullable(v.pipe(v.string(), v.maxLength(20))),
  })
)

export const ImageSchema = v.partial(
  v.object({
    src: v.nullable(v.pipe(v.string(), v.maxLength(200_000))),
    size: v.nullable(v.number()),
  })
)

export const LinkSchema = v.partial(
  v.object({
    href: v.nullable(
      v.pipe(v.string(), v.regex(/^https?:\/\//i), v.maxLength(2048))
    ),
  })
)

export const NodeBasicsSchema = v.object({
  colors: ColorSchema,
  font: FontSchema,
  name: v.nullable(v.pipe(v.string(), v.maxLength(512))),
  image: ImageSchema,
})

export const NodeSchema = v.object({
  ...NodeBasicsSchema.entries,
  coordinates: CoordinatesSchema,
  detached: v.boolean(),
  id: v.pipe(v.string(), v.nonEmpty()),
  k: v.number(),
  link: LinkSchema,
  locked: v.boolean(),
  parent: v.nullable(v.string()),
  isRoot: v.boolean(),
})

export type IMmpClientColor = v.InferOutput<typeof ColorSchema>
export type IMmpClientCoordinates = v.InferOutput<typeof CoordinatesSchema>
export type IMmpClientFont = v.InferOutput<typeof FontSchema>
export type IMmpClientNodeBasics = v.InferOutput<typeof NodeBasicsSchema>
export type IMmpClientNode = v.InferOutput<typeof NodeSchema>
