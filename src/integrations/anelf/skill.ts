export const defaultSkillName = 'anelfbodied-control';

export function resolveSkillName(value?: string): string {
  return value?.trim() || defaultSkillName;
}
