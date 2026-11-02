// A source change must recheck an image that the primitive previously loaded.
// An explicitly supplied loadingStatus="loaded" still bypasses preloading.
export const avatarSourceContext = Symbol('viewstem.shadcn.avatar-source');
