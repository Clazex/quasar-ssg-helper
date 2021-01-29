#!/usr/bin/env node
'use strict';
/* eslint-env node */

require('./index.js')()
  .catch((e) => { console.error(e); });
