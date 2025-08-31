import * as Sentry from '@sentry/bun';
import { SENTRY_OPTIONS } from './lib/constants';

Sentry.init({
  ...SENTRY_OPTIONS,
});
