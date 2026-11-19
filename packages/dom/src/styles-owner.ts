export const styleOwnerAttribute = 'data-vs-ui-owner';

export function validateStyleScopeId(id: string): void {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    throw new TypeError('A style scope ID must be a lowercase slug such as "acme-forms".');
  }
}
