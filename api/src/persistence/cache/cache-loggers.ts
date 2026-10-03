/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { logger } from '../../common/logger.js';

/** The logger of the repositories' `@PersistedWrite` cache writes. */
export const cacheWriteLogger = logger.child({ context: 'CacheDecorator' });

/** The logger of the repositories' `@FromCache` reads. */
export const cacheReadLogger = logger.child({ context: 'FromCacheDecorator' });

/** The logger of the repository cache table. */
export const mikroOrmCacheLogger = logger.child({ context: 'MikroOrmCache' });
