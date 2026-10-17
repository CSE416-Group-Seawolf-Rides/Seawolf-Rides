import type { SampleAvatar } from './publicProfiles';

export type AvatarPresentation = 'IMAGE' | 'SAMPLE' | 'DEFAULT';

export function chooseAvatarPresentation(options: {
  hasImage: boolean;
  imageFailed: boolean;
  sampleAvatar?: SampleAvatar;
}): AvatarPresentation {
  if (options.hasImage && !options.imageFailed) return 'IMAGE';
  return options.sampleAvatar ? 'SAMPLE' : 'DEFAULT';
}
