/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { methodDecorator } from './method-decorator.js';

const labelled = methodDecorator(
  (method, name) =>
    function (this: unknown, ...args: unknown[]) {
      return `${name}:${String(method.apply(this, args))}`;
    },
);

describe('methodDecorator', () => {
  it('replaces a method in the experimentalDecorators mode, keeping its name', () => {
    class Service {
      prefix = 'hi';
      @labelled
      greet(who: string) {
        return `${this.prefix} ${who}`;
      }
    }

    expect(new Service().greet('ann')).toBe('greet:hi ann');
    expect(Service.prototype.greet.name).toBe('greet');
  });

  it('replaces a method in the standard mode', () => {
    function greet(this: unknown, who: string) {
      return `hello ${who}`;
    }
    const replaced = labelled(greet, {
      kind: 'method',
      name: Symbol('greet'),
    } as unknown as ClassMethodDecoratorContext);

    expect(replaced('bob')).toBe('Symbol(greet):hello bob');
    expect(replaced.name).toBe('greet');
  });
});
