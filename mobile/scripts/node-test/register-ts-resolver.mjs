// Loaded with `node --import` before tests run. See ts-resolver.mjs.
import { register } from 'node:module';

register('./ts-resolver.mjs', import.meta.url);
