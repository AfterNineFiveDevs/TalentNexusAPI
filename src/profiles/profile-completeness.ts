import type { Profile, ProfileField } from '@talent-nexus/contracts';
import { profileEditableFields } from '@talent-nexus/contracts';

type CompletenessInput = Pick<Profile, ProfileField>;

/**
 * How complete the basic profile is (BR-PRF-005).
 * Every editable field has the same weight; blank text counts as missing.
 */
export function profileCompleteness(
  profile: CompletenessInput,
): Profile['completeness'] {
  const missing = profileEditableFields.filter(
    (field) => !profile[field]?.trim(),
  );
  const filled = profileEditableFields.length - missing.length;
  return {
    percent: Math.round((filled / profileEditableFields.length) * 100),
    missing,
  };
}
