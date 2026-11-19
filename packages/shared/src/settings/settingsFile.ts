import * as v from 'valibot';
import {
  BRANCH_STYLES,
  MAX_NODE_NAME_LENGTH,
  SUPPORTED_LANGUAGES,
} from '../constants';
import type { UserSettings } from '../models';
import { ColorSchema, FontSchema, ImageSchema, LinkSchema } from '../schemas';

const NodeSettingsSchema = v.strictObject({
  name: v.pipe(v.string(), v.maxLength(MAX_NODE_NAME_LENGTH)),
  link: LinkSchema,
  image: ImageSchema,
  colors: ColorSchema,
  font: FontSchema,
});

const UserSettingsSchema = v.strictObject({
  general: v.strictObject({
    language: v.picklist([...SUPPORTED_LANGUAGES]),
    darkMode: v.boolean(),
    displayName: v.string(),
  }),
  mapOptions: v.strictObject({
    centerOnResize: v.boolean(),
    autoBranchColors: v.boolean(),
    showLinktext: v.boolean(),
    branchStyle: v.picklist([...BRANCH_STYLES]),
    fontMaxSize: v.number(),
    fontMinSize: v.number(),
    fontIncrement: v.number(),
    defaultNode: NodeSettingsSchema,
    rootNode: NodeSettingsSchema,
  }),
});

/**
 * A settings file: the complete user settings and nothing else. Environment
 * variables set the system settings, so the file rejects them.
 */
export const SettingsFileSchema = v.strictObject({
  userSettings: UserSettingsSchema,
});

/**
 * Reads the user settings from the parsed content of a settings file.
 * Throws an error that names the source and every invalid field.
 */
export function parseSettingsFile(
  value: unknown,
  source: string
): UserSettings {
  const result = v.safeParse(SettingsFileSchema, value);
  if (result.success) return result.output.userSettings;
  const problems = result.issues.map(
    issue => `${v.getDotPath(issue) ?? '(root)'}: ${issue.message}`
  );
  throw new Error(`Invalid settings file ${source}: ${problems.join('; ')}`);
}
