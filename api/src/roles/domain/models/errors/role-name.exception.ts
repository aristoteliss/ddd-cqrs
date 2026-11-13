/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { DomainException, InvalidValueException } from '@cqrs-ddd/core/domain';
import { Role } from '../role.entity.js';

export class UniqueRoleNameException extends DomainException {
  readonly role: Role;

  constructor(role: Role) {
    super(`Role with name "${role.name}" already exists`);
    this.role = role;
  }
}

/** A role name breaks `Role.rules.name`. */
export class InvalidRoleNameException extends InvalidValueException {}
