// App code imports TypeScript modules without extensions (Metro resolves them), but
// Node's test runner does not. Retry relative, extensionless imports with `.ts` so
// tests can load modules that import other modules.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && relative && !hasExtension) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
