import * as Sentry from '@sentry/node';
import { SENTRY_OPTIONS } from './lib/constants';

Sentry.init({
  ...SENTRY_OPTIONS,
});
