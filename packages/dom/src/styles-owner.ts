export const styleOwnerAttribute = 'data-vs-ui-owner';

export function styleScopePrefix(id: string): string {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    throw new TypeError('A style scope ID must be a lowercase slug such as "acme-forms".');
  }
  // A scope ID cannot contain consecutive hyphens, so independently built sets
  // cannot produce the same prefix by splitting the ID and local name differently.
  return id + '--';
}

export function scopedPropertyName(prefix: string, property: string): string {
  const propertyPrefix = '--' + prefix;
  return property.startsWith(propertyPrefix) ? property : propertyPrefix + property.slice(2);
}
