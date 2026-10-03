/* Copyright (C) 2026-present Aristotelis — see repository license. */

// biome-ignore lint/suspicious/noExplicitAny: a decorated method takes any arguments
type AnyMethod = (this: unknown, ...args: any[]) => unknown;

/** A method decorator for the standard and the `experimentalDecorators` mode. */
export interface DualMethodDecorator {
  <F extends AnyMethod>(method: F, context: ClassMethodDecoratorContext): F;
  (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor;
}

/**
 * Builds a decorator that replaces a method with `replace(method, name)`, keeping the
 * method's own name for stack traces.
 */
export function methodDecorator(
  replace: (method: AnyMethod, name: string) => AnyMethod,
): DualMethodDecorator {
  const replaced = (method: AnyMethod, name: string) => {
    const replacement = replace(method, name);
    Object.defineProperty(replacement, 'name', {
      value: method.name,
      configurable: true,
    });
    return replacement;
  };
  return ((target: unknown, key: unknown, descriptor?: PropertyDescriptor) => {
    if (typeof key === 'object' && key !== null && 'name' in key) {
      return replaced(target as AnyMethod, String(key.name));
    }
    const property = descriptor as PropertyDescriptor;
    property.value = replaced(property.value, String(key));
    return property;
  }) as DualMethodDecorator;
}
