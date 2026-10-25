/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** A user with the roles and capabilities the current caller may read. */
export interface UserOverviewReadModel {
  id?: string;
  username?: string;
  email?: string;
  department?: string | null;
  roles?: (string | null)[];
  capabilities?: (string | null)[];
}
