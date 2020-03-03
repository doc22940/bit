import Bluebird from 'bluebird';
import harmony, { HarmonyError } from '@teambit/harmony';
import HooksManager from './hooks';
import { BitCliExt } from './extensions/cli';
import defaultHandleError, { findErrorDefinition } from './cli/default-error-handler';
import { logErrAndExit } from './cli/command-registry';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
Bluebird.config({
  longStackTraces: true
  // longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG)
});

// loudRejection();
HooksManager.init();

try {
  harmony
    .run(BitCliExt)
    .then(() => {
      const cli = harmony.get('BitCli');
      // @ts-ignore
      if (cli && cli.instance) return cli.instance.run([], harmony);
      throw new Error('failed to load CLI');
    })
    .catch(err => {
      const errorHandlerExist = findErrorDefinition(err.originalError);
      const handledError = errorHandlerExist ? defaultHandleError(err.originalError) : err;
      logErrAndExit(handledError, process.argv[1] || '');
    });
  // Catching errors from the load phase
} catch (err) {
  const handledError = err instanceof HarmonyError ? err.toString() : err;
  logErrAndExit(handledError, process.argv[1] || '');
}
