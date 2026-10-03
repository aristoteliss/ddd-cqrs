/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { loadOptionalEnvFile } from './common/environment/load-optional-env-file.js';

// ES module imports run before a module's body, so the environment file is loaded here,
// then the modules that read it are imported.
loadOptionalEnvFile();

void import('./bootstrap.js').then(({ bootstrap }) => bootstrap());
